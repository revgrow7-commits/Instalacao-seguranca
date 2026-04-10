"""
INDÚSTRIA VISUAL - Backend Server
Refactored with modular architecture.

Modules:
- config.py: Configuration and constants
- database.py: MongoDB connection
- security.py: Authentication utilities
- models/: Pydantic models
- services/: Business logic services
- routes/: API route handlers (being migrated)
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import requests
import base64
from io import BytesIO
from PIL import Image
import shutil
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
import resend
from pywebpush import webpush, WebPushException
import json

# Import from modular structure
from config import (
    ROOT_DIR, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_DAYS,
    HOLDPRINT_API_KEY_POA, HOLDPRINT_API_KEY_SP, HOLDPRINT_API_URL,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_CALENDAR_SCOPES,
    RESEND_API_KEY, SENDER_EMAIL, FRONTEND_URL,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIMS_EMAIL,
    MAX_CHECKOUT_DISTANCE_METERS, UPLOAD_DIR,
    PAUSE_REASONS, PAUSE_REASON_LABELS, PRODUCT_FAMILY_MAPPING
)
from db_supabase import db

# Import services
from services.product_classifier import classify_product_to_family, extract_product_measures, calculate_job_products_area
from services.holdprint import extract_product_dimensions
from services.image import compress_image_to_base64, compress_base64_image
from services.gps import calculate_gps_distance
from services.gamification import calculate_checkout_coins, add_coins, calculate_level, COIN_REWARDS
from services.sync_holdprint import sync_holdprint_jobs_sync

# Check if running in serverless mode (Vercel)
IS_SERVERLESS = os.environ.get('VERCEL', '').lower() == '1' or os.environ.get('SERVERLESS', '').lower() == 'true'

# Only import scheduler if not in serverless mode
if not IS_SERVERLESS:
    try:
        from services.scheduler import (
            get_scheduler, setup_scheduler, start_scheduler, shutdown_scheduler,
            get_scheduled_jobs, pause_job, resume_job, run_job_now
        )
        SCHEDULER_AVAILABLE = True
    except ImportError:
        SCHEDULER_AVAILABLE = False
else:
    SCHEDULER_AVAILABLE = False

# Security setup (kept here for backward compatibility, also in security.py)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Resend setup
resend.api_key = RESEND_API_KEY

# ============ CATÁLOGO DE PRODUTOS HOLDPRINT ============
# All product classification and area calculation functions are now in services/product_classifier.py
# The following functions are imported from there:
# - classify_product_to_family
# - extract_product_measures  
# - calculate_job_products_area

def classify_product_family(product_name: str) -> str:
    """Classifica um produto em uma família baseado no nome (legacy wrapper)"""
    family, _ = classify_product_to_family(product_name)
    return family if family else "Outros"

# Note: calculate_job_products_area is imported from services/product_classifier.py

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============ MODELS ============

class UserRole:
    ADMIN = "admin"
    MANAGER = "manager"
    INSTALLER = "installer"

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: str = UserRole.INSTALLER
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = UserRole.INSTALLER

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class Installer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    full_name: str
    phone: Optional[str] = None
    branch: str  # POA or SP
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    holdprint_job_id: str
    title: str
    client_name: str
    client_address: Optional[str] = None
    status: str = "aguardando"  # aguardando, instalando, pausado, finalizado, atrasado
    area_m2: Optional[float] = None  # Área total calculada do job
    branch: str  # POA or SP
    assigned_installers: List[str] = []  # List of installer IDs
    scheduled_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    items: List[dict] = []  # Job items from Holdprint
    holdprint_data: dict = {}  # Raw data from Holdprint
    # Campos calculados para análise de produtividade
    products_with_area: List[dict] = []  # Produtos com área calculada
    total_products: int = 0
    total_quantity: float = 0
    # Atribuição de itens a instaladores
    item_assignments: List[dict] = []  # [{item_index, installer_id, installer_name, assigned_at}]

class JobCreate(BaseModel):
    holdprint_job_id: str
    branch: str

class JobAssign(BaseModel):
    installer_ids: List[str]

class JobSchedule(BaseModel):
    scheduled_date: datetime
    installer_ids: Optional[List[str]] = None

class ItemAssignment(BaseModel):
    """Atribuição de itens específicos a instaladores"""
    item_indices: List[int]  # Índices dos itens/produtos a atribuir
    installer_ids: List[str]  # IDs dos instaladores
    difficulty_level: Optional[int] = None  # 1-5 Nível de dificuldade definido pelo gerente
    scenario_category: Optional[str] = None  # Cenário definido pelo gerente
    apply_to_all: bool = True  # Aplicar a todos os itens selecionados

class CheckIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    installer_id: str
    checkin_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checkout_at: Optional[datetime] = None
    checkin_photo: Optional[str] = None  # Base64 encoded
    checkout_photo: Optional[str] = None  # Base64 encoded
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    gps_accuracy: Optional[float] = None
    checkout_gps_lat: Optional[float] = None
    checkout_gps_long: Optional[float] = None
    checkout_gps_accuracy: Optional[float] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None
    installed_m2: Optional[float] = None  # M² instalado
    # Campos de métricas de produtividade
    complexity_level: Optional[int] = None  # 1-5
    height_category: Optional[str] = None  # terreo, media, alta, muito_alta
    scenario_category: Optional[str] = None  # loja_rua, shopping, evento, fachada, outdoor, veiculo
    difficulty_description: Optional[str] = None  # Descrição da dificuldade
    productivity_m2_h: Optional[float] = None  # Produtividade calculada (m²/hora)
    status: str = "in_progress"  # in_progress, completed

class ItemCheckin(BaseModel):
    """Check-in por item do job"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    item_index: int  # Índice do item no array products_with_area
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
    duration_minutes: Optional[int] = None  # Tempo bruto (total)
    net_duration_minutes: Optional[int] = None  # Tempo líquido (descontando pausas)
    total_pause_minutes: Optional[int] = None  # Total de tempo em pausa
    productivity_m2_h: Optional[float] = None  # Produtividade calculada com tempo líquido
    product_name: Optional[str] = None
    family_name: Optional[str] = None
    status: str = "in_progress"  # in_progress, paused, completed


class ItemPauseLog(BaseModel):
    """Registro de pausas durante a execução de um item"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_checkin_id: str  # FK para ItemCheckin
    job_id: str
    item_index: int
    installer_id: str
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None  # Nulo enquanto pausado
    reason: str  # Motivo da pausa
    duration_minutes: Optional[int] = None  # Calculado ao encerrar a pausa


# PAUSE_REASONS and PAUSE_REASON_LABELS are imported from config.py

class CheckInCreate(BaseModel):
    job_id: str
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    photo_base64: Optional[str] = None

class CheckOutUpdate(BaseModel):
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    photo_base64: Optional[str] = None
    notes: Optional[str] = None

# ============ PRODUCT FAMILIES & PRODUCTIVITY MODELS ============

class ProductFamily(BaseModel):
    """Família de produtos para categorização"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Ex: "Adesivos", "Lonas", "ACM", etc.
    description: Optional[str] = None
    color: str = "#3B82F6"  # Cor para identificação visual
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductFamilyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"

class ProductInstalled(BaseModel):
    """Registro de cada produto instalado com métricas de produtividade"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    checkin_id: Optional[str] = None
    product_name: str  # Nome do produto da Holdprint
    family_id: Optional[str] = None  # FK para ProductFamily
    family_name: Optional[str] = None  # Nome da família (desnormalizado para consultas rápidas)
    
    # Medidas
    width_m: Optional[float] = None
    height_m: Optional[float] = None
    quantity: int = 1
    area_m2: Optional[float] = None  # Calculado: width * height * quantity
    
    # Complexidade e contexto
    complexity_level: int = 1  # 1-5
    height_category: str = "terreo"  # terreo, media, alta, muito_alta
    scenario_category: str = "loja_rua"  # loja_rua, shopping, evento, fachada, etc.
    
    # Tempos
    estimated_time_min: Optional[float] = None
    actual_time_min: Optional[float] = None
    
    # Produtividade calculada
    productivity_m2_h: Optional[float] = None  # m²/hora
    
    # Metadados
    installers_count: int = 1
    installation_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cause_notes: Optional[str] = None  # Causa de desvio, se houver
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductInstalledCreate(BaseModel):
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
    """Histórico consolidado de produtividade para benchmarks"""
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

# ============ UTILITY FUNCTIONS ============
# Note: These functions are also available in services/ modules
# Kept here for backward compatibility during migration
# Note: calculate_gps_distance is imported from services/gps.py
# Note: MAX_CHECKOUT_DISTANCE_METERS is imported from config.py

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user_doc = db.users.find_one({"id": user_id}, {"_id": 0})
    if user_doc is None:
        raise credentials_exception
    return User(**user_doc)

async def require_role(user: User, allowed_roles: List[str]):
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user

# Note: compress_image_to_base64 and compress_base64_image are imported from services/image.py

async def fetch_holdprint_jobs(branch: str, month: int = None, year: int = None, include_finalized: bool = False):
    """Fetch jobs from Holdprint API"""
    api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
    
    if not api_key:
        raise HTTPException(status_code=500, detail=f"Chave de API não configurada para a filial {branch}")
    
    headers = {"x-api-key": api_key}
    
    # Se não especificado, usar mês e ano atual
    from calendar import monthrange
    now = datetime.now(timezone.utc)
    target_month = month if month else now.month
    target_year = year if year else now.year
    
    # Primeiro e último dia do mês
    last_day = monthrange(target_year, target_month)[1]
    start_date_str = f"{target_year}-{target_month:02d}-01"
    end_date_str = f"{target_year}-{target_month:02d}-{last_day:02d}"
    
    # Montar URL com parâmetros de filtro
    params = {
        "page": 1,
        "pageSize": 200,  # Aumentado para pegar mais jobs
        "startDate": start_date_str,
        "endDate": end_date_str,
        "language": "pt-BR"
    }
    
    try:
        response = requests.get(HOLDPRINT_API_URL, headers=headers, params=params, timeout=60)
        
        # Verificar erros específicos
        if response.status_code == 401:
            logger.error(f"Holdprint {branch}: Autenticação falhou - chave de API inválida")
            raise HTTPException(status_code=401, detail=f"Chave de API inválida para a filial {branch}. Verifique a configuração.")
        
        response.raise_for_status()
        data = response.json()
        
        # Holdprint returns {data: [...]} format
        jobs = []
        if isinstance(data, dict) and 'data' in data:
            jobs = data['data']
        elif isinstance(data, list):
            jobs = data
        
        # Filtrar jobs NÃO finalizados (isFinalized = false ou não existe) - se não quiser incluir finalizados
        if not include_finalized:
            filtered_jobs = [job for job in jobs if not job.get('isFinalized', False)]
        else:
            filtered_jobs = jobs
        
        logger.info(f"Holdprint {branch}: {len(jobs)} jobs encontrados, {len(filtered_jobs)} {'total' if include_finalized else 'não finalizados'} (período: {start_date_str} a {end_date_str})")
        
        return filtered_jobs
    except requests.RequestException as e:
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg:
            logger.error(f"Holdprint {branch}: Chave de API inválida")
            raise HTTPException(status_code=401, detail=f"Chave de API inválida para a filial {branch}")
        logger.error(f"Error fetching from Holdprint: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Erro ao conectar com Holdprint: {error_msg}")

# ============ AUTH ROUTES ============

# ============ AUTH ROUTES MOVED TO routes/auth_new.py ============
# All authentication routes have been moved to a dedicated module.
# The router is included at the bottom of this file.


# ============ ADMIN DATA CLEANUP ROUTES ============

@api_router.delete("/admin/cleanup-test-data")
async def cleanup_test_data(current_user: User = Depends(get_current_user)):
    """
    Limpa todos os dados de teste para começar do zero.
    Remove: jobs, checkins, item_checkins, atribuições.
    ATENÇÃO: Esta ação é irreversível!
    """
    require_role(current_user, [UserRole.ADMIN])
    
    results = {}
    
    # 1. Deletar todos os jobs
    jobs_result = db.jobs.delete_many({})
    results["jobs_deleted"] = jobs_result.deleted_count
    
    # 2. Deletar todos os checkins
    checkins_result = db.checkins.delete_many({})
    results["checkins_deleted"] = checkins_result.deleted_count
    
    # 3. Deletar todos os item_checkins
    item_checkins_result = db.item_checkins.delete_many({})
    results["item_checkins_deleted"] = item_checkins_result.deleted_count
    
    # 4. Deletar todas as atribuições de instaladores
    assignments_result = db.job_assignments.delete_many({})
    results["assignments_deleted"] = assignments_result.deleted_count
    
    # 5. Deletar status de sincronização
    sync_result = db.scheduler_sync_status.delete_many({})
    results["sync_status_deleted"] = sync_result.deleted_count
    
    # 6. Resetar moedas e pontos dos instaladores (opcional - mantém usuários)
    installers_result = db.installers.update_many(
        {},
        {"$set": {"coins": 0, "total_jobs": 0, "total_area_installed": 0}}
    )
    results["installers_reset"] = installers_result.modified_count
    
    # 7. Deletar transações de moedas
    transactions_result = db.coin_transactions.delete_many({})
    results["coin_transactions_deleted"] = transactions_result.deleted_count
    
    logger.info(f"Admin {current_user.email} limpou dados de teste: {results}")
    
    return {
        "success": True,
        "message": "Todos os dados de teste foram removidos. Sistema pronto para começar do zero.",
        "details": results
    }

@api_router.post("/admin/reprocess-job-products")
async def reprocess_job_products(current_user: User = Depends(get_current_user)):
    """
    Reprocessa os produtos de todos os jobs que não têm products_with_area.
    Útil para jobs importados por versões anteriores do código.
    """
    require_role(current_user, [UserRole.ADMIN])
    
    # Buscar jobs sem products_with_area ou com array vazio
    jobs_to_process = db.jobs.find({
        "$or": [
            {"products_with_area": {"$exists": False}},
            {"products_with_area": []},
            {"products_with_area": None}
        ]
    })
    
    processed = 0
    errors = []
    
    for job in jobs_to_process:
        try:
            holdprint_data = job.get('holdprint_data', {})
            products = holdprint_data.get('products', [])
            
            if not products:
                # Tentar pegar de production.products
                production = holdprint_data.get('production', {})
                items = job.get('items', [])
                
                # Se não tem products mas tem items, usar items como base
                if items:
                    products_with_area = []
                    total_area_m2 = 0.0
                    
                    for item in items:
                        product_info = extract_product_dimensions(item)
                        quantity = item.get('quantity', 1)
                        unit_area = product_info.get('area_m2', 0)
                        total_area = unit_area * quantity
                        
                        product_with_area = {
                            "name": item.get('name', 'Item sem nome'),
                            "family_name": classify_product_family(item.get('name', '')),
                            "quantity": quantity,
                            "width_m": product_info.get('width_m'),
                            "height_m": product_info.get('height_m'),
                            "copies": product_info.get('copies', 1),
                            "unit_area_m2": unit_area,
                            "total_area_m2": total_area
                        }
                        products_with_area.append(product_with_area)
                        total_area_m2 += total_area
                    
                    # Atualizar no banco
                    db.jobs.update_one(
                        {"id": job['id']},
                        {"$set": {
                            "products_with_area": products_with_area,
                            "area_m2": total_area_m2,
                            "total_products": len(products_with_area),
                            "total_quantity": sum(p.get('quantity', 1) for p in products_with_area)
                        }}
                    )
                    processed += 1
                continue
            
            # Processar products normalmente
            products_with_area = []
            total_area_m2 = 0.0
            total_quantity = 0
            
            for product in products:
                product_info = extract_product_dimensions(product)
                quantity = product.get('quantity', 1)
                unit_area = product_info.get('area_m2', 0)
                total_area = unit_area * quantity
                
                product_with_area = {
                    "name": product.get('name', 'Produto sem nome'),
                    "family_name": classify_product_family(product.get('name', '')),
                    "confidence": product_info.get('confidence', 0),
                    "quantity": quantity,
                    "width_m": product_info.get('width_m'),
                    "height_m": product_info.get('height_m'),
                    "copies": product_info.get('copies', 1),
                    "unit_area_m2": unit_area,
                    "total_area_m2": total_area,
                    "unit_price": product.get('unitPrice'),
                    "total_value": product.get('totalPrice')
                }
                products_with_area.append(product_with_area)
                total_area_m2 += total_area
                total_quantity += quantity
            
            # Atualizar no banco
            db.jobs.update_one(
                {"id": job['id']},
                {"$set": {
                    "products_with_area": products_with_area,
                    "area_m2": total_area_m2,
                    "total_products": len(products_with_area),
                    "total_quantity": total_quantity
                }}
            )
            processed += 1
            
        except Exception as e:
            errors.append(f"{job.get('title', 'Unknown')}: {str(e)}")
    
    logger.info(f"Admin {current_user.email} reprocessou {processed} jobs")
    
    return {
        "success": True,
        "message": f"{processed} jobs reprocessados com sucesso.",
        "processed": processed,
        "total_to_process": len(jobs_to_process),
        "errors": errors[:10] if errors else []
    }

# ============ USER MANAGEMENT ROUTES ============

@api_router.get("/users", response_model=List[User])
async def list_users(current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    users = db.users.find({}, {"_id": 0, "password_hash": 0})
    
    for user in users:
        if isinstance(user['created_at'], str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    return users

@api_router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, user_data: dict, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    
    # Update user
    update_data = {k: v for k, v in user_data.items() if k not in ['id', 'created_at', 'password', 'phone', 'branch']}
    
    if user_data.get('password'):
        update_data['password_hash'] = get_password_hash(user_data['password'])
    
    result = db.users.find_one_and_update(
        {"id": user_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0, "password_hash": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update installer data if applicable
    if user_data.get('role') == 'installer':
        installer_update = {}
        if 'phone' in user_data:
            installer_update['phone'] = user_data['phone']
        if 'branch' in user_data:
            installer_update['branch'] = user_data['branch']
        if 'name' in user_data:
            installer_update['full_name'] = user_data['name']
        
        if installer_update:
            db.installers.update_one(
                {"user_id": user_id},
                {"$set": installer_update}
            )
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    
    return User(**result)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    result = db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


# NOTE: /users/change-password has been moved to routes/auth_new.py as /auth/change-password


# ============ CHECK-IN/OUT ROUTES ============
# NOTE: Legacy check-in routes have been migrated to routes/checkins.py
# The router is included via: api_router.include_router(checkins_router, tags=["Check-ins"])

# Note: UPLOAD_DIR is imported from config.py - ensure directory exists
UPLOAD_DIR.mkdir(exist_ok=True)


async def detect_product_family(product_names: list) -> tuple:
    """
    Detects the product family based on product names.
    Returns (family_id, family_name) tuple.
    """
    # Get all families
    families = db.product_families.find({}, {"_id": 0})
    
    # Keywords for each family type
    family_keywords = {
        "adesivos": ["adesivo", "vinil", "adesivos", "plotagem", "recorte"],
        "lonas": ["lona", "banner", "faixa", "frontlight", "backlight"],
        "acm": ["acm", "alumínio composto", "chapa", "placa"],
        "painéis": ["painel", "outdoor", "totem", "display"],
        "outros": []
    }
    
    # Check each product name
    for name in product_names:
        name_lower = name.lower() if name else ""
        
        for family in families:
            family_name_lower = family.get("name", "").lower()
            
            # Check if family name matches
            if family_name_lower in name_lower:
                return family.get("id"), family.get("name")
            
            # Check keywords
            keywords = family_keywords.get(family_name_lower, [])
            for keyword in keywords:
                if keyword in name_lower:
                    return family.get("id"), family.get("name")
    
    # Default to first family or None
    if families:
        # Try to find "Outros" family
        outros = next((f for f in families if "outro" in f.get("name", "").lower()), None)
        if outros:
            return outros.get("id"), outros.get("name")
        return families[0].get("id"), families[0].get("name")
    
    return None, None


# === LEGACY CHECKINS ROUTES REMOVED - NOW IN routes/checkins.py ===

@api_router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a job and all related data - Only admin and managers"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Check if job exists
    job = db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete all related checkins
    db.checkins.delete_many({"job_id": job_id})
    
    # Delete all related item checkins
    db.item_checkins.delete_many({"job_id": job_id})
    
    # Delete all related installed products
    db.installed_products.delete_many({"job_id": job_id})
    
    # Delete the job
    db.jobs.delete_one({"id": job_id})
    
    return {"message": "Job and all related data deleted successfully"}


# === ITEM-CHECKINS ROUTES REMOVED - NOW IN routes/item_checkins.py ===


# ============ INSTALLER ROUTES ============

@api_router.get("/installers", response_model=List[Installer])
async def list_installers(current_user: User = Depends(get_current_user)):
    # Allow installers to see basic info about other installers (for team calendar)
    # Admin/Manager see full data
    
    installers = db.installers.find({}, {"_id": 0})
    
    for installer in installers:
        if isinstance(installer['created_at'], str):
            installer['created_at'] = datetime.fromisoformat(installer['created_at'])
    
    return installers

@api_router.put("/installers/{installer_id}", response_model=Installer)
async def update_installer(installer_id: str, installer_data: dict, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    
    update_data = {k: v for k, v in installer_data.items() if k not in ['id', 'user_id', 'created_at']}
    
    result = db.installers.find_one_and_update(
        {"id": installer_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Installer not found")
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    
    return Installer(**result)

# ============ METRICS ROUTES ============

# === REPORTS ROUTES REMOVED - NOW IN routes/reports.py ===
# Migrated routes:
# - GET /reports/by-family
# - GET /reports/kpis/family-productivity  
# - GET /reports/by-installer
# - GET /reports/productivity
# - GET /metrics
# - GET /reports/export


# ============ GAMIFICATION & BONUS SYSTEM ============

# Gamification Constants
COIN_LEVELS = {
    "bronze": {"min": 0, "max": 500, "name": "Bronze", "icon": "🥉"},
    "prata": {"min": 501, "max": 2000, "name": "Prata", "icon": "🥈"},
    "ouro": {"min": 2001, "max": 5000, "name": "Ouro", "icon": "🥇"},
    "faixa_preta": {"min": 5001, "max": float('inf'), "name": "Faixa Preta", "icon": "🥋"}
}

# Conversion: 1 m² with 100% = 10 coins
BASE_COINS_PER_M2 = 10

# Gamification Models
class GamificationBalance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    total_coins: int = 0
    lifetime_coins: int = 0  # Total ever earned (for level calculation)
    current_level: str = "bronze"
    daily_engagement_date: Optional[str] = None  # Last date of daily engagement bonus
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CoinTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: int  # Positive for earn, negative for spend
    transaction_type: str  # "earn_checkout", "earn_engagement", "spend_reward"
    description: str
    reference_id: Optional[str] = None  # checkin_id, reward_id, etc.
    breakdown: Optional[dict] = None  # Detailed breakdown of coins earned
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Reward(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    cost_coins: int
    category: str  # "voucher", "equipment", "bonus", "experience"
    image_url: Optional[str] = None
    is_active: bool = True
    stock: Optional[int] = None  # None = unlimited
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RewardRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    reward_id: str
    reward_name: str
    cost_coins: int
    status: str = "pending"  # pending, approved, delivered, rejected
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    processed_at: Optional[datetime] = None

def get_level_from_coins(lifetime_coins: int) -> dict:
    """Determine user level based on lifetime coins"""
    for level_key, level_data in COIN_LEVELS.items():
        if level_data["min"] <= lifetime_coins <= level_data["max"]:
            # Calculate progress to next level
            if level_key == "faixa_preta":
                progress = 100
                next_level = None
                coins_to_next = 0
            else:
                next_levels = {"bronze": "prata", "prata": "ouro", "ouro": "faixa_preta"}
                next_level = next_levels.get(level_key)
                next_min = COIN_LEVELS[next_level]["min"] if next_level else level_data["max"]
                progress = int(((lifetime_coins - level_data["min"]) / (next_min - level_data["min"])) * 100)
                coins_to_next = next_min - lifetime_coins
            
            return {
                "level": level_key,
                "name": level_data["name"],
                "icon": level_data["icon"],
                "progress": min(100, max(0, progress)),
                "next_level": next_level,
                "coins_to_next": coins_to_next
            }
    return {"level": "bronze", "name": "Bronze", "icon": "🥉", "progress": 0, "next_level": "prata", "coins_to_next": 500}

# Note: calculate_checkout_coins is imported from services/gamification.py

async def award_coins(user_id: str, amount: int, transaction_type: str, description: str, reference_id: str = None, breakdown: dict = None):
    """Award coins to a user and update their balance"""
    if amount <= 0:
        return None
    
    # Get or create balance
    balance = db.gamification_balances.find_one({"user_id": user_id}, {"_id": 0})
    
    if not balance:
        balance = GamificationBalance(user_id=user_id).model_dump()
        balance["created_at"] = balance["created_at"].isoformat()
        balance["updated_at"] = balance["updated_at"].isoformat()
        db.gamification_balances.insert_one(balance)
    
    # Update balance
    new_total = (balance.get("total_coins", 0) or 0) + amount
    new_lifetime = (balance.get("lifetime_coins", 0) or 0) + amount
    new_level = get_level_from_coins(new_lifetime)["level"]
    
    db.gamification_balances.update_one(
        {"user_id": user_id},
        {"$set": {
            "total_coins": new_total,
            "lifetime_coins": new_lifetime,
            "current_level": new_level,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create transaction record
    transaction = CoinTransaction(
        user_id=user_id,
        amount=amount,
        transaction_type=transaction_type,
        description=description,
        reference_id=reference_id,
        breakdown=breakdown
    )
    trans_dict = transaction.model_dump()
    trans_dict["created_at"] = trans_dict["created_at"].isoformat()
    db.coin_transactions.insert_one(trans_dict)
    
    return {
        "coins_awarded": amount,
        "new_total": new_total,
        "new_lifetime": new_lifetime,
        "level": new_level
    }

# ============ GAMIFICATION ROUTES (migrated to routes/gamification.py) ============
# Import and include the gamification router
from routes.gamification import router as gamification_router
api_router.include_router(gamification_router, tags=["Gamification"])

# ============ CHECKINS ROUTES (migrated to routes/checkins.py) ============
from routes.checkins import router as checkins_router
api_router.include_router(checkins_router, tags=["Check-ins"])

# ============ ITEM CHECKINS ROUTES (migrated to routes/item_checkins.py) ============
from routes.item_checkins import router as item_checkins_router
api_router.include_router(item_checkins_router, tags=["Item Check-ins"])

# ============ REPORTS ROUTES (migrated to routes/reports.py) ============
from routes.reports import router as reports_router
api_router.include_router(reports_router, tags=["Reports"])

# ============ PRODUCTS ROUTES (migrated to routes/products.py) ============
from routes.products import router as products_router
api_router.include_router(products_router, tags=["Products"])

# ============ CALENDAR ROUTES (migrated to routes/calendar.py) ============
from routes.calendar import router as calendar_router
api_router.include_router(calendar_router, tags=["Calendar"])

# ============ NOTIFICATIONS ROUTES (migrated to routes/notifications.py) ============
from routes.notifications import router as notifications_router
api_router.include_router(notifications_router, tags=["Notifications"])

# ============ JOBS ROUTES (migrated to routes/jobs.py) ============
from routes.jobs import router as jobs_router
api_router.include_router(jobs_router, tags=["Jobs"])

# ============ AUTH ROUTES (migrated to routes/auth_new.py) ============
from routes.auth_new import router as auth_router
api_router.include_router(auth_router, tags=["Authentication"])


# ============ SCHEDULER / CRON MANAGEMENT ROUTES ============

@api_router.get("/scheduler/jobs")
async def get_scheduler_jobs(current_user: User = Depends(get_current_user)):
    """List scheduled jobs status - works in both traditional and serverless mode"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Get last sync status from database
    last_sync = db.system_config.find_one({"key": "last_holdprint_sync"})
    
    jobs = [{
        "id": "holdprint_sync",
        "name": "Sincronização Holdprint",
        "trigger": "Vercel Cron (*/30 * * * *)" if IS_SERVERLESS else "APScheduler",
        "next_run": "N/A (Serverless)" if IS_SERVERLESS else "Check APScheduler",
        "last_run": last_sync.get("value") if last_sync else None,
        "last_imported": last_sync.get("total_imported", 0) if last_sync else 0,
        "last_skipped": last_sync.get("total_skipped", 0) if last_sync else 0,
        "status": "active"
    }]
    
    return {
        "scheduler_running": not IS_SERVERLESS,
        "serverless_mode": IS_SERVERLESS,
        "jobs": jobs
    }

@api_router.post("/scheduler/jobs/{job_id}/pause")
async def pause_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Pause a scheduled job - not available in serverless mode"""
    require_role(current_user, [UserRole.ADMIN])
    
    if IS_SERVERLESS:
        raise HTTPException(
            status_code=400, 
            detail="Pause não disponível em modo serverless. Configure via Vercel Dashboard."
        )
    
    if SCHEDULER_AVAILABLE:
        try:
            pause_job(job_id)
            return {"success": True, "message": f"Job {job_id} pausado"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="Scheduler não disponível")

@api_router.post("/scheduler/jobs/{job_id}/resume")
async def resume_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Resume a paused job - not available in serverless mode"""
    require_role(current_user, [UserRole.ADMIN])
    
    if IS_SERVERLESS:
        raise HTTPException(
            status_code=400,
            detail="Resume não disponível em modo serverless. Configure via Vercel Dashboard."
        )
    
    if SCHEDULER_AVAILABLE:
        try:
            resume_job(job_id)
            return {"success": True, "message": f"Job {job_id} retomado"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="Scheduler não disponível")

@api_router.post("/scheduler/jobs/{job_id}/run-now")
async def run_scheduler_job_now(job_id: str, current_user: User = Depends(get_current_user)):
    """Trigger a job to run immediately"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    if job_id == "holdprint_sync":
        # Run sync directly
        try:
            result = sync_holdprint_jobs_sync(db)
            return {
                "success": True,
                "message": f"Sync executado: {result.get('total_imported', 0)} importados",
                "result": result
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    if IS_SERVERLESS:
        raise HTTPException(status_code=404, detail=f"Job {job_id} não encontrado")
    
    if SCHEDULER_AVAILABLE:
        success = run_job_now(job_id)
        if success:
            return {"success": True, "message": f"Job {job_id} será executado em instantes"}
        else:
            raise HTTPException(status_code=404, detail=f"Job {job_id} não encontrado")
    else:
        raise HTTPException(status_code=400, detail="Scheduler não disponível")


# ============ VERCEL CRON ENDPOINTS ============

@api_router.get("/cron/sync-holdprint")
@api_router.post("/cron/sync-holdprint")
async def cron_sync_holdprint(request: Request):
    """
    Vercel Cron endpoint for Holdprint synchronization.
    Called automatically by Vercel Cron every 30 minutes.
    
    Security: Vercel adds CRON_SECRET header for verification.
    """
    # Verify cron secret if configured (Vercel adds this header)
    cron_secret = os.environ.get('CRON_SECRET')
    if cron_secret:
        auth_header = request.headers.get('Authorization', '')
        if auth_header != f"Bearer {cron_secret}":
            raise HTTPException(status_code=401, detail="Unauthorized cron request")
    
    try:
        result = sync_holdprint_jobs_sync(db)
        return {
            "success": True,
            "message": "Holdprint sync completed",
            "imported": result.get("total_imported", 0),
            "skipped": result.get("total_skipped", 0),
            "errors": result.get("total_errors", 0),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Cron sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/location-alerts")
async def get_location_alerts(current_user: User = Depends(get_current_user)):
    """
    Get recent location alerts for the dashboard.
    Returns alerts from the last 24 hours where installers checked out
    far from their check-in location.
    """
    try:
        # Get alerts from last 24 hours
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        
        alerts = db.location_alerts.find(
            {"created_at": {"$gte": cutoff}},
            {"_id": 0},
            sort=[("created_at", -1)],
            limit=50
        )
        
        # Enrich with job and installer info
        enriched_alerts = []
        for alert in alerts:
            # Get job info
            job = db.jobs.find_one(
                {"id": alert.get("job_id")},
                {"_id": 0, "job_number": 1, "client_name": 1}
            )
            
            # Get installer info
            installer = db.users.find_one(
                {"id": alert.get("installer_id")},
                {"_id": 0, "full_name": 1, "phone": 1}
            )
            
            job_title = f"#{job.get('job_number', 'N/A')} - {job.get('client_name', 'N/A')}" if job else "Job não encontrado"
            installer_name = installer.get("full_name", "Instalador não encontrado") if installer else "Instalador não encontrado"
            
            enriched_alerts.append({
                "id": alert.get("id"),
                "job_id": alert.get("job_id"),
                "job_title": job_title,
                "installer_id": alert.get("installer_id"),
                "installer_name": installer_name,
                "distance_meters": alert.get("distance_meters", 0),
                "max_allowed_meters": alert.get("max_allowed_meters", MAX_CHECKOUT_DISTANCE_METERS),
                "created_at": alert.get("created_at"),
                "action_taken": alert.get("action_taken", "none")
            })
        
        return enriched_alerts
    except Exception as e:
        logger.error(f"Error fetching location alerts: {e}")
        return []


@api_router.get("/")
async def root():
    return {"message": "INDÚSTRIA VISUAL API", "status": "online"}

# Include router
app.include_router(api_router)

# Health check endpoint for Kubernetes (must be at root, not under /api)
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes liveness/readiness probes"""
    return {"status": "healthy", "service": "industria-visual-api"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    if IS_SERVERLESS:
        logger.info("✅ Aplicação iniciada em modo SERVERLESS (Vercel)")
    else:
        if SCHEDULER_AVAILABLE:
            setup_scheduler(db)
            start_scheduler()
            logger.info("✅ Aplicação iniciada com scheduler ativo")
        else:
            logger.info("✅ Aplicação iniciada sem scheduler")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Cleanup on shutdown"""
    if not IS_SERVERLESS and SCHEDULER_AVAILABLE:
        shutdown_scheduler()
    # Note: Supabase client doesn't need explicit close
    logger.info("🛑 Aplicação encerrada")
