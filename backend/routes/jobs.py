"""
Jobs routes - Migrated from server.py
Handles all job-related endpoints including Holdprint integration, 
scheduling, assignments, and justifications.
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, Query, Body
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, ConfigDict
import logging
import time
import uuid
import asyncio
import httpx
import requests
from calendar import monthrange

import resend

from db_supabase import db, get_client
from security import get_current_user, require_role
from models.user import User, UserRole
from config import (
    HOLDPRINT_API_KEY_POA, HOLDPRINT_API_KEY_SP, HOLDPRINT_API_URL,
    SENDER_EMAIL, RESEND_API_KEY, NOTIFICATION_EMAILS
)

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
from services.holdprint import extract_product_dimensions

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ MODELS ============

class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    holdprint_job_id: Optional[str] = None
    title: str
    client_name: Optional[str] = None
    client_address: Optional[str] = None
    status: str = "aguardando"
    area_m2: Optional[float] = None
    branch: Optional[str] = None
    assigned_installers: List[str] = []
    scheduled_date: Optional[datetime] = None
    scheduled_time_end: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[str] = None
    items: List[dict] = []
    holdprint_data: dict = {}
    products_with_area: List[dict] = []
    total_products: int = 0
    total_quantity: float = 0
    item_assignments: List[dict] = []
    archived_items: List[dict] = []


class JobCreate(BaseModel):
    holdprint_job_id: str
    branch: str


class JobAssign(BaseModel):
    installer_ids: List[str]


class JobSchedule(BaseModel):
    scheduled_date: datetime
    scheduled_time_end: Optional[datetime] = None
    installer_ids: Optional[List[str]] = None
    status: Optional[str] = None
    reschedule_note: Optional[str] = None


class ItemAssignment(BaseModel):
    item_indices: List[int]
    installer_ids: List[str]
    difficulty_level: Optional[str] = None
    scenario_category: Optional[str] = None
    apply_to_all: bool = True
    remocao_prevista: bool = False
    ferramentas: Optional[List[str]] = None


class BatchImportRequest(BaseModel):
    branch: str
    month: Optional[int] = None
    year: Optional[int] = None


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


# Emails de notificação de job justificado: ver NOTIFICATION_EMAILS em config.py
# (carregado da env var NOTIFICATION_EMAILS, CSV).


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


async def fetch_holdprint_jobs(
    branch: str,
    month: int = None,
    year: int = None,
    include_finalized: bool = True,
    start_date: str = None,
    end_date: str = None,
    max_pages: int = 50,
    page_timeout_s: float = 15.0,
):
    """Fetch jobs from Holdprint API with pagination. Async/non-blocking via httpx."""
    import calendar
    api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP

    if not api_key:
        raise HTTPException(status_code=500, detail=f"Chave de API não configurada para a filial {branch}")

    headers = {
        "x-api-key": api_key,
        "Accept": "application/json",
    }

    if not start_date or not end_date:
        now = datetime.now(timezone.utc)
        month = month or now.month
        year = year or now.year
        last_day = calendar.monthrange(year, month)[1]
        start_date = f"{year}-{month:02d}-01"
        end_date = f"{year}-{month:02d}-{last_day:02d}"

    api_url = HOLDPRINT_API_URL
    all_jobs = []

    try:
        async with httpx.AsyncClient(timeout=page_timeout_s) as client:
            for page in range(1, max_pages + 1):
                params = {
                    "page": page,
                    "pageSize": 100,
                    "startDate": start_date,
                    "endDate": end_date,
                    "language": "pt-BR",
                }
                response = await client.get(api_url, params=params, headers=headers)

                if response.status_code == 401:
                    raise HTTPException(status_code=401, detail=f"Chave de API inválida para {branch}")

                response.raise_for_status()
                data = response.json()

                jobs = data.get('data', []) if isinstance(data, dict) else data
                has_next = data.get('hasNextPage', False) if isinstance(data, dict) else False

                if not jobs:
                    break

                all_jobs.extend(jobs)

                if not has_next:
                    break

        if not include_finalized:
            all_jobs = [j for j in all_jobs if not j.get('isFinalized', False)]

        logger.info(f"Holdprint {branch}: {len(all_jobs)} jobs encontrados (pages<= {max_pages})")
        return all_jobs

    except httpx.HTTPError as e:
        logger.error(f"Erro Holdprint {branch}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao conectar com Holdprint: {e}")


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
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    existing = db.jobs.find_one({"holdprint_job_id": job_data.holdprint_job_id})
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
    
    db.jobs.insert_one(job_dict)
    return job


# P2 (escalabilidade): teto de segurança quando o cliente NÃO pagina.
# Protege o serverless de carregar a tabela inteira; o frontend deve migrar
# gradualmente para `?page=&page_size=`.
MAX_UNPAGINATED_JOBS = 1000


@router.get("/jobs", response_model=List[Job])
async def list_jobs(
    current_user: User = Depends(get_current_user),
    include_archived: bool = Query(False),
    page: Optional[int] = Query(None, ge=1, description="Página (1+). Se omitido, comportamento legado com teto de segurança."),
    page_size: int = Query(50, ge=1, le=200, description="Itens por página (1-200). Usado apenas quando `page` é informado."),
):
    """List jobs based on user role - optimized. By default excludes archived jobs.

    Paginação opt-in (P2): com `?page=N`, retorna a página N ordenada por
    created_at desc. Sem `page`, mantém o comportamento legado, porém limitado
    a MAX_UNPAGINATED_JOBS registros mais recentes (teto de segurança).
    """
    query = {}

    # Jobs soft-deletados nunca aparecem na listagem (mesmo com include_archived).
    query["deleted"] = {"$ne": True}

    if not include_archived:
        query["archived"] = False

    # Projeção enxuta para listagem — campos pesados excluídos para reduzir payload
    # holdprint_data incluído apenas para extrair o code; trimado após a busca
    projection = {
        "_id": 0,
        "id": 1, "title": 1, "status": 1, "branch": 1, "client_name": 1,
        "scheduled_date": 1, "created_at": 1, "assigned_installers": 1,
        "archived": 1, "holdprint_job_id": 1, "area_m2": 1,
        "total_products": 1, "total_quantity": 1, "completed_at": 1,
        "holdprint_data": 1,
    }
    
    if current_user.role == UserRole.INSTALLER:
        installer = db.installers.find_one({"user_id": current_user.id}, {"_id": 0, "id": 1})
        if not installer:
            logger.warning(
                "list_jobs: row em installers ausente para user_id=%s email=%s",
                current_user.id, current_user.email,
            )
        ids = [current_user.id] + ([installer["id"]] if installer else [])

        from db_supabase import _deserialize
        cols = [k for k in projection if k != "_id"]
        builder = get_client().table("jobs").select(",".join(cols))

        builder = builder.neq("deleted", True)  # soft-deletados nunca aparecem

        if not include_archived:
            builder = builder.neq("archived", True)  # cobre NULL e false

        # OR entre os ids do instalador (PostgREST cs. = array contains)
        id_or = ",".join(f'assigned_installers.cs.["{i}"]' for i in ids)
        builder = builder.or_(id_or)

        # P2: paginação opt-in (range é inclusivo no PostgREST)
        if page:
            builder = builder.order("created_at", desc=True).range(
                (page - 1) * page_size, page * page_size - 1
            )

        result = builder.execute()
        jobs = [_deserialize(d) for d in (result.data or [])]
    else:
        # Busca otimizada com projeção. P2: paginação opt-in com ordenação
        # determinística; sem `page`, teto de segurança (registros mais recentes).
        if page:
            jobs = db.jobs.find(
                query, projection,
                sort=[("created_at", -1)],
                limit=page_size,
                skip=(page - 1) * page_size,
            )
        else:
            jobs = db.jobs.find(
                query, projection,
                sort=[("created_at", -1)],
                limit=MAX_UNPAGINATED_JOBS,
            )
            if len(jobs) == MAX_UNPAGINATED_JOBS:
                logger.warning(
                    "list_jobs: teto de %s jobs sem paginação atingido — "
                    "frontend deve adotar ?page=&page_size=", MAX_UNPAGINATED_JOBS
                )
    
    if not jobs:
        return []
    
    # Busca todos os checkins in_progress sem filtrar por job_id (evita URL longa com $in)
    job_ids = set(j.get('id') for j in jobs if j.get('id'))
    all_active_checkins = db.item_checkins.find(
        {"status": "in_progress"},
        {"_id": 0, "job_id": 1, "checkin_at": 1}
    )
    active_checkins = [c for c in all_active_checkins if c.get("job_id") in job_ids]
    
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
        if isinstance(job.get('created_at'), str):
            job['created_at'] = datetime.fromisoformat(job['created_at'])
        if job.get('scheduled_date') and isinstance(job['scheduled_date'], str):
            job['scheduled_date'] = datetime.fromisoformat(job['scheduled_date'])

        # Trim holdprint_data — listagem precisa do code, customerName (cliente exibido no
        # card), deliveryNeeded (previsão de entrega Hold, prioridade no sort) e creationTime
        # (fallback de data quando scheduled_date e deliveryNeeded ausentes). Demais campos
        # (description HTML pesada, production, products) ficam de fora.
        hd = job.get('holdprint_data')
        if isinstance(hd, dict):
            job['holdprint_data'] = {
                'code': hd.get('code', ''),
                'customerName': hd.get('customerName', ''),
                'deliveryNeeded': hd.get('deliveryNeeded'),
                'deliveryExpected': hd.get('deliveryExpected'),
                'creationTime': hd.get('creationTime'),
            }
        else:
            job['holdprint_data'] = {}

        job_id = job.get('id')
        if job_id in job_start_times:
            job['started_at'] = job_start_times[job_id].isoformat()
            job['last_checkin_at'] = job_start_times[job_id].isoformat()

    return jobs


@router.get("/jobs/team-calendar")
async def get_team_calendar_jobs(
    mine: bool = Query(False, description="Retorna apenas jobs atribuídos ao instalador logado"),
    branch: Optional[str] = Query(None, description="Filtra por filial"),
    installer_id: Optional[str] = Query(None, description="Filtra por instalador"),
    current_user: User = Depends(get_current_user)
):
    """Get scheduled jobs for the team calendar view, including visitas técnicas."""
    query = {"scheduled_date": {"$exists": True, "$ne": None}}
    if mine and current_user.role == UserRole.INSTALLER:
        installer = db.installers.find_one({"user_id": current_user.id}, {"_id": 0, "id": 1})
        if installer:
            query["assigned_installers"] = installer["id"]
        else:
            query["$or"] = [{"assigned_installers": current_user.id}, {"assigned_user_id": current_user.id}]

    # Apply optional filters for jobs
    if branch:
        query["branch"] = branch
    if installer_id:
        query.setdefault("assigned_installers", installer_id)

    jobs = db.jobs.find(query, {"_id": 0})

    def _iso(val):
        """Ensure a date/datetime value is returned as an ISO string."""
        if val is None:
            return None
        if isinstance(val, str):
            return val
        return val.isoformat() if hasattr(val, 'isoformat') else str(val)

    cleaned_jobs = []
    for job in jobs:
        hd = job.get("holdprint_data") or {}
        clean_job = {
            "id": job.get("id"),
            "title": job.get("title"),
            "status": job.get("status"),
            "branch": job.get("branch"),
            "scheduled_date": _iso(job.get("scheduled_date")),
            "scheduled_time_end": _iso(job.get("scheduled_time_end")),
            "created_at": _iso(job.get("created_at")),
            "assigned_installers": job.get("assigned_installers", []),
            "holdprint_data": {
                "code": hd.get("code", ""),
                "customerName": hd.get("customerName", ""),
                "deliveryNeeded": hd.get("deliveryNeeded"),
                "creationTime": hd.get("creationTime"),
            },
            "client_name": job.get("client_name"),
            "kind": "job",
        }
        cleaned_jobs.append(clean_job)

    # ---- Visitas Técnicas ----
    vt_query = {
        "scheduled_date": {"$ne": None},
        "status": {"$nin": ["CANCELADA"]},
    }
    if branch:
        vt_query["branch"] = branch
    if installer_id:
        vt_query["installer_id"] = installer_id
    if mine and current_user.role == UserRole.INSTALLER:
        vt_query["installer_id"] = current_user.id

    visitas = db.visitas_tecnicas.find(vt_query, {"_id": 0}) or []
    for v in visitas:
        numero_vt = v.get("numero_vt") or ""
        clean_vt = {
            "id": v.get("id"),
            "title": f"VISITA TÉCNICA — {numero_vt}" if numero_vt else "VISITA TÉCNICA",
            "status": v.get("status"),
            "branch": v.get("branch"),
            "scheduled_date": _iso(v.get("scheduled_date")),
            "scheduled_time_end": _iso(v.get("scheduled_time_end")),
            "created_at": _iso(v.get("created_at")),
            "assigned_installers": [v["installer_id"]] if v.get("installer_id") else [],
            "holdprint_data": None,
            "client_name": v.get("client_name", ""),
            "installer_id": v.get("installer_id"),
            "numero_vt": numero_vt,
            "kind": "visita_tecnica",
        }
        cleaned_jobs.append(clean_vt)

    return cleaned_jobs


def _build_job_doc(holdprint_job: dict, branch: str) -> dict:
    """Build a job document from a Holdprint job. Single source of truth for all import endpoints."""
    # Top-level 'products' has description with dimensions; 'production.products' is always empty
    products = holdprint_job.get('products', [])
    products_with_area = []
    total_area_m2 = 0.0
    total_quantity = 0

    for product in products:
        product_info = extract_product_dimensions(product)
        pw = {
            "name": product.get('name', ''),
            "quantity": product.get('quantity', 1),
            "copies": product_info.get('copies', 1),
            "width_m": product_info.get('width_m', 0),
            "height_m": product_info.get('height_m', 0),
            "unit_area_m2": product_info.get('area_m2', 0),
            "total_area_m2": product_info.get('area_m2', 0) * product.get('quantity', 1),
        }
        products_with_area.append(pw)
        total_area_m2 += pw['total_area_m2']
        total_quantity += product.get('quantity', 1)

    job = Job(
        holdprint_job_id=str(holdprint_job.get('id', '')),
        title=holdprint_job.get('title', 'Sem título'),
        client_name=holdprint_job.get('customerName', 'Cliente não informado'),
        client_address='',
        branch=branch,
        items=holdprint_job.get('production', {}).get('items', []),
        holdprint_data=holdprint_job,
        area_m2=round(total_area_m2, 4),
        products_with_area=products_with_area,
        total_products=len(products),
        total_quantity=total_quantity,
    )
    d = job.model_dump()
    d['created_at'] = d['created_at'].isoformat()
    if d.get('scheduled_date'):
        d['scheduled_date'] = d['scheduled_date'].isoformat()
    return d


def _persist_sync_result(total_imported: int, total_skipped: int, errors: list, sync_type: str = "manual"):
    """Persist sync result to system_config for sync-status endpoint."""
    try:
        status = "success" if not errors else ("partial" if total_imported > 0 else "error")
        db.system_config.update_one(
            {"key": "last_holdprint_sync"},
            {"$set": {
                "key": "last_holdprint_sync",
                "value": datetime.now(timezone.utc).isoformat(),
                "total_imported": total_imported,
                "total_skipped": total_skipped,
                "total_errors": len(errors),
                "status": status,
                "sync_type": sync_type,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"_persist_sync_result failed (non-critical): {e}")


@router.get("/jobs/sync-status")
async def get_sync_status(current_user: User = Depends(get_current_user)):
    """Check last Holdprint sync status"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    last_sync = db.system_config.find_one({"key": "last_holdprint_sync"}, {"_id": 0})

    if not last_sync:
        return {"last_sync": None, "status": None, "message": "Nenhuma sincronização realizada ainda"}

    return {
        "last_sync": last_sync.get("value"),
        "status": last_sync.get("status", "success"),
        "sync_type": last_sync.get("sync_type", "unknown"),
        "total_imported": last_sync.get("total_imported", 0),
        "total_skipped": last_sync.get("total_skipped", 0),
        "total_errors": last_sync.get("total_errors", 0),
    }


@router.get("/jobs/check-inconsistent")
async def check_inconsistent_jobs(current_user: User = Depends(get_current_user)):
    """
    Check for jobs with status 'instalando' but no assigned installers.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Busca jobs com status "instalando" e filtra no Python
    all_installing_jobs = db.jobs.find({
        "status": {"$in": ["instalando", "in_progress"]}
    }, {"_id": 0, "id": 1, "title": 1, "status": 1, "holdprint_data": 1, "assigned_installers": 1})
    
    # Filtra jobs inconsistentes (sem instaladores)
    inconsistent_jobs = [
        job for job in all_installing_jobs 
        if not job.get("assigned_installers") or len(job.get("assigned_installers", [])) == 0
    ]
    
    jobs_list = []
    for job in inconsistent_jobs:
        code = job.get("holdprint_data", {}).get("code", job.get("id", "")[:8])
        jobs_list.append({
            "id": job["id"],
            "code": code,
            "title": job.get("title", "N/A"),
            "status": job.get("status")
        })
    
    return {
        "inconsistent_count": len(jobs_list),
        "jobs": jobs_list
    }


@router.post("/jobs/fix-inconsistent")
async def fix_inconsistent_jobs(current_user: User = Depends(get_current_user)):
    """
    Fix jobs with status 'instalando' but no assigned installers.
    Changes their status back to 'aguardando'.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Busca jobs com status "instalando" e filtra no Python
    all_installing_jobs = db.jobs.find({
        "status": {"$in": ["instalando", "in_progress"]}
    }, {"_id": 0, "id": 1, "title": 1, "holdprint_data": 1, "assigned_installers": 1})
    
    # Filtra jobs inconsistentes (sem instaladores)
    inconsistent_jobs = [
        job for job in all_installing_jobs 
        if not job.get("assigned_installers") or len(job.get("assigned_installers", [])) == 0
    ]
    
    if not inconsistent_jobs:
        return {"message": "Nenhum job inconsistente encontrado", "fixed_count": 0, "jobs": []}
    
    # Atualiza cada job individualmente
    fixed_count = 0
    for job in inconsistent_jobs:
        db.jobs.update_one(
            {"id": job["id"]},
            {"$set": {"status": "aguardando"}}
        )
        fixed_count += 1
    
    fixed_jobs = []
    for job in inconsistent_jobs:
        code = job.get("holdprint_data", {}).get("code", job.get("id", "")[:8])
        fixed_jobs.append({
            "id": job["id"],
            "code": code,
            "title": job.get("title", "N/A")
        })
    
    return {
        "message": f"Corrigidos {fixed_count} jobs inconsistentes",
        "fixed_count": fixed_count,
        "jobs": fixed_jobs
    }


@router.post("/jobs/bulk-unarchive")
async def bulk_unarchive_jobs(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Desarquiva jobs arquivados. Se year+month fornecidos, filtra por archived_at no mês. Admin only."""
    require_role(current_user, [UserRole.ADMIN])

    client = get_client()

    count_builder = client.table("jobs").select("id", count="exact").eq("archived", True)
    update_builder = client.table("jobs").update({
        "archived": False,
        "archived_at": None,
        "archived_by": None,
        "archived_by_name": None,
        "exclude_from_metrics": False,
    }).eq("archived", True)

    if year and month:
        _, last_day = monthrange(year, month)
        date_from = f"{year}-{month:02d}-01"
        date_to = f"{year}-{month:02d}-{last_day:02d}T23:59:59"
        count_builder = count_builder.gte("archived_at", date_from).lte("archived_at", date_to)
        update_builder = update_builder.gte("archived_at", date_from).lte("archived_at", date_to)

    count = (count_builder.execute().count or 0)

    if count == 0:
        period = f"{month:02d}/{year}" if year and month else "todos"
        return {"unarchived_count": 0, "message": f"Nenhum job arquivado encontrado ({period})"}

    update_builder.execute()

    period_label = f"{month:02d}/{year}" if year and month else "todos os arquivados"
    logger.info(f"bulk_unarchive: {count} jobs desarquivados por {current_user.email} (período: {period_label})")
    return {
        "unarchived_count": count,
        "message": f"{count} job(s) desarquivados com sucesso",
    }


@router.post("/jobs/bulk-archive-pre-2026")
async def bulk_archive_pre_2026(current_user: User = Depends(get_current_user)):
    """Archive all non-archived jobs created before 2026-01-01. Admin only."""
    require_role(current_user, [UserRole.ADMIN])

    cutoff = "2026-01-01"
    now = datetime.now(timezone.utc).isoformat()
    archived_by_name = getattr(current_user, "name", None) or current_user.email

    client = get_client()

    # Count first (exact=True for header-based count)
    count_res = (
        client.table("jobs")
        .select("id", count="exact")
        .lt("created_at", cutoff)
        .or_("archived.is.null,archived.eq.false")
        .execute()
    )
    count = count_res.count or 0

    if count == 0:
        return {"archived_count": 0, "message": "Nenhum job anterior a 2026 encontrado para arquivar"}

    # Batch update via Supabase client (single SQL round-trip)
    client.table("jobs").update({
        "archived": True,
        "archived_at": now,
        "archived_by": current_user.id,
        "archived_by_name": archived_by_name,
        "exclude_from_metrics": True,
    }).lt("created_at", cutoff).or_("archived.is.null,archived.eq.false").execute()

    logger.info(f"bulk_archive_pre_2026: {count} jobs arquivados por {current_user.email}")
    return {
        "archived_count": count,
        "message": f"{count} job(s) anteriores a 2026 arquivados com sucesso",
    }


@router.get("/jobs/search")
async def search_jobs(
    q: str = Query("", description="Texto livre: pesquisa em holdprint_job_id, title, client_name"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """Autocomplete de Jobs/OS para formulário de Visita Técnica."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    q_lower = q.strip().lower()
    select_cols = "id,holdprint_job_id,title,client_name,client_address,branch"
    base = get_client().table("jobs").select(select_cols).eq("archived", False)

    if q_lower:
        # Strip PostgREST filter chars to avoid injection in or_ string
        safe_q = q_lower.replace("(", "").replace(")", "").replace(",", "").replace(".", "")
        results = base.or_(
            f"holdprint_job_id.ilike.%{safe_q}%,title.ilike.%{safe_q}%,client_name.ilike.%{safe_q}%"
        ).limit(limit).execute().data or []
    else:
        results = base.limit(limit).execute().data or []

    return [
        {
            "id": j.get("id"),
            "holdprint_job_id": j.get("holdprint_job_id"),
            "title": j.get("title"),
            "client_name": j.get("client_name"),
            "client_address": j.get("client_address"),
            "branch": j.get("branch"),
        }
        for j in results
    ]


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific job by ID"""
    job_doc = db.jobs.find_one({"id": job_id}, {"_id": 0})
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
            db.jobs.update_one(
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
        installer = db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            installer_id = installer['id']
            user_id = current_user.id
            job_assigned_installers = job_doc.get('assigned_installers') or []
            item_assignments = job_doc.get('item_assignments') or []
            
            # Check access by both installer.id and user_id
            has_access = installer_id in job_assigned_installers or user_id in job_assigned_installers
            
            if not has_access:
                for assignment in item_assignments:
                    if assignment.get('installer_id') in [installer_id, user_id]:
                        has_access = True
                        break
                    if installer_id in assignment.get('installer_ids', []) or user_id in assignment.get('installer_ids', []):
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
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    client = get_client()
    result = client.table("jobs").update(
        {"assigned_installers": assign_data.installer_ids}
    ).eq("id", job_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    job_doc = db.jobs.find_one({"id": job_id})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found after update")
    if isinstance(job_doc.get('created_at'), str):
        job_doc['created_at'] = datetime.fromisoformat(job_doc['created_at'])
    if job_doc.get('scheduled_date') and isinstance(job_doc['scheduled_date'], str):
        job_doc['scheduled_date'] = datetime.fromisoformat(job_doc['scheduled_date'])
    return Job(**job_doc)


@router.put("/jobs/{job_id}/schedule", response_model=Job)
async def schedule_job(job_id: str, schedule_data: JobSchedule, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    """Schedule a job"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    # Normalizar para UTC
    from datetime import timezone as _tz
    sched_dt = schedule_data.scheduled_date
    if sched_dt.tzinfo is None:
        sched_dt = sched_dt.replace(tzinfo=_tz.utc)
    sched_dt = sched_dt.astimezone(_tz.utc)

    # Capturar data anterior para email
    old_job = db.jobs.find_one({"id": job_id}, {"scheduled_date": 1})
    old_date = old_job.get("scheduled_date") if old_job else None

    update_data = {"scheduled_date": sched_dt.isoformat()}
    if schedule_data.scheduled_time_end:
        end_dt = schedule_data.scheduled_time_end
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=_tz.utc)
        update_data["scheduled_time_end"] = end_dt.astimezone(_tz.utc).isoformat()
    if schedule_data.installer_ids is not None:
        update_data["assigned_installers"] = schedule_data.installer_ids
    # Status: explícito no body ou default "agendado"
    update_data["status"] = schedule_data.status or "agendado"

    # Append reschedule history entry
    current_job = db.jobs.find_one({"id": job_id}, {"reschedule_history": 1, "status": 1, "scheduled_date": 1}) or {}
    old_status = current_job.get("status", "")
    history_entry = {
        "rescheduled_at": sched_dt.replace(microsecond=0).isoformat(),
        "rescheduled_by": getattr(current_user, "name", None) or getattr(current_user, "full_name", None) or getattr(current_user, "email", str(current_user.id)),
        "old_date": str(current_job.get("scheduled_date", "")),
        "new_date": sched_dt.replace(microsecond=0).isoformat(),
        "note": schedule_data.reschedule_note or "",
        "job_status": old_status,
    }
    existing_history = current_job.get("reschedule_history") or []
    if not isinstance(existing_history, list):
        existing_history = []
    update_data["reschedule_history"] = existing_history + [history_entry]

    client = get_client()
    try:
        result = client.table("jobs").update(update_data).eq("id", job_id).execute()
    except Exception as e:
        logger.error(f"schedule_job: falha ao atualizar job {job_id}: {e}")
        if "jobs_status_check" in str(e):
            raise HTTPException(status_code=400, detail=f"Status inválido para o job: '{update_data['status']}'")
        raise HTTPException(status_code=400, detail=f"Erro ao reagendar job: {str(e)}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    job_doc = db.jobs.find_one({"id": job_id})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found after update")

    for dt_field in ("created_at", "scheduled_date", "scheduled_time_end"):
        val = job_doc.get(dt_field)
        if val and isinstance(val, str):
            try:
                job_doc[dt_field] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError:
                pass

    # Background: Google Calendar sync
    def _sync_calendar():
        try:
            import asyncio as _asyncio
            from routes.calendar import sync_job_to_installer_calendar
            _asyncio.run(sync_job_to_installer_calendar(job_id, current_user))
        except Exception as e:
            logger.warning(f"Google Calendar sync falhou para job {job_id}: {e}")

    if update_data.get("assigned_installers"):
        background_tasks.add_task(_sync_calendar)

    # Background: Push Web + Email para todos os instaladores atribuídos
    assigned = job_doc.get("assigned_installers") or []
    if assigned:
        job_title = job_doc.get("title", "Job")
        job_client = job_doc.get("client_name", "")
        new_date_iso = job_doc.get("scheduled_date")

        def _notify_all():
            import asyncio as _asyncio

            async def _push():
                try:
                    from routes.notifications import send_push_notification
                    installers = db.installers.find(
                        {"id": {"$in": assigned}},
                        {"_id": 0, "user_id": 1, "full_name": 1}
                    )
                    try:
                        dt = datetime.fromisoformat(str(new_date_iso).replace("Z", "+00:00"))
                        from zoneinfo import ZoneInfo
                        date_display = dt.astimezone(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y às %H:%M")
                    except Exception:
                        date_display = str(new_date_iso)

                    for inst in installers:
                        uid = inst.get("user_id")
                        if uid:
                            try:
                                await send_push_notification(
                                    user_id=uid,
                                    title="📅 Job Reagendado",
                                    body=f"{job_title} — nova data: {date_display}",
                                    url=f"/installer/jobs/{job_id}",
                                    data={"type": "job_rescheduled", "job_id": job_id}
                                )
                            except Exception as e:
                                logger.warning(f"Push falhou para user {uid}: {e}")
                except Exception as e:
                    logger.warning(f"Notificação push falhou para job {job_id}: {e}")

            _asyncio.run(_push())

            # Email
            try:
                from services.email import send_reschedule_email
                installers_for_email = db.installers.find(
                    {"id": {"$in": assigned}},
                    {"_id": 0, "user_id": 1, "full_name": 1}
                )
                user_ids = [i.get("user_id") for i in installers_for_email if i.get("user_id")]
                if user_ids:
                    users = db.users.find(
                        {"id": {"$in": user_ids}},
                        {"_id": 0, "id": 1, "email": 1, "name": 1}
                    )
                    uid_to_email = {u["id"]: (u.get("email"), u.get("name", "Instalador")) for u in users}

                    installers_final = db.installers.find(
                        {"id": {"$in": assigned}},
                        {"_id": 0, "user_id": 1, "full_name": 1}
                    )
                    for inst in installers_final:
                        uid = inst.get("user_id")
                        if uid and uid in uid_to_email:
                            email_addr, uname = uid_to_email[uid]
                            if email_addr:
                                send_reschedule_email(
                                    to_email=email_addr,
                                    installer_name=inst.get("full_name") or uname,
                                    job_title=job_title,
                                    job_client=job_client,
                                    old_date=old_date,
                                    new_date=new_date_iso,
                                )
            except Exception as e:
                logger.warning(f"Email de reagendamento falhou para job {job_id}: {e}")

        background_tasks.add_task(_notify_all)

    try:
        return Job(**job_doc)
    except Exception as e:
        logger.error(f"schedule_job: falha ao montar Job model para {job_id}: {e} | doc keys: {list(job_doc.keys())}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar retorno do job: {str(e)}")


@router.put("/jobs/{job_id}", response_model=Job)
async def update_job(job_id: str, job_update: dict, current_user: User = Depends(get_current_user)):
    """Update job details"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Get current job data for validation
    current_job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not current_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
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
    
    # VALIDATION: Cannot set status to "instalando" without assigned installers
    new_status = update_data.get("status")
    if new_status in ["instalando", "in_progress"]:
        # Check if we're updating installers in this request or use existing
        installers = update_data.get("assigned_installers", current_job.get("assigned_installers", []))
        if not installers or len(installers) == 0:
            raise HTTPException(
                status_code=400, 
                detail="Não é possível definir status 'Instalando' sem instaladores atribuídos. Atribua pelo menos um instalador primeiro."
            )
    
    client = get_client()
    result = client.table("jobs").update(update_data).eq("id", job_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    from db_supabase import _deserialize
    job_doc = _deserialize(result.data[0])
    for _dt_field in ("created_at", "scheduled_date", "scheduled_time_end"):
        _val = job_doc.get(_dt_field)
        if _val and isinstance(_val, str):
            try:
                job_doc[_dt_field] = datetime.fromisoformat(_val.replace("Z", "+00:00"))
            except ValueError:
                pass
    return Job(**job_doc)


@router.post("/jobs/{job_id}/finalize")
async def finalize_job(job_id: str, current_user: User = Depends(get_current_user)):
    """
    Installer finalizes a job after completing all items.
    Validates that all assigned items (excluding archived) are completed before allowing finalization.
    """
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get archived item indices - these should be excluded from verification
    archived_items = job.get("archived_items", [])
    archived_indices = set(a.get("item_index") for a in archived_items)
    
    # Get all item checkins for this job
    item_checkins = db.item_checkins.find({"job_id": job_id}, {"_id": 0})
    
    # Get assigned item indices
    item_assignments = job.get("item_assignments", [])
    assigned_indices = set()
    for assignment in item_assignments:
        if "item_index" in assignment:
            assigned_indices.add(assignment["item_index"])
        if "item_indices" in assignment:
            for idx in assignment["item_indices"]:
                assigned_indices.add(idx)
    
    # If no assignments, consider all products as assigned
    if not assigned_indices:
        products = job.get("products_with_area", [])
        assigned_indices = set(range(len(products)))
    
    # Remove archived indices from required items
    required_indices = assigned_indices - archived_indices
    
    # Check if all required items are completed
    completed_indices = set(c["item_index"] for c in item_checkins if c.get("status") == "completed")
    
    if not required_indices.issubset(completed_indices):
        missing = required_indices - completed_indices
        raise HTTPException(
            status_code=400, 
            detail=f"Nem todos os itens foram concluídos. Faltam: {list(missing)}"
        )
    
    # Update job status to finalizado
    db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "status": "finalizado",
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Job finalizado com sucesso", "status": "finalizado"}


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current_user: User = Depends(get_current_user)):
    """
    Soft-delete de um job: marca como deletado e o remove de listas, relatórios e KPIs,
    mas mantém os dados (check-ins, produtos) no banco para auditoria/reversão.
    Use /jobs/{id}/restore para reverter.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now(timezone.utc).isoformat()
    db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "deleted": True,
            "deleted_at": now,
            "deleted_by": current_user.id,
            "deleted_by_name": getattr(current_user, "name", None) or current_user.email,
            "exclude_from_metrics": True,
        }}
    )

    logger.info(f"Job {job_id} soft-deleted by {current_user.email}")
    return {"message": "Job excluído (soft-delete) com sucesso", "job_id": job_id}


@router.post("/jobs/{job_id}/restore")
async def restore_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Restaura um job soft-deletado, devolvendo-o às listas, relatórios e KPIs."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "deleted": False,
            "deleted_at": None,
            "deleted_by": None,
            "deleted_by_name": None,
            "exclude_from_metrics": False,
        }}
    )

    logger.info(f"Job {job_id} restored by {current_user.email}")
    return {"message": "Job restaurado com sucesso", "job_id": job_id}


@router.post("/jobs/{job_id}/reprocess-products")
async def reprocess_job_products(job_id: str, current_user: User = Depends(get_current_user)):
    """
    Reprocessa as medidas dos produtos de um job específico.
    Útil quando as medidas não foram calculadas corretamente na importação.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get products from holdprint_data or items
    holdprint_data = job.get('holdprint_data', {})
    products = holdprint_data.get('products', [])
    
    # If no products in holdprint_data, try items
    if not products:
        products = job.get('items', [])
    
    if not products:
        return {
            "message": "Job não possui produtos para reprocessar",
            "products_count": 0,
            "total_area_m2": 0
        }
    
    products_with_area = []
    total_area_m2 = 0.0
    total_quantity = 0
    
    for product in products:
        product_info = extract_product_dimensions(product)
        quantity = product.get('quantity', 1)
        
        # Calculate areas
        unit_area = product_info.get('area_m2', 0)
        total_area = unit_area * quantity
        
        product_with_area = {
            "name": product.get('name', 'Produto sem nome'),
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
    
    # Update job in database
    db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "products_with_area": products_with_area,
            "area_m2": round(total_area_m2, 2),
            "total_products": len(products_with_area),
            "total_quantity": total_quantity
        }}
    )
    
    logger.info(f"Job {job_id} reprocessed: {len(products_with_area)} products, {total_area_m2} m²")
    
    return {
        "message": "Produtos reprocessados com sucesso",
        "products_count": len(products_with_area),
        "total_area_m2": round(total_area_m2, 2),
        "products": products_with_area
    }


# ============ ARCHIVE ROUTES ============

class ArchiveJobRequest(BaseModel):
    """Request to archive a job"""
    exclude_from_metrics: bool = False  # True = não contabilizar


class ArchiveItemsRequest(BaseModel):
    """Request to archive specific items from a job"""
    item_indices: List[int]
    exclude_from_metrics: bool = False


@router.post("/jobs/batch-schedule")
async def batch_schedule_jobs(
    job_ids: List[str] = Body(..., embed=True),
    scheduled_date: Optional[str] = Body(None, embed=True),
    scheduled_time_end: Optional[str] = Body(None, embed=True),
    assigned_installers: List[str] = Body(default=[], embed=True),
    current_user: User = Depends(get_current_user),
):
    """Schedule multiple jobs in a single DB round-trip."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    if not job_ids:
        return {"updated_count": 0, "message": "Nenhum job selecionado"}
    if len(job_ids) > 500:
        raise HTTPException(status_code=400, detail="Máximo de 500 jobs por operação")

    update_data: dict = {}
    if scheduled_date:
        try:
            update_data["scheduled_date"] = datetime.fromisoformat(scheduled_date.replace("Z", "+00:00")).isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Data inválida")
    else:
        update_data["scheduled_date"] = None

    if scheduled_time_end:
        try:
            update_data["scheduled_time_end"] = datetime.fromisoformat(scheduled_time_end.replace("Z", "+00:00")).isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Hora de término inválida")

    if assigned_installers:
        update_data["assigned_installers"] = assigned_installers

    if scheduled_date:
        update_data["status"] = "agendado"

    try:
        client = get_client()
        client.table("jobs").update(update_data).in_("id", job_ids).execute()

        # Google Calendar sync omitido no batch — feito sob demanda pelo instalador

    except Exception as e:
        logger.error(f"batch_schedule_jobs error: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao agendar jobs: {str(e)}")

    logger.info(f"batch_schedule_jobs: {len(job_ids)} jobs agendados por {current_user.email}")
    return {"updated_count": len(job_ids), "message": f"{len(job_ids)} job(s) agendados com sucesso"}


@router.post("/jobs/batch-archive")
async def batch_archive_jobs(
    job_ids: List[str] = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
):
    """Archive multiple jobs in a single DB round-trip."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    if not job_ids:
        return {"archived_count": 0, "message": "Nenhum job selecionado"}

    if len(job_ids) > 500:
        raise HTTPException(status_code=400, detail="Máximo de 500 jobs por operação")

    now = datetime.now(timezone.utc).isoformat()
    archived_by_name = getattr(current_user, "name", None) or current_user.email

    try:
        client = get_client()
        client.table("jobs").update({
            "archived": True,
            "archived_at": now,
            "archived_by": current_user.id,
            "archived_by_name": archived_by_name,
            "exclude_from_metrics": True,
            "status": "arquivado",
        }).in_("id", job_ids).execute()
    except Exception as e:
        logger.error(f"batch_archive_jobs error: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao arquivar jobs: {str(e)}")

    logger.info(f"batch_archive_jobs: {len(job_ids)} jobs arquivados por {current_user.email}")
    return {
        "archived_count": len(job_ids),
        "message": f"{len(job_ids)} job(s) arquivados com sucesso",
    }


@router.post("/jobs/{job_id}/archive")
async def archive_job(job_id: str, request: ArchiveJobRequest, current_user: User = Depends(get_current_user)):
    """
    Arquiva um job inteiro.
    Se exclude_from_metrics=True, o job não será contabilizado nos relatórios.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "status": "arquivado",
        "archived": True,
        "archived_at": now,
        "archived_by": current_user.id,
        "archived_by_name": current_user.name,
        "exclude_from_metrics": request.exclude_from_metrics
    }
    
    db.jobs.update_one(
        {"id": job_id},
        {"$set": update_data}
    )
    
    logger.info(f"Job {job_id} archived by {current_user.name}, exclude_from_metrics={request.exclude_from_metrics}")
    
    return {
        "message": "Job arquivado com sucesso",
        "job_id": job_id,
        "exclude_from_metrics": request.exclude_from_metrics
    }


@router.post("/jobs/{job_id}/unarchive")
async def unarchive_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Desarquiva um job."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    db.jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "status": "aguardando",
                "archived": False,
                "exclude_from_metrics": False
            },
            "$unset": {
                "archived_at": "",
                "archived_by": "",
                "archived_by_name": ""
            }
        }
    )
    
    return {"message": "Job desarquivado com sucesso"}


@router.post("/jobs/{job_id}/archive-items")
async def archive_job_items(job_id: str, request: ArchiveItemsRequest, current_user: User = Depends(get_current_user)):
    """
    Arquiva itens específicos de um job.
    Os itens arquivados não serão considerados para instalação.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    products = job.get("products_with_area", [])
    if not products:
        products = job.get("holdprint_data", {}).get("products", [])
    
    # Validate indices
    for idx in request.item_indices:
        if idx < 0 or idx >= len(products):
            raise HTTPException(status_code=400, detail=f"Índice de item inválido: {idx}")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get current archived items
    archived_items = job.get("archived_items", [])
    
    # Add new archived items
    for idx in request.item_indices:
        if idx not in [a.get("item_index") for a in archived_items]:
            product = products[idx] if idx < len(products) else {}
            archived_items.append({
                "item_index": idx,
                "item_name": product.get("name", f"Item {idx}"),
                "archived_at": now,
                "archived_by": current_user.id,
                "archived_by_name": current_user.name,
                "exclude_from_metrics": request.exclude_from_metrics
            })
    
    # Remove archived indices from item_assignments to keep state consistent.
    # Installers assigned only to archived items would otherwise still see
    # a job with 0 workable items, causing confusion.
    archived_index_set = {a.get("item_index") for a in archived_items}
    item_assignments = [
        a for a in job.get("item_assignments", [])
        if a.get("item_index") not in archived_index_set
    ]

    db.jobs.update_one(
        {"id": job_id},
        {"$set": {"archived_items": archived_items, "item_assignments": item_assignments}}
    )

    logger.info(f"Job {job_id}: {len(request.item_indices)} items archived by {current_user.name}")

    return {
        "message": f"{len(request.item_indices)} item(s) arquivado(s) com sucesso",
        "archived_items": archived_items
    }


@router.post("/jobs/{job_id}/unarchive-items")
async def unarchive_job_items(job_id: str, item_indices: List[int] = Body(...), current_user: User = Depends(get_current_user)):
    """Desarquiva itens específicos de um job."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    archived_items = job.get("archived_items", [])
    
    # Remove items from archived list
    archived_items = [a for a in archived_items if a.get("item_index") not in item_indices]
    
    db.jobs.update_one(
        {"id": job_id},
        {"$set": {"archived_items": archived_items}}
    )
    
    return {
        "message": f"{len(item_indices)} item(s) desarquivado(s) com sucesso",
        "archived_items": archived_items
    }


# ============ ITEM ASSIGNMENT ROUTES ============

@router.post("/jobs/{job_id}/assign-items")
async def assign_items_to_installers(job_id: str, assignment: ItemAssignment, current_user: User = Depends(get_current_user)):
    """Assign specific items to installers"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Search installers by both id and user_id for compatibility
    installers_by_id = db.installers.find({"id": {"$in": assignment.installer_ids}})
    installers_by_user_id = db.installers.find({"user_id": {"$in": assignment.installer_ids}})
    
    # Combine results
    installer_map = {}
    for i in installers_by_id:
        installer_map[i["id"]] = i
    for i in installers_by_user_id:
        installer_map[i["user_id"]] = i
    
    # Verify all requested installers were found
    missing = [iid for iid in assignment.installer_ids if iid not in installer_map]
    if missing:
        raise HTTPException(status_code=400, detail=f"Installers not found: {missing}")
    
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
                "remocao_prevista": assignment.remocao_prevista,
                "ferramentas": assignment.ferramentas,
                "assigned_by": current_user.id
            }
            new_assignments.append(new_assignment)
            total_m2_assigned += m2_per_installer
    
    if assignment.apply_to_all and (assignment.difficulty_level or assignment.scenario_category or assignment.remocao_prevista or assignment.ferramentas):
        job_config = job.get("installation_config", {})
        # Ensure job_config is a dict (could be string from DB)
        if isinstance(job_config, str):
            try:
                import json
                job_config = json.loads(job_config)
            except (json.JSONDecodeError, ValueError):
                job_config = {}
        if not isinstance(job_config, dict):
            job_config = {}

        if assignment.difficulty_level:
            job_config["default_difficulty_level"] = assignment.difficulty_level
        if assignment.scenario_category:
            job_config["default_scenario_category"] = assignment.scenario_category
        job_config["remocao_prevista"] = assignment.remocao_prevista
        if assignment.ferramentas:
            job_config["ferramentas"] = assignment.ferramentas

        db.jobs.update_one(
            {"id": job_id},
            {"$set": {"installation_config": job_config}}
        )
    
    all_assignments = current_assignments + new_assignments
    all_installer_ids = list(set([a["installer_id"] for a in all_assignments]))
    
    db.jobs.update_one(
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
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTALLER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
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
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
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
                installer = db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
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
    
    db.jobs.update_one(
        {"id": job_id},
        {"$set": {"item_assignments": assignments}}
    )
    
    return {"message": "Assignment status updated", "assignments": assignments}


# ============ IMPORT ROUTES ============

@router.post("/jobs/import-all")
async def import_all_jobs(request: BatchImportRequest, current_user: User = Depends(get_current_user)):
    """Import all jobs from Holdprint in batch"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    holdprint_jobs = await fetch_holdprint_jobs(request.branch)
    holdprint_total_received = len(holdprint_jobs)
    imported = 0
    skipped = 0
    errors = []

    for holdprint_job in holdprint_jobs:
        holdprint_job_id = str(holdprint_job.get('id', ''))

        existing = db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
        if existing:
            skipped += 1
            continue

        try:
            db.jobs.insert_one(_build_job_doc(holdprint_job, request.branch))
            imported += 1
        except Exception as e:
            errors.append(f"{holdprint_job.get('title', 'Unknown')}: {str(e)}")

    _persist_sync_result(imported, skipped, errors, sync_type="manual_branch")
    return {
        "success": True,
        "imported": imported,
        "skipped": skipped,
        "total": holdprint_total_received,
        "holdprint_total_received": holdprint_total_received,
        "errors": errors[:5] if errors else []
    }


async def _fetch_branch_jobs(branch: str, start_date: str, end_date: str, max_pages: int = 10):
    """Fetch a single branch's jobs; return (branch, jobs, error_or_none)."""
    try:
        jobs = await fetch_holdprint_jobs(
            branch,
            start_date=start_date,
            end_date=end_date,
            max_pages=max_pages,
        )
        return (branch, jobs, None)
    except HTTPException as he:
        return (branch, [], f"{branch}: {he.detail}")
    except Exception as e:
        return (branch, [], f"{branch}: {str(e)}")


@router.post("/jobs/import-current-month")
async def import_current_month_jobs(current_user: User = Depends(get_current_user)):
    """Import jobs from the last 2 weeks for both branches (POA + SP)."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    # Vercel cap is 60s; reserve 10s for response + DB writes.
    BUDGET_S = 50.0
    started = time.monotonic()

    now = datetime.now(timezone.utc).date()
    start_date = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")

    total_imported = 0
    total_skipped = 0
    total_errors = []
    branch_results = []
    partial = False

    # Fetch both branches in parallel (network-bound)
    fetch_results = await asyncio.gather(
        _fetch_branch_jobs("POA", start_date, end_date, max_pages=10),
        _fetch_branch_jobs("SP", start_date, end_date, max_pages=10),
    )

    # Insert sequentially (PostgREST sync); abort once we approach Vercel cap.
    for branch, holdprint_jobs, fetch_error in fetch_results:
        branch_imported = 0
        branch_skipped = 0
        branch_errors = []
        if fetch_error:
            branch_errors.append(fetch_error)

        for holdprint_job in holdprint_jobs:
            if time.monotonic() - started > BUDGET_S:
                partial = True
                break
            holdprint_job_id = str(holdprint_job.get('id', ''))
            existing = db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
            if existing:
                branch_skipped += 1
                continue
            try:
                db.jobs.insert_one(_build_job_doc(holdprint_job, branch))
                branch_imported += 1
            except Exception as e:
                branch_errors.append(f"{holdprint_job.get('title', 'Unknown')}: {str(e)}")

        branch_results.append({
            "branch": branch,
            "imported": branch_imported,
            "skipped": branch_skipped,
        })
        total_imported += branch_imported
        total_skipped += branch_skipped
        total_errors.extend(branch_errors)

    _persist_sync_result(total_imported, total_skipped, total_errors, sync_type="manual_last_2_weeks")
    return {
        "success": total_imported > 0 or total_skipped > 0,
        "period": f"{start_date} a {end_date}",
        "total_imported": total_imported,
        "total_skipped": total_skipped,
        "branches": branch_results,
        "errors": total_errors[:5] if total_errors else [],
        "partial": partial,
        "elapsed_s": round(time.monotonic() - started, 2),
    }


class ImportMonthRequest(BaseModel):
    month: int
    year: int


@router.post("/jobs/import-month")
async def import_month_jobs(request: ImportMonthRequest, current_user: User = Depends(get_current_user)):
    """Import all jobs from a specific month for both branches"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    target_month = request.month
    target_year = request.year
    
    total_imported = 0
    total_skipped = 0
    total_errors = []
    branch_results = []
    
    for branch in ["SP", "POA"]:
        try:
            holdprint_jobs = await fetch_holdprint_jobs(branch, target_month, target_year)
            
            imported = 0
            skipped = 0
            errors = []
            
            for holdprint_job in holdprint_jobs:
                holdprint_job_id = str(holdprint_job.get('id', ''))

                existing = db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                if existing:
                    skipped += 1
                    continue

                try:
                    db.jobs.insert_one(_build_job_doc(holdprint_job, branch))
                    imported += 1
                except Exception as e:
                    errors.append(f"{holdprint_job.get('title', 'Unknown')}: {str(e)}")

            branch_results.append({
                "branch": branch,
                "imported": imported,
                "skipped": skipped,
                "total": imported + skipped,
            })

            total_imported += imported
            total_skipped += skipped

        except HTTPException as he:
            branch_results.append({"branch": branch, "imported": 0, "skipped": 0, "total": 0, "error": str(he.detail)})
            total_errors.append(f"{branch}: {str(he.detail)}")
        except Exception as e:
            branch_results.append({"branch": branch, "imported": 0, "skipped": 0, "total": 0, "error": str(e)})
            total_errors.append(f"{branch}: {str(e)}")

    return {
        "success": total_imported > 0 or total_skipped > 0,
        "month": target_month,
        "year": target_year,
        "total_imported": total_imported,
        "total_skipped": total_skipped,
        "branches": branch_results,
        "errors": total_errors[:5] if total_errors else [],
    }


@router.post("/jobs/sync-holdprint")
async def sync_holdprint_jobs(
    months_back: int = Query(2, ge=1, le=12, description="Meses para trás (usado apenas com full_resync=true)"),
    full_resync: bool = Query(False, description="Ignorar cursor e refazer sync completo dos últimos months_back meses"),
    current_user: User = Depends(get_current_user)
):
    """
    Sync jobs from Holdprint.

    Delta sync (default, full_resync=false): fetches only jobs created since the
    last successful sync timestamp stored in system_config, with a 1-day overlap
    to cover clock-boundary edge cases.

    Full resync (full_resync=true): iterates over the last `months_back` months —
    use this to force a complete reprocessing from the admin panel.
    """
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    results = []
    total_imported = 0
    total_skipped = 0
    total_errors = []

    now = datetime.now(timezone.utc)

    # ── Build date window(s) ─────────────────────────────────────────────────
    if full_resync:
        months_to_sync = []
        for i in range(months_back + 1):
            target_date = now - timedelta(days=i * 30)
            month_year = (target_date.month, target_date.year)
            if month_year not in months_to_sync:
                months_to_sync.append(month_year)
        windows = []
        for month, year in months_to_sync:
            last_day = monthrange(year, month)[1]
            windows.append((f"{year}-{month:02d}-01", f"{year}-{month:02d}-{last_day:02d}", month, year))
    else:
        # Delta sync: single window from cursor (or start of current month)
        cursor_row = db.system_config.find_one({"key": "last_holdprint_sync"})
        if cursor_row and cursor_row.get("value"):
            cursor_dt = datetime.fromisoformat(cursor_row["value"].replace('Z', '+00:00'))
            # 1-day overlap so jobs created right at the clock boundary are not missed
            start_dt = cursor_dt - timedelta(days=1)
        else:
            # First run: start of current month
            start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        windows = [(start_dt.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d"), now.month, now.year)]

    logger.info(f"sync-holdprint: windows={[(w[0], w[1]) for w in windows]}, full_resync={full_resync}")

    for branch in ["POA", "SP"]:
        for start_date, end_date, month, year in windows:
            try:
                holdprint_jobs = await fetch_holdprint_jobs(
                    branch, start_date=start_date, end_date=end_date
                )

                imported = 0
                skipped = 0
                errors = []

                for holdprint_job in holdprint_jobs:
                    holdprint_job_id = str(holdprint_job.get('id', ''))

                    # Defence-in-depth: skip if already imported
                    existing = db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                    if existing:
                        skipped += 1
                        continue

                    try:
                        db.jobs.insert_one(_build_job_doc(holdprint_job, branch))
                        imported += 1
                    except Exception as e:
                        errors.append(f"{holdprint_job.get('title', 'Unknown')}: {str(e)}")

                results.append({
                    "branch": branch,
                    "month": month,
                    "year": year,
                    "start_date": start_date,
                    "end_date": end_date,
                    "imported": imported,
                    "skipped": skipped,
                    "total": len(holdprint_jobs),
                    "errors": errors[:3]
                })

                total_imported += imported
                total_skipped += skipped
                total_errors.extend(errors)

                logger.info(f"Sync {branch} {start_date}→{end_date}: {imported} imported, {skipped} skipped")

            except Exception as e:
                logger.error(f"Error syncing {branch} {start_date}→{end_date}: {str(e)}")
                results.append({
                    "branch": branch,
                    "month": month,
                    "year": year,
                    "start_date": start_date,
                    "end_date": end_date,
                    "imported": 0,
                    "skipped": 0,
                    "total": 0,
                    "errors": [str(e)]
                })

    db.system_config.update_one(
        {"key": "last_holdprint_sync"},
        {
            "$set": {
                "key": "last_holdprint_sync",
                "value": datetime.now(timezone.utc).isoformat(),
                "total_imported": total_imported,
                "total_skipped": total_skipped,
                "sync_type": "full_resync" if full_resync else "delta",
            }
        },
        upsert=True
    )

    return {
        "success": True,
        "sync_date": datetime.now(timezone.utc).isoformat(),
        "sync_type": "full_resync" if full_resync else "delta",
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Submit justification for a job that wasn't completed"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
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
    
    db.job_justifications.insert_one(justification_record)
    
    db.jobs.update_one(
        {"id": job_id},
        {"$set": {
            "status": "justificado",
            "justification": justification_record,
            "justified_at": datetime.now(timezone.utc).isoformat(),
            "exclude_from_metrics": True
        }}
    )
    
    def send_justification_email():
        if not NOTIFICATION_EMAILS:
            logger.warning("NOTIFICATION_EMAILS não configurado; e-mail de justificativa não enviado")
            return
        try:
            scheduled_date = job.get("scheduled_date", "")
            if scheduled_date:
                try:
                    dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
                    scheduled_date = dt.strftime("%d/%m/%Y às %H:%M")
                except (ValueError, TypeError):
                    pass

            html_content = f"""<!DOCTYPE html>
<html><head><style>
body{{font-family:Arial,sans-serif;line-height:1.6;color:#333}}
.container{{max-width:600px;margin:0 auto;padding:20px}}
.header{{background:#dc2626;color:white;padding:20px;border-radius:8px 8px 0 0}}
.content{{background:#f9fafb;padding:20px;border:1px solid #e5e7eb}}
.footer{{background:#f3f4f6;padding:15px;border-radius:0 0 8px 8px;font-size:12px;color:#6b7280}}
.highlight{{background:#fef3c7;padding:10px;border-left:4px solid #f59e0b;margin:15px 0}}
</style></head><body>
<div class="container">
  <div class="header"><h2 style="margin:0">Job Justificado</h2></div>
  <div class="content">
    <div class="highlight"><strong>Motivo:</strong> {justification.reason}</div>
    <p><strong>Código:</strong> #{justification.job_code}</p>
    <p><strong>Título:</strong> {justification.job_title}</p>
    <p><strong>Tipo:</strong> {type_label}</p>
    <p><strong>Data:</strong> {scheduled_date or 'N/A'}</p>
    <p><strong>Por:</strong> {current_user.name}</p>
  </div>
  <div class="footer"><p>Sistema Indústria Visual</p></div>
</div></body></html>"""

            resend.Emails.send({
                "from": SENDER_EMAIL,
                "to": NOTIFICATION_EMAILS,
                "subject": f"Job Justificado: #{justification.job_code} - {justification.job_title}",
                "html": html_content,
            })
            logger.info(f"Justification email sent for job {job_id}")
        except Exception as e:
            logger.error(f"Failed to send justification email: {str(e)}")

    background_tasks.add_task(send_justification_email)

    return {
        "message": "Justificativa registrada com sucesso",
        "justification_id": justification_record["id"],
        "emails_sent": len(NOTIFICATION_EMAILS)
    }


@router.get("/job-justifications")
async def get_job_justifications(current_user: User = Depends(get_current_user)):
    """Get all job justifications"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    justifications = db.job_justifications.find({}, {"_id": 0}, sort=[("created_at", -1)])
    return justifications
