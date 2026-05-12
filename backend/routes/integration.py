"""
Integration routes — API cross-system para Visual Connect → Instal-Visual.
Autenticação via header X-Integration-Key (não JWT).
"""
import hmac
import os
import logging
from datetime import datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional

from db_supabase import db, get_client

router = APIRouter(prefix="/integration", tags=["Integration"])
logger = logging.getLogger(__name__)

INTEGRATION_API_KEY = os.environ.get("INTEGRATION_API_KEY", "")


def _verify_key(request: Request) -> None:
    if not INTEGRATION_API_KEY:
        raise HTTPException(status_code=503, detail="Integration key not configured")
    key = request.headers.get("X-Integration-Key", "")
    if not hmac.compare_digest(key, INTEGRATION_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid integration key")


class SchedulePayload(BaseModel):
    holdprint_job_id: str
    scheduled_date: str  # ISO 8601 — datetime-local format "YYYY-MM-DDTHH:mm"
    notes: Optional[str] = None
    # Fase 2: emails dos instaladores selecionados no Visual Connect
    installer_emails: Optional[List[str]] = None
    # Fase 3: dados mínimos para criar o job caso ainda não exista
    job_title: Optional[str] = None
    client_name: Optional[str] = None
    branch: Optional[str] = None


@router.post("/schedule")
async def integration_schedule(request: Request, payload: SchedulePayload):
    """
    Recebido do Visual Connect ao agendar uma instalação.
    Atualiza scheduled_date, status e assigned_installers no Instal-Visual via holdprint_job_id.
    Se o job ainda não foi importado pelo cron, cria um registro mínimo (Fase 3).
    """
    _verify_key(request)

    job = db.jobs.find_one({"holdprint_job_id": payload.holdprint_job_id})

    # Fase 3: fallback — criar job mínimo para não perder o agendamento
    if not job:
        new_id = str(uuid4())
        db.jobs.insert_one({
            "id": new_id,
            "holdprint_job_id": payload.holdprint_job_id,
            "title": payload.job_title or f"Job #{payload.holdprint_job_id}",
            "client_name": payload.client_name or "",
            "status": "aguardando",
            "branch": payload.branch or "POA",
        })
        job = {"id": new_id, "holdprint_job_id": payload.holdprint_job_id}
        logger.info(
            f"integration_schedule: job criado automaticamente "
            f"holdprint_id={payload.holdprint_job_id}"
        )

    # Normalizar data para ISO com timezone
    try:
        raw = payload.scheduled_date.replace("Z", "+00:00")
        if len(raw) == 16:  # "YYYY-MM-DDTHH:mm"
            raw += ":00+00:00"
        sched_dt = datetime.fromisoformat(raw)
        if sched_dt.tzinfo is None:
            logger.warning(
                f"integration_schedule: naive datetime recebido, interpretando como BRT: "
                f"{payload.scheduled_date}"
            )
            sched_dt = sched_dt.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
        scheduled_iso = sched_dt.isoformat()
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Formato de data inválido: {payload.scheduled_date}")

    update: dict = {
        "scheduled_date": scheduled_iso,
        "status": "agendado",
    }
    if payload.notes is not None:
        update["notes"] = payload.notes

    # Fase 2: resolver emails → IDs de usuários do Instal-Visual
    # Fallback por nome (primeiro token) quando email não bate entre sistemas
    if payload.installer_emails:
        installer_ids: List[str] = []
        all_users = db.users.find({"role": "installer"}) or []
        for email in payload.installer_emails:
            user = db.users.find_one({"email": email.lower()})
            if not user:
                # Fallback: match pelo primeiro nome extraído do email local-part
                first = email.split("@")[0].replace(".", " ").split()[0].lower()
                user = next(
                    (u for u in all_users if first in (u.get("name") or "").lower()),
                    None,
                )
                if user:
                    logger.info(
                        f"integration_schedule: instalador matched por nome '{first}' "
                        f"(email={email} → id={user['id']})"
                    )
                else:
                    logger.warning(
                        f"integration_schedule: instalador não encontrado email={email}"
                    )
            if user:
                installer_ids.append(user["id"])
        if installer_ids:
            update["assigned_installers"] = installer_ids

    result = get_client().table("jobs").update(update).eq("id", job["id"]).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Falha ao atualizar job")

    logger.info(
        f"integration_schedule: job {job['id']} agendado via Visual Connect "
        f"(holdprint_job_id={payload.holdprint_job_id}, date={scheduled_iso}, "
        f"installers={update.get('assigned_installers', [])})"
    )

    return {
        "ok": True,
        "job_id": job["id"],
        "holdprint_job_id": payload.holdprint_job_id,
        "scheduled_date": scheduled_iso,
        "status": "agendado",
    }
