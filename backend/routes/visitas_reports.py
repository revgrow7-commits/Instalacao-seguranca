"""
Visitas Técnicas — Relatórios analíticos.

Expõe 8 endpoints de agregação sob /visitas/reports/*. Cada endpoint chama uma
função SQL correspondente (report_visitas_*) via Supabase RPC. As funções vivem
em backend/migrations/017_visitas_reports_indexes.sql.

Filtros comuns (todos opcionais via query string):
  • branch      — POA | SP
  • date_from   — YYYY-MM-DD (inclusive, sobre scheduled_date)
  • date_to     — YYYY-MM-DD (inclusive, sobre scheduled_date)

Permissão: somente admin e manager.
"""
from typing import Any, Dict, List, Optional
from datetime import date as _date
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from db_supabase import get_client
from security import get_current_user, require_role
from models.user import User, UserRole

router = APIRouter(prefix="/visitas/reports", tags=["Visitas - Relatórios"])
logger = logging.getLogger(__name__)


def _validate_date(value: Optional[str], field: str) -> Optional[str]:
    """Valida formato YYYY-MM-DD e devolve a string original (ou None)."""
    if not value:
        return None
    try:
        _date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Parâmetro '{field}' inválido — esperado YYYY-MM-DD",
        )
    return value


def _build_rpc_params(
    branch: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> Dict[str, Any]:
    """Monta o dict de argumentos nomeados que vai para .rpc()."""
    return {
        "p_branch": branch,
        "p_date_from": _validate_date(date_from, "date_from"),
        "p_date_to": _validate_date(date_to, "date_to"),
    }


def _call_report(fn_name: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Chama a função SQL e devolve uma lista de dicts (cada linha é um JSON)."""
    try:
        result = get_client().rpc(fn_name, params).execute()
    except Exception as exc:
        logger.exception("Falha ao executar RPC %s: %s", fn_name, exc)
        raise HTTPException(status_code=500, detail=f"Erro ao gerar relatório ({fn_name})")

    rows = result.data or []
    out: List[Dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            out.append(row)
        else:
            out.append(row)
    return out


def _require_admin_or_manager(current_user: User) -> None:
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])


@router.get("/by-vendedor")
async def report_by_vendedor(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_by_vendedor",
        _build_rpc_params(branch, date_from, date_to),
    )


@router.get("/by-filial")
async def report_by_filial(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_by_filial",
        _build_rpc_params(branch, date_from, date_to),
    )


@router.get("/by-aprovacao")
async def report_by_aprovacao(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_by_aprovacao",
        _build_rpc_params(branch, date_from, date_to),
    )


@router.get("/by-dificuldade")
async def report_by_dificuldade(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_by_dificuldade",
        _build_rpc_params(branch, date_from, date_to),
    )


@router.get("/by-tipo-servico")
async def report_by_tipo_servico(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_by_tipo_servico",
        _build_rpc_params(branch, date_from, date_to),
    )


@router.get("/by-altura")
async def report_by_altura(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_by_altura",
        _build_rpc_params(branch, date_from, date_to),
    )


@router.get("/divergencia-remocao")
async def report_divergencia_remocao(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    rows = _call_report(
        "report_visitas_divergencia_remocao",
        _build_rpc_params(branch, date_from, date_to),
    )
    if rows:
        return rows[0]
    return {
        "divergencias": 0,
        "total": 0,
        "percentual_divergencia": 0,
        "lista_divergencias": [],
    }


@router.get("/custo-deslocamento")
async def report_custo_deslocamento(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_custo_deslocamento",
        _build_rpc_params(branch, date_from, date_to),
    )


@router.get("/by-instalador")
async def report_by_instalador(
    branch: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_manager(current_user)
    return _call_report(
        "report_visitas_by_instalador",
        _build_rpc_params(branch, date_from, date_to),
    )
