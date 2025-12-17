from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# Holdprint API Keys
HOLDPRINT_API_KEY_POA = os.environ.get('HOLDPRINT_API_KEY_POA')
HOLDPRINT_API_KEY_SP = os.environ.get('HOLDPRINT_API_KEY_SP')
HOLDPRINT_API_URL = "https://api.holdworks.ai/api-key/jobs/data"

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI', 'https://instalmonitor.preview.emergentagent.com/api/auth/google/callback')
GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email']

# Resend Email Config
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://instalmonitor.preview.emergentagent.com')
resend.api_key = RESEND_API_KEY

# ============ CATÁLOGO DE PRODUTOS HOLDPRINT ============
# Mapeamento de produtos para famílias - usado para associação automática

PRODUCT_FAMILY_MAPPING = {
    # Adesivos
    "Adesivos": [
        "adesivo", "vinil", "fachada adesivada", "fachada com vinil"
    ],
    # Lonas e Banners
    "Lonas e Banners": [
        "lona", "banner", "faixa", "empena", "faixa de gradil"
    ],
    # Chapas e Placas
    "Chapas e Placas": [
        "chapa", "placa", "acm", "acrílico", "mdf", "ps", "pvc", "polionda", 
        "policarbonato", "petg", "compensado", "xps"
    ],
    # Estruturas Metálicas
    "Estruturas Metálicas": [
        "estrutura metálica", "estrutura metalica", "backdrop", "cavalete"
    ],
    # Tecidos
    "Tecidos": [
        "tecido", "bandeira", "wind banner"
    ],
    # Letras Caixa
    "Letras Caixa": [
        "letra caixa", "letra-caixa", "letras caixa"
    ],
    # Totens
    "Totens": [
        "totem"
    ],
    # Envelopamento
    "Envelopamento": [
        "envelopamento"
    ],
    # Painéis Luminosos
    "Painéis Luminosos": [
        "painel backlight", "painel luminoso", "backlight"
    ],
    # Serviços
    "Serviços": [
        "serviço", "serviços", "instalação", "entrega", "montagem", 
        "pintura", "serralheria", "solda", "corte", "aplicação"
    ],
    # Materiais Promocionais
    "Materiais Promocionais": [
        "cartaz", "flyer", "folder", "panfleto", "imã", "marca-página"
    ],
    # Produtos Terceirizados
    "Produtos Terceirizados": [
        "terceirizado", "produto genérico"
    ],
    # Sublimação
    "Sublimação": [
        "sublimação", "sublimática", "sublimatico"
    ],
    # Impressão
    "Impressão": [
        "impressão uv", "impressão latex", "impressão solvente"
    ],
    # Display/PS
    "Display/PS": [
        "display", "móbile", "mobile", "orelha de monitor"
    ],
    # Fundação
    "Fundação/Estrutura": [
        "fundação", "sapata", "estrutura em madeira"
    ]
}

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

async def fetch_holdprint_jobs(branch: str):
    """Fetch jobs from Holdprint API - últimos 7 dias, excluindo finalizados"""
    api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
    
    if not api_key:
        raise HTTPException(status_code=500, detail=f"API key not configured for branch {branch}")
    
    headers = {"x-api-key": api_key}
    
    # Calcular datas: últimos 7 dias
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    
    # Formatar datas no padrão YYYY-MM-DD
    start_date_str = start_date.strftime("%Y-%m-%d")
    end_date_str = end_date.strftime("%Y-%m-%d")
    
    # Montar URL com parâmetros de filtro
    params = {
        "page": 1,
        "pageSize": 100,
        "startDate": start_date_str,
        "endDate": end_date_str,
        "language": "pt-BR"
    }
    
    try:
        response = requests.get(HOLDPRINT_API_URL, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # Holdprint returns {data: [...]} format
        jobs = []
        if isinstance(data, dict) and 'data' in data:
            jobs = data['data']
        elif isinstance(data, list):
            jobs = data
        
        # Filtrar jobs NÃO finalizados (isFinalized = false ou não existe)
        filtered_jobs = [job for job in jobs if not job.get('isFinalized', False)]
        
        logger.info(f"Holdprint {branch}: {len(jobs)} jobs encontrados, {len(filtered_jobs)} não finalizados (últimos 7 dias: {start_date_str} a {end_date_str})")
        
        return filtered_jobs
    except requests.RequestException as e:
        logger.error(f"Error fetching from Holdprint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching from Holdprint: {str(e)}")

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
    
    # Send email
    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    
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
    except Exception as e:
        logging.error(f"Failed to send password reset email: {str(e)}")
        # Still return success message to not reveal if email exists
    
    return {"message": "Se o email existir, você receberá um link para redefinir sua senha."}

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
    update_data = {k: v for k, v in user_data.items() if k not in ['id', 'created_at', 'password']}
    
    if 'password' in user_data:
        update_data['password_hash'] = get_password_hash(user_data['password'])
    
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0, "password_hash": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    
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
async def get_holdprint_jobs(branch: str, current_user: User = Depends(get_current_user)):
    """Fetch jobs from Holdprint API"""
    if branch not in ["POA", "SP"]:
        raise HTTPException(status_code=400, detail="Branch must be POA or SP")
    
    jobs = await fetch_holdprint_jobs(branch)
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
    
    for job in jobs:
        if isinstance(job['created_at'], str):
            job['created_at'] = datetime.fromisoformat(job['created_at'])
        if job.get('scheduled_date') and isinstance(job['scheduled_date'], str):
            job['scheduled_date'] = datetime.fromisoformat(job['scheduled_date'])
    
    return jobs

@api_router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, current_user: User = Depends(get_current_user)):
    job_doc = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")
    
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

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@api_router.post("/checkins", response_model=CheckIn)
async def create_checkin(
    job_id: str = Form(...),
    photo_base64: str = Form(...),
    gps_lat: float = Form(...),
    gps_long: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Create check-in for a job with photo in Base64 and GPS coordinates"""
    # Get installer
    installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
    if not installer:
        raise HTTPException(status_code=400, detail="User is not an installer")
    
    # Check if job exists
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check for existing open checkin
    existing = await db.checkins.find_one({
        "job_id": job_id,
        "installer_id": installer['id'],
        "status": "in_progress"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already checked in")
    
    # Compress photo before storing
    compressed_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
    
    # Create checkin with compressed Base64 photo and GPS
    checkin_id = str(uuid.uuid4())
    checkin = CheckIn(
        id=checkin_id,
        job_id=job_id,
        installer_id=installer['id'],
        checkin_photo=compressed_photo,
        gps_lat=gps_lat,
        gps_long=gps_long,
        gps_accuracy=gps_accuracy
    )
    
    checkin_dict = checkin.model_dump()
    checkin_dict['checkin_at'] = checkin_dict['checkin_at'].isoformat()
    if checkin_dict.get('checkout_at'):
        checkin_dict['checkout_at'] = checkin_dict['checkout_at'].isoformat()
    
    await db.checkins.insert_one(checkin_dict)
    
    # Update job status
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "in_progress"}}
    )
    
    return checkin

@api_router.put("/checkins/{checkin_id}/checkout", response_model=CheckIn)
async def checkout(
    checkin_id: str,
    photo_base64: str = Form(...),
    gps_lat: float = Form(...),
    gps_long: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    installed_m2: Optional[float] = Form(None),
    complexity_level: Optional[int] = Form(None),
    height_category: Optional[str] = Form(None),
    scenario_category: Optional[str] = Form(None),
    difficulty_description: Optional[str] = Form(None),
    notes: str = Form(""),
    current_user: User = Depends(get_current_user)
):
    """Check out from a job with photo in Base64, GPS coordinates and productivity metrics"""
    checkin_doc = await db.checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin_doc:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    if checkin_doc['status'] == "completed":
        raise HTTPException(status_code=400, detail="Already checked out")
    
    # Calculate duration
    checkout_at = datetime.now(timezone.utc)
    checkin_at = datetime.fromisoformat(checkin_doc['checkin_at']) if isinstance(checkin_doc['checkin_at'], str) else checkin_doc['checkin_at']
    duration_minutes = int((checkout_at - checkin_at).total_seconds() / 60)
    
    # Calculate productivity if m2 and duration available
    productivity_m2_h = None
    if installed_m2 and installed_m2 > 0 and duration_minutes > 0:
        hours = duration_minutes / 60
        productivity_m2_h = round(installed_m2 / hours, 2)
    
    # Compress checkout photo before storing
    compressed_checkout_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
    
    # Update checkin with compressed Base64 photo, GPS and metrics
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
        "difficulty_description": difficulty_description,
        "productivity_m2_h": productivity_m2_h,
        "notes": notes,
        "duration_minutes": duration_minutes,
        "status": "completed"
    }
    
    result = await db.checkins.find_one_and_update(
        {"id": checkin_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    # Check if all checkins for this job are completed
    job_checkins = await db.checkins.find({"job_id": checkin_doc['job_id']}, {"_id": 0}).to_list(1000)
    all_completed = all(c['status'] == "completed" for c in job_checkins)
    
    if all_completed:
        await db.jobs.update_one(
            {"id": checkin_doc['job_id']},
            {"$set": {"status": "completed"}}
        )
    
    # === AUTOMATIC REGISTRATION OF INSTALLED PRODUCTS ===
    # Register installed products based on job items assigned to this installer
    await register_installed_products_from_checkout(
        checkin_id=checkin_id,
        job_id=checkin_doc['job_id'],
        installer_id=checkin_doc['installer_id'],
        installed_m2=installed_m2,
        complexity_level=complexity_level,
        height_category=height_category,
        scenario_category=scenario_category,
        duration_minutes=duration_minutes,
        notes=notes
    )
    
    if isinstance(result['checkin_at'], str):
        result['checkin_at'] = datetime.fromisoformat(result['checkin_at'])
    if result.get('checkout_at') and isinstance(result['checkout_at'], str):
        result['checkout_at'] = datetime.fromisoformat(result['checkout_at'])
    
    return CheckIn(**result)

async def register_installed_products_from_checkout(
    checkin_id: str,
    job_id: str,
    installer_id: str,
    installed_m2: Optional[float],
    complexity_level: Optional[int],
    height_category: Optional[str],
    scenario_category: Optional[str],
    duration_minutes: int,
    notes: Optional[str]
):
    """
    Automatically registers installed products based on checkout data.
    Links the checkout metrics to the productivity system.
    """
    try:
        # Get the job details
        job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            return
        
        # Get products with area from the job
        products = job.get("products_with_area", [])
        if not products:
            products = job.get("holdprint_data", {}).get("products", [])
        
        # Get item assignments for this installer
        item_assignments = job.get("item_assignments", [])
        assigned_items = [a for a in item_assignments if a.get("installer_id") == installer_id]
        
        # If no specific assignments, create one general record for the checkout
        if not assigned_items and installed_m2 and installed_m2 > 0:
            # Create a general product record
            product_name = f"Instalação - {job.get('title', 'Job')}"
            
            # Try to find a matching family based on job products
            family_id = None
            family_name = None
            
            # Detect family from product names
            product_names = [p.get("name", "") for p in products]
            family_id, family_name = await detect_product_family(product_names)
            
            # Calculate productivity
            productivity_m2_h = None
            if duration_minutes > 0:
                hours = duration_minutes / 60
                productivity_m2_h = round(installed_m2 / hours, 2)
            
            # Create the installed product record
            installed_product = ProductInstalled(
                job_id=job_id,
                checkin_id=checkin_id,
                product_name=product_name,
                family_id=family_id,
                family_name=family_name,
                area_m2=installed_m2,
                complexity_level=complexity_level or 1,
                height_category=height_category or "terreo",
                scenario_category=scenario_category or "loja_rua",
                actual_time_min=duration_minutes,
                productivity_m2_h=productivity_m2_h,
                cause_notes=notes
            )
            
            await db.installed_products.insert_one(installed_product.model_dump())
            
            # Update productivity history
            await update_productivity_history(installed_product)
            
        else:
            # Create records for each assigned item
            total_assigned_items = len(assigned_items)
            time_per_item = duration_minutes // total_assigned_items if total_assigned_items > 0 else duration_minutes
            
            for assignment in assigned_items:
                item_idx = assignment.get("item_index", 0)
                item_m2 = assignment.get("m2_assigned", 0)
                
                # Get product details
                product = products[item_idx] if item_idx < len(products) else {}
                product_name = product.get("name", f"Item {item_idx}")
                width = product.get("width") or product.get("width_m")
                height = product.get("height") or product.get("height_m")
                
                # Detect family
                family_id, family_name = await detect_product_family([product_name])
                
                # Use reported m² or calculated m²
                final_m2 = item_m2 if item_m2 > 0 else (installed_m2 / total_assigned_items if installed_m2 else 0)
                
                # Calculate productivity for this item
                productivity_m2_h = None
                if time_per_item > 0 and final_m2 > 0:
                    hours = time_per_item / 60
                    productivity_m2_h = round(final_m2 / hours, 2)
                
                installed_product = ProductInstalled(
                    job_id=job_id,
                    checkin_id=checkin_id,
                    product_name=product_name,
                    family_id=family_id,
                    family_name=family_name,
                    width_m=float(width) if width else None,
                    height_m=float(height) if height else None,
                    area_m2=final_m2,
                    complexity_level=complexity_level or 1,
                    height_category=height_category or "terreo",
                    scenario_category=scenario_category or "loja_rua",
                    actual_time_min=time_per_item,
                    productivity_m2_h=productivity_m2_h,
                    cause_notes=notes
                )
                
                await db.installed_products.insert_one(installed_product.model_dump())
                
                # Update productivity history
                await update_productivity_history(installed_product)
                
    except Exception as e:
        # Log error but don't fail the checkout
        print(f"Error registering installed products: {e}")


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

@api_router.get("/checkins", response_model=List[CheckIn])
async def list_checkins(job_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """List check-ins"""
    query = {}
    
    if job_id:
        query["job_id"] = job_id
    
    # Installers only see their own checkins
    if current_user.role == UserRole.INSTALLER:
        installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            query["installer_id"] = installer['id']
        else:
            return []
    
    checkins = await db.checkins.find(query, {"_id": 0}).to_list(1000)
    
    for checkin in checkins:
        if isinstance(checkin['checkin_at'], str):
            checkin['checkin_at'] = datetime.fromisoformat(checkin['checkin_at'])
        if checkin.get('checkout_at') and isinstance(checkin['checkout_at'], str):
            checkin['checkout_at'] = datetime.fromisoformat(checkin['checkout_at'])
    
    return checkins

@api_router.get("/checkins/{checkin_id}/details")
async def get_checkin_details(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get check-in details with photos and GPS data for managers/admins"""
    # Only admin and managers can view detailed checkin data
    if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    checkin = await db.checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    # Get installer info
    installer = await db.installers.find_one({"id": checkin['installer_id']}, {"_id": 0})
    
    # Get job info
    job = await db.jobs.find_one({"id": checkin['job_id']}, {"_id": 0})
    
    return {
        "checkin": checkin,
        "installer": installer,
        "job": job
    }

@api_router.delete("/checkins/{checkin_id}")
async def delete_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a check-in - Only admin and managers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Check if checkin exists
    checkin = await db.checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    # Delete the checkin
    await db.checkins.delete_one({"id": checkin_id})
    
    # Also delete related installed products
    await db.installed_products.delete_many({"checkin_id": checkin_id})
    
    return {"message": "Check-in deleted successfully"}

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
    
    products = job.get("products_with_area", [])
    if item_index >= len(products):
        raise HTTPException(status_code=400, detail="Invalid item index")
    
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
    
    await db.item_checkins.insert_one(item_checkin.model_dump())
    
    # Update job status
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "in_progress"}})
    
    return item_checkin.model_dump()

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
        
        enriched = {
            **c,
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
    
    # Return updated checkin
    result = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    return result


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
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
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
        
        # Usar tempo LÍQUIDO se disponível, senão calcular bruto
        net_duration_minutes = checkin.get("net_duration_minutes")
        total_pause_minutes = checkin.get("total_pause_minutes", 0) or 0
        
        if net_duration_minutes is None:
            # Fallback para cálculo bruto se não tiver tempo líquido
            checkout_at = checkin.get("checkout_at")
            if isinstance(checkout_at, str):
                checkout_at = datetime.fromisoformat(checkout_at.replace('Z', '+00:00'))
            
            # Garantir que ambos têm timezone
            if checkin_at and checkin_at.tzinfo is None:
                checkin_at = checkin_at.replace(tzinfo=timezone.utc)
            if checkout_at and checkout_at.tzinfo is None:
                checkout_at = checkout_at.replace(tzinfo=timezone.utc)
            
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
    
    # Get all checkins with related data
    checkins = await db.checkins.find({}, {"_id": 0}).to_list(1000)
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(1000)
    installers = await db.installers.find({}, {"_id": 0}).to_list(1000)
    
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
        "ID do Job",
        "Nome do Job",
        "Cliente",
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
    
    # Write data
    row_num = 2
    for checkin in checkins:
        job = jobs_map.get(checkin.get('job_id'))
        installer = installers_map.get(checkin.get('installer_id'))
        
        if not job:
            continue
            
        ws.cell(row=row_num, column=1, value=job.get('id', '')).border = border
        ws.cell(row=row_num, column=2, value=job.get('title', '')).border = border
        ws.cell(row=row_num, column=3, value=job.get('client_name', '')).border = border
        ws.cell(row=row_num, column=4, value=job.get('area_m2', '')).border = border
        ws.cell(row=row_num, column=5, value=checkin.get('installed_m2', '')).border = border
        ws.cell(row=row_num, column=6, value=installer.get('full_name', '') if installer else '').border = border
        ws.cell(row=row_num, column=7, value=checkin.get('gps_lat', '')).border = border
        ws.cell(row=row_num, column=8, value=checkin.get('gps_long', '')).border = border
        ws.cell(row=row_num, column=9, value=checkin.get('checkout_gps_lat', '')).border = border
        ws.cell(row=row_num, column=10, value=checkin.get('checkout_gps_long', '')).border = border
        
        checkin_at = checkin.get('checkin_at')
        if isinstance(checkin_at, str):
            checkin_at = datetime.fromisoformat(checkin_at)
        ws.cell(row=row_num, column=11, value=checkin_at.strftime('%d/%m/%Y %H:%M') if checkin_at else '').border = border
        
        checkout_at = checkin.get('checkout_at')
        if isinstance(checkout_at, str):
            checkout_at = datetime.fromisoformat(checkout_at)
        ws.cell(row=row_num, column=12, value=checkout_at.strftime('%d/%m/%Y %H:%M') if checkout_at else '').border = border
        
        ws.cell(row=row_num, column=13, value=checkin.get('duration_minutes', '')).border = border
        ws.cell(row=row_num, column=14, value=checkin.get('status', '')).border = border
        ws.cell(row=row_num, column=15, value=job.get('branch', '')).border = border
        
        row_num += 1
    
    # Adjust column widths
    column_widths = {
        'A': 35, 'B': 30, 'C': 25, 'D': 15, 'E': 15,
        'F': 20, 'G': 18, 'H': 18, 'I': 18, 'J': 18,
        'K': 18, 'L': 18, 'M': 12, 'N': 15, 'O': 12
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
                url=f"https://instalmonitor.preview.emergentagent.com/calendar?google_error=user_not_found"
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
            url=f"https://instalmonitor.preview.emergentagent.com/calendar?google_connected=true"
        )
        
    except Exception as e:
        logging.error(f"Google callback error: {str(e)}")
        return RedirectResponse(
            url=f"https://instalmonitor.preview.emergentagent.com/calendar?google_error=auth_failed"
        )

@api_router.get("/auth/google/status")
async def google_auth_status(current_user: User = Depends(get_current_user)):
    """Check if user has connected Google Calendar"""
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "google_tokens": 1, "google_email": 1})
    
    has_google = user and user.get('google_tokens') and user['google_tokens'].get('access_token')
    
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

@api_router.post("/calendar/events")
async def create_google_calendar_event(
    event_data: GoogleCalendarEventCreate,
    current_user: User = Depends(get_current_user)
):
    """Create an event in user's Google Calendar"""
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
        
        event = service.events().insert(
            calendarId='primary',
            body=event_body
        ).execute()
        
        return {
            "message": "Evento criado com sucesso no Google Calendar",
            "event_id": event.get('id'),
            "html_link": event.get('htmlLink')
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

@api_router.get("/")
async def root():
    return {"message": "INDÚSTRIA VISUAL API", "status": "online"}

# Include router
app.include_router(api_router)

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()