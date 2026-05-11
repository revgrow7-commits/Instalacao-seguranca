"""
CS Integration proxy — encaminha chamadas do Instal-Visual para a Edge Function
cs-integration do Visual Connect sem expor o token no bundle frontend.
"""
import os
import time
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from security import get_current_user, require_role
from models.user import User, UserRole

router = APIRouter(prefix="/cs", tags=["CS Integration"])
logger = logging.getLogger(__name__)

_CS_URL = "https://otyrrvkixegiqsthmaaj.supabase.co/functions/v1/cs-integration"
_CS_COLABORADORES_URL = "https://otyrrvkixegiqsthmaaj.supabase.co/functions/v1/cs-colaboradores"
_CS_TOKEN = os.environ.get("CS_INTEGRATION_TOKEN", "")

# Cache in-memory para /colaboradores — TTL de 5 minutos por chave de role
_colaboradores_cache: dict = {}  # key: role | "all"  →  (timestamp: float, data: any)
_COLABORADORES_CACHE_TTL = 300   # 5 minutos


def _headers() -> dict:
    if not _CS_TOKEN:
        raise HTTPException(status_code=503, detail="CS Integration não configurada — defina CS_INTEGRATION_TOKEN")
    return {"Authorization": f"Bearer {_CS_TOKEN}", "Content-Type": "application/json"}


@router.get("/colaboradores")
async def get_colaboradores(
    role: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """
    Retorna colaboradores ativos do Visual Connect (nome + email) para o seletor de Vendedor.
    Aceita query param opcional `role` para filtrar por papel (ex: role=vendedor).
    Resultado em cache por 5 minutos por valor de role.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    cache_key = role or "all"
    now = time.time()
    cached = _colaboradores_cache.get(cache_key)
    if cached:
        ts, data = cached
        if now - ts < _COLABORADORES_CACHE_TTL:
            return data

    params = {"role": role} if role else {}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_CS_COLABORADORES_URL, headers=_headers(), params=params)
    if not resp.is_success:
        logger.error("CS colaboradores: %s %s", resp.status_code, resp.text[:200])
        raise HTTPException(status_code=resp.status_code, detail="Falha ao buscar colaboradores do CS")

    result = resp.json()
    _colaboradores_cache[cache_key] = (now, result)
    return result


@router.get("/responsaveis")
async def get_responsaveis(current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{_CS_URL}/responsaveis", headers=_headers())
    if not resp.is_success:
        logger.error("CS responsaveis: %s %s", resp.status_code, resp.text[:200])
        raise HTTPException(status_code=resp.status_code, detail="Falha ao buscar responsáveis do CS")
    return resp.json()


class TicketPayload(BaseModel):
    cliente: str
    job_code: str
    job_titulo: str
    categoria: str
    prioridade: str
    descricao: str
    responsavel: Optional[str] = None
    unidade: Optional[str] = None


@router.post("/ticket", status_code=201)
async def create_ticket(payload: TicketPayload, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(_CS_URL, headers=_headers(), json=payload.model_dump(exclude_none=True))
    if not resp.is_success:
        logger.error("CS ticket: %s %s", resp.status_code, resp.text[:200])
        raise HTTPException(status_code=resp.status_code, detail=f"Falha ao criar ticket: {resp.text[:300]}")
    return resp.json()
