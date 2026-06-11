"""
Authentication Routes - Supabase Compatible
Complete authentication system with:
- Login
- Register (admin creates user)
- Self-Register (public - installers)
- Forgot Password (Resend)
- Reset Password
- Token verification
- Change Password
"""
import os
import re
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
import resend

# Use Supabase database wrapper (SYNCHRONOUS - no await)
from db_supabase import db
from security import get_password_hash, verify_password, create_access_token, get_current_user, require_role
from models.user import User, UserRole
from config import FRONTEND_URL, RESEND_API_KEY, SENDER_EMAIL

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Initialize Resend
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

logger.info(f"Auth module initialized. FRONTEND_URL: {FRONTEND_URL}, SENDER_EMAIL: {SENDER_EMAIL}")


# ============ SEGURANÇA — POLÍTICA DE SENHA (B1) ============

def validar_forca_senha(password: str, campo: str = "A senha") -> None:
    """Valida a força mínima de senha (B1): >= 8 caracteres, com letra e número.

    Lança HTTP 400 se a senha for fraca. Usado em todos os fluxos que definem
    senha (cadastro, cadastro admin, reset e troca de senha).
    """
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{campo} deve ter pelo menos 8 caracteres"
        )
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{campo} deve conter pelo menos uma letra e um número"
        )


# ============ SEGURANÇA — THROTTLE DE LOGIN (B1) ============
# Bloqueio de força bruta efetivo em ambiente serverless: usa a tabela
# `login_attempts` no Supabase (estado compartilhado entre instâncias), em vez
# de memória local (que se perde a cada invocação). Falha-aberto (fail-open) em
# caso de erro de infra para nunca trancar usuários legítimos por um problema do DB.

THROTTLE_JANELA_MINUTOS = 15
THROTTLE_MAX_TENTATIVAS = 5


def _login_attempts_recentes(identificador: str) -> int:
    """Conta tentativas de login falhas para o identificador na janela atual."""
    try:
        janela = (datetime.now(timezone.utc) - timedelta(minutes=THROTTLE_JANELA_MINUTOS)).isoformat()
        registros = db.login_attempts.find({"identifier": identificador, "created_at": {"$gte": janela}})
        return len(registros or [])
    except Exception as e:  # noqa: BLE001 - fail-open intencional
        logger.warning(f"Throttle de login indisponível (login_attempts): {e}")
        return 0


def _registrar_tentativa_falha(identificador: str) -> None:
    try:
        db.login_attempts.insert_one({
            "id": str(uuid.uuid4()),
            "identifier": identificador,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Não foi possível registrar tentativa de login: {e}")


def _limpar_tentativas(identificador: str) -> None:
    try:
        db.login_attempts.delete_many({"identifier": identificador})
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Não foi possível limpar tentativas de login: {e}")


# ============ MODELS ============

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    branch: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ============ LOGIN ============

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    
    email = request.email.lower()

    # B1: throttle por conta — bloqueia após muitas tentativas falhas na janela,
    # impedindo força bruta de senha. Efetivo em serverless (estado no banco).
    if _login_attempts_recentes(email) >= THROTTLE_MAX_TENTATIVAS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de login. Aguarde alguns minutos e tente novamente."
        )

    # Find user by email (case-insensitive)
    users = db.users.find({"email": email})
    user = users[0] if users else None

    if not user:
        _registrar_tentativa_falha(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )
    
    # Check if user is active
    if not user.get('is_active', True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Conta desativada. Entre em contato com o administrador."
        )
    
    # Verify password
    if not verify_password(request.password, user.get('password_hash', '')):
        _registrar_tentativa_falha(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )

    # B1: login bem-sucedido → zera o contador de tentativas da conta
    _limpar_tentativas(email)

    # Create JWT token
    token_data = {
        "sub": user['id'],
        "email": user['email'],
        "role": user.get('role', 'installer')
    }
    access_token = create_access_token(data=token_data)

    # Para instaladores, inclui o installers.id para uso no frontend
    installer_id = None
    if user.get('role') == 'installer':
        installer_rec = db.installers.find_one({"user_id": user['id']})
        if installer_rec:
            installer_id = installer_rec['id']

    # Return user data without password
    user_response = {
        "id": user['id'],
        "email": user['email'],
        "name": user.get('name', ''),
        "full_name": user.get('full_name', user.get('name', '')),
        "role": user.get('role', 'installer'),
        "branch": user.get('branch'),
        "phone": user.get('phone'),
        "is_active": user.get('is_active', True),
        "installer_id": installer_id,
    }
    
    logger.info(f"User logged in: {request.email}")
    
    return LoginResponse(
        access_token=access_token,
        user=user_response
    )


# ============ REGISTER (PUBLIC - Self Registration) ============

@router.post("/register")
def register(request: RegisterRequest):
    """Public registration - creates installer account (self-register)"""
    
    # Check if email already exists (case-insensitive using ilike)
    users = db.users.find({"email": request.email.lower()})
    if users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este email já está cadastrado"
        )
    
    # Validate password
    validar_forca_senha(request.password)
    
    # Create user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": request.email.lower(),
        "name": request.name,
        "full_name": request.name,
        "password_hash": get_password_hash(request.password),
        "role": "installer",  # Default role for self-registration
        "phone": request.phone,
        "branch": request.branch or "POA",
        "is_active": True,
        "created_at": now
    }
    
    db.users.insert_one(user_doc)
    
    # Also create installer record
    installer_doc = {
        "id": user_id,
        "user_id": user_id,
        "full_name": request.name,
        "phone": request.phone,
        "branch": request.branch or "POA",
        "coins": 0,
        "total_area_installed": 0,
        "total_jobs": 0,
        "created_at": now
    }
    
    db.installers.insert_one(installer_doc)
    # Gamificação desabilitada 2026-05-15 — INSERT removido (FK violation em users.id pré-commit).

    logger.info(f"New user self-registered: {request.email}")
    
    return {
        "success": True,
        "message": "Conta criada com sucesso! Faça login para continuar.",
        "user_id": user_id
    }


# ============ SELF-REGISTER (Alias for backward compatibility) ============

@router.post("/self-register")
def self_register(request: RegisterRequest):
    """Alias for /register - backward compatibility"""
    return register(request)


# ============ ADMIN REGISTER (Requires Auth) ============

class AdminRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "installer"
    phone: Optional[str] = None
    branch: Optional[str] = None


@router.post("/admin-register")
def admin_register(request: AdminRegisterRequest, current_user: User = Depends(get_current_user)):
    """Admin creates new user with any role"""
    
    # Check admin permissions
    require_role(current_user, [UserRole.ADMIN])
    
    # Check if email already exists
    users = db.users.find({"email": request.email.lower()})
    if users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este email já está cadastrado"
        )
    
    # Validate password
    validar_forca_senha(request.password)
    
    # Create user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": request.email.lower(),
        "name": request.name,
        "full_name": request.name,
        "password_hash": get_password_hash(request.password),
        "role": request.role,
        "phone": request.phone,
        "branch": request.branch or "POA",
        "is_active": True,
        "created_at": now
    }
    
    db.users.insert_one(user_doc)
    
    # If installer role, create installer record
    if request.role == "installer":
        installer_doc = {
            "id": user_id,
            "user_id": user_id,
            "full_name": request.name,
            "phone": request.phone,
            "branch": request.branch or "POA",
            "coins": 0,
            "total_area_installed": 0,
            "total_jobs": 0,
            "created_at": now
        }
        
        db.installers.insert_one(installer_doc)
        # Gamificação desabilitada 2026-05-15 — INSERT removido (FK violation em users.id pré-commit).
    
    logger.info(f"Admin {current_user.email} created user: {request.email} with role {request.role}")
    
    return {
        "success": True,
        "message": f"Usuário {request.name} criado com sucesso!",
        "user_id": user_id,
        "role": request.role
    }


# ============ FORGOT PASSWORD ============

@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest):
    """Send password reset email via Resend"""
    
    # Segurança (M2): resposta SEMPRE idêntica para prevenir enumeração de e-mails.
    # Não expõe se a conta existe nem o resultado do envio do e-mail — apenas logs internos.
    response = {
        "message": "Se o email existir, você receberá um link para redefinir sua senha."
    }
    
    # Find user
    users = db.users.find({"email": request.email.lower()})
    user = users[0] if users else None
    
    if not user:
        return response
    
    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Save token to database (remove old tokens first)
    db.password_resets.delete_many({"user_id": user['id']})
    db.password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user['id'],
        "token": reset_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Generate reset link - ALWAYS use production URL
    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    logger.info(f"Password reset link generated for {request.email}")
    
    # Send email via Resend
    if RESEND_API_KEY:
        try:
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .header h1 {{ margin: 0; font-size: 28px; }}
                    .header span {{ color: #e94560; }}
                    .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .button {{ display: inline-block; background: #e94560; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }}
                    .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>INDÚSTRIA <span>VISUAL</span></h1>
                    </div>
                    <div class="content">
                        <h2>Redefinição de Senha</h2>
                        <p>Olá, <strong>{user.get('name', 'Usuário')}</strong>!</p>
                        <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
                        <p>Clique no botão abaixo para criar uma nova senha:</p>
                        <p style="text-align: center;">
                            <a href="{reset_link}" class="button">Redefinir Senha</a>
                        </p>
                        <p><small>Este link expira em <strong>1 hora</strong>.</small></p>
                        <p><small>Se você não solicitou esta redefinição, ignore este email.</small></p>
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                        <p><small>Ou copie e cole este link no navegador:</small></p>
                        <p><small style="word-break: break-all;">{reset_link}</small></p>
                    </div>
                    <div class="footer">
                        <p>© 2026 Indústria Visual. Todos os direitos reservados.</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            resend.Emails.send({
                "from": f"Indústria Visual <{SENDER_EMAIL}>",
                "to": [user['email']],
                "subject": "Redefinição de Senha - Indústria Visual",
                "html": html_content
            })
            
            logger.info(f"Password reset email sent to {user['email']}")

        except Exception as e:
            # Falha de envio é registrada apenas em log. A resposta ao cliente
            # permanece idêntica para não vazar a existência da conta nem o estado
            # do serviço de e-mail (anti-enumeração).
            logger.error(f"Failed to send reset email: {e}")

    return response


# ============ VERIFY RESET TOKEN ============

@router.get("/verify-reset-token")
def verify_reset_token(token: str):
    """Verify if a reset token is valid"""
    
    reset_records = db.password_resets.find({"token": token})
    reset_record = reset_records[0] if reset_records else None
    
    if not reset_record:
        return {"valid": False, "message": "Token inválido"}
    
    # Check expiration
    expires_at_str = reset_record.get('expires_at', '')
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) > expires_at:
                db.password_resets.delete_one({"token": token})
                return {"valid": False, "message": "Token expirado"}
        except Exception as e:
            logger.error(f"Error parsing expiry date: {e}")
    
    return {"valid": True, "message": "Token válido"}


# ============ RESET PASSWORD ============

@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest):
    """Reset password using token"""
    
    # Find token
    reset_records = db.password_resets.find({"token": request.token})
    reset_record = reset_records[0] if reset_records else None
    
    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou expirado"
        )
    
    # Check expiration — parse e validação separados para que um expires_at
    # malformado NÃO deixe o reset prosseguir como se o token fosse válido.
    expires_at_str = reset_record.get('expires_at', '')
    expires_at = None
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
        except (ValueError, TypeError) as e:
            logger.error(f"Error parsing expiry date: {e}")
            expires_at = None

    # Sem data válida de expiração: tratar como token inválido (fail-closed).
    if expires_at is None or datetime.now(timezone.utc) > expires_at:
        db.password_resets.delete_one({"token": request.token})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token expirado. Solicite um novo link."
        )
    
    # Validate password
    validar_forca_senha(request.new_password)
    
    # Update password
    new_hash = get_password_hash(request.new_password)
    result = db.users.update_one(
        {"id": reset_record['user_id']},
        {"$set": {"password_hash": new_hash}}
    )
    
    # Check if update was successful
    if isinstance(result, dict):
        modified = result.get('modified_count', 0)
    else:
        modified = getattr(result, 'modified_count', 0)
    
    if modified == 0:
        # Verify user exists
        users = db.users.find({"id": reset_record['user_id']})
        if not users:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Delete used token
    db.password_resets.delete_one({"token": request.token})
    
    logger.info(f"Password reset completed for user {reset_record['user_id']}")
    
    return {"message": "Senha alterada com sucesso!"}


# ============ CHANGE PASSWORD (AUTHENTICATED) ============

@router.post("/change-password")
def change_password(request: ChangePasswordRequest, current_user: User = Depends(get_current_user)):
    """Change password for authenticated user"""
    
    # Get current user data
    users = db.users.find({"id": current_user.id})
    user = users[0] if users else None
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Verify current password
    if not verify_password(request.current_password, user.get('password_hash', '')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta"
        )
    
    # Validate new password
    validar_forca_senha(request.new_password, "A nova senha")
    
    # Update password
    new_hash = get_password_hash(request.new_password)
    db.users.update_one(
        {"id": current_user.id},
        {"$set": {"password_hash": new_hash}}
    )
    
    logger.info(f"Password changed for user {current_user.id}")
    
    return {"message": "Senha alterada com sucesso!"}


# ============ GET CURRENT USER ============

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user"""

    users = db.users.find({"id": current_user.id})
    user = users[0] if users else None

    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user.pop('password_hash', None)

    # Inclui installer_id para que o frontend possa comparar com visita.installer_id
    if user.get('role') == 'installer':
        installer_rec = db.installers.find_one({"user_id": user['id']})
        user['installer_id'] = installer_rec['id'] if installer_rec else None
    else:
        user['installer_id'] = None

    return user


