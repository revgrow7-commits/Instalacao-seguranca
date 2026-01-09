"""
Job-related models.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class Job(BaseModel):
    """Job model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    holdprint_job_id: str
    title: str
    client_name: str
    client_address: Optional[str] = None
    status: str = "aguardando"  # aguardando, instalando, pausado, finalizado, atrasado
    area_m2: Optional[float] = None
    branch: str  # POA or SP
    assigned_installers: List[str] = []
    scheduled_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    items: List[dict] = []
    holdprint_data: dict = {}
    products_with_area: List[dict] = []
    total_products: int = 0
    total_quantity: int = 0
    item_assignments: List[dict] = []


class JobCreate(BaseModel):
    """Job creation request model."""
    holdprint_job_id: str
    branch: str


class JobAssign(BaseModel):
    """Job assignment request model."""
    installer_ids: List[str]


class JobSchedule(BaseModel):
    """Job scheduling request model."""
    scheduled_date: datetime
    installer_ids: Optional[List[str]] = None


class ItemAssignment(BaseModel):
    """Item assignment request model."""
    item_indices: List[int]
    installer_ids: List[str]
    difficulty_level: Optional[int] = None
    scenario_category: Optional[str] = None
    apply_to_all: bool = True


class BatchImportRequest(BaseModel):
    """Batch import request model."""
    branch: str


class JobJustificationRequest(BaseModel):
    """Job justification request model."""
    justification_type: str  # delayed, incomplete, problem
    reason: str
    notes: Optional[str] = None
    photo_base64: Optional[str] = None


class GoogleCalendarEventCreate(BaseModel):
    """Google Calendar event creation request model."""
    title: str
    start_time: datetime
    end_time: datetime
    description: Optional[str] = None
    location: Optional[str] = None
