"""
Gamification-related models.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


class GamificationBalance(BaseModel):
    """Gamification balance model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    coins: int = 0
    level: int = 1
    total_earned: int = 0
    total_redeemed: int = 0
    streak_days: int = 0
    last_activity: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CoinTransaction(BaseModel):
    """Coin transaction record model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: int
    transaction_type: str  # earn, redeem, bonus, penalty
    description: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    balance_after: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Reward(BaseModel):
    """Reward item model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    cost: int
    category: str = "geral"
    icon: str = "gift"
    is_active: bool = True
    quantity_available: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RewardRequest(BaseModel):
    """Reward redemption request model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    reward_id: str
    reward_name: str
    cost: int
    status: str = "pending"  # pending, approved, rejected, delivered
    notes: Optional[str] = None
    processed_by: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
