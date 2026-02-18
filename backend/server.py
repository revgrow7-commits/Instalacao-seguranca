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
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, Query
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
from database import db, client

# Import services
from services.product_classifier import classify_product_to_family, extract_product_measures, calculate_job_products_area
from services.holdprint import extract_product_dimensions
from services.image import compress_image_to_base64, compress_base64_image
from services.gps import calculate_gps_distance
from services.gamification import calculate_checkout_coins, add_coins, calculate_level, COIN_REWARDS
from services.scheduler import (
    get_scheduler, setup_scheduler, start_scheduler, shutdown_scheduler,
    get_scheduled_jobs, pause_job, resume_job, run_job_now
)

# Security setup (kept here for backward compatibility, also in security.py)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Resend setup
resend.api_key = RESEND_API_KEY

# ============ CATÁLOGO DE PRODUTOS HOLDPRINT ============
# Moved to config.py - PRODUCT_FAMILY_MAPPING is imported from there

def classify_product_to_family(product_name: str) -> tuple:
    """
    Classifica um produto em uma família baseado no nome.
    Retorna (family_name, confidence_score)
    """
    if not product_name:
        return (None, 0)
    
    product_lower = product_name.lower()
    
    # Mapeamento com prioridade (mais específico primeiro)
    priority_mapping = [
        # Letras Caixa - verificar antes de outros
        ("Letras Caixa", ["letra caixa", "letra-caixa", "letras caixa"]),
        # Totens
        ("Totens", ["totem"]),
        # Envelopamento
        ("Envelopamento", ["envelopamento", "envelopar"]),
        # Painéis Luminosos
        ("Painéis Luminosos", ["painel backlight", "painel luminoso", "backlight", "lightbox"]),
        # Tecidos
        ("Tecidos", ["tecido", "bandeira", "wind banner"]),
        # Estruturas Metálicas
        ("Estruturas Metálicas", ["estrutura metálica", "estrutura metalica", "backdrop", "cavalete"]),
        # Lonas e Banners
        ("Lonas e Banners", ["lona", "banner", "faixa", "empena"]),
        # Adesivos - depois de lonas para não pegar "lona com adesivo"
        ("Adesivos", ["adesivo", "vinil", "fachada adesivada", "fachada com vinil"]),
        # Chapas e Placas
        ("Chapas e Placas", ["chapa", "placa", "acm", "acrílico", "acrilico", "mdf", " ps ", "pvc", "polionda", 
                           "policarbonato", "petg", "compensado", "xps"]),
        # Serviços
        ("Serviços", ["serviço", "serviços", "instalação", "instalacao", "entrega", "montagem", 
                     "pintura", "serralheria", "solda", "corte", "aplicação", "aplicacao"]),
        # Materiais Promocionais
        ("Materiais Promocionais", ["cartaz", "flyer", "folder", "panfleto", "imã", "marca-página"]),
        # Sublimação
        ("Sublimação", ["sublimação", "sublimática", "sublimatico", "sublimacao"]),
        # Impressão
        ("Impressão", ["impressão uv", "impressão latex", "impressão solvente", "impresso"]),
        # Display/PS
        ("Display/PS", ["display", "móbile", "mobile", "orelha de monitor"]),
        # Produtos Terceirizados
        ("Produtos Terceirizados", ["terceirizado", "produto genérico"]),
        # Fundação
        ("Fundação/Estrutura", ["fundação", "sapata", "estrutura em madeira"]),
    ]
    
    best_match = None
    best_score = 0
    
    for family_name, keywords in priority_mapping:
        for keyword in keywords:
            if keyword.lower() in product_lower:
                # Score baseado no tamanho do match e posição
                keyword_len = len(keyword)
                product_len = len(product_name)
                
                # Score base: proporção do keyword no nome
                base_score = (keyword_len / product_len) * 100
                
                # Bonus se keyword está no início
                if product_lower.startswith(keyword.lower()):
                    base_score += 30
                
                # Bonus por match exato de palavra
                if keyword.lower() == product_lower:
                    base_score = 100
                
                score = min(base_score, 100)
                
                if score > best_score:
                    best_score = score
                    best_match = family_name
    
    if best_match:
        return (best_match, round(best_score, 1))
    
    return ("Outros", 10)  # Família genérica com baixa confiança

def extract_product_measures(description: str) -> dict:
    """
    Extrai medidas (largura, altura, cópias) da descrição HTML do produto.
    Retorna dict com width_m, height_m, copies e area_m2
    """
    import re
    
    result = {
        "width_m": None,
        "height_m": None,
        "copies": 1,
        "area_m2": None
    }
    
    if not description:
        return result
    
    # Extrair Largura - vários formatos possíveis
    width_patterns = [
        r'Largura:\s*<span[^>]*>([0-9.,]+)\s*m',
        r'Largura:\s*([0-9.,]+)\s*m',
        r'largura[:\s]+([0-9.,]+)\s*m',
    ]
    for pattern in width_patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            result["width_m"] = float(match.group(1).replace(',', '.'))
            break
    
    # Extrair Altura
    height_patterns = [
        r'Altura:\s*<span[^>]*>([0-9.,]+)\s*m',
        r'Altura:\s*([0-9.,]+)\s*m',
        r'altura[:\s]+([0-9.,]+)\s*m',
    ]
    for pattern in height_patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            result["height_m"] = float(match.group(1).replace(',', '.'))
            break
    
    # Extrair Cópias
    copies_patterns = [
        r'Cópias:\s*<span[^>]*>([0-9]+)',
        r'Cópias:\s*([0-9]+)',
        r'copias[:\s]+([0-9]+)',
    ]
    for pattern in copies_patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            result["copies"] = int(match.group(1))
            break
    
    # Calcular área se tiver largura e altura
    if result["width_m"] and result["height_m"]:
        result["area_m2"] = round(result["width_m"] * result["height_m"] * result["copies"], 2)
    
    return result

def classify_product_family(product_name: str) -> str:
    """Classifica um produto em uma família baseado no nome"""
    name_lower = product_name.lower()
    
    for family, keywords in PRODUCT_FAMILY_MAPPING.items():
        for keyword in keywords:
            if keyword in name_lower:
                return family
    
    return "Outros"

def calculate_job_products_area(holdprint_data: dict) -> tuple:
    """
    Calcula a área de todos os produtos de um job.
    Retorna (products_with_area, total_area_m2, total_products, total_quantity)
    """
    products = holdprint_data.get("products", [])
    products_with_area = []
    total_area_m2 = 0
    total_quantity = 0
    
    for product in products:
        product_name = product.get("name", "")
        quantity = product.get("quantity", 1)
        description = product.get("description", "")
        
        # Extrair medidas
        measures = extract_product_measures(description)
        
        # Classificar família
        family_name, confidence = classify_product_to_family(product_name)
        
        # Calcular área do item (considerando quantidade)
        item_area = None
        if measures["width_m"] and measures["height_m"]:
            # Área unitária × quantidade
            unit_area = measures["width_m"] * measures["height_m"]
            item_area = round(unit_area * quantity * measures["copies"], 2)
            total_area_m2 += item_area
        
        total_quantity += quantity
        
        product_data = {
            "name": product_name,
            "family_name": family_name,
            "confidence": confidence,
            "quantity": quantity,
            "width_m": measures["width_m"],
            "height_m": measures["height_m"],
            "copies": measures["copies"],
            "unit_area_m2": round(measures["width_m"] * measures["height_m"], 2) if measures["width_m"] and measures["height_m"] else None,
            "total_area_m2": item_area,
            "unit_price": product.get("unitPrice", 0),
            "total_value": product.get("totalValue", 0)
        }
        products_with_area.append(product_data)
    
    return (products_with_area, round(total_area_m2, 2), len(products), total_quantity)

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
    total_quantity: int = 0
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


# Enum de motivos de pausa
PAUSE_REASONS = [
    "aguardando_cliente",
    "chuva",
    "falta_material", 
    "almoco_intervalo",
    "problema_acesso",
    "problema_equipamento",
    "aguardando_aprovacao",
    "outro"
]

PAUSE_REASON_LABELS = {
    "aguardando_cliente": "Aguardando Cliente",
    "chuva": "Chuva/Intempérie",
    "falta_material": "Falta de Material",
    "almoco_intervalo": "Almoço/Intervalo",
    "problema_acesso": "Problema de Acesso",
    "problema_equipamento": "Problema com Equipamento",
    "aguardando_aprovacao": "Aguardando Aprovação",
    "outro": "Outro Motivo"
}

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
    estimated_time_min: Optional[int] = None
    actual_time_min: Optional[int] = None
    
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

import math

def calculate_gps_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance between two GPS coordinates using Haversine formula.
    Returns distance in meters.
    """
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 0
    
    R = 6371000  # Earth's radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

# Maximum distance in meters before triggering location alert
MAX_CHECKOUT_DISTANCE_METERS = 500

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
    
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user_doc is None:
        raise credentials_exception
    return User(**user_doc)

async def require_role(user: User, allowed_roles: List[str]):
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user

def compress_image_to_base64(image_data: bytes, max_size_kb: int = 300, max_dimension: int = 1200) -> str:
    """
    Compress image and return base64 string.
    - Resizes image if larger than max_dimension
    - Compresses to target size (default 300KB)
    - Converts to JPEG format
    """
    try:
        img = Image.open(BytesIO(image_data))
        
        # Convert to RGB if necessary (handles PNG with transparency, etc.)
        if img.mode in ('RGBA', 'P', 'LA'):
            # Create white background for transparent images
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if image is too large
        original_size = img.size
        if img.width > max_dimension or img.height > max_dimension:
            ratio = min(max_dimension / img.width, max_dimension / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            logging.info(f"Image resized from {original_size} to {img.size}")
        
        # Progressive compression to meet target size
        quality = 85
        output = BytesIO()
        
        while quality >= 20:
            output = BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            size_kb = len(output.getvalue()) / 1024
            
            if size_kb <= max_size_kb:
                break
            quality -= 5
        
        final_size_kb = len(output.getvalue()) / 1024
        logging.info(f"Image compressed: {len(image_data)/1024:.1f}KB -> {final_size_kb:.1f}KB (quality={quality})")
        
        return base64.b64encode(output.getvalue()).decode('utf-8')
        
    except Exception as e:
        logging.error(f"Error compressing image: {str(e)}")
        # Return original as base64 if compression fails
        return base64.b64encode(image_data).decode('utf-8')

def compress_base64_image(base64_string: str, max_size_kb: int = 300, max_dimension: int = 1200) -> str:
    """
    Compress a base64-encoded image string.
    Returns compressed base64 string.
    """
    if not base64_string:
        return base64_string
    
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64 to bytes
        image_data = base64.b64decode(base64_string)
        original_size_kb = len(image_data) / 1024
        
        # Skip compression for small images
        if original_size_kb <= max_size_kb:
            logging.info(f"Image already small ({original_size_kb:.1f}KB), skipping compression")
            return base64_string
        
        # Compress the image
        return compress_image_to_base64(image_data, max_size_kb, max_dimension)
        
    except Exception as e:
        logging.error(f"Error in compress_base64_image: {str(e)}")
        return base64_string

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

@api_router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate, current_user: User = Depends(get_current_user)):
    """Admin creates new user"""
    await require_role(current_user, [UserRole.ADMIN])
    
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name,
        role=user_data.role
    )
    
    user_dict = user.model_dump()
    user_dict['password_hash'] = get_password_hash(user_data.password)
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # If installer, create installer record
    if user_data.role == UserRole.INSTALLER:
        installer = Installer(
            user_id=user.id,
            full_name=user_data.name,
            branch="POA"  # Default, can be updated later
        )
        installer_dict = installer.model_dump()
        installer_dict['created_at'] = installer_dict['created_at'].isoformat()
        await db.installers.insert_one(installer_dict)
    
    return user

# Self-registration endpoint (public - no auth required)
class SelfRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

@api_router.post("/auth/self-register")
async def self_register(request: SelfRegisterRequest):
    """Allow users to create their own account"""
    # Check if email already exists
    existing_user = await db.users.find_one({"email": request.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Este email já está cadastrado")
    
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 6 caracteres")
    
    # Create user with default 'installer' role
    user = User(
        name=request.name,
        email=request.email,
        role=UserRole.INSTALLER  # Default role for self-registered users
    )
    
    user_dict = user.model_dump()
    user_dict['password_hash'] = get_password_hash(request.password)
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    await db.users.insert_one(user_dict)
    
    # Auto-create installer profile
    installer = Installer(
        user_id=user.id,
        full_name=request.name,
        branch="POA"  # Default branch
    )
    installer_dict = installer.model_dump()
    installer_dict['created_at'] = installer_dict['created_at'].isoformat()
    await db.installers.insert_one(installer_dict)
    
    logging.info(f"New user self-registered: {request.email}")
    
    return {
        "success": True,
        "message": "Conta criada com sucesso! Faça login para continuar.",
        "user_id": user.id
    }

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    # Find user
    user_doc = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify password
    if not verify_password(credentials.password, user_doc['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Convert datetime
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    user = User(**user_doc)
    
    # Create token
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "role": user.role})
    
    return Token(access_token=access_token, token_type="bearer", user=user)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# ============ PASSWORD RECOVERY ============

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class AdminResetPasswordRequest(BaseModel):
    new_password: str

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send password reset email"""
    # Find user by email
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        # Don't reveal if email exists or not for security
        return {"message": "Se o email existir, você receberá um link para redefinir sua senha."}
    
    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Store reset token in database
    await db.password_resets.delete_many({"user_id": user['id']})  # Remove old tokens
    await db.password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user['id'],
        "token": reset_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Send email - Get FRONTEND_URL directly from environment to ensure fresh value
    import os as _os
    frontend_url = _os.environ.get('FRONTEND_URL', 'https://pwa-gamify-prod.preview.emergentagent.com')
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    logging.info(f"Password reset link generated with FRONTEND_URL: {frontend_url}")
    logging.info(f"Full reset link: {reset_link}")
    
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
        # Check if it's a Resend test account limitation
        if "testing emails" in error_message.lower() or "verify a domain" in error_message.lower():
            return {
                "message": "O serviço de email está em modo de teste. Entre em contato com o administrador para redefinir sua senha.",
                "email_sent": False,
                "error_type": "test_mode"
            }
        # Still return success message to not reveal if email exists
        return {"message": "Se o email existir, você receberá um link para redefinir sua senha.", "email_sent": False}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password using token from email"""
    # Find reset token
    reset_record = await db.password_resets.find_one({"token": request.token}, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")
    
    # Check if token expired
    expires_at = datetime.fromisoformat(reset_record['expires_at'])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_resets.delete_one({"token": request.token})
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link.")
    
    # Update user password
    new_hash = get_password_hash(request.new_password)
    result = await db.users.update_one(
        {"id": reset_record['user_id']},
        {"$set": {"password_hash": new_hash}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Delete used token
    await db.password_resets.delete_one({"token": request.token})
    
    return {"message": "Senha alterada com sucesso!"}

@api_router.get("/auth/verify-reset-token")
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

@api_router.put("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: str,
    request: AdminResetPasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """Admin can reset any user's password"""
    await require_role(current_user, [UserRole.ADMIN])
    
    # Find user
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Update password
    new_hash = get_password_hash(request.new_password)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": f"Senha do usuário {user.get('name')} redefinida com sucesso"}

# ============ ADMIN DATA CLEANUP ROUTES ============

@api_router.delete("/admin/cleanup-test-data")
async def cleanup_test_data(current_user: User = Depends(get_current_user)):
    """
    Limpa todos os dados de teste para começar do zero.
    Remove: jobs, checkins, item_checkins, atribuições.
    ATENÇÃO: Esta ação é irreversível!
    """
    await require_role(current_user, [UserRole.ADMIN])
    
    results = {}
    
    # 1. Deletar todos os jobs
    jobs_result = await db.jobs.delete_many({})
    results["jobs_deleted"] = jobs_result.deleted_count
    
    # 2. Deletar todos os checkins
    checkins_result = await db.checkins.delete_many({})
    results["checkins_deleted"] = checkins_result.deleted_count
    
    # 3. Deletar todos os item_checkins
    item_checkins_result = await db.item_checkins.delete_many({})
    results["item_checkins_deleted"] = item_checkins_result.deleted_count
    
    # 4. Deletar todas as atribuições de instaladores
    assignments_result = await db.job_assignments.delete_many({})
    results["assignments_deleted"] = assignments_result.deleted_count
    
    # 5. Deletar status de sincronização
    sync_result = await db.scheduler_sync_status.delete_many({})
    results["sync_status_deleted"] = sync_result.deleted_count
    
    # 6. Resetar moedas e pontos dos instaladores (opcional - mantém usuários)
    installers_result = await db.installers.update_many(
        {},
        {"$set": {"coins": 0, "total_jobs": 0, "total_area_installed": 0}}
    )
    results["installers_reset"] = installers_result.modified_count
    
    # 7. Deletar transações de moedas
    transactions_result = await db.coin_transactions.delete_many({})
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
    await require_role(current_user, [UserRole.ADMIN])
    
    # Buscar jobs sem products_with_area ou com array vazio
    jobs_to_process = await db.jobs.find({
        "$or": [
            {"products_with_area": {"$exists": False}},
            {"products_with_area": []},
            {"products_with_area": None}
        ]
    }).to_list(1000)
    
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
                    await db.jobs.update_one(
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
            await db.jobs.update_one(
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
    await require_role(current_user, [UserRole.ADMIN])
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    
    for user in users:
        if isinstance(user['created_at'], str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    return users

@api_router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, user_data: dict, current_user: User = Depends(get_current_user)):
    await require_role(current_user, [UserRole.ADMIN])
    
    # Update user
    update_data = {k: v for k, v in user_data.items() if k not in ['id', 'created_at', 'password', 'phone', 'branch']}
    
    if user_data.get('password'):
        update_data['password_hash'] = get_password_hash(user_data['password'])
    
    result = await db.users.find_one_and_update(
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
            await db.installers.update_one(
                {"user_id": user_id},
                {"$set": installer_update}
            )
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    
    return User(**result)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    await require_role(current_user, [UserRole.ADMIN])
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/users/change-password")
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user)
):
    """Change the current user's password"""
    # Get user with password hash
    user_doc = await db.users.find_one({"id": current_user.id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    if not verify_password(password_data.current_password, user_doc['password_hash']):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    
    # Validate new password
    if len(password_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 6 caracteres")
    
    # Hash and save new password
    new_password_hash = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"password_hash": new_password_hash}}
    )
    
    return {"message": "Senha alterada com sucesso"}


# ============ HOLDPRINT & JOB ROUTES ============

@api_router.get("/holdprint/jobs/{branch}")
async def get_holdprint_jobs(
    branch: str, 
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020, le=2030),
    current_user: User = Depends(get_current_user)
):
    """Fetch jobs from Holdprint API"""
    if branch not in ["POA", "SP"]:
        raise HTTPException(status_code=400, detail="Branch must be POA or SP")
    
    jobs = await fetch_holdprint_jobs(branch, month, year)
    return {"success": True, "jobs": jobs}

@api_router.post("/jobs", response_model=Job)
async def create_job(job_data: JobCreate, current_user: User = Depends(get_current_user)):
    """Import job from Holdprint to local database"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Check if job already exists
    existing = await db.jobs.find_one({"holdprint_job_id": job_data.holdprint_job_id})
    if existing:
        raise HTTPException(status_code=400, detail="Job already imported")
    
    # Fetch from Holdprint
    holdprint_jobs = await fetch_holdprint_jobs(job_data.branch)
    holdprint_job = next((j for j in holdprint_jobs if str(j.get('id')) == job_data.holdprint_job_id), None)
    
    if not holdprint_job:
        raise HTTPException(status_code=404, detail="Job not found in Holdprint")
    
    # Calcular área dos produtos
    products_with_area, total_area_m2, total_products, total_quantity = calculate_job_products_area(holdprint_job)
    
    # Create job
    job = Job(
        holdprint_job_id=job_data.holdprint_job_id,
        title=holdprint_job.get('title', 'Sem título'),
        client_name=holdprint_job.get('customerName', 'Cliente não informado'),
        client_address='',
        branch=job_data.branch,
        items=holdprint_job.get('production', {}).get('items', []),
        holdprint_data=holdprint_job,
        # Campos calculados
        area_m2=total_area_m2,
        products_with_area=products_with_area,
        total_products=total_products,
        total_quantity=total_quantity
    )
    
    job_dict = job.model_dump()
    job_dict['created_at'] = job_dict['created_at'].isoformat()
    if job_dict.get('scheduled_date'):
        job_dict['scheduled_date'] = job_dict['scheduled_date'].isoformat()
    
    await db.jobs.insert_one(job_dict)
    return job

class BatchImportRequest(BaseModel):
    branch: str

@api_router.post("/jobs/import-all")
async def import_all_jobs(request: BatchImportRequest, current_user: User = Depends(get_current_user)):
    """Import all jobs from Holdprint in batch"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Fetch jobs from Holdprint
    holdprint_jobs = await fetch_holdprint_jobs(request.branch)
    
    imported = 0
    skipped = 0
    errors = []
    
    for holdprint_job in holdprint_jobs:
        holdprint_job_id = str(holdprint_job.get('id', ''))
        
        # Check if already exists
        existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
        if existing:
            skipped += 1
            continue
        
        try:
            # Calculate products and area
            products = holdprint_job.get('production', {}).get('products', [])
            products_with_area = []
            total_area_m2 = 0.0
            total_products = len(products)
            total_quantity = 0
            
            for product in products:
                product_info = extract_product_dimensions(product)
                product_with_area = {
                    "name": product.get('name', ''),
                    "quantity": product.get('quantity', 1),
                    "copies": product_info.get('copies', 1),
                    "width_m": product_info.get('width_m', 0),
                    "height_m": product_info.get('height_m', 0),
                    "unit_area_m2": product_info.get('area_m2', 0),
                    "total_area_m2": product_info.get('area_m2', 0) * product.get('quantity', 1)
                }
                products_with_area.append(product_with_area)
                total_area_m2 += product_with_area['total_area_m2']
                total_quantity += product.get('quantity', 1)
            
            # Create job
            job = Job(
                holdprint_job_id=holdprint_job_id,
                title=holdprint_job.get('title', 'Sem título'),
                client_name=holdprint_job.get('customerName', 'Cliente não informado'),
                client_address='',
                branch=request.branch,
                items=holdprint_job.get('production', {}).get('items', []),
                holdprint_data=holdprint_job,
                area_m2=total_area_m2,
                products_with_area=products_with_area,
                total_products=total_products,
                total_quantity=total_quantity
            )
            
            job_dict = job.model_dump()
            job_dict['created_at'] = job_dict['created_at'].isoformat()
            if job_dict.get('scheduled_date'):
                job_dict['scheduled_date'] = job_dict['scheduled_date'].isoformat()
            
            await db.jobs.insert_one(job_dict)
            imported += 1
            
        except Exception as e:
            errors.append(f"{holdprint_job.get('title', 'Unknown')}: {str(e)}")
    
    return {
        "success": True,
        "imported": imported,
        "skipped": skipped,
        "total": len(holdprint_jobs),
        "errors": errors[:5] if errors else []  # Return only first 5 errors
    }

@api_router.post("/jobs/import-current-month")
async def import_current_month_jobs(current_user: User = Depends(get_current_user)):
    """
    Importa automaticamente todos os jobs do mês atual de todas as filiais (SP e POA).
    Ideal para uso diário ou quando o usuário quer sincronizar rapidamente.
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year
    
    total_imported = 0
    total_skipped = 0
    total_errors = []
    branch_results = []
    
    for branch in ["SP", "POA"]:
        try:
            # Buscar jobs da Holdprint para o mês atual
            holdprint_jobs = await fetch_holdprint_jobs(branch, current_month, current_year)
            
            imported = 0
            skipped = 0
            errors = []
            
            for holdprint_job in holdprint_jobs:
                holdprint_job_id = str(holdprint_job.get('id', ''))
                
                # Check if already exists
                existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                if existing:
                    skipped += 1
                    continue
                
                try:
                    # Calculate products and area
                    products = holdprint_job.get('production', {}).get('products', [])
                    products_with_area = []
                    total_area_m2 = 0.0
                    total_products = len(products)
                    total_quantity = 0
                    
                    for product in products:
                        product_info = extract_product_dimensions(product)
                        product_with_area = {
                            "name": product.get('name', ''),
                            "quantity": product.get('quantity', 1),
                            "copies": product_info.get('copies', 1),
                            "width_m": product_info.get('width_m', 0),
                            "height_m": product_info.get('height_m', 0),
                            "unit_area_m2": product_info.get('area_m2', 0),
                            "total_area_m2": product_info.get('area_m2', 0) * product.get('quantity', 1)
                        }
                        products_with_area.append(product_with_area)
                        total_area_m2 += product_with_area['total_area_m2']
                        total_quantity += product.get('quantity', 1)
                    
                    # Create job
                    job = Job(
                        holdprint_job_id=holdprint_job_id,
                        title=holdprint_job.get('title', 'Sem título'),
                        client_name=holdprint_job.get('customerName', 'Cliente não informado'),
                        client_address='',
                        branch=branch,
                        items=holdprint_job.get('production', {}).get('items', []),
                        holdprint_data=holdprint_job,
                        area_m2=total_area_m2,
                        products_with_area=products_with_area,
                        total_products=total_products,
                        total_quantity=total_quantity
                    )
                    
                    job_dict = job.model_dump()
                    job_dict['created_at'] = job_dict['created_at'].isoformat()
                    if job_dict.get('scheduled_date'):
                        job_dict['scheduled_date'] = job_dict['scheduled_date'].isoformat()
                    
                    await db.jobs.insert_one(job_dict)
                    imported += 1
                    
                except Exception as e:
                    errors.append(f"{holdprint_job.get('title', 'Unknown')}: {str(e)}")
            
            branch_results.append({
                "branch": branch,
                "imported": imported,
                "skipped": skipped,
                "total": len(holdprint_jobs)
            })
            total_imported += imported
            total_skipped += skipped
            total_errors.extend(errors)
            
        except HTTPException as he:
            branch_results.append({
                "branch": branch,
                "imported": 0,
                "skipped": 0,
                "total": 0,
                "error": str(he.detail)
            })
            total_errors.append(f"{branch}: {str(he.detail)}")
        except Exception as e:
            branch_results.append({
                "branch": branch,
                "imported": 0,
                "skipped": 0,
                "total": 0,
                "error": str(e)
            })
            total_errors.append(f"{branch}: {str(e)}")
    
    return {
        "success": total_imported > 0 or total_skipped > 0,
        "month": current_month,
        "year": current_year,
        "total_imported": total_imported,
        "total_skipped": total_skipped,
        "branches": branch_results,
        "errors": total_errors[:5] if total_errors else []
    }

# ============ SINCRONIZAÇÃO AUTOMÁTICA HOLDPRINT ============

class SyncResult(BaseModel):
    branch: str
    month: int
    year: int
    imported: int
    skipped: int
    total: int
    errors: List[str] = []

@api_router.post("/jobs/sync-holdprint")
async def sync_holdprint_jobs(
    months_back: int = Query(2, ge=1, le=12, description="Quantos meses para trás buscar"),
    current_user: User = Depends(get_current_user)
):
    """
    Sincronização automática de OS da Holdprint.
    Busca jobs de todas as filiais (POA e SP) dos últimos N meses.
    Ideal para ser chamado diariamente via cron/scheduler.
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    results = []
    total_imported = 0
    total_skipped = 0
    total_errors = []
    
    # Calcular meses a buscar
    now = datetime.now(timezone.utc)
    months_to_sync = []
    
    for i in range(months_back + 1):  # Inclui mês atual
        target_date = now - timedelta(days=i * 30)
        month_year = (target_date.month, target_date.year)
        if month_year not in months_to_sync:
            months_to_sync.append(month_year)
    
    # Buscar de cada filial e cada mês
    for branch in ["POA", "SP"]:
        for month, year in months_to_sync:
            try:
                # Buscar jobs da Holdprint
                holdprint_jobs = await fetch_holdprint_jobs(branch, month, year)
                
                imported = 0
                skipped = 0
                errors = []
                
                for holdprint_job in holdprint_jobs:
                    holdprint_job_id = str(holdprint_job.get('id', ''))
                    
                    # Check if already exists
                    existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                    if existing:
                        skipped += 1
                        continue
                    
                    try:
                        # Calculate products and area
                        products = holdprint_job.get('production', {}).get('products', [])
                        products_with_area = []
                        total_area_m2 = 0.0
                        total_products = len(products)
                        total_quantity = 0
                        
                        for product in products:
                            product_info = extract_product_dimensions(product)
                            product_with_area = {
                                "name": product.get('name', ''),
                                "quantity": product.get('quantity', 1),
                                "copies": product_info.get('copies', 1),
                                "width_m": product_info.get('width_m', 0),
                                "height_m": product_info.get('height_m', 0),
                                "unit_area_m2": product_info.get('area_m2', 0),
                                "total_area_m2": product_info.get('area_m2', 0) * product.get('quantity', 1)
                            }
                            products_with_area.append(product_with_area)
                            total_area_m2 += product_with_area['total_area_m2']
                            total_quantity += product.get('quantity', 1)
                        
                        # Create job
                        job = Job(
                            holdprint_job_id=holdprint_job_id,
                            title=holdprint_job.get('title', 'Sem título'),
                            client_name=holdprint_job.get('customerName', 'Cliente não informado'),
                            client_address='',
                            branch=branch,
                            items=holdprint_job.get('production', {}).get('items', []),
                            holdprint_data=holdprint_job,
                            area_m2=total_area_m2,
                            products_with_area=products_with_area,
                            total_products=total_products,
                            total_quantity=total_quantity
                        )
                        
                        job_dict = job.model_dump()
                        job_dict['created_at'] = job_dict['created_at'].isoformat()
                        if job_dict.get('scheduled_date'):
                            job_dict['scheduled_date'] = job_dict['scheduled_date'].isoformat()
                        
                        await db.jobs.insert_one(job_dict)
                        imported += 1
                        
                    except Exception as e:
                        errors.append(f"{holdprint_job.get('title', 'Unknown')}: {str(e)}")
                
                results.append({
                    "branch": branch,
                    "month": month,
                    "year": year,
                    "imported": imported,
                    "skipped": skipped,
                    "total": len(holdprint_jobs),
                    "errors": errors[:3]
                })
                
                total_imported += imported
                total_skipped += skipped
                total_errors.extend(errors)
                
                logger.info(f"Sync {branch} {month}/{year}: {imported} imported, {skipped} skipped")
                
            except Exception as e:
                logger.error(f"Error syncing {branch} {month}/{year}: {str(e)}")
                results.append({
                    "branch": branch,
                    "month": month,
                    "year": year,
                    "imported": 0,
                    "skipped": 0,
                    "total": 0,
                    "errors": [str(e)]
                })
    
    # Registrar última sincronização
    await db.system_config.update_one(
        {"key": "last_holdprint_sync"},
        {
            "$set": {
                "key": "last_holdprint_sync",
                "value": datetime.now(timezone.utc).isoformat(),
                "total_imported": total_imported,
                "total_skipped": total_skipped
            }
        },
        upsert=True
    )
    
    return {
        "success": True,
        "sync_date": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_imported": total_imported,
            "total_skipped": total_skipped,
            "total_errors": len(total_errors)
        },
        "details": results
    }

@api_router.get("/jobs/sync-status")
async def get_sync_status(current_user: User = Depends(get_current_user)):
    """Verificar status da última sincronização com Holdprint"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    last_sync = await db.system_config.find_one({"key": "last_holdprint_sync"}, {"_id": 0})
    
    if not last_sync:
        return {
            "last_sync": None,
            "message": "Nenhuma sincronização realizada ainda"
        }
    
    return {
        "last_sync": last_sync.get("value"),
        "total_imported": last_sync.get("total_imported", 0),
        "total_skipped": last_sync.get("total_skipped", 0)
    }

@api_router.get("/jobs", response_model=List[Job])
async def list_jobs(current_user: User = Depends(get_current_user)):
    """List jobs based on user role"""
    query = {}
    
    # Installers only see their assigned jobs
    if current_user.role == UserRole.INSTALLER:
        installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            query["assigned_installers"] = installer['id']
        else:
            return []
    
    jobs = await db.jobs.find(query, {"_id": 0}).to_list(1000)
    
    # Get active check-ins to add started_at info for jobs in progress
    active_checkins = await db.item_checkins.find(
        {"status": "in_progress"},
        {"_id": 0, "job_id": 1, "checkin_at": 1}
    ).to_list(1000)
    
    # Create a map of job_id to earliest checkin_at
    job_start_times = {}
    for checkin in active_checkins:
        job_id = checkin.get("job_id")
        checkin_at = checkin.get("checkin_at")
        if job_id and checkin_at:
            if isinstance(checkin_at, str):
                checkin_at = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
            if job_id not in job_start_times or checkin_at < job_start_times[job_id]:
                job_start_times[job_id] = checkin_at
    
    for job in jobs:
        if isinstance(job['created_at'], str):
            job['created_at'] = datetime.fromisoformat(job['created_at'])
        if job.get('scheduled_date') and isinstance(job['scheduled_date'], str):
            job['scheduled_date'] = datetime.fromisoformat(job['scheduled_date'])
        
        # Add started_at for jobs that have active checkins
        job_id = job.get('id')
        if job_id in job_start_times:
            job['started_at'] = job_start_times[job_id].isoformat()
            job['last_checkin_at'] = job_start_times[job_id].isoformat()
    
    return jobs

@api_router.get("/jobs/team-calendar")
async def get_team_calendar_jobs(current_user: User = Depends(get_current_user)):
    """
    Get all scheduled jobs for the team calendar view.
    Installers can see all scheduled jobs (not just their own) to know what the team is doing.
    """
    # Get all jobs that have a scheduled date
    jobs = await db.jobs.find(
        {"scheduled_date": {"$exists": True, "$ne": None}}, 
        {"_id": 0}
    ).to_list(500)
    
    # Process dates and clean data
    cleaned_jobs = []
    for job in jobs:
        # Convert dates
        if isinstance(job.get('created_at'), str):
            pass  # Keep as string
        elif job.get('created_at'):
            job['created_at'] = job['created_at'].isoformat() if hasattr(job['created_at'], 'isoformat') else str(job['created_at'])
        
        if isinstance(job.get('scheduled_date'), str):
            pass  # Keep as string
        elif job.get('scheduled_date'):
            job['scheduled_date'] = job['scheduled_date'].isoformat() if hasattr(job['scheduled_date'], 'isoformat') else str(job['scheduled_date'])
        
        # Create a clean job dict with only serializable fields
        clean_job = {
            "id": job.get("id"),
            "title": job.get("title"),
            "status": job.get("status"),
            "branch": job.get("branch"),
            "scheduled_date": job.get("scheduled_date"),
            "created_at": job.get("created_at"),
            "assigned_installers": job.get("assigned_installers", []),
            "holdprint_data": job.get("holdprint_data", {}),
            "client_name": job.get("client_name"),
        }
        cleaned_jobs.append(clean_job)
    
    return cleaned_jobs

@api_router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, current_user: User = Depends(get_current_user)):
    job_doc = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Auto-populate products_with_area if empty
    if not job_doc.get('products_with_area') or len(job_doc.get('products_with_area', [])) == 0:
        products_with_area = []
        total_area_m2 = 0.0
        
        # Try items first
        items = job_doc.get('items', [])
        if items:
            for item in items:
                product_info = extract_product_dimensions(item)
                quantity = item.get('quantity', 1)
                unit_area = product_info.get('area_m2', 0)
                total_area = unit_area * quantity
                
                product_with_area = {
                    "name": item.get('name', 'Item'),
                    "quantity": quantity,
                    "width_m": product_info.get('width_m'),
                    "height_m": product_info.get('height_m'),
                    "unit_area_m2": unit_area,
                    "total_area_m2": total_area
                }
                products_with_area.append(product_with_area)
                total_area_m2 += total_area
        
        # If no items, try holdprint_data.products
        if not products_with_area:
            holdprint_products = job_doc.get('holdprint_data', {}).get('products', [])
            for product in holdprint_products:
                product_info = extract_product_dimensions(product)
                quantity = product.get('quantity', 1)
                unit_area = product_info.get('area_m2', 0)
                total_area = unit_area * quantity
                
                product_with_area = {
                    "name": product.get('name', 'Produto'),
                    "quantity": quantity,
                    "width_m": product_info.get('width_m'),
                    "height_m": product_info.get('height_m'),
                    "unit_area_m2": unit_area,
                    "total_area_m2": total_area
                }
                products_with_area.append(product_with_area)
                total_area_m2 += total_area
        
        # Update job in database
        if products_with_area:
            await db.jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "products_with_area": products_with_area,
                    "area_m2": total_area_m2,
                    "total_products": len(products_with_area)
                }}
            )
            job_doc['products_with_area'] = products_with_area
            job_doc['area_m2'] = total_area_m2
            job_doc['total_products'] = len(products_with_area)
    
    # Check if installer is assigned to this job or any item
    if current_user.role == UserRole.INSTALLER:
        installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            installer_id = installer['id']
            job_assigned_installers = job_doc.get('assigned_installers') or []
            item_assignments = job_doc.get('item_assignments') or []
            
            # Check job-level assignment
            has_access = installer_id in job_assigned_installers
            
            # Check item-level assignment
            if not has_access:
                for assignment in item_assignments:
                    # Check both installer_id (singular) and installer_ids (plural) for compatibility
                    if assignment.get('installer_id') == installer_id:
                        has_access = True
                        break
                    if installer_id in assignment.get('installer_ids', []):
                        has_access = True
                        break
            
            if not has_access:
                raise HTTPException(status_code=403, detail="Você não tem acesso a este job")
        else:
            raise HTTPException(status_code=403, detail="Instalador não encontrado")
    
    if isinstance(job_doc['created_at'], str):
        job_doc['created_at'] = datetime.fromisoformat(job_doc['created_at'])
    if job_doc.get('scheduled_date') and isinstance(job_doc['scheduled_date'], str):
        job_doc['scheduled_date'] = datetime.fromisoformat(job_doc['scheduled_date'])
    
    return Job(**job_doc)

@api_router.put("/jobs/{job_id}/assign", response_model=Job)
async def assign_job(job_id: str, assign_data: JobAssign, current_user: User = Depends(get_current_user)):
    """Assign installers to a job"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    result = await db.jobs.find_one_and_update(
        {"id": job_id},
        {"$set": {"assigned_installers": assign_data.installer_ids}},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    if result.get('scheduled_date') and isinstance(result['scheduled_date'], str):
        result['scheduled_date'] = datetime.fromisoformat(result['scheduled_date'])
    
    return Job(**result)

@api_router.put("/jobs/{job_id}/schedule", response_model=Job)
async def schedule_job(job_id: str, schedule_data: JobSchedule, current_user: User = Depends(get_current_user)):
    """Schedule a job"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    update_data = {"scheduled_date": schedule_data.scheduled_date.isoformat()}
    if schedule_data.installer_ids:
        update_data["assigned_installers"] = schedule_data.installer_ids
    
    result = await db.jobs.find_one_and_update(
        {"id": job_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    if result.get('scheduled_date') and isinstance(result['scheduled_date'], str):
        result['scheduled_date'] = datetime.fromisoformat(result['scheduled_date'])
    
    return Job(**result)

@api_router.put("/jobs/{job_id}", response_model=Job)
async def update_job(job_id: str, job_update: dict, current_user: User = Depends(get_current_user)):
    """Update job details (status, schedule, assignments, etc)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Prepare update data
    update_data = {}
    
    # Handle allowed fields
    if "status" in job_update:
        update_data["status"] = job_update["status"]
    
    if "scheduled_date" in job_update:
        # Convert to datetime if string
        if isinstance(job_update["scheduled_date"], str):
            update_data["scheduled_date"] = job_update["scheduled_date"]
        else:
            update_data["scheduled_date"] = job_update["scheduled_date"].isoformat()
    
    if "assigned_installers" in job_update:
        update_data["assigned_installers"] = job_update["assigned_installers"]
    
    if "client_name" in job_update:
        update_data["client_name"] = job_update["client_name"]
    
    if "client_address" in job_update:
        update_data["client_address"] = job_update["client_address"]
    
    if "title" in job_update:
        update_data["title"] = job_update["title"]
    
    if "area_m2" in job_update:
        update_data["area_m2"] = job_update["area_m2"]
    
    if "no_installation" in job_update:
        update_data["no_installation"] = job_update["no_installation"]
    
    if "notes" in job_update:
        update_data["notes"] = job_update["notes"]
    
    if "cancelled_at" in job_update:
        update_data["cancelled_at"] = job_update["cancelled_at"]
    
    if "exclude_from_metrics" in job_update:
        update_data["exclude_from_metrics"] = job_update["exclude_from_metrics"]
    
    if "item_assignments" in job_update:
        update_data["item_assignments"] = job_update["item_assignments"]
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    result = await db.jobs.find_one_and_update(
        {"id": job_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    if result.get('scheduled_date') and isinstance(result['scheduled_date'], str):
        result['scheduled_date'] = datetime.fromisoformat(result['scheduled_date'])
    
    return Job(**result)

@api_router.post("/jobs/{job_id}/assign-items")
async def assign_items_to_installers(job_id: str, assignment: ItemAssignment, current_user: User = Depends(get_current_user)):
    """
    Atribui itens específicos do job a instaladores.
    Permite selecionar múltiplos itens e atribuir a um ou mais instaladores.
    Inclui nível de dificuldade e cenário definidos pelo gerente.
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Buscar job
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Buscar instaladores
    installers = await db.installers.find({"id": {"$in": assignment.installer_ids}}, {"_id": 0}).to_list(100)
    installer_map = {i["id"]: i for i in installers}
    
    if len(installers) != len(assignment.installer_ids):
        raise HTTPException(status_code=400, detail="One or more installers not found")
    
    # Validar índices dos itens
    products = job.get("products_with_area", [])
    if not products:
        # Se não tiver products_with_area, usar holdprint_data.products
        products = job.get("holdprint_data", {}).get("products", [])
    
    for idx in assignment.item_indices:
        if idx < 0 or idx >= len(products):
            raise HTTPException(status_code=400, detail=f"Invalid item index: {idx}")
    
    # Criar atribuições
    current_assignments = job.get("item_assignments", [])
    now = datetime.now(timezone.utc).isoformat()
    
    new_assignments = []
    total_m2_assigned = 0
    
    for item_idx in assignment.item_indices:
        product = products[item_idx] if item_idx < len(products) else None
        item_area = product.get("total_area_m2") if product else 0
        item_area = item_area if item_area is not None else 0
        
        for installer_id in assignment.installer_ids:
            installer = installer_map.get(installer_id)
            
            # Remover atribuição anterior do mesmo item (se existir)
            current_assignments = [a for a in current_assignments 
                                  if not (a.get("item_index") == item_idx and a.get("installer_id") == installer_id)]
            
            # Calcular m² por instalador (dividir igualmente se múltiplos instaladores)
            m2_per_installer = round(item_area / len(assignment.installer_ids), 2) if item_area and item_area > 0 else 0
            
            new_assignment = {
                "item_index": item_idx,
                "item_name": product.get("name", f"Item {item_idx}") if product else f"Item {item_idx}",
                "installer_id": installer_id,
                "installer_name": installer.get("full_name", ""),
                "assigned_at": now,
                "item_area_m2": item_area,
                "assigned_m2": m2_per_installer,
                "status": "pending",  # pending, in_progress, completed
                # Campos definidos pelo gerente
                "manager_difficulty_level": assignment.difficulty_level,
                "manager_scenario_category": assignment.scenario_category,
                "assigned_by": current_user.id
            }
            new_assignments.append(new_assignment)
            total_m2_assigned += m2_per_installer
    
    # Se apply_to_all está ativado, atualizar também a configuração do job
    if assignment.apply_to_all and (assignment.difficulty_level or assignment.scenario_category):
        job_config = job.get("installation_config", {})
        if assignment.difficulty_level:
            job_config["default_difficulty_level"] = assignment.difficulty_level
        if assignment.scenario_category:
            job_config["default_scenario_category"] = assignment.scenario_category
        
        await db.jobs.update_one(
            {"id": job_id},
            {"$set": {"installation_config": job_config}}
        )
    
    # Combinar atribuições
    all_assignments = current_assignments + new_assignments
    
    # Atualizar assigned_installers do job (lista única de IDs)
    all_installer_ids = list(set([a["installer_id"] for a in all_assignments]))
    
    # Atualizar job
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "item_assignments": all_assignments,
            "assigned_installers": all_installer_ids
        }}
    )
    
    return {
        "message": f"{len(new_assignments)} atribuições criadas",
        "total_m2_assigned": total_m2_assigned,
        "assignments": new_assignments
    }

@api_router.get("/jobs/{job_id}/assignments")
async def get_job_assignments(job_id: str, current_user: User = Depends(get_current_user)):
    """
    Retorna as atribuições de itens do job, agrupadas por instalador.
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTALLER])
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    assignments = job.get("item_assignments", [])
    products = job.get("products_with_area", []) or job.get("holdprint_data", {}).get("products", [])
    
    # Agrupar por instalador
    by_installer = {}
    for assignment in assignments:
        installer_id = assignment.get("installer_id")
        if installer_id not in by_installer:
            by_installer[installer_id] = {
                "installer_id": installer_id,
                "installer_name": assignment.get("installer_name"),
                "items": [],
                "total_m2": 0
            }
        
        by_installer[installer_id]["items"].append(assignment)
        by_installer[installer_id]["total_m2"] += assignment.get("assigned_m2", 0)
    
    # Agrupar por item
    by_item = {}
    for assignment in assignments:
        item_idx = assignment.get("item_index")
        if item_idx not in by_item:
            product = products[item_idx] if item_idx < len(products) else {}
            item_area = product.get("total_area_m2", 0) or 0
            by_item[item_idx] = {
                "item_index": item_idx,
                "item_name": product.get("name", f"Item {item_idx}"),
                "item_area_m2": item_area,
                "installers": []
            }
        
        by_item[item_idx]["installers"].append({
            "installer_id": assignment.get("installer_id"),
            "installer_name": assignment.get("installer_name"),
            "assigned_m2": assignment.get("assigned_m2"),
            "status": assignment.get("status")
        })
    
    return {
        "job_id": job_id,
        "job_title": job.get("title"),
        "total_area_m2": job.get("area_m2", 0),
        "by_installer": list(by_installer.values()),
        "by_item": list(by_item.values()),
        "all_assignments": assignments
    }

@api_router.put("/jobs/{job_id}/assignments/{item_index}/status")
async def update_assignment_status(job_id: str, item_index: int, status_update: dict, current_user: User = Depends(get_current_user)):
    """
    Atualiza o status de uma atribuição de item (instalador reportando progresso).
    """
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    new_status = status_update.get("status")
    installed_m2 = status_update.get("installed_m2")
    
    if new_status not in ["pending", "in_progress", "completed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    assignments = job.get("item_assignments", [])
    updated = False
    
    for assignment in assignments:
        if assignment.get("item_index") == item_index:
            # Se for instalador, só pode atualizar sua própria atribuição
            if current_user.role == UserRole.INSTALLER:
                installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
                if not installer or installer.get("id") != assignment.get("installer_id"):
                    continue
            
            assignment["status"] = new_status
            if installed_m2 is not None:
                assignment["installed_m2"] = installed_m2
            if new_status == "completed":
                assignment["completed_at"] = datetime.now(timezone.utc).isoformat()
            updated = True
    
    if not updated:
        raise HTTPException(status_code=404, detail="Assignment not found or unauthorized")
    
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"item_assignments": assignments}}
    )
    
    return {"message": "Assignment status updated", "assignments": assignments}

# ============ CHECK-IN/OUT ROUTES ============
# NOTE: Legacy check-in routes have been migrated to routes/checkins.py
# The router is included via: api_router.include_router(checkins_router, tags=["Check-ins"])

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


async def detect_product_family(product_names: list) -> tuple:
    """
    Detects the product family based on product names.
    Returns (family_id, family_name) tuple.
    """
    # Get all families
    families = await db.product_families.find({}, {"_id": 0}).to_list(100)
    
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
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Check if job exists
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete all related checkins
    await db.checkins.delete_many({"job_id": job_id})
    
    # Delete all related item checkins
    await db.item_checkins.delete_many({"job_id": job_id})
    
    # Delete all related installed products
    await db.installed_products.delete_many({"job_id": job_id})
    
    # Delete the job
    await db.jobs.delete_one({"id": job_id})
    
    return {"message": "Job and all related data deleted successfully"}

@api_router.delete("/item-checkins/{checkin_id}")
async def delete_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an item check-in - Only admin and managers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Check if item checkin exists
    checkin = await db.item_checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    # Delete the item checkin
    await db.item_checkins.delete_one({"id": checkin_id})
    
    # Also delete related installed products
    await db.installed_products.delete_many({"checkin_id": checkin_id})
    
    return {"message": "Item check-in deleted successfully"}

@api_router.put("/item-checkins/{checkin_id}/archive")
async def archive_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Archive an item check-in - Only admin and managers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Check if item checkin exists
    checkin = await db.item_checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    # Archive the item checkin
    await db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"archived": True, "archived_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Item check-in archived successfully"}

# ============ ITEM CHECK-IN/OUT ROUTES (per item) ============

@api_router.post("/item-checkins")
async def create_item_checkin(
    job_id: str = Form(...),
    item_index: int = Form(...),
    photo_base64: Optional[str] = Form(None),
    gps_lat: Optional[float] = Form(None),
    gps_long: Optional[float] = Form(None),
    gps_accuracy: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Create a check-in for a specific item in a job"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can create item check-ins")
    
    # Get installer
    installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
    if not installer:
        raise HTTPException(status_code=404, detail="Installer not found")
    
    # Get job and item info
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check if installer is assigned to this job OR to this specific item
    job_assigned_installers = job.get("assigned_installers", [])
    item_assignments = job.get("item_assignments", [])
    
    # Check item-level assignment first
    item_assigned = False
    for assignment in item_assignments:
        # Check if this assignment is for the requested item_index
        if assignment.get("item_index") == item_index:
            # Check if installer matches (can be installer_id or in installer_ids list)
            if assignment.get("installer_id") == installer["id"]:
                item_assigned = True
                break
            if installer["id"] in assignment.get("installer_ids", []):
                item_assigned = True
                break
    
    # If not item-assigned, check job-level assignment
    if not item_assigned and installer["id"] not in job_assigned_installers:
        raise HTTPException(status_code=403, detail="Você não está atribuído a este item")
    
    # Get products - try products_with_area first, then items
    products = job.get("products_with_area", [])
    if not products:
        # Fallback to items if products_with_area is empty
        products = job.get("items", [])
    
    if not products or item_index >= len(products):
        raise HTTPException(status_code=400, detail=f"Item inválido. O job tem {len(products)} itens.")
    
    product = products[item_index]
    
    # Check if item already has an active checkin
    existing = await db.item_checkins.find_one({
        "job_id": job_id,
        "item_index": item_index,
        "installer_id": installer["id"],
        "status": "in_progress"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Item already has an active check-in")
    
    # Detect family
    family_id, family_name = await detect_product_family([product.get("name", "")])
    
    # Compress photo if provided
    compressed_photo = None
    if photo_base64:
        compressed_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
    
    # Create item checkin
    item_checkin = ItemCheckin(
        job_id=job_id,
        item_index=item_index,
        installer_id=installer["id"],
        checkin_photo=compressed_photo,
        gps_lat=gps_lat,
        gps_long=gps_long,
        gps_accuracy=gps_accuracy,
        product_name=product.get("name", f"Item {item_index}"),
        family_name=family_name
    )
    
    checkin_dict = item_checkin.model_dump()
    checkin_dict['checkin_at'] = checkin_dict['checkin_at'].isoformat()
    await db.item_checkins.insert_one(checkin_dict)
    
    # Remove _id before returning
    checkin_dict.pop('_id', None)
    
    # Update job status
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "in_progress"}})
    
    return checkin_dict

@api_router.get("/item-checkins")
async def get_item_checkins(
    job_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Get item check-ins for a job"""
    query = {}
    
    if current_user.role == UserRole.INSTALLER:
        installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            query["installer_id"] = installer["id"]
    
    if job_id:
        query["job_id"] = job_id
    
    checkins = await db.item_checkins.find(query, {"_id": 0}).to_list(1000)
    
    # Convert datetime strings
    for c in checkins:
        if isinstance(c.get('checkin_at'), str):
            c['checkin_at'] = datetime.fromisoformat(c['checkin_at'])
        if c.get('checkout_at') and isinstance(c['checkout_at'], str):
            c['checkout_at'] = datetime.fromisoformat(c['checkout_at'])
    
    return checkins


@api_router.get("/item-checkins/all")
async def get_all_item_checkins(
    current_user: User = Depends(get_current_user)
):
    """Get all item check-ins with photos for reports (Admin/Manager only)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    checkins = await db.item_checkins.find({}, {"_id": 0}).to_list(5000)
    jobs_map = {}
    installers_map = {}
    
    # Get all jobs and installers for enrichment
    jobs = await db.jobs.find({}, {"_id": 0, "id": 1, "title": 1, "client_name": 1}).to_list(1000)
    installers = await db.installers.find({}, {"_id": 0, "id": 1, "full_name": 1}).to_list(100)
    
    for job in jobs:
        jobs_map[job["id"]] = job
    for installer in installers:
        installers_map[installer["id"]] = installer
    
    # Enrich checkins with job and installer info
    enriched_checkins = []
    for c in checkins:
        job = jobs_map.get(c.get("job_id"), {})
        installer = installers_map.get(c.get("installer_id"), {})
        
        # Normalize checkin_at to string for consistent sorting
        checkin_at = c.get("checkin_at", "")
        if isinstance(checkin_at, datetime):
            checkin_at = checkin_at.isoformat()
        
        enriched = {
            **c,
            "checkin_at": checkin_at,
            "job_title": job.get("title", "N/A"),
            "client_name": job.get("client_name", "N/A"),
            "installer_name": installer.get("full_name", "N/A")
        }
        enriched_checkins.append(enriched)
    
    # Sort by checkin_at descending (most recent first)
    enriched_checkins.sort(key=lambda x: x.get("checkin_at", ""), reverse=True)
    
    return enriched_checkins

@api_router.put("/item-checkins/{checkin_id}/checkout")
async def complete_item_checkout(
    checkin_id: str,
    photo_base64: Optional[str] = Form(None),
    gps_lat: Optional[float] = Form(None),
    gps_long: Optional[float] = Form(None),
    gps_accuracy: Optional[float] = Form(None),
    installed_m2: Optional[float] = Form(None),
    complexity_level: Optional[int] = Form(None),
    height_category: Optional[str] = Form(None),
    scenario_category: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Complete checkout for a specific item, calculating net time (excluding pauses)"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can complete item checkouts")
    
    # Get checkin
    checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    if checkin["status"] == "completed":
        raise HTTPException(status_code=400, detail="Item already checked out")
    
    # ============ GPS DISTANCE VALIDATION ============
    location_alert = None
    auto_paused = False
    distance_meters = 0
    
    checkin_lat = checkin.get("gps_lat")
    checkin_long = checkin.get("gps_long")
    
    if checkin_lat and checkin_long and gps_lat and gps_long:
        distance_meters = calculate_gps_distance(checkin_lat, checkin_long, gps_lat, gps_long)
        
        if distance_meters > MAX_CHECKOUT_DISTANCE_METERS:
            # Log the location alert
            location_log = {
                "id": str(uuid.uuid4()),
                "item_checkin_id": checkin_id,
                "job_id": checkin.get("job_id"),
                "installer_id": checkin.get("installer_id"),
                "event_type": "location_alert",
                "checkin_lat": checkin_lat,
                "checkin_long": checkin_long,
                "checkout_lat": gps_lat,
                "checkout_long": gps_long,
                "distance_meters": round(distance_meters, 2),
                "max_allowed_meters": MAX_CHECKOUT_DISTANCE_METERS,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "action_taken": "auto_pause"
            }
            await db.location_alerts.insert_one(location_log)
            
            # Auto-pause the check-in if not already paused
            if checkin["status"] != "paused":
                pause_reason = f"Saiu do local sem justificar (distância: {round(distance_meters)}m)"
                pause_log = {
                    "id": str(uuid.uuid4()),
                    "item_checkin_id": checkin_id,
                    "reason": pause_reason,
                    "start_time": datetime.now(timezone.utc).isoformat(),
                    "end_time": datetime.now(timezone.utc).isoformat(),  # Immediately end since we're checking out
                    "duration_minutes": 0,
                    "auto_generated": True
                }
                await db.item_pause_logs.insert_one(pause_log)
                auto_paused = True
            
            location_alert = {
                "type": "location_exceeded",
                "message": f"Checkout realizado a {round(distance_meters)}m do local do check-in (máximo: {MAX_CHECKOUT_DISTANCE_METERS}m)",
                "distance_meters": round(distance_meters, 2),
                "auto_paused": auto_paused
            }
            logging.warning(f"Location alert: Installer {checkin.get('installer_id')} checked out {round(distance_meters)}m from check-in location")
    # ============ END GPS VALIDATION ============
    
    # If currently paused, end the pause first
    if checkin["status"] == "paused":
        active_pause = await db.item_pause_logs.find_one({
            "item_checkin_id": checkin_id,
            "end_time": None
        }, {"_id": 0})
        if active_pause:
            end_time = datetime.now(timezone.utc)
            start_time = active_pause['start_time']
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)
            pause_duration = int((end_time - start_time).total_seconds() / 60)
            await db.item_pause_logs.update_one(
                {"id": active_pause["id"]},
                {"$set": {"end_time": end_time.isoformat(), "duration_minutes": pause_duration}}
            )
    
    # Calculate total duration (gross time)
    checkin_at = checkin['checkin_at']
    if isinstance(checkin_at, str):
        checkin_at = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
    if checkin_at.tzinfo is None:
        checkin_at = checkin_at.replace(tzinfo=timezone.utc)
    
    checkout_at = datetime.now(timezone.utc)
    duration_minutes = int((checkout_at - checkin_at).total_seconds() / 60)
    
    # Calculate total pause time
    pause_logs = await db.item_pause_logs.find({"item_checkin_id": checkin_id}, {"_id": 0}).to_list(100)
    total_pause_minutes = sum(p.get("duration_minutes", 0) or 0 for p in pause_logs)
    
    # Calculate net time (working time)
    net_duration_minutes = max(0, duration_minutes - total_pause_minutes)
    
    # Calculate productivity using NET time (tempo líquido)
    productivity_m2_h = None
    if installed_m2 and installed_m2 > 0 and net_duration_minutes > 0:
        hours = net_duration_minutes / 60
        productivity_m2_h = round(installed_m2 / hours, 2)
    
    # Compress checkout photo if provided
    compressed_checkout_photo = None
    if photo_base64:
        compressed_checkout_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
    
    # Update checkin with both gross and net times
    update_data = {
        "checkout_at": checkout_at.isoformat(),
        "checkout_photo": compressed_checkout_photo,
        "checkout_gps_lat": gps_lat,
        "checkout_gps_long": gps_long,
        "checkout_gps_accuracy": gps_accuracy,
        "installed_m2": installed_m2,
        "complexity_level": complexity_level,
        "height_category": height_category,
        "scenario_category": scenario_category,
        "notes": notes,
        "duration_minutes": duration_minutes,  # Tempo bruto
        "net_duration_minutes": net_duration_minutes,  # Tempo líquido
        "total_pause_minutes": total_pause_minutes,  # Total de pausas
        "productivity_m2_h": productivity_m2_h,  # Calculado com tempo líquido
        "status": "completed"
    }
    
    await db.item_checkins.update_one({"id": checkin_id}, {"$set": update_data})
    
    # Register installed product with NET time
    job = await db.jobs.find_one({"id": checkin["job_id"]}, {"_id": 0})
    if job:
        products = job.get("products_with_area", [])
        product = products[checkin["item_index"]] if checkin["item_index"] < len(products) else {}
        
        family_id, family_name = await detect_product_family([product.get("name", "")])
        
        installed_product = ProductInstalled(
            job_id=checkin["job_id"],
            checkin_id=checkin_id,
            product_name=product.get("name", f"Item {checkin['item_index']}"),
            family_id=family_id,
            family_name=family_name,
            width_m=product.get("width"),
            height_m=product.get("height"),
            area_m2=installed_m2 or product.get("total_area_m2", 0),
            complexity_level=complexity_level or 1,
            height_category=height_category or "terreo",
            scenario_category=scenario_category or "loja_rua",
            actual_time_min=net_duration_minutes,  # Usar tempo LÍQUIDO
            productivity_m2_h=productivity_m2_h,
            cause_notes=notes
        )
        
        await db.installed_products.insert_one(installed_product.model_dump())
        await update_productivity_history(installed_product)
    
    # Check if all ASSIGNED items in job are completed
    job = await db.jobs.find_one({"id": checkin["job_id"]}, {"_id": 0})
    job_checkins = await db.item_checkins.find({"job_id": checkin["job_id"]}, {"_id": 0}).to_list(1000)
    
    # Get all assigned item indices (support both field names for compatibility)
    item_assignments = job.get("item_assignments", []) if job else []
    assigned_item_indices = set()
    for assignment in item_assignments:
        # Support both item_index (singular) and item_indices (plural)
        if "item_index" in assignment:
            assigned_item_indices.add(assignment["item_index"])
        if "item_indices" in assignment:
            for idx in assignment["item_indices"]:
                assigned_item_indices.add(idx)
    
    # If no specific items assigned, consider all products
    if not assigned_item_indices:
        products = job.get("products_with_area", []) if job else []
        assigned_item_indices = set(range(len(products)))
    
    # Check if all assigned items have completed checkins
    completed_item_indices = set(c["item_index"] for c in job_checkins if c["status"] == "completed")
    all_assigned_completed = assigned_item_indices.issubset(completed_item_indices) if assigned_item_indices else False
    
    if all_assigned_completed and len(assigned_item_indices) > 0:
        await db.jobs.update_one({"id": checkin["job_id"]}, {"$set": {"status": "completed"}})
    
    # ============ GAMIFICATION: Process coins for checkout ============
    gamification_result = None
    try:
        # Get updated checkin with installed_m2
        updated_checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
        if updated_checkin and updated_checkin.get("installed_m2", 0) > 0:
            coin_result = await calculate_checkout_coins(updated_checkin, job)
            
            if coin_result["total_coins"] > 0:
                installer_user_id = None
                # Get installer's user_id
                installer = await db.installers.find_one({"id": updated_checkin.get("installer_id")}, {"_id": 0})
                if installer:
                    installer_user_id = installer.get("user_id")
                
                if installer_user_id:
                    gamification_result = await award_coins(
                        user_id=installer_user_id,
                        amount=coin_result["total_coins"],
                        transaction_type="earn_checkout",
                        description=f"Checkout: {job.get('title', 'Job')[:30]}",
                        reference_id=checkin_id,
                        breakdown=coin_result["breakdown"]
                    )
                    if gamification_result:
                        gamification_result["breakdown"] = coin_result["breakdown"]
                        gamification_result["installed_m2"] = coin_result["installed_m2"]
    except Exception as e:
        logging.warning(f"Gamification processing error (non-blocking): {e}")
    # ============ END GAMIFICATION ============
    
    # Return updated checkin with location alert if any
    result = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    
    # Add location alert to response if distance exceeded
    if location_alert:
        result["location_alert"] = location_alert
        result["checkout_distance_meters"] = round(distance_meters, 2)
    
    # Add gamification result to response
    if gamification_result:
        result["gamification"] = gamification_result
    
    return result


@api_router.get("/location-alerts")
async def get_location_alerts(
    current_user: User = Depends(get_current_user)
):
    """Get all location alerts (admin/manager only)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    alerts = await db.location_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich with job and installer info
    enriched = []
    for alert in alerts:
        job = await db.jobs.find_one({"id": alert.get("job_id")}, {"_id": 0, "title": 1, "client_name": 1})
        installer = await db.installers.find_one({"id": alert.get("installer_id")}, {"_id": 0, "full_name": 1})
        
        enriched.append({
            **alert,
            "job_title": job.get("title") if job else "N/A",
            "client_name": job.get("client_name") if job else "N/A",
            "installer_name": installer.get("full_name") if installer else "N/A"
        })
    
    return enriched


@api_router.post("/item-checkins/{checkin_id}/pause")
async def pause_item_checkin(
    checkin_id: str,
    reason: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Pause an item checkin and log the reason"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can pause item checkouts")
    
    # Get checkin
    checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    if checkin["status"] == "completed":
        raise HTTPException(status_code=400, detail="Cannot pause a completed item")
    
    if checkin["status"] == "paused":
        raise HTTPException(status_code=400, detail="Item is already paused")
    
    # Create pause log
    pause_log = ItemPauseLog(
        item_checkin_id=checkin_id,
        job_id=checkin["job_id"],
        item_index=checkin["item_index"],
        installer_id=checkin["installer_id"],
        reason=reason
    )
    
    await db.item_pause_logs.insert_one(pause_log.model_dump())
    
    # Update checkin status to paused
    await db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"status": "paused"}}
    )
    
    return {
        "message": "Item paused successfully",
        "pause_id": pause_log.id,
        "reason": reason,
        "start_time": pause_log.start_time.isoformat()
    }


@api_router.post("/item-checkins/{checkin_id}/resume")
async def resume_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Resume a paused item checkin"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can resume item checkouts")
    
    # Get checkin
    checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    if checkin["status"] != "paused":
        raise HTTPException(status_code=400, detail="Item is not paused")
    
    # Find the active pause log
    active_pause = await db.item_pause_logs.find_one({
        "item_checkin_id": checkin_id,
        "end_time": None
    }, {"_id": 0})
    
    if not active_pause:
        raise HTTPException(status_code=400, detail="No active pause found")
    
    # Calculate pause duration
    end_time = datetime.now(timezone.utc)
    start_time = active_pause['start_time']
    if isinstance(start_time, str):
        start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    
    pause_duration = int((end_time - start_time).total_seconds() / 60)
    
    # Update pause log
    await db.item_pause_logs.update_one(
        {"id": active_pause["id"]},
        {"$set": {"end_time": end_time.isoformat(), "duration_minutes": pause_duration}}
    )
    
    # Update checkin status back to in_progress
    await db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"status": "in_progress"}}
    )
    
    return {
        "message": "Item resumed successfully",
        "pause_duration_minutes": pause_duration,
        "resumed_at": end_time.isoformat()
    }


@api_router.get("/item-checkins/{checkin_id}/pauses")
async def get_item_pause_logs(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all pause logs for an item checkin"""
    pause_logs = await db.item_pause_logs.find(
        {"item_checkin_id": checkin_id},
        {"_id": 0}
    ).to_list(100)
    
    # Add reason labels
    for log in pause_logs:
        log["reason_label"] = PAUSE_REASON_LABELS.get(log.get("reason"), log.get("reason"))
    
    # Calculate total pause time
    total_pause_minutes = sum(p.get("duration_minutes", 0) or 0 for p in pause_logs if p.get("duration_minutes"))
    active_pause = next((p for p in pause_logs if p.get("end_time") is None), None)
    
    return {
        "pauses": pause_logs,
        "total_pause_minutes": total_pause_minutes,
        "has_active_pause": active_pause is not None,
        "active_pause": active_pause
    }


@api_router.get("/pause-reasons")
async def get_pause_reasons():
    """Get list of valid pause reasons"""
    return {
        "reasons": PAUSE_REASONS,
        "labels": PAUSE_REASON_LABELS
    }

# ============ INSTALLER ROUTES ============

@api_router.get("/installers", response_model=List[Installer])
async def list_installers(current_user: User = Depends(get_current_user)):
    # Allow installers to see basic info about other installers (for team calendar)
    # Admin/Manager see full data
    
    installers = await db.installers.find({}, {"_id": 0}).to_list(1000)
    
    for installer in installers:
        if isinstance(installer['created_at'], str):
            installer['created_at'] = datetime.fromisoformat(installer['created_at'])
    
    return installers

@api_router.put("/installers/{installer_id}", response_model=Installer)
async def update_installer(installer_id: str, installer_data: dict, current_user: User = Depends(get_current_user)):
    await require_role(current_user, [UserRole.ADMIN])
    
    update_data = {k: v for k, v in installer_data.items() if k not in ['id', 'user_id', 'created_at']}
    
    result = await db.installers.find_one_and_update(
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

# ============ PRODUCT FAMILIES ENDPOINTS ============

@api_router.get("/product-families")
async def get_product_families(current_user: User = Depends(get_current_user)):
    """List all product families"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    families = await db.product_families.find({}, {"_id": 0}).to_list(1000)
    return families

@api_router.post("/product-families")
async def create_product_family(family: ProductFamilyCreate, current_user: User = Depends(get_current_user)):
    """Create a new product family"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    new_family = ProductFamily(**family.model_dump())
    await db.product_families.insert_one(new_family.model_dump())
    return new_family.model_dump()

@api_router.put("/product-families/{family_id}")
async def update_product_family(family_id: str, family: ProductFamilyCreate, current_user: User = Depends(get_current_user)):
    """Update a product family"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    result = await db.product_families.update_one(
        {"id": family_id},
        {"$set": family.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Family not found")
    
    updated = await db.product_families.find_one({"id": family_id}, {"_id": 0})
    return updated

@api_router.delete("/product-families/{family_id}")
async def delete_product_family(family_id: str, current_user: User = Depends(get_current_user)):
    """Delete a product family"""
    await require_role(current_user, [UserRole.ADMIN])
    
    result = await db.product_families.delete_one({"id": family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Family not found")
    return {"message": "Family deleted"}

@api_router.post("/product-families/seed")
async def seed_product_families(current_user: User = Depends(get_current_user)):
    """Seed initial product families from Holdprint catalog"""
    await require_role(current_user, [UserRole.ADMIN])
    
    # Famílias padrão baseadas no catálogo Holdprint
    default_families = [
        {"name": "Adesivos", "description": "Adesivos impressos, coloridos, jateados, etc.", "color": "#EF4444"},
        {"name": "Lonas e Banners", "description": "Lonas frontlight, backlight, banners", "color": "#F97316"},
        {"name": "Chapas e Placas", "description": "ACM, acrílico, PVC, PS, MDF com ou sem impressão", "color": "#EAB308"},
        {"name": "Estruturas Metálicas", "description": "Estruturas com lona, ACM ou chapa galvanizada", "color": "#22C55E"},
        {"name": "Tecidos", "description": "Bandeiras, faixas, wind banners em tecido", "color": "#14B8A6"},
        {"name": "Letras Caixa", "description": "Letras planas, em relevo, iluminadas", "color": "#3B82F6"},
        {"name": "Totens", "description": "Totens em diversos materiais e formatos", "color": "#8B5CF6"},
        {"name": "Envelopamento", "description": "Envelopamento de veículos", "color": "#EC4899"},
        {"name": "Painéis Luminosos", "description": "Backlight, painéis com iluminação", "color": "#F59E0B"},
        {"name": "Serviços", "description": "Instalação, entrega, montagem, pintura", "color": "#6B7280"},
        {"name": "Materiais Promocionais", "description": "Cartazes, flyers, folders, panfletos", "color": "#84CC16"},
        {"name": "Produtos Terceirizados", "description": "Produtos de terceiros", "color": "#A855F7"},
    ]
    
    inserted = 0
    for family_data in default_families:
        existing = await db.product_families.find_one({"name": family_data["name"]})
        if not existing:
            new_family = ProductFamily(**family_data)
            await db.product_families.insert_one(new_family.model_dump())
            inserted += 1
    
    return {"message": f"{inserted} families created", "total": len(default_families)}

# ============ PRODUCTS INSTALLED ENDPOINTS ============

@api_router.get("/products-installed")
async def get_products_installed(
    job_id: Optional[str] = None,
    family_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List installed products with optional filters"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    query = {}
    if job_id:
        query["job_id"] = job_id
    if family_id:
        query["family_id"] = family_id
    
    products = await db.installed_products.find(query, {"_id": 0}).to_list(1000)
    return products

@api_router.post("/products-installed")
async def create_product_installed(product: ProductInstalledCreate, current_user: User = Depends(get_current_user)):
    """Register a new installed product with productivity metrics"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTALLER])
    
    # Calculate area
    area_m2 = None
    if product.width_m and product.height_m:
        area_m2 = product.width_m * product.height_m * product.quantity
    
    # Calculate productivity (m²/hour)
    productivity_m2_h = None
    if area_m2 and product.actual_time_min and product.actual_time_min > 0:
        hours = product.actual_time_min / 60
        productivity_m2_h = round(area_m2 / hours, 2)
    
    # Get family name if family_id provided
    family_name = None
    if product.family_id:
        family = await db.product_families.find_one({"id": product.family_id}, {"_id": 0})
        if family:
            family_name = family.get("name")
    
    new_product = ProductInstalled(
        **product.model_dump(),
        area_m2=area_m2,
        productivity_m2_h=productivity_m2_h,
        family_name=family_name
    )
    
    await db.installed_products.insert_one(new_product.model_dump())
    
    # Update productivity history
    await update_productivity_history(new_product)
    
    return new_product.model_dump()

async def update_productivity_history(product: ProductInstalled):
    """Update the productivity history based on new data"""
    if not product.family_id or not product.productivity_m2_h:
        return
    
    key = {
        "family_id": product.family_id,
        "complexity_level": product.complexity_level,
        "height_category": product.height_category,
        "scenario_category": product.scenario_category
    }
    
    existing = await db.productivity_history.find_one(key, {"_id": 0})
    
    if existing:
        # Calculate new average
        new_count = existing["sample_count"] + 1
        new_avg_prod = ((existing["avg_productivity_m2_h"] * existing["sample_count"]) + product.productivity_m2_h) / new_count
        
        # Calculate avg time per m2
        new_avg_time = 60 / new_avg_prod if new_avg_prod > 0 else 0
        
        await db.productivity_history.update_one(
            key,
            {
                "$set": {
                    "avg_productivity_m2_h": round(new_avg_prod, 2),
                    "avg_time_per_m2_min": round(new_avg_time, 2),
                    "sample_count": new_count,
                    "last_updated": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    else:
        # Create new record
        avg_time = 60 / product.productivity_m2_h if product.productivity_m2_h > 0 else 0
        new_history = ProductivityHistory(
            family_id=product.family_id,
            family_name=product.family_name or "",
            complexity_level=product.complexity_level,
            height_category=product.height_category,
            scenario_category=product.scenario_category,
            avg_productivity_m2_h=product.productivity_m2_h,
            avg_time_per_m2_min=round(avg_time, 2),
            sample_count=1
        )
        await db.productivity_history.insert_one(new_history.model_dump())

@api_router.get("/productivity-history")
async def get_productivity_history(
    family_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get productivity benchmarks"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    query = {}
    if family_id:
        query["family_id"] = family_id
    
    history = await db.productivity_history.find(query, {"_id": 0}).to_list(1000)
    return history

@api_router.get("/productivity-metrics")
async def get_productivity_metrics(current_user: User = Depends(get_current_user)):
    """Get comprehensive productivity metrics"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Get all product families
    families = await db.product_families.find({}, {"_id": 0}).to_list(100)
    
    # Get all products installed
    products = await db.installed_products.find({}, {"_id": 0}).to_list(10000)
    
    # Get productivity history
    history = await db.productivity_history.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate metrics by family
    family_metrics = {}
    for family in families:
        family_products = [p for p in products if p.get("family_id") == family["id"]]
        
        total_area = sum(p.get("area_m2", 0) or 0 for p in family_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in family_products)
        total_products = len(family_products)
        
        avg_productivity = 0
        if total_time > 0:
            avg_productivity = round((total_area / (total_time / 60)), 2) if total_area > 0 else 0
        
        family_metrics[family["name"]] = {
            "family_id": family["id"],
            "color": family.get("color", "#3B82F6"),
            "total_products": total_products,
            "total_area_m2": round(total_area, 2),
            "total_time_hours": round(total_time / 60, 2),
            "avg_productivity_m2_h": avg_productivity,
            "avg_time_per_m2_min": round(60 / avg_productivity, 2) if avg_productivity > 0 else 0
        }
    
    # Calculate overall metrics
    total_area_all = sum(p.get("area_m2", 0) or 0 for p in products)
    total_time_all = sum(p.get("actual_time_min", 0) or 0 for p in products)
    overall_productivity = round((total_area_all / (total_time_all / 60)), 2) if total_time_all > 0 and total_area_all > 0 else 0
    
    # Metrics by complexity
    complexity_metrics = {}
    for level in [1, 2, 3, 4, 5]:
        level_products = [p for p in products if p.get("complexity_level") == level]
        total_area = sum(p.get("area_m2", 0) or 0 for p in level_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in level_products)
        
        complexity_metrics[f"level_{level}"] = {
            "total_products": len(level_products),
            "total_area_m2": round(total_area, 2),
            "avg_productivity_m2_h": round((total_area / (total_time / 60)), 2) if total_time > 0 and total_area > 0 else 0
        }
    
    # Metrics by height category
    height_metrics = {}
    for category in ["terreo", "media", "alta", "muito_alta"]:
        cat_products = [p for p in products if p.get("height_category") == category]
        total_area = sum(p.get("area_m2", 0) or 0 for p in cat_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in cat_products)
        
        height_metrics[category] = {
            "total_products": len(cat_products),
            "total_area_m2": round(total_area, 2),
            "avg_productivity_m2_h": round((total_area / (total_time / 60)), 2) if total_time > 0 and total_area > 0 else 0
        }
    
    # Metrics by scenario
    scenario_metrics = {}
    for scenario in ["loja_rua", "shopping", "evento", "fachada", "outdoor", "veiculo"]:
        scen_products = [p for p in products if p.get("scenario_category") == scenario]
        total_area = sum(p.get("area_m2", 0) or 0 for p in scen_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in scen_products)
        
        scenario_metrics[scenario] = {
            "total_products": len(scen_products),
            "total_area_m2": round(total_area, 2),
            "avg_productivity_m2_h": round((total_area / (total_time / 60)), 2) if total_time > 0 and total_area > 0 else 0
        }
    
    return {
        "overall": {
            "total_products": len(products),
            "total_area_m2": round(total_area_all, 2),
            "total_time_hours": round(total_time_all / 60, 2),
            "avg_productivity_m2_h": overall_productivity
        },
        "by_family": family_metrics,
        "by_complexity": complexity_metrics,
        "by_height": height_metrics,
        "by_scenario": scenario_metrics,
        "benchmarks": history
    }

@api_router.get("/reports/by-family")
async def get_report_by_family(current_user: User = Depends(get_current_user)):
    """
    Relatório completo por família de produtos.
    Analisa todos os jobs importados e classifica seus produtos por família.
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Buscar todos os jobs
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(10000)
    
    # Buscar famílias cadastradas
    families = await db.product_families.find({}, {"_id": 0}).to_list(100)
    family_map = {f["name"]: f for f in families}
    
    # Estrutura para agrupar dados por família
    family_report = {}
    all_products = []
    unclassified_products = []
    
    for job in jobs:
        holdprint_data = job.get("holdprint_data", {})
        products = holdprint_data.get("products", [])
        production_items = holdprint_data.get("production", {}).get("items", [])
        
        # Processar produtos do job
        for product in products:
            product_name = product.get("name", "")
            quantity = product.get("quantity", 1)
            
            # Extrair medidas da descrição
            description = product.get("description", "")
            width_m = None
            height_m = None
            
            # Parse de medidas da descrição HTML
            import re
            width_match = re.search(r'Largura:\s*<span[^>]*>([0-9.,]+)\s*m', description, re.IGNORECASE)
            height_match = re.search(r'Altura:\s*<span[^>]*>([0-9.,]+)\s*m', description, re.IGNORECASE)
            
            if width_match:
                width_m = float(width_match.group(1).replace(',', '.'))
            if height_match:
                height_m = float(height_match.group(1).replace(',', '.'))
            
            # Calcular área
            area_m2 = None
            if width_m and height_m:
                area_m2 = round(width_m * height_m * quantity, 2)
            
            # Classificar produto em família
            family_name, confidence = classify_product_to_family(product_name)
            
            product_data = {
                "job_id": job.get("id"),
                "job_title": job.get("title"),
                "job_code": holdprint_data.get("code"),
                "client_name": holdprint_data.get("customerName", job.get("client_name")),
                "product_name": product_name,
                "family_name": family_name,
                "confidence": confidence,
                "quantity": quantity,
                "width_m": width_m,
                "height_m": height_m,
                "area_m2": area_m2,
                "unit_price": product.get("unitPrice", 0),
                "total_value": product.get("totalValue", 0),
                "branch": job.get("branch")
            }
            
            all_products.append(product_data)
            
            # Agrupar por família
            if family_name not in family_report:
                family_info = family_map.get(family_name, {})
                family_report[family_name] = {
                    "family_name": family_name,
                    "color": family_info.get("color", "#6B7280"),
                    "total_jobs": set(),
                    "total_products": 0,
                    "total_quantity": 0,
                    "total_area_m2": 0,
                    "total_value": 0,
                    "products": []
                }
            
            family_report[family_name]["total_jobs"].add(job.get("id"))
            family_report[family_name]["total_products"] += 1
            family_report[family_name]["total_quantity"] += quantity
            if area_m2:
                family_report[family_name]["total_area_m2"] += area_m2
            family_report[family_name]["total_value"] += product.get("totalValue", 0)
            family_report[family_name]["products"].append(product_data)
            
            # Rastrear produtos não classificados com alta confiança
            if confidence < 50:
                unclassified_products.append(product_data)
        
        # Processar itens de produção também
        for item in production_items:
            item_name = item.get("name", "")
            item_quantity = item.get("quantity", 1)
            
            family_name, confidence = classify_product_to_family(item_name)
            
            if family_name not in family_report:
                family_info = family_map.get(family_name, {})
                family_report[family_name] = {
                    "family_name": family_name,
                    "color": family_info.get("color", "#6B7280"),
                    "total_jobs": set(),
                    "total_products": 0,
                    "total_quantity": 0,
                    "total_area_m2": 0,
                    "total_value": 0,
                    "products": []
                }
            
            family_report[family_name]["total_jobs"].add(job.get("id"))
            family_report[family_name]["total_quantity"] += item_quantity
    
    # Converter sets para contagem
    for family_name in family_report:
        family_report[family_name]["total_jobs"] = len(family_report[family_name]["total_jobs"])
        family_report[family_name]["total_area_m2"] = round(family_report[family_name]["total_area_m2"], 2)
        family_report[family_name]["total_value"] = round(family_report[family_name]["total_value"], 2)
        # Limitar lista de produtos para não sobrecarregar resposta
        family_report[family_name]["products"] = family_report[family_name]["products"][:50]
    
    # Ordenar por quantidade total
    sorted_families = sorted(
        family_report.values(),
        key=lambda x: x["total_quantity"],
        reverse=True
    )
    
    # Estatísticas gerais
    total_area = sum(f["total_area_m2"] for f in sorted_families)
    total_value = sum(f["total_value"] for f in sorted_families)
    total_products = sum(f["total_products"] for f in sorted_families)
    
    return {
        "summary": {
            "total_jobs": len(jobs),
            "total_products": total_products,
            "total_area_m2": round(total_area, 2),
            "total_value": round(total_value, 2),
            "families_count": len(sorted_families),
            "unclassified_count": len(unclassified_products)
        },
        "by_family": sorted_families,
        "unclassified": unclassified_products[:20],  # Primeiros 20 não classificados
        "all_products": all_products[:100]  # Primeiros 100 produtos para análise
    }


@api_router.get("/reports/kpis/family-productivity")
async def get_family_productivity_kpis(
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    KPIs de produtividade por família de produto.
    
    Métricas calculadas:
    - m²/hora por família
    - Total de m² instalados
    - Tempo médio de instalação
    - Número de instalações
    - Eficiência comparada
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Build query with optional date filter
    query = {"status": "completed"}
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from + "T00:00:00"
        if date_to:
            date_filter["$lte"] = date_to + "T23:59:59"
        if date_filter:
            query["checkin_at"] = date_filter
    
    # Get completed item checkins
    checkins = await db.item_checkins.find(query, {"_id": 0}).to_list(10000)
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(10000)
    jobs_map = {j["id"]: j for j in jobs}
    
    # Aggregate by family
    family_data = {}
    global_totals = {"total_m2": 0, "total_minutes": 0, "count": 0}
    
    for checkin in checkins:
        family = checkin.get("family_name") or "Outros"
        installed_m2 = checkin.get("installed_m2", 0) or 0
        duration = checkin.get("net_duration_minutes") or checkin.get("duration_minutes", 0) or 0
        
        # Skip if no valid data
        if installed_m2 <= 0:
            continue
            
        if family not in family_data:
            family_data[family] = {
                "family_name": family,
                "total_m2": 0,
                "total_minutes": 0,
                "count": 0,
                "min_duration": float('inf'),
                "max_duration": 0,
                "m2_list": [],
                "duration_list": [],
                "installers": set(),
                "jobs": set()
            }
        
        family_data[family]["total_m2"] += installed_m2
        family_data[family]["total_minutes"] += duration
        family_data[family]["count"] += 1
        family_data[family]["m2_list"].append(installed_m2)
        family_data[family]["duration_list"].append(duration)
        
        if duration > 0:
            family_data[family]["min_duration"] = min(family_data[family]["min_duration"], duration)
            family_data[family]["max_duration"] = max(family_data[family]["max_duration"], duration)
        
        if checkin.get("installer_id"):
            family_data[family]["installers"].add(checkin.get("installer_id"))
        if checkin.get("job_id"):
            family_data[family]["jobs"].add(checkin.get("job_id"))
        
        global_totals["total_m2"] += installed_m2
        global_totals["total_minutes"] += duration
        global_totals["count"] += 1
    
    # Calculate KPIs for each family
    result = []
    global_avg_m2_h = (global_totals["total_m2"] / global_totals["total_minutes"] * 60) if global_totals["total_minutes"] > 0 else 0
    
    for family, data in family_data.items():
        # Calculate metrics
        avg_m2_per_hour = (data["total_m2"] / data["total_minutes"] * 60) if data["total_minutes"] > 0 else 0
        avg_m2_per_install = data["total_m2"] / data["count"] if data["count"] > 0 else 0
        avg_duration = data["total_minutes"] / data["count"] if data["count"] > 0 else 0
        
        # Efficiency compared to global average (100% = average)
        efficiency = (avg_m2_per_hour / global_avg_m2_h * 100) if global_avg_m2_h > 0 else 100
        
        # Calculate standard deviation for m²
        if len(data["m2_list"]) > 1:
            mean_m2 = sum(data["m2_list"]) / len(data["m2_list"])
            variance = sum((x - mean_m2) ** 2 for x in data["m2_list"]) / len(data["m2_list"])
            std_dev_m2 = variance ** 0.5
        else:
            std_dev_m2 = 0
        
        result.append({
            "family_name": family,
            "total_m2": round(data["total_m2"], 2),
            "total_hours": round(data["total_minutes"] / 60, 2),
            "installation_count": data["count"],
            "avg_m2_per_hour": round(avg_m2_per_hour, 2),
            "avg_m2_per_install": round(avg_m2_per_install, 2),
            "avg_duration_minutes": round(avg_duration, 1),
            "min_duration_minutes": data["min_duration"] if data["min_duration"] != float('inf') else 0,
            "max_duration_minutes": data["max_duration"],
            "efficiency_percent": round(efficiency, 1),
            "std_dev_m2": round(std_dev_m2, 2),
            "unique_installers": len(data["installers"]),
            "unique_jobs": len(data["jobs"]),
            "share_of_total_m2": round(data["total_m2"] / global_totals["total_m2"] * 100, 1) if global_totals["total_m2"] > 0 else 0
        })
    
    # Sort by total m²
    result.sort(key=lambda x: x["total_m2"], reverse=True)
    
    # Add ranking
    for i, item in enumerate(result, 1):
        item["rank"] = i
    
    return {
        "kpis": result,
        "summary": {
            "total_families": len(result),
            "global_total_m2": round(global_totals["total_m2"], 2),
            "global_total_hours": round(global_totals["total_minutes"] / 60, 2),
            "global_installations": global_totals["count"],
            "global_avg_m2_per_hour": round(global_avg_m2_h, 2),
            "period": {
                "from": date_from,
                "to": date_to
            }
        }
    }

@api_router.post("/jobs/{job_id}/classify-products")
async def classify_job_products(job_id: str, current_user: User = Depends(get_current_user)):
    """
    Classifica os produtos de um job específico por família.
    Retorna a análise detalhada para esse job.
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    holdprint_data = job.get("holdprint_data", {})
    products = holdprint_data.get("products", [])
    
    classified_products = []
    
    for product in products:
        product_name = product.get("name", "")
        family_name, confidence = classify_product_to_family(product_name)
        
        # Extrair medidas
        description = product.get("description", "")
        import re
        width_match = re.search(r'Largura:\s*<span[^>]*>([0-9.,]+)\s*m', description, re.IGNORECASE)
        height_match = re.search(r'Altura:\s*<span[^>]*>([0-9.,]+)\s*m', description, re.IGNORECASE)
        
        width_m = float(width_match.group(1).replace(',', '.')) if width_match else None
        height_m = float(height_match.group(1).replace(',', '.')) if height_match else None
        
        area_m2 = round(width_m * height_m * product.get("quantity", 1), 2) if width_m and height_m else None
        
        classified_products.append({
            "product_name": product_name,
            "family_name": family_name,
            "confidence": confidence,
            "quantity": product.get("quantity", 1),
            "width_m": width_m,
            "height_m": height_m,
            "area_m2": area_m2,
            "unit_price": product.get("unitPrice", 0),
            "total_value": product.get("totalValue", 0)
        })
    
    # Agrupar por família
    family_summary = {}
    for p in classified_products:
        fname = p["family_name"]
        if fname not in family_summary:
            family_summary[fname] = {
                "count": 0,
                "total_area_m2": 0,
                "total_value": 0
            }
        family_summary[fname]["count"] += 1
        if p["area_m2"]:
            family_summary[fname]["total_area_m2"] += p["area_m2"]
        family_summary[fname]["total_value"] += p["total_value"]
    
    return {
        "job_id": job_id,
        "job_title": job.get("title"),
        "client": holdprint_data.get("customerName"),
        "products": classified_products,
        "family_summary": family_summary
    }

@api_router.post("/jobs/recalculate-areas")
async def recalculate_job_areas(current_user: User = Depends(get_current_user)):
    """
    Recalcula a área de todos os jobs existentes.
    Útil para atualizar jobs importados antes da implementação do cálculo automático.
    """
    await require_role(current_user, [UserRole.ADMIN])
    
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(10000)
    updated_count = 0
    
    for job in jobs:
        holdprint_data = job.get("holdprint_data", {})
        
        if holdprint_data:
            products_with_area, total_area_m2, total_products, total_quantity = calculate_job_products_area(holdprint_data)
            
            await db.jobs.update_one(
                {"id": job["id"]},
                {"$set": {
                    "area_m2": total_area_m2,
                    "products_with_area": products_with_area,
                    "total_products": total_products,
                    "total_quantity": total_quantity
                }}
            )
            updated_count += 1
    
    return {"message": f"{updated_count} jobs atualizados com áreas calculadas"}

@api_router.get("/reports/by-installer")
async def get_report_by_installer(current_user: User = Depends(get_current_user)):
    """
    Relatório de produtividade por instalador.
    Usa item_checkins (check-ins por item) para calcular m² instalados e tempo líquido.
    Produtividade = m² total / horas líquidas trabalhadas
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Buscar dados
    installers = await db.installers.find({}, {"_id": 0}).to_list(1000)
    item_checkins = await db.item_checkins.find({"status": "completed"}, {"_id": 0}).to_list(10000)
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(10000)
    
    # Mapear jobs por ID
    jobs_map = {job["id"]: job for job in jobs}
    
    # Processar dados por instalador
    installer_report = []
    
    for installer in installers:
        installer_id = installer["id"]
        
        # Item checkins completados deste instalador
        installer_checkins = [c for c in item_checkins if c.get("installer_id") == installer_id]
        
        # Calcular métricas usando tempo LÍQUIDO
        completed_count = len(installer_checkins)
        
        # Total de tempo líquido (descontando pausas)
        total_net_duration_min = 0
        total_m2_installed = 0
        
        for checkin in installer_checkins:
            # Usar tempo líquido se disponível, senão usar tempo bruto
            net_minutes = checkin.get("net_duration_minutes") or checkin.get("duration_minutes") or 0
            total_net_duration_min += net_minutes
            
            # m² do item (da API da Holdprint)
            job = jobs_map.get(checkin.get("job_id"))
            if job:
                products = job.get("products_with_area", [])
                item_index = checkin.get("item_index", 0)
                if item_index < len(products):
                    item = products[item_index]
                    item_m2 = item.get("total_area_m2", 0) or 0
                    total_m2_installed += item_m2
        
        # Jobs únicos trabalhados
        job_ids = set(c.get("job_id") for c in installer_checkins if c.get("job_id"))
        jobs_worked = len(job_ids)
        
        # Detalhes dos jobs trabalhados
        jobs_details = []
        for job_id in job_ids:
            job = jobs_map.get(job_id)
            if job:
                job_area = job.get("area_m2", 0) or 0
                
                # Checkins deste instalador neste job
                job_item_checkins = [c for c in installer_checkins if c.get("job_id") == job_id]
                
                # Tempo líquido total neste job
                job_net_duration = sum(c.get("net_duration_minutes") or c.get("duration_minutes") or 0 for c in job_item_checkins)
                
                # m² instalados neste job (somar área dos itens concluídos)
                job_m2_installed = 0
                products = job.get("products_with_area", [])
                for checkin in job_item_checkins:
                    item_index = checkin.get("item_index", 0)
                    if item_index < len(products):
                        job_m2_installed += products[item_index].get("total_area_m2", 0) or 0
                
                jobs_details.append({
                    "job_id": job_id,
                    "job_title": job.get("title"),
                    "client": job.get("client_name") or job.get("holdprint_data", {}).get("customerName"),
                    "job_area_m2": job_area,
                    "duration_min": round(job_net_duration, 2),
                    "m2_installed": round(job_m2_installed, 2),
                    "status": job.get("status"),
                    "items_completed": len(job_item_checkins)
                })
        
        # Produtividade (m²/hora) usando tempo LÍQUIDO
        productivity_m2_h = 0
        total_hours = total_net_duration_min / 60 if total_net_duration_min > 0 else 0
        if total_hours > 0 and total_m2_installed > 0:
            productivity_m2_h = round(total_m2_installed / total_hours, 2)
        
        installer_data = {
            "installer_id": installer_id,
            "full_name": installer.get("full_name"),
            "branch": installer.get("branch"),
            "metrics": {
                "items_completed": completed_count,
                "completed_checkins": completed_count,
                "jobs_worked": jobs_worked,
                "total_duration_hours": round(total_hours, 2),
                "total_m2_reported": round(total_m2_installed, 2),
                "productivity_m2_h": productivity_m2_h
            },
            "jobs": sorted(jobs_details, key=lambda x: x.get("m2_installed", 0), reverse=True)[:20]
        }
        
        installer_report.append(installer_data)
    
    # Ordenar por produtividade (maior primeiro)
    installer_report.sort(key=lambda x: x["metrics"]["productivity_m2_h"], reverse=True)
    
    # Totais gerais
    total_area_all = sum(i["metrics"]["total_m2_reported"] for i in installer_report)
    total_hours_all = sum(i["metrics"]["total_duration_hours"] for i in installer_report)
    
    return {
        "summary": {
            "total_installers": len(installer_report),
            "total_area_m2_all": round(total_area_all, 2),
            "total_hours_all": round(total_hours_all, 2),
            "avg_productivity_m2_h": round(total_area_all / total_hours_all, 2) if total_hours_all > 0 else 0
        },
        "by_installer": installer_report
    }


@api_router.get("/reports/productivity")
async def get_productivity_report(
    filter_by: Optional[str] = Query(None, description="Filter type: installer, job, family, item"),
    filter_id: Optional[str] = Query(None, description="ID to filter by"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Relatório de produtividade completo.
    
    Calcula produtividade usando:
    - m² da API (definido no job/item)
    - Tempo real de execução (check-in até check-out)
    
    Filtros disponíveis:
    - installer: por instalador
    - job: por job
    - family: por família de produto
    - item: por item específico
    """
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Buscar dados necessários
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(10000)
    item_checkins = await db.item_checkins.find({"status": "completed"}, {"_id": 0}).to_list(10000)
    installers = await db.installers.find({}, {"_id": 0}).to_list(1000)
    legacy_checkins = await db.checkins.find({"status": "completed"}, {"_id": 0}).to_list(10000)
    
    # Criar mapas para lookup rápido
    jobs_map = {job["id"]: job for job in jobs}
    installers_map = {inst["id"]: inst for inst in installers}
    
    # Estruturas para agregação
    by_installer = {}
    by_job = {}
    by_family = {}
    by_item = {}
    
    # Processar item_checkins (novo sistema)
    for checkin in item_checkins:
        job = jobs_map.get(checkin.get("job_id"))
        if not job:
            continue
        
        # Aplicar filtro de data
        checkin_at = checkin.get("checkin_at")
        if isinstance(checkin_at, str):
            checkin_at = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
        
        if date_from:
            start_date = datetime.fromisoformat(date_from + "T00:00:00+00:00")
            if checkin_at and checkin_at < start_date:
                continue
        
        if date_to:
            end_date = datetime.fromisoformat(date_to + "T23:59:59+00:00")
            if checkin_at and checkin_at > end_date:
                continue
        
        # Obter dados do item
        products = job.get("products_with_area", [])
        item_index = checkin.get("item_index", 0)
        item = products[item_index] if item_index < len(products) else {}
        
        # m² da API (não o reportado manualmente)
        item_m2 = item.get("total_area_m2", 0) or 0
        
        # Obter checkout_at primeiro (sempre necessário para o record)
        checkout_at = checkin.get("checkout_at")
        if isinstance(checkout_at, str):
            checkout_at = datetime.fromisoformat(checkout_at.replace('Z', '+00:00'))
        
        # Garantir que ambos têm timezone
        if checkin_at and checkin_at.tzinfo is None:
            checkin_at = checkin_at.replace(tzinfo=timezone.utc)
        if checkout_at and checkout_at.tzinfo is None:
            checkout_at = checkout_at.replace(tzinfo=timezone.utc)
        
        # Usar tempo LÍQUIDO se disponível, senão calcular bruto
        net_duration_minutes = checkin.get("net_duration_minutes")
        total_pause_minutes = checkin.get("total_pause_minutes", 0) or 0
        
        if net_duration_minutes is None:
            # Fallback para cálculo bruto se não tiver tempo líquido
            if checkin_at and checkout_at:
                net_duration_minutes = (checkout_at - checkin_at).total_seconds() / 60
            else:
                net_duration_minutes = 0
        
        duration_minutes = net_duration_minutes  # Usar tempo líquido para cálculos
        
        # Dados do instalador
        installer_id = checkin.get("installer_id")
        installer = installers_map.get(installer_id, {})
        installer_name = installer.get("full_name", "Desconhecido")
        
        # Dados da família
        family_name = item.get("family_name", "Não Classificado")
        
        # Dados do registro
        record = {
            "job_id": job.get("id"),
            "job_title": job.get("title"),
            "client_name": job.get("client_name") or job.get("holdprint_data", {}).get("customerName"),
            "installer_id": installer_id,
            "installer_name": installer_name,
            "item_name": item.get("name", f"Item {item_index + 1}"),
            "item_index": item_index,
            "family_name": family_name,
            "m2_api": item_m2,
            "m2_reported": checkin.get("installed_m2", 0) or 0,
            "duration_minutes": round(duration_minutes, 2),  # Tempo líquido
            "gross_duration_minutes": checkin.get("duration_minutes", 0) or 0,  # Tempo bruto
            "pause_minutes": total_pause_minutes,  # Tempo de pausa
            "checkin_at": checkin_at.isoformat() if checkin_at else None,
            "checkout_at": checkout_at.isoformat() if checkout_at else None,
            "complexity_level": checkin.get("complexity_level"),
            "scenario_category": checkin.get("scenario_category"),
            "notes": checkin.get("notes")
        }
        
        # Aplicar filtros
        if filter_by == "installer" and filter_id and installer_id != filter_id:
            continue
        if filter_by == "job" and filter_id and job.get("id") != filter_id:
            continue
        if filter_by == "family" and filter_id and family_name != filter_id:
            continue
        
        # Agregar por instalador
        if installer_id not in by_installer:
            by_installer[installer_id] = {
                "installer_id": installer_id,
                "installer_name": installer_name,
                "branch": installer.get("branch"),
                "total_m2": 0,
                "total_minutes": 0,
                "items_count": 0,
                "jobs": set(),
                "records": []
            }
        by_installer[installer_id]["total_m2"] += item_m2
        by_installer[installer_id]["total_minutes"] += duration_minutes
        by_installer[installer_id]["items_count"] += 1
        by_installer[installer_id]["jobs"].add(job.get("id"))
        by_installer[installer_id]["records"].append(record)
        
        # Agregar por job
        job_id = job.get("id")
        if job_id not in by_job:
            by_job[job_id] = {
                "job_id": job_id,
                "job_title": job.get("title"),
                "client_name": job.get("client_name") or job.get("holdprint_data", {}).get("customerName"),
                "total_m2_api": job.get("area_m2", 0) or 0,
                "total_m2_executed": 0,
                "total_minutes": 0,
                "items_count": 0,
                "installers": set(),
                "records": []
            }
        by_job[job_id]["total_m2_executed"] += item_m2
        by_job[job_id]["total_minutes"] += duration_minutes
        by_job[job_id]["items_count"] += 1
        by_job[job_id]["installers"].add(installer_id)
        by_job[job_id]["records"].append(record)
        
        # Agregar por família
        if family_name not in by_family:
            by_family[family_name] = {
                "family_name": family_name,
                "total_m2": 0,
                "total_minutes": 0,
                "items_count": 0,
                "jobs": set(),
                "installers": set(),
                "records": []
            }
        by_family[family_name]["total_m2"] += item_m2
        by_family[family_name]["total_minutes"] += duration_minutes
        by_family[family_name]["items_count"] += 1
        by_family[family_name]["jobs"].add(job.get("id"))
        by_family[family_name]["installers"].add(installer_id)
        by_family[family_name]["records"].append(record)
        
        # Agregar por item
        item_key = f"{job_id}:{item_index}"
        if item_key not in by_item:
            by_item[item_key] = {
                "job_id": job_id,
                "job_title": job.get("title"),
                "item_index": item_index,
                "item_name": item.get("name", f"Item {item_index + 1}"),
                "family_name": family_name,
                "m2_api": item_m2,
                "total_minutes": 0,
                "executions": 0,
                "installers": set(),
                "records": []
            }
        by_item[item_key]["total_minutes"] += duration_minutes
        by_item[item_key]["executions"] += 1
        by_item[item_key]["installers"].add(installer_id)
        by_item[item_key]["records"].append(record)
    
    # Processar legacy checkins (sistema antigo de job-level)
    for checkin in legacy_checkins:
        job = jobs_map.get(checkin.get("job_id"))
        if not job:
            continue
        
        # Aplicar filtro de data
        checkin_at = checkin.get("checkin_at")
        if isinstance(checkin_at, str):
            checkin_at = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
        
        if date_from:
            start_date = datetime.fromisoformat(date_from + "T00:00:00+00:00")
            if checkin_at and checkin_at < start_date:
                continue
        
        if date_to:
            end_date = datetime.fromisoformat(date_to + "T23:59:59+00:00")
            if checkin_at and checkin_at > end_date:
                continue
        
        # m² da API (área total do job)
        job_m2 = job.get("area_m2", 0) or 0
        
        # Tempo real
        duration_minutes = checkin.get("duration_minutes", 0) or 0
        
        # Dados do instalador
        installer_id = checkin.get("installer_id")
        installer = installers_map.get(installer_id, {})
        installer_name = installer.get("full_name", "Desconhecido")
        
        # Aplicar filtros
        if filter_by == "installer" and filter_id and installer_id != filter_id:
            continue
        if filter_by == "job" and filter_id and job.get("id") != filter_id:
            continue
        
        # Agregar por instalador (adicionar ao existente ou criar novo)
        if installer_id not in by_installer:
            by_installer[installer_id] = {
                "installer_id": installer_id,
                "installer_name": installer_name,
                "branch": installer.get("branch"),
                "total_m2": 0,
                "total_minutes": 0,
                "items_count": 0,
                "jobs": set(),
                "records": []
            }
        by_installer[installer_id]["total_m2"] += checkin.get("installed_m2", 0) or 0
        by_installer[installer_id]["total_minutes"] += duration_minutes
        by_installer[installer_id]["items_count"] += 1
        by_installer[installer_id]["jobs"].add(job.get("id"))
    
    # Calcular produtividade e converter sets para listas
    def calc_productivity(total_m2, total_minutes):
        if total_minutes > 0 and total_m2 > 0:
            hours = total_minutes / 60
            return round(total_m2 / hours, 2)
        return 0
    
    # Preparar resposta por instalador
    installer_results = []
    for data in by_installer.values():
        data["jobs"] = list(data["jobs"])
        data["jobs_count"] = len(data["jobs"])
        data["productivity_m2_h"] = calc_productivity(data["total_m2"], data["total_minutes"])
        data["avg_minutes_per_m2"] = round(data["total_minutes"] / data["total_m2"], 2) if data["total_m2"] > 0 else 0
        data["total_hours"] = round(data["total_minutes"] / 60, 2)
        data["total_m2"] = round(data["total_m2"], 2)
        data["records"] = data["records"][:50]  # Limitar registros
        installer_results.append(data)
    
    installer_results.sort(key=lambda x: x["productivity_m2_h"], reverse=True)
    
    # Preparar resposta por job
    job_results = []
    for data in by_job.values():
        data["installers"] = list(data["installers"])
        data["installers_count"] = len(data["installers"])
        data["productivity_m2_h"] = calc_productivity(data["total_m2_executed"], data["total_minutes"])
        data["completion_percent"] = round((data["total_m2_executed"] / data["total_m2_api"]) * 100, 1) if data["total_m2_api"] > 0 else 0
        data["total_hours"] = round(data["total_minutes"] / 60, 2)
        data["total_m2_executed"] = round(data["total_m2_executed"], 2)
        data["records"] = data["records"][:50]
        job_results.append(data)
    
    job_results.sort(key=lambda x: x["total_m2_executed"], reverse=True)
    
    # Preparar resposta por família
    family_results = []
    for data in by_family.values():
        data["jobs"] = list(data["jobs"])
        data["installers"] = list(data["installers"])
        data["jobs_count"] = len(data["jobs"])
        data["installers_count"] = len(data["installers"])
        data["productivity_m2_h"] = calc_productivity(data["total_m2"], data["total_minutes"])
        data["avg_minutes_per_m2"] = round(data["total_minutes"] / data["total_m2"], 2) if data["total_m2"] > 0 else 0
        data["total_hours"] = round(data["total_minutes"] / 60, 2)
        data["total_m2"] = round(data["total_m2"], 2)
        data["records"] = data["records"][:50]
        family_results.append(data)
    
    family_results.sort(key=lambda x: x["total_m2"], reverse=True)
    
    # Preparar resposta por item
    item_results = []
    for data in by_item.values():
        data["installers"] = list(data["installers"])
        data["installers_count"] = len(data["installers"])
        data["productivity_m2_h"] = calc_productivity(data["m2_api"], data["total_minutes"])
        data["avg_minutes_per_execution"] = round(data["total_minutes"] / data["executions"], 2) if data["executions"] > 0 else 0
        data["total_hours"] = round(data["total_minutes"] / 60, 2)
        data["records"] = data["records"][:20]
        item_results.append(data)
    
    item_results.sort(key=lambda x: x["m2_api"], reverse=True)
    
    # Calcular totais gerais
    total_m2 = sum(i["total_m2"] for i in installer_results)
    total_minutes = sum(i["total_minutes"] for i in by_installer.values())
    total_hours = round(total_minutes / 60, 2)
    
    return {
        "summary": {
            "total_m2": round(total_m2, 2),
            "total_hours": total_hours,
            "total_items": sum(i["items_count"] for i in installer_results),
            "total_jobs": len(by_job),
            "total_installers": len(by_installer),
            "avg_productivity_m2_h": calc_productivity(total_m2, total_minutes),
            "avg_minutes_per_m2": round(total_minutes / total_m2, 2) if total_m2 > 0 else 0,
            "filters_applied": {
                "filter_by": filter_by,
                "filter_id": filter_id,
                "date_from": date_from,
                "date_to": date_to
            }
        },
        "by_installer": installer_results if not filter_by or filter_by == "installer" else [],
        "by_job": job_results if not filter_by or filter_by == "job" else [],
        "by_family": family_results if not filter_by or filter_by == "family" else [],
        "by_item": item_results[:100] if not filter_by or filter_by == "item" else []
    }

@api_router.get("/metrics")
async def get_metrics(current_user: User = Depends(get_current_user)):
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Total jobs
    total_jobs = await db.jobs.count_documents({})
    completed_jobs = await db.jobs.count_documents({"status": "completed"})
    in_progress_jobs = await db.jobs.count_documents({"status": "in_progress"})
    pending_jobs = await db.jobs.count_documents({"status": "pending"})
    
    # Total checkins
    total_checkins = await db.checkins.count_documents({})
    completed_checkins = await db.checkins.count_documents({"status": "completed"})
    
    # Average duration
    completed_checkins_docs = await db.checkins.find({"status": "completed"}, {"duration_minutes": 1, "_id": 0}).to_list(1000)
    avg_duration = sum(c.get('duration_minutes', 0) for c in completed_checkins_docs) / len(completed_checkins_docs) if completed_checkins_docs else 0
    
    # Installers
    total_installers = await db.installers.count_documents({})
    
    return {
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs,
        "in_progress_jobs": in_progress_jobs,
        "pending_jobs": pending_jobs,
        "total_checkins": total_checkins,
        "completed_checkins": completed_checkins,
        "avg_duration_minutes": round(avg_duration, 2),
        "total_installers": total_installers
    }


@api_router.get("/reports/export")
async def export_reports(current_user: User = Depends(get_current_user)):
    """Export consolidated report to Excel"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Get all item_checkins with related data (correct collection)
    checkins = await db.item_checkins.find({}, {"_id": 0}).to_list(1000)
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(1000)
    installers = await db.installers.find({}, {"_id": 0}).to_list(1000)
    
    logging.info(f"Exporting report: {len(checkins)} checkins, {len(jobs)} jobs, {len(installers)} installers")
    
    # Create mapping dicts for faster lookup
    jobs_map = {job['id']: job for job in jobs}
    installers_map = {installer['id']: installer for installer in installers}
    
    # Create workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Relatório de Trabalhos"
    
    # Define styles
    header_fill = PatternFill(start_color="FF1F5A", end_color="FF1F5A", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=12)
    header_alignment = Alignment(horizontal="center", vertical="center")
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Headers
    headers = [
        "Código Job",
        "Nome do Job",
        "Cliente",
        "Item/Produto",
        "Família",
        "Área Total (m²)",
        "M² Instalado",
        "Instalador",
        "GPS Check-in (Lat)",
        "GPS Check-in (Long)",
        "GPS Check-out (Lat)",
        "GPS Check-out (Long)",
        "Data Check-in",
        "Data Check-out",
        "Tempo (min)",
        "Status",
        "Filial"
    ]
    
    # Write headers
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = border
    
    # Product family classification function
    def get_product_family(product_name):
        if not product_name:
            return 'Outros'
        name = product_name.lower()
        if 'adesivo' in name:
            return 'Adesivos'
        if 'lona' in name or 'banner' in name:
            return 'Lonas/Banners'
        if 'chapa' in name or 'acm' in name or 'fachada' in name:
            return 'Chapas/Fachadas'
        if 'serviço' in name or 'serviços' in name or 'instalação' in name or 'entrega' in name:
            return 'Serviços'
        if 'placa' in name or 'legenda' in name:
            return 'Placas/Legendas'
        if 'display' in name or 'expositor' in name or 'totem' in name:
            return 'Displays/Totens'
        return 'Outros'
    
    # Write data
    row_num = 2
    for checkin in checkins:
        job = jobs_map.get(checkin.get('job_id'))
        installer = installers_map.get(checkin.get('installer_id'))
        
        if not job:
            continue
        
        # Get product name
        product_name = checkin.get('product_name') or checkin.get('item_name') or ''
        if not product_name and job.get('holdprint_data', {}).get('products'):
            item_index = checkin.get('item_index', 0)
            products = job['holdprint_data']['products']
            if item_index < len(products):
                product_name = products[item_index].get('name', '')
        
        job_code = job.get('holdprint_data', {}).get('code') or job.get('code') or job.get('id', '')[:8]
        
        ws.cell(row=row_num, column=1, value=f"#{job_code}").border = border
        ws.cell(row=row_num, column=2, value=job.get('title', '')).border = border
        ws.cell(row=row_num, column=3, value=job.get('client_name') or job.get('holdprint_data', {}).get('customerName', '')).border = border
        ws.cell(row=row_num, column=4, value=product_name).border = border
        ws.cell(row=row_num, column=5, value=get_product_family(product_name)).border = border
        ws.cell(row=row_num, column=6, value=job.get('area_m2', 0)).border = border
        ws.cell(row=row_num, column=7, value=checkin.get('installed_m2', 0)).border = border
        ws.cell(row=row_num, column=8, value=installer.get('full_name', '') if installer else '').border = border
        ws.cell(row=row_num, column=9, value=checkin.get('gps_lat', '')).border = border
        ws.cell(row=row_num, column=10, value=checkin.get('gps_long', '')).border = border
        ws.cell(row=row_num, column=11, value=checkin.get('checkout_gps_lat', '')).border = border
        ws.cell(row=row_num, column=12, value=checkin.get('checkout_gps_long', '')).border = border
        
        checkin_at = checkin.get('checkin_at')
        if isinstance(checkin_at, str):
            try:
                checkin_at = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
            except:
                checkin_at = None
        ws.cell(row=row_num, column=13, value=checkin_at.strftime('%d/%m/%Y %H:%M') if checkin_at else '').border = border
        
        checkout_at = checkin.get('checkout_at')
        if isinstance(checkout_at, str):
            try:
                checkout_at = datetime.fromisoformat(checkout_at.replace('Z', '+00:00'))
            except:
                checkout_at = None
        ws.cell(row=row_num, column=14, value=checkout_at.strftime('%d/%m/%Y %H:%M') if checkout_at else '').border = border
        
        ws.cell(row=row_num, column=15, value=checkin.get('duration_minutes', 0)).border = border
        ws.cell(row=row_num, column=16, value=checkin.get('status', '')).border = border
        ws.cell(row=row_num, column=17, value=job.get('branch', '')).border = border
        
        row_num += 1
    
    logging.info(f"Excel report generated with {row_num - 2} rows")
    
    # Adjust column widths
    column_widths = {
        'A': 12, 'B': 35, 'C': 25, 'D': 35, 'E': 18,
        'F': 15, 'G': 15, 'H': 20, 'I': 15, 'J': 15,
        'K': 15, 'L': 15, 'M': 18, 'N': 18, 'O': 12,
        'P': 15, 'Q': 12
    }
    for col, width in column_widths.items():
        ws.column_dimensions[col].width = width
    
    # Save to BytesIO
    excel_file = BytesIO()
    wb.save(excel_file)
    excel_file.seek(0)
    
    # Generate filename with current date
    filename = f"relatorio_trabalhos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        excel_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ============ GOOGLE CALENDAR INTEGRATION ============

@api_router.get("/auth/google/login")
async def google_login(current_user: User = Depends(get_current_user)):
    """Initiates Google OAuth flow for calendar access"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth não configurado")
    
    # Store user_id in state to associate tokens later
    state = f"{current_user.id}"
    
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope={'%20'.join(GOOGLE_CALENDAR_SCOPES)}&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={state}"
    )
    
    return {"authorization_url": auth_url}

@api_router.get("/auth/google/callback")
async def google_callback(code: str, state: str = None):
    """Handles Google OAuth callback"""
    try:
        # Exchange code for tokens
        token_response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': GOOGLE_REDIRECT_URI,
                'grant_type': 'authorization_code'
            }
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Falha ao obter tokens do Google")
        
        tokens = token_response.json()
        
        # Get user email from Google
        userinfo_response = requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {tokens["access_token"]}'}
        )
        
        if userinfo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Falha ao obter informações do usuário")
        
        google_user = userinfo_response.json()
        google_email = google_user.get('email')
        
        # Find user by state (user_id) or by google email
        user = None
        if state:
            user = await db.users.find_one({"id": state}, {"_id": 0})
        
        if not user:
            user = await db.users.find_one({"email": google_email}, {"_id": 0})
        
        if not user:
            # Close window with error
            return RedirectResponse(
                url=f"{FRONTEND_URL}/calendar?google_error=user_not_found"
            )
        
        # Store Google tokens for this user
        await db.users.update_one(
            {"id": user['id']},
            {"$set": {
                "google_tokens": {
                    "access_token": tokens.get('access_token'),
                    "refresh_token": tokens.get('refresh_token'),
                    "expires_in": tokens.get('expires_in'),
                    "token_type": tokens.get('token_type'),
                    "scope": tokens.get('scope'),
                    "obtained_at": datetime.now(timezone.utc).isoformat()
                },
                "google_email": google_email
            }}
        )
        
        # Redirect back to calendar page with success
        return RedirectResponse(
            url=f"{FRONTEND_URL}/calendar?google_connected=true"
        )
        
    except Exception as e:
        logging.error(f"Google callback error: {str(e)}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/calendar?google_error=auth_failed"
        )

@api_router.get("/auth/google/status")
async def google_auth_status(current_user: User = Depends(get_current_user)):
    """Check if user has connected Google Calendar"""
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "google_tokens": 1, "google_email": 1})
    
    has_google = False
    if user and user.get('google_tokens'):
        tokens = user.get('google_tokens')
        if isinstance(tokens, dict) and tokens.get('access_token'):
            has_google = True
    
    return {
        "connected": has_google,
        "google_email": user.get('google_email') if has_google else None
    }

@api_router.delete("/auth/google/disconnect")
async def google_disconnect(current_user: User = Depends(get_current_user)):
    """Disconnect Google Calendar from user account"""
    await db.users.update_one(
        {"id": current_user.id},
        {"$unset": {"google_tokens": "", "google_email": ""}}
    )
    
    return {"message": "Google Calendar desconectado com sucesso"}

async def get_google_credentials(user_id: str):
    """Get and refresh Google credentials for a user"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "google_tokens": 1})
    
    if not user or not user.get('google_tokens'):
        return None
    
    tokens = user['google_tokens']
    
    creds = Credentials(
        token=tokens.get('access_token'),
        refresh_token=tokens.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GOOGLE_CALENDAR_SCOPES
    )
    
    # Refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            # Update stored token
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "google_tokens.access_token": creds.token,
                    "google_tokens.obtained_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        except Exception as e:
            logging.error(f"Failed to refresh Google token: {str(e)}")
            return None
    
    return creds

@api_router.get("/calendar/events")
async def get_google_calendar_events(current_user: User = Depends(get_current_user)):
    """Get events from user's Google Calendar"""
    google_creds = await get_google_credentials(current_user.id)
    if not google_creds:
        raise HTTPException(status_code=401, detail="Google Calendar não conectado")
    
    try:
        service = build('calendar', 'v3', credentials=google_creds)
        
        # Get events from now to 30 days ahead
        now = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        
        events_result = service.events().list(
            calendarId='primary',
            timeMin=now,
            timeMax=end,
            maxResults=50,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        
        return {"events": events}
        
    except Exception as e:
        logging.error(f"Error fetching Google Calendar events: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao buscar eventos: {str(e)}")

class GoogleCalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_datetime: str  # ISO format
    end_datetime: str  # ISO format
    location: Optional[str] = None
    attendees: Optional[List[str]] = None  # List of email addresses
    send_notifications: Optional[bool] = True  # Send email invites to attendees

@api_router.post("/calendar/events")
async def create_google_calendar_event(
    event_data: GoogleCalendarEventCreate,
    current_user: User = Depends(get_current_user)
):
    """Create an event in user's Google Calendar with optional email invites"""
    google_creds = await get_google_credentials(current_user.id)
    if not google_creds:
        raise HTTPException(status_code=401, detail="Google Calendar não conectado")
    
    try:
        service = build('calendar', 'v3', credentials=google_creds)
        
        event_body = {
            'summary': event_data.title,
            'description': event_data.description or '',
            'start': {
                'dateTime': event_data.start_datetime,
                'timeZone': 'America/Sao_Paulo'
            },
            'end': {
                'dateTime': event_data.end_datetime,
                'timeZone': 'America/Sao_Paulo'
            }
        }
        
        if event_data.location:
            event_body['location'] = event_data.location
        
        # Add attendees for email invitations
        if event_data.attendees and len(event_data.attendees) > 0:
            event_body['attendees'] = [{'email': email} for email in event_data.attendees]
            logging.info(f"Adding {len(event_data.attendees)} attendees to calendar event")
        
        # Create the event with sendUpdates parameter for email notifications
        event = service.events().insert(
            calendarId='primary',
            body=event_body,
            sendUpdates='all' if event_data.send_notifications and event_data.attendees else 'none'
        ).execute()
        
        attendees_count = len(event_data.attendees) if event_data.attendees else 0
        return {
            "message": "Evento criado com sucesso no Google Calendar",
            "event_id": event.get('id'),
            "html_link": event.get('htmlLink'),
            "attendees_notified": attendees_count if event_data.send_notifications else 0
        }
        
    except Exception as e:
        logging.error(f"Error creating Google Calendar event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar evento: {str(e)}")

@api_router.delete("/calendar/events/{event_id}")
async def delete_google_calendar_event(
    event_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an event from user's Google Calendar"""
    google_creds = await get_google_credentials(current_user.id)
    if not google_creds:
        raise HTTPException(status_code=401, detail="Google Calendar não conectado")
    
    try:
        service = build('calendar', 'v3', credentials=google_creds)
        service.events().delete(calendarId='primary', eventId=event_id).execute()
        
        return {"message": "Evento removido do Google Calendar"}
        
    except Exception as e:
        logging.error(f"Error deleting Google Calendar event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao remover evento: {str(e)}")


# ==================== JOB JUSTIFICATION ====================

class JobJustificationRequest(BaseModel):
    reason: str
    type: str  # no_checkin, no_checkout, cancelled, rescheduled, other
    job_title: str
    job_code: str

# Emails to notify when job is justified
NOTIFICATION_EMAILS = ["bruno@industriavisual.com.br", "marcelo@industriavisual.com.br"]

@api_router.post("/jobs/{job_id}/justify")
async def submit_job_justification(
    job_id: str,
    justification: JobJustificationRequest,
    current_user: User = Depends(get_current_user)
):
    """Submit justification for a job that wasn't completed and notify managers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Get job
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    # Get justification type label
    type_labels = {
        "no_checkin": "Check-in não realizado",
        "no_checkout": "Check-out não realizado",
        "cancelled": "Job cancelado pelo cliente",
        "rescheduled": "Job reagendado",
        "other": "Outro motivo"
    }
    type_label = type_labels.get(justification.type, justification.type)
    
    # Create justification record
    justification_record = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "job_title": justification.job_title,
        "job_code": justification.job_code,
        "type": justification.type,
        "type_label": type_label,
        "reason": justification.reason,
        "submitted_by": current_user.id,
        "submitted_by_name": current_user.name,
        "submitted_by_email": current_user.email,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.job_justifications.insert_one(justification_record)
    
    # Update job status
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "status": "justificado",
            "justification": justification_record,
            "justified_at": datetime.now(timezone.utc).isoformat(),
            "exclude_from_metrics": True
        }}
    )
    
    # Send email notifications
    try:
        scheduled_date = job.get("scheduled_date", "")
        if scheduled_date:
            try:
                dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
                scheduled_date = dt.strftime("%d/%m/%Y às %H:%M")
            except:
                pass
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }}
                .footer {{ background: #f3f4f6; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }}
                .highlight {{ background: #fef3c7; padding: 10px; border-left: 4px solid #f59e0b; margin: 15px 0; }}
                .info-row {{ display: flex; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }}
                .info-label {{ font-weight: bold; width: 150px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2 style="margin: 0;">⚠️ Job Justificado</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Notificação de job não realizado</p>
                </div>
                <div class="content">
                    <div class="highlight">
                        <strong>Motivo:</strong> {justification.reason}
                    </div>
                    
                    <h3>Detalhes do Job</h3>
                    <div class="info-row">
                        <span class="info-label">Código:</span>
                        <span>#{justification.job_code}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Título:</span>
                        <span>{justification.job_title}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Tipo:</span>
                        <span>{type_label}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Data Agendada:</span>
                        <span>{scheduled_date or 'Não informada'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Cliente:</span>
                        <span>{job.get('holdprint_data', {}).get('customerName') or job.get('client_name') or 'N/A'}</span>
                    </div>
                    
                    <h3>Justificado por</h3>
                    <div class="info-row">
                        <span class="info-label">Nome:</span>
                        <span>{current_user.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Email:</span>
                        <span>{current_user.email}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Data/Hora:</span>
                        <span>{datetime.now(timezone.utc).strftime("%d/%m/%Y às %H:%M")} UTC</span>
                    </div>
                </div>
                <div class="footer">
                    <p>Esta é uma notificação automática do sistema Indústria Visual.</p>
                    <p>Acesse o sistema para mais detalhes.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": SENDER_EMAIL,
            "to": NOTIFICATION_EMAILS,
            "subject": f"⚠️ Job Justificado: #{justification.job_code} - {justification.job_title}",
            "html": html_content
        }
        
        await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Justification email sent for job {job_id} to {NOTIFICATION_EMAILS}")
        
    except Exception as e:
        logging.error(f"Failed to send justification email: {str(e)}")
        # Don't fail the request if email fails
    
    return {
        "message": "Justificativa registrada com sucesso",
        "justification_id": justification_record["id"],
        "emails_sent_to": NOTIFICATION_EMAILS
    }

@api_router.get("/job-justifications")
async def get_job_justifications(current_user: User = Depends(get_current_user)):
    """Get all job justifications (admin/manager only)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    justifications = await db.job_justifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return justifications


# ==================== PUSH NOTIFICATIONS ====================

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict  # Contains p256dh and auth keys

class PushNotificationRequest(BaseModel):
    title: str
    body: str
    icon: Optional[str] = "/logo192.png"
    badge: Optional[str] = "/logo192.png"
    url: Optional[str] = "/"
    user_ids: Optional[List[str]] = None  # If None, send to all installers

@api_router.get("/notifications/vapid-public-key")
async def get_vapid_public_key():
    """Get VAPID public key for push subscription"""
    return {"publicKey": VAPID_PUBLIC_KEY}

@api_router.post("/notifications/subscribe")
async def subscribe_to_notifications(
    subscription: PushSubscription,
    current_user: User = Depends(get_current_user)
):
    """Subscribe user to push notifications"""
    try:
        # Store subscription in database
        await db.push_subscriptions.update_one(
            {"user_id": current_user.id},
            {
                "$set": {
                    "user_id": current_user.id,
                    "endpoint": subscription.endpoint,
                    "keys": subscription.keys,
                    "subscribed_at": datetime.now(timezone.utc).isoformat(),
                    "is_active": True
                }
            },
            upsert=True
        )
        logging.info(f"Push subscription saved for user {current_user.id}")
        return {"message": "Notificações ativadas com sucesso!"}
    except Exception as e:
        logging.error(f"Error saving push subscription: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro ao ativar notificações")

@api_router.delete("/notifications/unsubscribe")
async def unsubscribe_from_notifications(current_user: User = Depends(get_current_user)):
    """Unsubscribe user from push notifications"""
    await db.push_subscriptions.update_one(
        {"user_id": current_user.id},
        {"$set": {"is_active": False}}
    )
    return {"message": "Notificações desativadas"}

@api_router.get("/notifications/status")
async def get_notification_status(current_user: User = Depends(get_current_user)):
    """Check if user is subscribed to notifications"""
    subscription = await db.push_subscriptions.find_one(
        {"user_id": current_user.id, "is_active": True},
        {"_id": 0}
    )
    return {"subscribed": subscription is not None}

async def send_push_notification(user_id: str, title: str, body: str, url: str = "/", data: dict = None):
    """Send push notification to a specific user"""
    subscription = await db.push_subscriptions.find_one(
        {"user_id": user_id, "is_active": True}
    )
    
    if not subscription:
        logging.info(f"No active push subscription for user {user_id}")
        return False
    
    try:
        payload = json.dumps({
            "title": title,
            "body": body,
            "icon": "/logo192.png",
            "badge": "/logo192.png",
            "url": url,
            "data": data or {}
        })
        
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": subscription["keys"]
            },
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={
                "sub": f"mailto:{VAPID_CLAIMS_EMAIL}"
            }
        )
        logging.info(f"Push notification sent to user {user_id}")
        return True
    except WebPushException as e:
        logging.error(f"Push notification failed for user {user_id}: {str(e)}")
        # If subscription is invalid, mark it as inactive
        if e.response and e.response.status_code in [404, 410]:
            await db.push_subscriptions.update_one(
                {"user_id": user_id},
                {"$set": {"is_active": False}}
            )
        return False

@api_router.post("/notifications/send")
async def send_notification_to_users(
    notification: PushNotificationRequest,
    current_user: User = Depends(get_current_user)
):
    """Send push notification to specific users or all installers (admin/manager only)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    if notification.user_ids:
        # Send to specific users
        user_ids = notification.user_ids
    else:
        # Send to all installers
        installers = await db.installers.find({}, {"_id": 0, "user_id": 1}).to_list(1000)
        user_ids = [i["user_id"] for i in installers if i.get("user_id")]
    
    sent_count = 0
    for user_id in user_ids:
        success = await send_push_notification(
            user_id=user_id,
            title=notification.title,
            body=notification.body,
            url=notification.url or "/"
        )
        if success:
            sent_count += 1
    
    return {"message": f"Notificações enviadas para {sent_count} usuários"}

@api_router.get("/notifications/check-schedule-conflicts")
async def check_schedule_conflicts(
    installer_id: str,
    date: str,
    time: str = "08:00",
    exclude_job_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Check if installer has schedule conflicts on a specific date/time"""
    try:
        # Parse date
        target_date = datetime.fromisoformat(date.replace('Z', '+00:00'))
        target_date_str = target_date.strftime('%Y-%m-%d')
        
        # Find jobs assigned to this installer on the same date
        query = {
            "assigned_installers": installer_id,
            "scheduled_date": {"$regex": f"^{target_date_str}"}
        }
        
        if exclude_job_id:
            query["id"] = {"$ne": exclude_job_id}
        
        conflicting_jobs = await db.jobs.find(query, {"_id": 0, "id": 1, "title": 1, "scheduled_date": 1}).to_list(100)
        
        has_conflict = len(conflicting_jobs) > 0
        
        return {
            "has_conflict": has_conflict,
            "conflicting_jobs": conflicting_jobs,
            "message": f"Instalador já tem {len(conflicting_jobs)} job(s) agendado(s) para esta data" if has_conflict else "Sem conflitos"
        }
    except Exception as e:
        logging.error(f"Error checking schedule conflicts: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro ao verificar conflitos")

@api_router.get("/notifications/pending-checkins")
async def get_pending_checkins(current_user: User = Depends(get_current_user)):
    """Get scheduled jobs that haven't been started (for late check-in alerts)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    now = datetime.now(timezone.utc)
    today_str = now.strftime('%Y-%m-%d')
    
    # Find jobs scheduled for today that are past their scheduled time
    jobs = await db.jobs.find({
        "status": "scheduled",
        "scheduled_date": {"$regex": f"^{today_str}"}
    }, {"_id": 0}).to_list(1000)
    
    pending = []
    for job in jobs:
        scheduled_date_str = job.get("scheduled_date", "")
        if scheduled_date_str:
            try:
                scheduled_time = datetime.fromisoformat(scheduled_date_str.replace('Z', '+00:00'))
                if scheduled_time < now:
                    # Job is late
                    minutes_late = int((now - scheduled_time).total_seconds() / 60)
                    job["minutes_late"] = minutes_late
                    job["is_late"] = True
                    
                    # Get assigned installers info
                    if job.get("assigned_installers"):
                        installers = await db.installers.find(
                            {"id": {"$in": job["assigned_installers"]}},
                            {"_id": 0, "id": 1, "full_name": 1, "user_id": 1}
                        ).to_list(100)
                        job["installers_info"] = installers
                    
                    pending.append(job)
            except:
                pass
    
    return {"pending_checkins": pending, "count": len(pending)}

@api_router.post("/notifications/send-late-alerts")
async def send_late_checkin_alerts(current_user: User = Depends(get_current_user)):
    """Send notifications for late check-ins"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    result = await get_pending_checkins(current_user)
    pending = result["pending_checkins"]
    
    sent_count = 0
    for job in pending:
        installers_info = job.get("installers_info", [])
        for installer in installers_info:
            user_id = installer.get("user_id")
            if user_id:
                success = await send_push_notification(
                    user_id=user_id,
                    title="⚠️ Check-in Atrasado",
                    body=f"O job '{job.get('title', 'Job')}' está {job.get('minutes_late', 0)} minutos atrasado. Inicie o check-in!",
                    url=f"/installer/jobs/{job.get('id')}",
                    data={"type": "late_checkin", "job_id": job.get("id")}
                )
                if success:
                    sent_count += 1
    
    return {"message": f"Alertas enviados para {sent_count} instaladores", "jobs_count": len(pending)}

@api_router.post("/notifications/notify-job-scheduled")
async def notify_job_scheduled(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Send notification when a job is scheduled"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    assigned_installers = job.get("assigned_installers", [])
    if not assigned_installers:
        return {"message": "Job não tem instaladores atribuídos", "sent_count": 0}
    
    # Get installer user IDs
    installers = await db.installers.find(
        {"id": {"$in": assigned_installers}},
        {"_id": 0, "user_id": 1, "full_name": 1}
    ).to_list(100)
    
    scheduled_date = job.get("scheduled_date", "")
    date_display = ""
    if scheduled_date:
        try:
            dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
            date_display = dt.strftime("%d/%m/%Y às %H:%M")
        except:
            date_display = scheduled_date
    
    sent_count = 0
    for installer in installers:
        user_id = installer.get("user_id")
        if user_id:
            success = await send_push_notification(
                user_id=user_id,
                title="📅 Novo Agendamento",
                body=f"Você foi agendado para: {job.get('title', 'Job')} em {date_display}",
                url=f"/installer/jobs/{job_id}",
                data={"type": "job_scheduled", "job_id": job_id}
            )
            if success:
                sent_count += 1
    
    return {"message": f"Notificações enviadas para {sent_count} instaladores"}


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

async def calculate_checkout_coins(checkin_data: dict, job_data: dict) -> dict:
    """
    Calculate coins earned from a checkout based on triggers:
    - Check-in no Prazo (50%): If check-in time <= scheduled time
    - Check-out com Evidências (20%): If checkout photo exists
    - Engajamento na Agenda (10%): Daily bonus for first access
    - Produtividade Base (20%): Awarded by m² completed
    
    Conversion: 1 m² with 100% approval = 10 coins
    """
    installed_m2 = checkin_data.get("installed_m2", 0) or 0
    if installed_m2 <= 0:
        return {"total_coins": 0, "breakdown": {}, "base_coins": 0}
    
    # Base coins from m² (this is 100% if all triggers are met)
    base_coins = int(installed_m2 * BASE_COINS_PER_M2)
    
    breakdown = {
        "checkin_on_time": {"earned": 0, "max": 0, "percentage": 50, "approved": False},
        "checkout_evidence": {"earned": 0, "max": 0, "percentage": 20, "approved": False},
        "daily_engagement": {"earned": 0, "max": 0, "percentage": 10, "approved": False},
        "base_productivity": {"earned": 0, "max": 0, "percentage": 20, "approved": False}
    }
    
    # Calculate max possible for each trigger
    breakdown["checkin_on_time"]["max"] = int(base_coins * 0.50)
    breakdown["checkout_evidence"]["max"] = int(base_coins * 0.20)
    breakdown["daily_engagement"]["max"] = int(base_coins * 0.10)
    breakdown["base_productivity"]["max"] = int(base_coins * 0.20)
    
    # 1. Check-in on Time (50%) - Compare checkin_at with scheduled_date
    scheduled_date = job_data.get("scheduled_date")
    checkin_at = checkin_data.get("checkin_at")
    
    if scheduled_date and checkin_at:
        try:
            if isinstance(scheduled_date, str):
                scheduled_dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
            else:
                scheduled_dt = scheduled_date
            
            if isinstance(checkin_at, str):
                checkin_dt = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
            else:
                checkin_dt = checkin_at
            
            # Allow 15 minutes tolerance
            tolerance = timedelta(minutes=15)
            if checkin_dt <= scheduled_dt + tolerance:
                breakdown["checkin_on_time"]["earned"] = breakdown["checkin_on_time"]["max"]
                breakdown["checkin_on_time"]["approved"] = True
        except Exception as e:
            logging.warning(f"Error comparing dates for gamification: {e}")
    
    # 2. Check-out with Evidence (20%) - Has checkout photo
    if checkin_data.get("checkout_photo"):
        breakdown["checkout_evidence"]["earned"] = breakdown["checkout_evidence"]["max"]
        breakdown["checkout_evidence"]["approved"] = True
    
    # 3. Daily Engagement (10%) - First access today (handled separately)
    # This will be checked in the endpoint
    
    # 4. Base Productivity (20%) - Always awarded for completion
    breakdown["base_productivity"]["earned"] = breakdown["base_productivity"]["max"]
    breakdown["base_productivity"]["approved"] = True
    
    total_coins = sum(trigger["earned"] for trigger in breakdown.values())
    
    return {
        "total_coins": total_coins,
        "breakdown": breakdown,
        "base_coins": base_coins,
        "installed_m2": installed_m2
    }

async def award_coins(user_id: str, amount: int, transaction_type: str, description: str, reference_id: str = None, breakdown: dict = None):
    """Award coins to a user and update their balance"""
    if amount <= 0:
        return None
    
    # Get or create balance
    balance = await db.gamification_balances.find_one({"user_id": user_id}, {"_id": 0})
    
    if not balance:
        balance = GamificationBalance(user_id=user_id).model_dump()
        balance["created_at"] = balance["created_at"].isoformat()
        balance["updated_at"] = balance["updated_at"].isoformat()
        await db.gamification_balances.insert_one(balance)
    
    # Update balance
    new_total = (balance.get("total_coins", 0) or 0) + amount
    new_lifetime = (balance.get("lifetime_coins", 0) or 0) + amount
    new_level = get_level_from_coins(new_lifetime)["level"]
    
    await db.gamification_balances.update_one(
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
    await db.coin_transactions.insert_one(trans_dict)
    
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


# ============ SCHEDULER MANAGEMENT ROUTES ============

@api_router.get("/scheduler/jobs")
async def get_scheduler_jobs(current_user: User = Depends(get_current_user)):
    """List all scheduled jobs and their status"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    jobs = get_scheduled_jobs()
    scheduler_instance = get_scheduler()
    
    return {
        "scheduler_running": scheduler_instance.running,
        "jobs": jobs
    }

@api_router.post("/scheduler/jobs/{job_id}/pause")
async def pause_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Pause a scheduled job"""
    await require_role(current_user, [UserRole.ADMIN])
    
    try:
        pause_job(job_id)
        return {"success": True, "message": f"Job {job_id} pausado"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scheduler/jobs/{job_id}/resume")
async def resume_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Resume a paused job"""
    await require_role(current_user, [UserRole.ADMIN])
    
    try:
        resume_job(job_id)
        return {"success": True, "message": f"Job {job_id} retomado"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scheduler/jobs/{job_id}/run-now")
async def run_scheduler_job_now(job_id: str, current_user: User = Depends(get_current_user)):
    """Trigger a job to run immediately"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    success = run_job_now(job_id)
    if success:
        return {"success": True, "message": f"Job {job_id} será executado em instantes"}
    else:
        raise HTTPException(status_code=404, detail=f"Job {job_id} não encontrado")


# ============ TRELLO PCP INTEGRATION ============
from services.trello import (
    get_board_info, get_board_lists, get_board_cards,
    get_card_details, get_installation_cards, get_pcp_summary,
    search_cards, get_cards_by_date_range
)

@api_router.get("/trello/board")
async def trello_get_board(current_user: User = Depends(get_current_user)):
    """Get Trello board information"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    try:
        board = await get_board_info()
        return {"success": True, "board": board}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/trello/lists")
async def trello_get_lists(current_user: User = Depends(get_current_user)):
    """Get all lists from the PCP board"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    try:
        lists = await get_board_lists()
        return {"success": True, "lists": lists}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/trello/cards")
async def trello_get_cards(
    list_id: Optional[str] = Query(None, description="Filter by list ID"),
    current_user: User = Depends(get_current_user)
):
    """Get cards from the PCP board"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    try:
        cards = await get_board_cards(list_id)
        return {"success": True, "total": len(cards), "cards": cards}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/trello/cards/{card_id}")
async def trello_get_card_details(card_id: str, current_user: User = Depends(get_current_user)):
    """Get detailed information about a specific card"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    try:
        card = await get_card_details(card_id)
        return {"success": True, "card": card}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/trello/installation")
async def trello_get_installation_cards(current_user: User = Depends(get_current_user)):
    """Get cards from the installation list"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    try:
        cards = await get_installation_cards()
        return {"success": True, "total": len(cards), "cards": cards}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/trello/summary")
async def trello_get_summary(current_user: User = Depends(get_current_user)):
    """Get a summary of the PCP board"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    try:
        summary = await get_pcp_summary()
        return {"success": True, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/trello/search")
async def trello_search_cards(
    q: str = Query(..., description="Search query"),
    current_user: User = Depends(get_current_user)
):
    """Search for cards by name or description"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    try:
        cards = await search_cards(q)
        return {"success": True, "total": len(cards), "cards": cards}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    """Initialize scheduler on application startup"""
    setup_scheduler(db)
    start_scheduler()
    logger.info("✅ Aplicação iniciada com scheduler ativo")

@app.on_event("shutdown")
async def shutdown_db_client():
    shutdown_scheduler()
    client.close()
    logger.info("🛑 Aplicação encerrada")