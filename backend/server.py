"""
INDUSTRIA VISUAL - Backend Server
Aplicacao FastAPI modular.
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

from config import MAX_CHECKOUT_DISTANCE_METERS
from db_supabase import db
from security import get_current_user, require_role
from models.user import User, UserRole
from services.sync_holdprint import sync_holdprint_jobs_sync

# Serverless detection
IS_SERVERLESS = os.environ.get('VERCEL', '').lower() == '1' or os.environ.get('SERVERLESS', '').lower() == 'true'

# Scheduler (only for non-serverless)
SCHEDULER_AVAILABLE = False
if not IS_SERVERLESS:
    try:
        from services.scheduler import setup_scheduler, start_scheduler, shutdown_scheduler, pause_job, resume_job, run_job_now
        SCHEDULER_AVAILABLE = True
    except ImportError:
        pass

# ============ APP SETUP ============

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Industria Visual API")
api_router = APIRouter(prefix="/api")

# ============ INCLUDE ALL MODULAR ROUTES ============

from routes.auth_new import router as auth_router
from routes.users import router as users_router
from routes.jobs import router as jobs_router
from routes.checkins import router as checkins_router
from routes.item_checkins import router as item_checkins_router
from routes.products import router as products_router
from routes.reports import router as reports_router
from routes.calendar import router as calendar_router
from routes.notifications import router as notifications_router
from routes.gamification import router as gamification_router
from routes.installers import router as installers_router

api_router.include_router(auth_router, tags=["Authentication"])
api_router.include_router(users_router, tags=["Users"])
api_router.include_router(jobs_router, tags=["Jobs"])
api_router.include_router(checkins_router, tags=["Check-ins"])
api_router.include_router(item_checkins_router, tags=["Item Check-ins"])
api_router.include_router(products_router, tags=["Products"])
api_router.include_router(reports_router, tags=["Reports"])
api_router.include_router(calendar_router, tags=["Calendar"])
api_router.include_router(notifications_router, tags=["Notifications"])
api_router.include_router(gamification_router, tags=["Gamification"])
api_router.include_router(installers_router, tags=["Installers"])

# ============ ADMIN ROUTES (kept in server.py - small, unique) ============

@api_router.delete("/admin/cleanup-test-data")
def cleanup_test_data(current_user: User = Depends(get_current_user)):
    """Limpa dados de teste. Somente em dev/staging."""
    require_role(current_user, [UserRole.ADMIN])

    env = os.environ.get('ENV', 'production').lower()
    if env == 'production':
        raise HTTPException(status_code=403, detail="Endpoint desabilitado em producao")

    results = {}
    results["jobs_deleted"] = db.jobs.delete_many({}).get('deleted_count', 0)
    results["checkins_deleted"] = db.checkins.delete_many({}).get('deleted_count', 0)
    results["item_checkins_deleted"] = db.item_checkins.delete_many({}).get('deleted_count', 0)
    results["pause_logs_deleted"] = db.item_pause_logs.delete_many({}).get('deleted_count', 0)
    results["coin_transactions_deleted"] = db.coin_transactions.delete_many({}).get('deleted_count', 0)

    db.installers.update_many({}, {"$set": {"coins": 0, "total_jobs": 0, "total_area_installed": 0}})

    logger.info(f"Admin {current_user.email} limpou dados de teste: {results}")
    return {"success": True, "message": "Dados de teste removidos.", "details": results}


# ============ SCHEDULER / CRON ROUTES ============

@api_router.get("/scheduler/jobs")
def get_scheduler_jobs(current_user: User = Depends(get_current_user)):
    """Status dos jobs agendados."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    last_sync = db.scheduler_sync_status.find_one({"sync_type": "holdprint"})

    jobs = [{
        "id": "holdprint_sync",
        "name": "Sincronizacao Holdprint",
        "trigger": "Vercel Cron (*/30 * * * *)" if IS_SERVERLESS else "APScheduler",
        "next_run": "N/A (Serverless)" if IS_SERVERLESS else "Check APScheduler",
        "last_run": last_sync.get("last_sync_at") if last_sync else None,
        "status": "active"
    }]

    return {"scheduler_running": not IS_SERVERLESS, "serverless_mode": IS_SERVERLESS, "jobs": jobs}


@api_router.post("/scheduler/jobs/{job_id}/pause")
def pause_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    if IS_SERVERLESS:
        raise HTTPException(status_code=400, detail="Nao disponivel em modo serverless.")
    if SCHEDULER_AVAILABLE:
        pause_job(job_id)
        return {"success": True, "message": f"Job {job_id} pausado"}
    raise HTTPException(status_code=400, detail="Scheduler nao disponivel")


@api_router.post("/scheduler/jobs/{job_id}/resume")
def resume_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    if IS_SERVERLESS:
        raise HTTPException(status_code=400, detail="Nao disponivel em modo serverless.")
    if SCHEDULER_AVAILABLE:
        resume_job(job_id)
        return {"success": True, "message": f"Job {job_id} retomado"}
    raise HTTPException(status_code=400, detail="Scheduler nao disponivel")


@api_router.post("/scheduler/jobs/{job_id}/run-now")
def run_scheduler_job_now(job_id: str, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    if job_id == "holdprint_sync":
        result = sync_holdprint_jobs_sync(db)
        return {"success": True, "message": f"Sync executado: {result.get('total_imported', 0)} importados", "result": result}
    if IS_SERVERLESS:
        raise HTTPException(status_code=404, detail=f"Job {job_id} nao encontrado")
    if SCHEDULER_AVAILABLE:
        if run_job_now(job_id):
            return {"success": True, "message": f"Job {job_id} sera executado em instantes"}
    raise HTTPException(status_code=404, detail=f"Job {job_id} nao encontrado")


# ============ VERCEL CRON ============

@api_router.get("/cron/sync-holdprint")
@api_router.post("/cron/sync-holdprint")
def cron_sync_holdprint(request: Request):
    """Endpoint para Vercel Cron - sincronizacao Holdprint a cada 30 min."""
    cron_secret = os.environ.get('CRON_SECRET')
    if cron_secret:
        auth_header = request.headers.get('Authorization', '')
        if auth_header != f"Bearer {cron_secret}":
            raise HTTPException(status_code=401, detail="Unauthorized cron request")

    result = sync_holdprint_jobs_sync(db)
    return {
        "success": True,
        "imported": result.get("total_imported", 0),
        "skipped": result.get("total_skipped", 0),
        "errors": result.get("total_errors", 0),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ============ LOCATION ALERTS ============

@api_router.get("/location-alerts")
def get_location_alerts(current_user: User = Depends(get_current_user)):
    """Alertas de localizacao das ultimas 24h."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    alerts = db.location_alerts.find(
        {"created_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
        limit=50
    )

    enriched = []
    for alert in alerts:
        job = db.jobs.find_one({"id": alert.get("job_id")})
        installer = db.installers.find_one({"id": alert.get("installer_id")})

        enriched.append({
            "id": alert.get("id"),
            "job_id": alert.get("job_id"),
            "job_title": f"{job.get('title', 'N/A')} - {job.get('client_name', 'N/A')}" if job else "Job nao encontrado",
            "installer_id": alert.get("installer_id"),
            "installer_name": installer.get("full_name", "N/A") if installer else "N/A",
            "distance_meters": alert.get("distance_meters", 0),
            "max_allowed_meters": MAX_CHECKOUT_DISTANCE_METERS,
            "created_at": alert.get("created_at"),
            "action_taken": alert.get("action_taken", "none")
        })

    return enriched


# ============ ROOT & HEALTH ============

@api_router.get("/")
def root():
    return {"message": "INDUSTRIA VISUAL API", "status": "online"}

app.include_router(api_router)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "industria-visual-api"}

# ============ MIDDLEWARE ============

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ LIFECYCLE ============

@app.on_event("startup")
async def startup_event():
    if IS_SERVERLESS:
        logger.info("Aplicacao iniciada em modo SERVERLESS (Vercel)")
    elif SCHEDULER_AVAILABLE:
        setup_scheduler(db)
        start_scheduler()
        logger.info("Aplicacao iniciada com scheduler ativo")
    else:
        logger.info("Aplicacao iniciada sem scheduler")


@app.on_event("shutdown")
async def shutdown_event():
    if not IS_SERVERLESS and SCHEDULER_AVAILABLE:
        shutdown_scheduler()
    logger.info("Aplicacao encerrada")
