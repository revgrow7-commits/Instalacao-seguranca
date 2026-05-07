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
    AGUARDANDO_CONFIRMACAO = "AGUARDANDO_CONFIRMACAO"
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
    # Novos campos — expansão VT
    job_id: Optional[str] = None
    vendedor_nome: Optional[str] = None
    tipos_servico: Optional[List[str]] = []
    ferramentas: Optional[List[str]] = []
    remocao_prevista_os: Optional[bool] = False
    remocao_a_realizar: Optional[bool] = False
    altura_estimada_m: Optional[float] = None
    nivel_dificuldade: Optional[int] = None
    aprovacao_status: Optional[str] = "PENDENTE"
    km_ida: Optional[float] = Field(None, ge=0)
    km_volta: Optional[float] = Field(None, ge=0)

    @field_validator("scheduled_date", "scheduled_time_end", mode="before")
    @classmethod
    def parse_dt(cls, v):
        return _coerce_datetime(v)

    @field_validator("nivel_dificuldade")
    @classmethod
    def validate_nivel(cls, v):
        if v is not None and v not in (1, 2, 3, 4):
            raise ValueError("nivel_dificuldade deve ser entre 1 e 4")
        return v


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
    # km_rodados removido — coluna dropada. Use km_ida/km_volta.
    status: Optional[VisitaStatus] = None
    observacoes_admin: Optional[str] = None
    relatorio_descricao: Optional[str] = None
    relatorio_situacao: Optional[str] = None
    relatorio_fotos: Optional[List[dict]] = None
    relatorio_assinatura_confirmada: Optional[bool] = None
    relatorio_chegada: Optional[datetime] = None
    relatorio_saida: Optional[datetime] = None
    relatorio_enviado_em: Optional[datetime] = None
    # Novos campos — expansão VT
    job_id: Optional[str] = None
    vendedor_nome: Optional[str] = None
    tipos_servico: Optional[List[str]] = None
    ferramentas: Optional[List[str]] = None
    remocao_prevista_os: Optional[bool] = None
    remocao_a_realizar: Optional[bool] = None
    altura_estimada_m: Optional[float] = None
    nivel_dificuldade: Optional[int] = None
    aprovacao_status: Optional[str] = None
    km_ida: Optional[float] = None
    km_volta: Optional[float] = None
    # Checklist de vistoria (campos do PDF)
    tem_estacionamento: Optional[bool] = None
    restricao_horario_inicio: Optional[str] = None
    restricao_horario_fim: Optional[str] = None
    tipo_superficie: Optional[List[str]] = None
    tipo_superficie_outro: Optional[str] = None
    condicao_superficie: Optional[bool] = None
    material_remocao: Optional[str] = None
    tem_ponto_energia: Optional[bool] = None
    medida_largura_m: Optional[float] = None
    medida_altura_m: Optional[float] = None
    forma_instalacao: Optional[List[str]] = None
    epi_altura: Optional[bool] = None
    escada_tamanho: Optional[str] = None
    andaime_torres: Optional[int] = None

    @field_validator(
        "scheduled_date", "scheduled_time_end",
        "relatorio_chegada", "relatorio_saida", "relatorio_enviado_em",
        mode="before",
    )
    @classmethod
    def parse_dt(cls, v):
        return _coerce_datetime(v)

    @field_validator("nivel_dificuldade")
    @classmethod
    def validate_nivel(cls, v):
        if v is not None and v not in (1, 2, 3, 4):
            raise ValueError("nivel_dificuldade deve ser entre 1 e 4")
        return v


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


class VisitaConfirmar(BaseModel):
    """Campos editáveis pelo instalador ao confirmar a visita técnica."""
    model_config = ConfigDict(extra="ignore")

    km_ida: Optional[float] = Field(None, ge=0)
    km_volta: Optional[float] = Field(None, ge=0)
    altura_estimada_m: Optional[float] = Field(None, ge=0)
    nivel_dificuldade: Optional[int] = Field(None, ge=1, le=4)
    ferramentas: Optional[List[str]] = None
    remocao_a_realizar: Optional[bool] = None
    tipos_servico: Optional[List[str]] = None
    observacoes_instalador: Optional[str] = None
    # Checklist de vistoria (campos do PDF)
    tem_estacionamento: Optional[bool] = None
    restricao_horario_inicio: Optional[str] = None
    restricao_horario_fim: Optional[str] = None
    tipo_superficie: Optional[List[str]] = None
    tipo_superficie_outro: Optional[str] = None
    condicao_superficie: Optional[bool] = None
    material_remocao: Optional[str] = None
    tem_ponto_energia: Optional[bool] = None
    medida_largura_m: Optional[float] = Field(None, ge=0)
    medida_altura_m: Optional[float] = Field(None, ge=0)
    forma_instalacao: Optional[List[str]] = None
    epi_altura: Optional[bool] = None
    escada_tamanho: Optional[str] = None
    andaime_torres: Optional[int] = Field(None, ge=1)

    @field_validator("nivel_dificuldade")
    @classmethod
    def validate_nivel(cls, v):
        if v is not None and v not in (1, 2, 3, 4):
            raise ValueError("nivel_dificuldade deve ser entre 1 e 4")
        return v


class VisitaRejeitar(BaseModel):
    """Motivo de rejeição da visita técnica pelo instalador."""
    model_config = ConfigDict(extra="ignore")

    motivo: str = Field(..., min_length=10)


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
    installer_name: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    scheduled_time_end: Optional[datetime] = None
    valor_por_km: float = 1.50
    km_ida: Optional[float] = None
    km_volta: Optional[float] = None
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
    # Novos campos — expansão VT
    job_id: Optional[str] = None
    vendedor_nome: Optional[str] = None
    tipos_servico: Optional[List[str]] = []
    ferramentas: Optional[List[str]] = []
    remocao_prevista_os: Optional[bool] = False
    remocao_a_realizar: Optional[bool] = False
    altura_estimada_m: Optional[float] = None
    nivel_dificuldade: Optional[int] = None
    aprovacao_status: Optional[str] = "PENDENTE"
    # Confirmação pelo instalador
    confirmado_em: Optional[datetime] = None
    confirmado_por: Optional[str] = None
    planejado_snapshot: Optional[dict] = None
    rejeitado_em: Optional[datetime] = None
    rejeitado_motivo: Optional[str] = None
    observacoes_instalador: Optional[str] = None
    # Checklist de vistoria (campos do PDF)
    tem_estacionamento: Optional[bool] = None
    restricao_horario_inicio: Optional[str] = None
    restricao_horario_fim: Optional[str] = None
    tipo_superficie: Optional[List[str]] = []
    tipo_superficie_outro: Optional[str] = None
    condicao_superficie: Optional[bool] = None
    material_remocao: Optional[str] = None
    tem_ponto_energia: Optional[bool] = None
    medida_largura_m: Optional[float] = None
    medida_altura_m: Optional[float] = None
    forma_instalacao: Optional[List[str]] = []
    epi_altura: Optional[bool] = None
    escada_tamanho: Optional[str] = None
    andaime_torres: Optional[int] = None
