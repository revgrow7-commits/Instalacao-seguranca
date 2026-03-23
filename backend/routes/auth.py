"""
Authentication routes.
"""
import secrets
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
import resend

from database import db
from config import SENDER_EMAIL, FRONTEND_URL
from security import get_current_user, get_password_hash, verify_password, create_access_token, require_role
from models.user import (
    User, UserRole, UserCreate, UserLogin, Token, Installer,
    ForgotPasswordRequest, ResetPasswordRequest, AdminResetPasswordRequest
)

router = APIRouter()


@router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate, current_user: User = Depends(get_current_user)):
    """Admin creates new user"""
    await require_role(current_user, [UserRole.ADMIN])
    
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=user_data.email,
        name=user_data.name,
        role=user_data.role
    )
    
    user_dict = user.model_dump()
    user_dict['password_hash'] = get_password_hash(user_data.password)
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    
    if user_data.role == UserRole.INSTALLER:
        installer = Installer(
            user_id=user.id,
            full_name=user_data.name,
            branch="POA"
        )
        installer_dict = installer.model_dump()
        installer_dict['created_at'] = installer_dict['created_at'].isoformat()
        await db.installers.insert_one(installer_dict)
    
    return user


@router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user_doc['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    user = User(**user_doc)
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "role": user.role})
    
    return Token(access_token=access_token, token_type="bearer", user=user)


@router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send password reset email"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        return {"message": "Se o email existir, você receberá um link para redefinir sua senha."}
    
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await db.password_resets.delete_many({"user_id": user['id']})
    await db.password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user['id'],
        "token": reset_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Force production URL - hardcoded to avoid environment variable issues
    reset_link = f"https://instal-visual.com.br/reset-password?token={reset_token}"
    
    logging.info(f"Password reset link generated for {request.email}")
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #FF1F5A; margin: 0;">INDÚSTRIA VISUAL</h1>
            <p style="color: #666; margin-top: 5px;">Transformamos ideias em realidade</p>
        </div>
        
        <div style="background-color: #1a1a2e; color: white; padding: 30px; border-radius: 10px;">
            <h2 style="margin-top: 0;">Redefinir Senha</h2>
            <p>Olá {user.get('name', 'Usuário')},</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
            <p>Clique no botão abaixo para criar uma nova senha:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_link}" 
                   style="background-color: #FF1F5A; color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Redefinir Senha
                </a>
            </div>
            
            <p style="color: #999; font-size: 12px;">
                Este link expira em 1 hora.<br>
                Se você não solicitou esta redefinição, ignore este email.
            </p>
        </div>
        
        <p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">
            © 2025 Indústria Visual. Todos os direitos reservados.
        </p>
    </div>
    """
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [request.email],
            "subject": "Redefinir Senha - Indústria Visual",
            "html": html_content
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Password reset email sent to {request.email}")
        return {"message": "Se o email existir, você receberá um link para redefinir sua senha.", "email_sent": True}
    except Exception as e:
        error_message = str(e)
        logging.error(f"Failed to send password reset email: {error_message}")
        if "testing emails" in error_message.lower() or "verify a domain" in error_message.lower():
            return {
                "message": "O serviço de email está em modo de teste. Entre em contato com o administrador para redefinir sua senha.",
                "email_sent": False,
                "error_type": "test_mode"
            }
        return {"message": "Se o email existir, você receberá um link para redefinir sua senha.", "email_sent": False}


@router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password using token from email"""
    reset_record = await db.password_resets.find_one({"token": request.token}, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")
    
    expires_at = datetime.fromisoformat(reset_record['expires_at'])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_resets.delete_one({"token": request.token})
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link.")
    
    new_hash = get_password_hash(request.new_password)
    result = await db.users.update_one(
        {"id": reset_record['user_id']},
        {"$set": {"password_hash": new_hash}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    await db.password_resets.delete_one({"token": request.token})
    
    return {"message": "Senha alterada com sucesso!"}


@router.get("/auth/verify-reset-token")
async def verify_reset_token(token: str):
    """Verify if a reset token is valid"""
    reset_record = await db.password_resets.find_one({"token": token}, {"_id": 0})
    
    if not reset_record:
        return {"valid": False, "message": "Token inválido"}
    
    expires_at = datetime.fromisoformat(reset_record['expires_at'])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_resets.delete_one({"token": token})
        return {"valid": False, "message": "Token expirado"}
    
    return {"valid": True}
