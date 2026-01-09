"""
Check-in related models.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


class CheckIn(BaseModel):
    """Check-in model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    installer_id: str
    checkin_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checkout_at: Optional[datetime] = None
    checkin_photo: Optional[str] = None
    checkout_photo: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    gps_accuracy: Optional[float] = None
    checkout_gps_lat: Optional[float] = None
    checkout_gps_long: Optional[float] = None
    checkout_gps_accuracy: Optional[float] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None
    installed_m2: Optional[float] = None
    complexity_level: Optional[int] = None
    height_category: Optional[str] = None
    scenario_category: Optional[str] = None
    difficulty_description: Optional[str] = None
    productivity_m2_h: Optional[float] = None
    status: str = "in_progress"


class CheckInCreate(BaseModel):
    """Check-in creation request model."""
    job_id: str
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    photo_base64: Optional[str] = None


class CheckOutUpdate(BaseModel):
    """Check-out update request model."""
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    photo_base64: Optional[str] = None
    notes: Optional[str] = None


class ItemCheckin(BaseModel):
    """Item-level check-in model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    item_index: int
    installer_id: str
    checkin_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checkout_at: Optional[datetime] = None
    checkin_photo: Optional[str] = None
    checkout_photo: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    gps_accuracy: Optional[float] = None
    checkout_gps_lat: Optional[float] = None
    checkout_gps_long: Optional[float] = None
    checkout_gps_accuracy: Optional[float] = None
    installed_m2: Optional[float] = None
    complexity_level: Optional[int] = None
    height_category: Optional[str] = None
    scenario_category: Optional[str] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None
    net_duration_minutes: Optional[int] = None
    total_pause_minutes: Optional[int] = None
    productivity_m2_h: Optional[float] = None
    product_name: Optional[str] = None
    family_name: Optional[str] = None
    status: str = "in_progress"


class ItemPauseLog(BaseModel):
    """Item pause log model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_checkin_id: str
    job_id: str
    item_index: int
    installer_id: str
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    reason: str
    duration_minutes: Optional[int] = None
