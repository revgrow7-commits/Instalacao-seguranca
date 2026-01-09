"""
User-related models.
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional
from datetime import datetime, timezone
import uuid


class UserRole:
    """User role constants."""
    ADMIN = "admin"
    MANAGER = "manager"
    INSTALLER = "installer"


class User(BaseModel):
    """User model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: str = UserRole.INSTALLER
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True


class UserCreate(BaseModel):
    """User creation request model."""
    email: EmailStr
    password: str
    name: str
    role: str = UserRole.INSTALLER


class UserLogin(BaseModel):
    """User login request model."""
    email: EmailStr
    password: str


class Token(BaseModel):
    """Authentication token response model."""
    access_token: str
    token_type: str
    user: User


class Installer(BaseModel):
    """Installer profile model."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    full_name: str
    phone: Optional[str] = None
    branch: str  # POA or SP
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ForgotPasswordRequest(BaseModel):
    """Forgot password request model."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password request model."""
    token: str
    new_password: str


class AdminResetPasswordRequest(BaseModel):
    """Admin reset password request model."""
    new_password: str


class PasswordChangeRequest(BaseModel):
    """Password change request model."""
    current_password: str
    new_password: str
