"""
Jobs routes - Migrated from server.py
Handles all job-related endpoints including Holdprint integration, 
scheduling, assignments, and justifications.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, ConfigDict
import logging
import uuid
import asyncio
import requests
from calendar import monthrange

import resend

from database import db
from security import get_current_user, require_role
from models.user import User, UserRole
from config import (
    HOLDPRINT_API_KEY_POA, HOLDPRINT_API_KEY_SP, HOLDPRINT_API_URL,
    SENDER_EMAIL
)
from services.holdprint import extract_product_dimensions

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ MODELS ============

class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    holdprint_job_id: str
    title: str
    client_name: str
    client_address: Optional[str] = None
    status: str = "aguardando"
    area_m2: Optional[float] = None
    branch: str
    assigned_installers: List[str] = []
    scheduled_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    items: List[dict] = []
    holdprint_data: dict = {}
    products_with_area: List[dict] = []
    total_products: int = 0
    total_quantity: int = 0
    item_assignments: List[dict] = []


class JobCreate(BaseModel):
    holdprint_job_id: str
    branch: str


class JobAssign(BaseModel):
    installer_ids: List[str]


class JobSchedule(BaseModel):
    scheduled_date: datetime
    installer_ids: Optional[List[str]] = None


class ItemAssignment(BaseModel):
    item_indices: List[int]
    installer_ids: List[str]
    difficulty_level: Optional[int] = None
    scenario_category: Optional[str] = None
    apply_to_all: bool = True


class BatchImportRequest(BaseModel):
    branch: str


class SyncResult(BaseModel):
    branch: str
    month: int
    year: int
    imported: int
    skipped: int
    total: int
    errors: List[str] = []


class JobJustificationRequest(BaseModel):
    reason: str
    type: str
    job_title: str
    job_code: str


# Emails to notify when job is justified
NOTIFICATION_EMAILS = ["bruno@industriavisual.com.br", "marcelo@industriavisual.com.br"]


# ============ HELPER FUNCTIONS ============

def classify_product_family(product_name: str) -> str:
    """Classify a product into a family based on name"""
    if not product_name:
        return "Outros"
    
    name_lower = product_name.lower()
    
    mappings = [
        (["adesivo", "vinil"], "Adesivos"),
        (["lona", "banner", "faixa"], "Lonas e Banners"),
        (["chapa", "placa", "acm", "acrílico"], "Chapas e Placas"),
        (["totem"], "Totens"),
        (["letra caixa"], "Letras Caixa"),
        (["tecido", "bandeira"], "Tecidos"),
        (["envelopamento"], "Envelopamento"),
        (["painel", "backlight"], "Painéis Luminosos"),
        (["serviço", "instalação", "entrega"], "Serviços"),
    ]
    
    for keywords, family in mappings:
        for keyword in keywords:
            if keyword in name_lower:
                return family
    
    return "Outros"


def calculate_job_products_area(holdprint_data: dict) -> tuple:
    """Calculate area for all products in a job."""
    products = holdprint_data.get("products", [])
    products_with_area = []
    total_area_m2 = 0
    total_quantity = 0
    
    for product in products:
        product_info = extract_product_dimensions(product)
        quantity = product.get('quantity', 1)
        unit_area = product_info.get('area_m2', 0)
        total_area = unit_area * quantity
        
        product_with_area = {
            "name": product.get('name', ''),
            "family_name": classify_product_family(product.get('name', '')),
            "quantity": quantity,
            "width_m": product_info.get('width_m'),
            "height_m": product_info.get('height_m'),
            "copies": product_info.get('copies', 1),
            "unit_area_m2": unit_area,
            "total_area_m2": total_area
        }
        products_with_area.append(product_with_area)
        total_area_m2 += total_area
        total_quantity += quantity
    
    return (products_with_area, round(total_area_m2, 2), len(products), total_quantity)


async def fetch_holdprint_jobs(branch: str, month: int = None, year: int = None, include_finalized: bool = False):
    """Fetch jobs from Holdprint API"""
    api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
    
    if not api_key:
        raise HTTPException(status_code=500, detail=f"Chave de API não configurada para a filial {branch}")
    
    headers = {"x-api-key": api_key}
    
    now = datetime.now(timezone.utc)
    target_month = month if month else now.month
    target_year = year if year else now.year
    
    last_day = monthrange(target_year, target_month)[1]
    start_date_str = f"{target_year}-{target_month:02d}-01"
    end_date_str = f"{target_year}-{target_month:02d}-{last_day:02d}"
    
    params = {
        "page": 1,
        "pageSize": 200,
        "startDate": start_date_str,
        "endDate": end_date_str,
        "language": "pt-BR"
    }
    
    try:
        response = requests.get(HOLDPRINT_API_URL, headers=headers, params=params, timeout=60)
        
        if response.status_code == 401:
            logger.error(f"Holdprint {branch}: Autenticação falhou - chave de API inválida")
            raise HTTPException(status_code=401, detail=f"Chave de API inválida para a filial {branch}. Verifique a configuração.")
        
        response.raise_for_status()
        data = response.json()
        
        jobs = []
        if isinstance(data, dict) and 'data' in data:
            jobs = data['data']
        elif isinstance(data, list):
            jobs = data
        
        if not include_finalized:
            filtered_jobs = [job for job in jobs if not job.get('isFinalized', False)]
        else:
            filtered_jobs = jobs
        
        logger.info(f"Holdprint {branch}: {len(jobs)} jobs encontrados, {len(filtered_jobs)} {'total' if include_finalized else 'não finalizados'}")
        
        return filtered_jobs
    except requests.RequestException as e:
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg:
            logger.error(f"Holdprint {branch}: Chave de API inválida")
            raise HTTPException(status_code=401, detail=f"Chave de API inválida para a filial {branch}")
        logger.error(f"Error fetching from Holdprint: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Erro ao conectar com Holdprint: {error_msg}")


# ============ HOLDPRINT ROUTES ============

@router.get("/holdprint/jobs/{branch}")
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


# ============ JOB CRUD ROUTES ============

@router.post("/jobs", response_model=Job)
async def create_job(job_data: JobCreate, current_user: User = Depends(get_current_user)):
    """Import job from Holdprint to local database"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    existing = await db.jobs.find_one({"holdprint_job_id": job_data.holdprint_job_id})
    if existing:
        raise HTTPException(status_code=400, detail="Job already imported")
    
    holdprint_jobs = await fetch_holdprint_jobs(job_data.branch)
    holdprint_job = next((j for j in holdprint_jobs if str(j.get('id')) == job_data.holdprint_job_id), None)
    
    if not holdprint_job:
        raise HTTPException(status_code=404, detail="Job not found in Holdprint")
    
    products_with_area, total_area_m2, total_products, total_quantity = calculate_job_products_area(holdprint_job)
    
    job = Job(
        holdprint_job_id=job_data.holdprint_job_id,
        title=holdprint_job.get('title', 'Sem título'),
        client_name=holdprint_job.get('customerName', 'Cliente não informado'),
        client_address='',
        branch=job_data.branch,
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
    return job


@router.get("/jobs", response_model=List[Job])
async def list_jobs(current_user: User = Depends(get_current_user)):
    """List jobs based on user role"""
    query = {}
    
    if current_user.role == UserRole.INSTALLER:
        installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            query["assigned_installers"] = installer['id']
        else:
            return []
    
    jobs = await db.jobs.find(query, {"_id": 0}).to_list(1000)
    
    active_checkins = await db.item_checkins.find(
        {"status": "in_progress"},
        {"_id": 0, "job_id": 1, "checkin_at": 1}
    ).to_list(1000)
    
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
        
        job_id = job.get('id')
        if job_id in job_start_times:
            job['started_at'] = job_start_times[job_id].isoformat()
            job['last_checkin_at'] = job_start_times[job_id].isoformat()
    
    return jobs


@router.get("/jobs/team-calendar")
async def get_team_calendar_jobs(current_user: User = Depends(get_current_user)):
    """Get all scheduled jobs for the team calendar view."""
    jobs = await db.jobs.find(
        {"scheduled_date": {"$exists": True, "$ne": None}}, 
        {"_id": 0}
    ).to_list(500)
    
    cleaned_jobs = []
    for job in jobs:
        if isinstance(job.get('created_at'), str):
            pass
        elif job.get('created_at'):
            job['created_at'] = job['created_at'].isoformat() if hasattr(job['created_at'], 'isoformat') else str(job['created_at'])
        
        if isinstance(job.get('scheduled_date'), str):
            pass
        elif job.get('scheduled_date'):
            job['scheduled_date'] = job['scheduled_date'].isoformat() if hasattr(job['scheduled_date'], 'isoformat') else str(job['scheduled_date'])
        
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


@router.get("/jobs/sync-status")
async def get_sync_status(current_user: User = Depends(get_current_user)):
    """Check last Holdprint sync status"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    last_sync = await db.system_config.find_one({"key": "last_holdprint_sync"}, {"_id": 0})
    
    if not last_sync:
        return {"last_sync": None, "message": "Nenhuma sincronização realizada ainda"}
    
    return {
        "last_sync": last_sync.get("value"),
        "total_imported": last_sync.get("total_imported", 0),
        "total_skipped": last_sync.get("total_skipped", 0)
    }


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific job by ID"""
    job_doc = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Auto-populate products_with_area if empty
    if not job_doc.get('products_with_area') or len(job_doc.get('products_with_area', [])) == 0:
        products_with_area = []
        total_area_m2 = 0.0
        
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
    
    # Check installer access
    if current_user.role == UserRole.INSTALLER:
        installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            installer_id = installer['id']
            job_assigned_installers = job_doc.get('assigned_installers') or []
            item_assignments = job_doc.get('item_assignments') or []
            
            has_access = installer_id in job_assigned_installers
            
            if not has_access:
                for assignment in item_assignments:
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


@router.put("/jobs/{job_id}/assign", response_model=Job)
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


@router.put("/jobs/{job_id}/schedule", response_model=Job)
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


@router.put("/jobs/{job_id}", response_model=Job)
async def update_job(job_id: str, job_update: dict, current_user: User = Depends(get_current_user)):
    """Update job details"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    update_data = {}
    allowed_fields = [
        "status", "scheduled_date", "assigned_installers", "client_name",
        "client_address", "title", "area_m2", "no_installation", "notes",
        "cancelled_at", "exclude_from_metrics", "item_assignments"
    ]
    
    for field in allowed_fields:
        if field in job_update:
            if field == "scheduled_date" and isinstance(job_update[field], str):
                update_data[field] = job_update[field]
            elif field == "scheduled_date":
                update_data[field] = job_update[field].isoformat()
            else:
                update_data[field] = job_update[field]
    
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


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Delete a job and all related data"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    await db.checkins.delete_many({"job_id": job_id})
    await db.item_checkins.delete_many({"job_id": job_id})
    await db.installed_products.delete_many({"job_id": job_id})
    await db.jobs.delete_one({"id": job_id})
    
    return {"message": "Job and all related data deleted successfully"}


# ============ ITEM ASSIGNMENT ROUTES ============

@router.post("/jobs/{job_id}/assign-items")
async def assign_items_to_installers(job_id: str, assignment: ItemAssignment, current_user: User = Depends(get_current_user)):
    """Assign specific items to installers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    installers = await db.installers.find({"id": {"$in": assignment.installer_ids}}, {"_id": 0}).to_list(100)
    installer_map = {i["id"]: i for i in installers}
    
    if len(installers) != len(assignment.installer_ids):
        raise HTTPException(status_code=400, detail="One or more installers not found")
    
    products = job.get("products_with_area", [])
    if not products:
        products = job.get("holdprint_data", {}).get("products", [])
    
    for idx in assignment.item_indices:
        if idx < 0 or idx >= len(products):
            raise HTTPException(status_code=400, detail=f"Invalid item index: {idx}")
    
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
            
            current_assignments = [a for a in current_assignments 
                                  if not (a.get("item_index") == item_idx and a.get("installer_id") == installer_id)]
            
            m2_per_installer = round(item_area / len(assignment.installer_ids), 2) if item_area and item_area > 0 else 0
            
            new_assignment = {
                "item_index": item_idx,
                "item_name": product.get("name", f"Item {item_idx}") if product else f"Item {item_idx}",
                "installer_id": installer_id,
                "installer_name": installer.get("full_name", ""),
                "assigned_at": now,
                "item_area_m2": item_area,
                "assigned_m2": m2_per_installer,
                "status": "pending",
                "manager_difficulty_level": assignment.difficulty_level,
                "manager_scenario_category": assignment.scenario_category,
                "assigned_by": current_user.id
            }
            new_assignments.append(new_assignment)
            total_m2_assigned += m2_per_installer
    
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
    
    all_assignments = current_assignments + new_assignments
    all_installer_ids = list(set([a["installer_id"] for a in all_assignments]))
    
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


@router.get("/jobs/{job_id}/assignments")
async def get_job_assignments(job_id: str, current_user: User = Depends(get_current_user)):
    """Get job assignments grouped by installer and item"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTALLER])
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    assignments = job.get("item_assignments", [])
    products = job.get("products_with_area", []) or job.get("holdprint_data", {}).get("products", [])
    
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


@router.put("/jobs/{job_id}/assignments/{item_index}/status")
async def update_assignment_status(job_id: str, item_index: int, status_update: dict, current_user: User = Depends(get_current_user)):
    """Update assignment status"""
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


# ============ IMPORT ROUTES ============

@router.post("/jobs/import-all")
async def import_all_jobs(request: BatchImportRequest, current_user: User = Depends(get_current_user)):
    """Import all jobs from Holdprint in batch"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    holdprint_jobs = await fetch_holdprint_jobs(request.branch)
    
    imported = 0
    skipped = 0
    errors = []
    
    for holdprint_job in holdprint_jobs:
        holdprint_job_id = str(holdprint_job.get('id', ''))
        
        existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
        if existing:
            skipped += 1
            continue
        
        try:
            products = holdprint_job.get('production', {}).get('products', [])
            products_with_area = []
            total_area_m2 = 0.0
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
                total_products=len(products),
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
        "errors": errors[:5] if errors else []
    }


@router.post("/jobs/import-current-month")
async def import_current_month_jobs(current_user: User = Depends(get_current_user)):
    """Import all jobs from current month for both branches"""
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
            holdprint_jobs = await fetch_holdprint_jobs(branch, current_month, current_year)
            
            imported = 0
            skipped = 0
            errors = []
            
            for holdprint_job in holdprint_jobs:
                holdprint_job_id = str(holdprint_job.get('id', ''))
                
                existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                if existing:
                    skipped += 1
                    continue
                
                try:
                    products = holdprint_job.get('production', {}).get('products', [])
                    products_with_area = []
                    total_area_m2 = 0.0
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
                        total_products=len(products),
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


@router.post("/jobs/sync-holdprint")
async def sync_holdprint_jobs(
    months_back: int = Query(2, ge=1, le=12, description="Quantos meses para trás buscar"),
    current_user: User = Depends(get_current_user)
):
    """Sync jobs from Holdprint for multiple months"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    results = []
    total_imported = 0
    total_skipped = 0
    total_errors = []
    
    now = datetime.now(timezone.utc)
    months_to_sync = []
    
    for i in range(months_back + 1):
        target_date = now - timedelta(days=i * 30)
        month_year = (target_date.month, target_date.year)
        if month_year not in months_to_sync:
            months_to_sync.append(month_year)
    
    for branch in ["POA", "SP"]:
        for month, year in months_to_sync:
            try:
                holdprint_jobs = await fetch_holdprint_jobs(branch, month, year)
                
                imported = 0
                skipped = 0
                errors = []
                
                for holdprint_job in holdprint_jobs:
                    holdprint_job_id = str(holdprint_job.get('id', ''))
                    
                    existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                    if existing:
                        skipped += 1
                        continue
                    
                    try:
                        products = holdprint_job.get('production', {}).get('products', [])
                        products_with_area = []
                        total_area_m2 = 0.0
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
                            total_products=len(products),
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


# ============ JOB JUSTIFICATION ROUTES ============

@router.post("/jobs/{job_id}/justify")
async def submit_job_justification(
    job_id: str,
    justification: JobJustificationRequest,
    current_user: User = Depends(get_current_user)
):
    """Submit justification for a job that wasn't completed"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    type_labels = {
        "no_checkin": "Check-in não realizado",
        "no_checkout": "Check-out não realizado",
        "cancelled": "Job cancelado pelo cliente",
        "rescheduled": "Job reagendado",
        "other": "Outro motivo"
    }
    type_label = type_labels.get(justification.type, justification.type)
    
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
    
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "status": "justificado",
            "justification": justification_record,
            "justified_at": datetime.now(timezone.utc).isoformat(),
            "exclude_from_metrics": True
        }}
    )
    
    # Send email notification
    try:
        scheduled_date = job.get("scheduled_date", "")
        if scheduled_date:
            try:
                dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
                scheduled_date = dt.strftime("%d/%m/%Y às %H:%M")
            except (ValueError, TypeError):
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
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2 style="margin: 0;">Job Justificado</h2>
                </div>
                <div class="content">
                    <div class="highlight">
                        <strong>Motivo:</strong> {justification.reason}
                    </div>
                    <p><strong>Código:</strong> #{justification.job_code}</p>
                    <p><strong>Título:</strong> {justification.job_title}</p>
                    <p><strong>Tipo:</strong> {type_label}</p>
                    <p><strong>Data:</strong> {scheduled_date or 'N/A'}</p>
                    <p><strong>Por:</strong> {current_user.name}</p>
                </div>
                <div class="footer">
                    <p>Sistema Indústria Visual</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": SENDER_EMAIL,
            "to": NOTIFICATION_EMAILS,
            "subject": f"Job Justificado: #{justification.job_code} - {justification.job_title}",
            "html": html_content
        }
        
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Justification email sent for job {job_id}")
        
    except Exception as e:
        logger.error(f"Failed to send justification email: {str(e)}")
    
    return {
        "message": "Justificativa registrada com sucesso",
        "justification_id": justification_record["id"],
        "emails_sent_to": NOTIFICATION_EMAILS
    }


@router.get("/job-justifications")
async def get_job_justifications(current_user: User = Depends(get_current_user)):
    """Get all job justifications"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    justifications = await db.job_justifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return justifications
