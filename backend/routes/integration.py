"""
Integration routes — API cross-system para Visual Connect → Instal-Visual.
Autenticação via header X-Integration-Key (não JWT).
"""
import hmac
import os
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

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


@router.post("/schedule")
async def integration_schedule(request: Request, payload: SchedulePayload):
    """
    Recebido do Visual Connect ao agendar uma instalação.
    Atualiza scheduled_date e status no Instal-Visual via holdprint_job_id.
    """
    _verify_key(request)

    job = db.jobs.find_one({"holdprint_job_id": payload.holdprint_job_id})
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job não encontrado no Instal-Visual: {payload.holdprint_job_id}"
        )

    # Normalizar data para ISO com timezone UTC
    try:
        # Aceita "2026-05-20T10:00" ou "2026-05-20T10:00:00" ou "2026-05-20T10:00:00Z"
        raw = payload.scheduled_date.replace("Z", "+00:00")
        if len(raw) == 16:  # "YYYY-MM-DDTHH:mm"
            raw += ":00+00:00"
        sched_dt = datetime.fromisoformat(raw)
        if sched_dt.tzinfo is None:
            logger.warning(f"integration_schedule: naive datetime recebido, interpretando como BRT: {payload.scheduled_date}")
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

    result = get_client().table("jobs").update(update).eq("id", job["id"]).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Falha ao atualizar job")

    logger.info(
        f"integration_schedule: job {job['id']} agendado via Visual Connect "
        f"(holdprint_job_id={payload.holdprint_job_id}, date={scheduled_iso})"
    )

    return {
        "ok": True,
        "job_id": job["id"],
        "holdprint_job_id": payload.holdprint_job_id,
        "scheduled_date": scheduled_iso,
        "status": "agendado",
    }
