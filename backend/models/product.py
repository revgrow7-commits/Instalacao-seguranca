"""
Product-related models.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


class ProductFamily(BaseModel):
    """Product family model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductFamilyCreate(BaseModel):
    """Product family creation request model."""
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"


class ProductInstalled(BaseModel):
    """Product installed record model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    checkin_id: Optional[str] = None
    product_name: str
    family_id: Optional[str] = None
    family_name: Optional[str] = None
    width_m: Optional[float] = None
    height_m: Optional[float] = None
    quantity: int = 1
    area_m2: Optional[float] = None
    complexity_level: int = 1
    height_category: str = "terreo"
    scenario_category: str = "loja_rua"
    estimated_time_min: Optional[float] = None
    actual_time_min: Optional[float] = None
    productivity_m2_h: Optional[float] = None
    installers_count: int = 1
    installation_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cause_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductInstalledCreate(BaseModel):
    """Product installed creation request model."""
    job_id: str
    checkin_id: Optional[str] = None
    product_name: str
    family_id: Optional[str] = None
    width_m: Optional[float] = None
    height_m: Optional[float] = None
    quantity: int = 1
    complexity_level: int = 1
    height_category: str = "terreo"
    scenario_category: str = "loja_rua"
    estimated_time_min: Optional[int] = None
    actual_time_min: Optional[int] = None
    installers_count: int = 1
    cause_notes: Optional[str] = None


class ProductivityHistory(BaseModel):
    """Productivity history model for benchmarks."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    family_id: str
    family_name: str
    complexity_level: int
    height_category: str
    scenario_category: str
    avg_productivity_m2_h: float
    avg_time_per_m2_min: float
    sample_count: int
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
