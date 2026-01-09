"""
Notification-related models.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


class PushSubscription(BaseModel):
    """Push notification subscription model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    endpoint: str
    keys: dict
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PushNotificationRequest(BaseModel):
    """Push notification request model."""
    user_ids: list
    title: str
    body: str
    icon: Optional[str] = None
    url: Optional[str] = None
