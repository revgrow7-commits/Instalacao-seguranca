"""
Catálogos VT — endpoints para Vendedores, Tipos de Serviço e Ferramentas.
Listagem pública (autenticado), criação/desativação restrita a admin/manager.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from db_supabase import db
from security import get_current_user, require_role
from models.user import User, UserRole

router = APIRouter()


class CatalogoItem(BaseModel):
    id: Optional[str] = None
    nome: str
    is_active: bool = True
    created_at: Optional[datetime] = None


class CatalogoCreate(BaseModel):
    nome: str


def _list_catalogo(table_name: str) -> List[dict]:
    docs = getattr(db, table_name).find({"is_active": True}, {"_id": 0}) or []
    return [
        {
            "id": str(d.get("id")),
            "nome": d.get("nome"),
            "is_active": d.get("is_active", True),
        }
        for d in docs
    ]


def _create_catalogo(table_name: str, nome: str, user_id: str) -> dict:
    item_id = str(uuid.uuid4())
    # Ferramentas mantêm capitalização original; demais catálogos forçam UPPER
    nome_normalized = nome.strip().upper() if table_name != "ferramentas_vt" else nome.strip()
    doc = {
        "id": item_id,
        "nome": nome_normalized,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user_id,
    }
    existing = getattr(db, table_name).find_one({"nome": nome_normalized})
    if existing:
        if not existing.get("is_active"):
            # Reativar item desativado
            getattr(db, table_name).update_one(
                {"nome": nome_normalized},
                {"$set": {"is_active": True}},
            )
            return {**existing, "is_active": True}
        raise HTTPException(status_code=409, detail="Item já existe no catálogo")
    getattr(db, table_name).insert_one(doc)
    return doc


# ── Vendedores ──────────────────────────────────────────────────────────────

@router.get("/catalogos/vendedores", response_model=List[CatalogoItem])
async def list_vendedores(current_user: User = Depends(get_current_user)):
    """Lista vendedores ativos."""
    return _list_catalogo("vendedores")


@router.post("/catalogos/vendedores", response_model=CatalogoItem)
async def create_vendedor(
    data: CatalogoCreate,
    current_user: User = Depends(get_current_user),
):
    """Cria novo vendedor. Somente admin/manager."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    return _create_catalogo("vendedores", data.nome, current_user.id)


# ── Tipos de Serviço ────────────────────────────────────────────────────────

@router.get("/catalogos/tipos-servico", response_model=List[CatalogoItem])
async def list_tipos_servico(current_user: User = Depends(get_current_user)):
    """Lista tipos de serviço ativos."""
    return _list_catalogo("tipos_servico")


@router.post("/catalogos/tipos-servico", response_model=CatalogoItem)
async def create_tipo_servico(
    data: CatalogoCreate,
    current_user: User = Depends(get_current_user),
):
    """Cria novo tipo de serviço. Somente admin/manager."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    return _create_catalogo("tipos_servico", data.nome, current_user.id)


# ── Ferramentas ─────────────────────────────────────────────────────────────

@router.get("/catalogos/ferramentas", response_model=List[CatalogoItem])
async def list_ferramentas(current_user: User = Depends(get_current_user)):
    """Lista ferramentas ativas."""
    return _list_catalogo("ferramentas_vt")


@router.post("/catalogos/ferramentas", response_model=CatalogoItem)
async def create_ferramenta(
    data: CatalogoCreate,
    current_user: User = Depends(get_current_user),
):
    """Cria nova ferramenta. Somente admin/manager."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    return _create_catalogo("ferramentas_vt", data.nome, current_user.id)
