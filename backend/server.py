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
    
    # Send email - Hardcoded production URL
    reset_link = f"https://instal-visual.com.br/reset-password?token={reset_token}"
    
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


# === ITEM-CHECKINS ROUTES REMOVED - NOW IN routes/item_checkins.py ===


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