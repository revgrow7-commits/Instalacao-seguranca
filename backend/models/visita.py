"""
Visita Técnica models.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum
import uuid


class VisitaStatus(str, Enum):
    AGUARDANDO = "AGUARDANDO"
    EM_VISITA = "EM_VISITA"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"


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


class VisitaRelatorio(BaseModel):
    """Campos do relatório de visita técnica (enviado pelo instalador via multipart)."""
    model_config = ConfigDict(extra="ignore")

    km_rodados: float = Field(..., gt=0, description="Quilômetros rodados (> 0)")
    descricao: str = Field(..., min_length=1)
    situacao: str  # normal | pendencia | retrabalho | aprovado
    assinatura_confirmada: bool = False
    chegada: Optional[datetime] = None
    saida: Optional[datetime] = None


class AgendarVisitaRequest(BaseModel):
    """Request para agendar visita técnica (atribuir instalador e data)."""
    model_config = ConfigDict(extra="ignore")

    installer_id: str
    scheduled_date: datetime
    scheduled_time_end: Optional[datetime] = None
    observacoes_admin: Optional[str] = None


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
