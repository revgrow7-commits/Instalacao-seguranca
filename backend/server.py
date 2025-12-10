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
    status: str = "pending"  # pending, in_progress, completed
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
    """Fetch jobs from Holdprint API"""
    api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
    
    if not api_key:
        raise HTTPException(status_code=500, detail=f"API key not configured for branch {branch}")
    
    headers = {"x-api-key": api_key}
    
    try:
        response = requests.get(HOLDPRINT_API_URL, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # Holdprint returns {data: [...]} format
        if isinstance(data, dict) and 'data' in data:
            return data['data']
        elif isinstance(data, list):
            return data
        else:
            return []
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
        client_name=holdprint_job.get('client', {}).get('name', 'Cliente não informado'),
        client_address=holdprint_job.get('client', {}).get('address', ''),
        branch=job_data.branch,
        items=holdprint_job.get('items', []),
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