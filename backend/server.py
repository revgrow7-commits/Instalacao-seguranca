from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
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
    
    # Busca por correspondência nas palavras-chave
    for family_name, keywords in PRODUCT_FAMILY_MAPPING.items():
        for keyword in keywords:
            if keyword.lower() in product_lower:
                # Calcula score baseado no tamanho do match
                score = len(keyword) / len(product_name) * 100
                return (family_name, min(score * 2, 100))  # Score de 0-100
    
    return ("Outros", 10)  # Família genérica com baixa confiança

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
    area_m2: Optional[float] = None
    branch: str  # POA or SP
    assigned_installers: List[str] = []  # List of installer IDs
    scheduled_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    items: List[dict] = []  # Job items from Holdprint
    holdprint_data: dict = {}  # Raw data from Holdprint

class JobCreate(BaseModel):
    holdprint_job_id: str
    branch: str

class JobAssign(BaseModel):
    installer_ids: List[str]

class JobSchedule(BaseModel):
    scheduled_date: datetime
    installer_ids: Optional[List[str]] = None

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
    status: str = "in_progress"  # in_progress, completed

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

def compress_image_to_base64(image_data: bytes, max_size_kb: int = 500) -> str:
    """Compress image and return base64 string"""
    img = Image.open(BytesIO(image_data))
    
    # Convert to RGB if necessary
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Start with quality 85
    quality = 85
    output = BytesIO()
    
    while quality > 20:
        output = BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        size_kb = len(output.getvalue()) / 1024
        
        if size_kb <= max_size_kb:
            break
        quality -= 10
    
    return base64.b64encode(output.getvalue()).decode('utf-8')

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
    
    # Create job
    job = Job(
        holdprint_job_id=job_data.holdprint_job_id,
        title=holdprint_job.get('title', 'Sem título'),
        client_name=holdprint_job.get('customerName', 'Cliente não informado'),
        client_address='',
        branch=job_data.branch,
        items=holdprint_job.get('production', {}).get('items', []),
        holdprint_data=holdprint_job
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
    
    # Create checkin with Base64 photo and GPS
    checkin_id = str(uuid.uuid4())
    checkin = CheckIn(
        id=checkin_id,
        job_id=job_id,
        installer_id=installer['id'],
        checkin_photo=photo_base64,
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
    notes: str = Form(""),
    current_user: User = Depends(get_current_user)
):
    """Check out from a job with photo in Base64 and GPS coordinates"""
    checkin_doc = await db.checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin_doc:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    if checkin_doc['status'] == "completed":
        raise HTTPException(status_code=400, detail="Already checked out")
    
    # Calculate duration
    checkout_at = datetime.now(timezone.utc)
    checkin_at = datetime.fromisoformat(checkin_doc['checkin_at']) if isinstance(checkin_doc['checkin_at'], str) else checkin_doc['checkin_at']
    duration_minutes = int((checkout_at - checkin_at).total_seconds() / 60)
    
    # Update checkin with Base64 photo and GPS
    update_data = {
        "checkout_at": checkout_at.isoformat(),
        "checkout_photo": photo_base64,
        "checkout_gps_lat": gps_lat,
        "checkout_gps_long": gps_long,
        "checkout_gps_accuracy": gps_accuracy,
        "installed_m2": installed_m2,
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
    
    if isinstance(result['checkin_at'], str):
        result['checkin_at'] = datetime.fromisoformat(result['checkin_at'])
    if result.get('checkout_at') and isinstance(result['checkout_at'], str):
        result['checkout_at'] = datetime.fromisoformat(result['checkout_at'])
    
    return CheckIn(**result)

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
    
    products = await db.products_installed.find(query, {"_id": 0}).to_list(1000)
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
    
    await db.products_installed.insert_one(new_product.model_dump())
    
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
    products = await db.products_installed.find({}, {"_id": 0}).to_list(10000)
    
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