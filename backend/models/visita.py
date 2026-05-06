"""
Visita Técnica models.
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
from datetime import datetime, date, timezone
from enum import Enum
import uuid


class VisitaStatus(str, Enum):
    AGUARDANDO = "AGUARDANDO"
    EM_VISITA = "EM_VISITA"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"


def _coerce_datetime(v) -> Optional[datetime]:
    """Aceita datetime, ISO string, date-only (YYYY-MM-DD), time-only (HH:MM) ou vazio."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day, tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            pass
        try:
            d = date.fromisoformat(v)
            return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        except ValueError:
            pass
        if ":" in v and len(v) <= 8:
            today = datetime.now(timezone.utc)
            parts = v.split(":")
            try:
                return today.replace(hour=int(parts[0]), minute=int(parts[1]), second=0, microsecond=0)
            except (ValueError, IndexError):
                pass
    return None


class VisitaCreate(BaseModel):
    """Campos obrigatórios para criação de visita técnica pelo admin/manager."""
    model_config = ConfigDict(extra="ignore")

    titulo: Optional[str] = "VISITA TÉCNICA"
    client_name: str
    client_address: str
    branch: str
    installer_id: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    scheduled_time_end: Optional[datetime] = None
    valor_por_km: Optional[float] = 1.50
    observacoes_admin: Optional[str] = None

    @field_validator("scheduled_date", "scheduled_time_end", mode="before")
    @classmethod
    def parse_dt(cls, v):
        return _coerce_datetime(v)


class VisitaUpdate(BaseModel):
    """Todos os campos opcionais para PATCH de visita técnica."""
    model_config = ConfigDict(extra="ignore")

    titulo: Optional[str] = None
    client_name: Optional[str] = None
    client_address: Optional[str] = None
    branch: Optional[str] = None
    installer_id: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    scheduled_time_end: Optional[datetime] = None
    valor_por_km: Optional[float] = None
    km_rodados: Optional[float] = None
    status: Optional[VisitaStatus] = None
    observacoes_admin: Optional[str] = None
    relatorio_descricao: Optional[str] = None
    relatorio_situacao: Optional[str] = None
    relatorio_fotos: Optional[List[dict]] = None
    relatorio_assinatura_confirmada: Optional[bool] = None
    relatorio_chegada: Optional[datetime] = None
    relatorio_saida: Optional[datetime] = None
    relatorio_enviado_em: Optional[datetime] = None

    @field_validator(
        "scheduled_date", "scheduled_time_end",
        "relatorio_chegada", "relatorio_saida", "relatorio_enviado_em",
        mode="before",
    )
    @classmethod
    def parse_dt(cls, v):
        return _coerce_datetime(v)


class VisitaRelatorio(BaseModel):
    """Campos do relatório de visita técnica (enviado pelo instalador via multipart)."""
    model_config = ConfigDict(extra="ignore")

    km_rodados: float = Field(..., gt=0, description="Quilômetros rodados (> 0)")
    descricao: str = Field(..., min_length=1)
    situacao: str  # normal | pendencia | retrabalho | aprovado
    assinatura_confirmada: bool = False
    chegada: Optional[datetime] = None
    saida: Optional[datetime] = None

    @field_validator("chegada", "saida", mode="before")
    @classmethod
    def parse_dt(cls, v):
        return _coerce_datetime(v)


class AgendarVisitaRequest(BaseModel):
    """Request para agendar visita técnica (atribuir instalador e data)."""
    model_config = ConfigDict(extra="ignore")

    installer_id: str
    scheduled_date: datetime
    scheduled_time_end: Optional[datetime] = None
    observacoes_admin: Optional[str] = None

    @field_validator("scheduled_date", "scheduled_time_end", mode="before")
    @classmethod
    def parse_dt(cls, v):
        return _coerce_datetime(v)


class VisitaOut(BaseModel):
    """Saída completa de uma visita técnica."""
    model_config = ConfigDict(extra="ignore")

    id: str
    numero_vt: Optional[str] = None
    titulo: str = "VISITA TÉCNICA"
    client_name: str
    client_address: str
    branch: str
    installer_id: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    scheduled_time_end: Optional[datetime] = None
    valor_por_km: float = 1.50
    km_rodados: Optional[float] = None
    valor_total: Optional[float] = None
    status: str = "AGUARDANDO"
    observacoes_admin: Optional[str] = None
    relatorio_descricao: Optional[str] = None
    relatorio_situacao: Optional[str] = None
    relatorio_fotos: Optional[List[dict]] = []
    relatorio_assinatura_confirmada: bool = False
    relatorio_chegada: Optional[datetime] = None
    relatorio_saida: Optional[datetime] = None
    relatorio_enviado_em: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
