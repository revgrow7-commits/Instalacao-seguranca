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
# [GAMIFICATION DISABLED 2026-05-15] import suspenso para desativar /gamification/*
# from routes.gamification import router as gamification_router
from routes.installers import router as installers_router
from routes.visitas import router as visitas_router
from routes.visitas_reports import router as visitas_reports_router
from routes.catalogos import router as catalogos_router
from routes.integration import router as integration_router
from routes.cs_integration import router as cs_integration_router
from routes.job_photos import router as job_photos_router

api_router.include_router(auth_router, tags=["Authentication"])
api_router.include_router(users_router, tags=["Users"])
api_router.include_router(jobs_router, tags=["Jobs"])
api_router.include_router(checkins_router, tags=["Check-ins"])
api_router.include_router(item_checkins_router, tags=["Item Check-ins"])
api_router.include_router(products_router, tags=["Products"])
api_router.include_router(reports_router, tags=["Reports"])
api_router.include_router(calendar_router, tags=["Calendar"])
api_router.include_router(notifications_router, tags=["Notifications"])
# [GAMIFICATION DISABLED 2026-05-15] endpoints /gamification/* desativados.
# api_router.include_router(gamification_router, tags=["Gamification"])
api_router.include_router(installers_router, tags=["Installers"])
api_router.include_router(visitas_router, tags=["Visitas Técnicas"])
api_router.include_router(visitas_reports_router)
api_router.include_router(catalogos_router, tags=["Catálogos VT"])
api_router.include_router(integration_router, tags=["Integration"])
api_router.include_router(cs_integration_router, tags=["CS Integration"])
api_router.include_router(job_photos_router, tags=["Job Photos"])

# ============ ADMIN ROUTES (kept in server.py - small, unique) ============

@api_router.post("/admin/bootstrap-test-admin")
def bootstrap_test_admin(payload: dict):
    """Cria usuário admin de teste. Requer BOOTSTRAP_SECRET no body. Remove após uso."""
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    secret = os.environ.get("BOOTSTRAP_SECRET", "iv-boot-7f3a9c2e-1d84-4b56-a901-ef23cc78d500")
    if payload.get("secret") != secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    email = payload.get("email", "teste.admin@industriavisual.com.br")
    password = payload.get("password", "")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="password obrigatório (mín 6 chars)")
    from security import get_password_hash as _hash
    existing = db.users.find({"email": email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail=f"Email já cadastrado: {existing[0]['id']}")
    uid = str(_uuid.uuid4())
    now = _dt.now(_tz.utc).isoformat()
    db.users.insert_one({
        "id": uid, "email": email.lower(), "name": "Admin Teste",
        "full_name": "Admin Teste", "password_hash": _hash(password),
        "role": "admin", "branch": "POA", "is_active": True, "created_at": now,
    })
    logger.info(f"Bootstrap admin criado: {email}")
    return {"success": True, "id": uid, "email": email, "role": "admin"}


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

    last_sync = db.system_config.find_one({"key": "last_holdprint_sync"})

    last_run = None
    if last_sync:
        last_run = last_sync.get("value") or last_sync.get("last_sync_at")

    jobs = [{
        "id": "holdprint_sync",
        "name": "Sincronizacao Holdprint",
        "trigger": "Vercel Cron (09:00 UTC / 06:00 BRT, diario)",
        "next_run": "09:00 UTC diario",
        "last_run": last_run,
        "total_imported": last_sync.get("total_imported", 0) if last_sync else 0,
        "total_skipped": last_sync.get("total_skipped", 0) if last_sync else 0,
        "status": "active"
    }]

    return {"scheduler_running": True, "serverless_mode": IS_SERVERLESS, "jobs": jobs}


@api_router.post("/scheduler/jobs/{job_id}/pause")
def pause_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    raise HTTPException(status_code=400, detail="Cron gerenciado pelo Vercel — use o dashboard do Vercel para pausar.")


@api_router.post("/scheduler/jobs/{job_id}/resume")
def resume_scheduler_job(job_id: str, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN])
    raise HTTPException(status_code=400, detail="Cron gerenciado pelo Vercel — use o dashboard do Vercel para retomar.")


@api_router.post("/scheduler/jobs/{job_id}/run-now")
def run_scheduler_job_now(job_id: str, current_user: User = Depends(get_current_user)):
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    if job_id == "holdprint_sync":
        result = sync_holdprint_jobs_sync(db)
        return {"success": True, "message": f"Sync executado: {result.get('total_imported', 0)} importados", "result": result}
    raise HTTPException(status_code=404, detail=f"Job {job_id} nao encontrado")


# ============ VERCEL CRON ============

@api_router.get("/cron/sync-holdprint")
@api_router.post("/cron/sync-holdprint")
def cron_sync_holdprint(request: Request):
    """Endpoint para Vercel Cron - sincronizacao Holdprint diaria (09:00 UTC / 06:00 BRT)."""
    # Vercel envia x-vercel-cron: 1 em requests de cron autenticados
    is_vercel_cron = request.headers.get('x-vercel-cron') == '1'
    cron_secret = os.environ.get('CRON_SECRET')
    if cron_secret:
        auth_header = request.headers.get('Authorization', '')
        if not is_vercel_cron and auth_header != f"Bearer {cron_secret}":
            raise HTTPException(status_code=401, detail="Unauthorized cron request")
    elif not is_vercel_cron and os.environ.get('VERCEL') == '1':
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

    # Bulk fetch jobs and installers to avoid N+1
    job_ids = list({a["job_id"] for a in alerts if a.get("job_id")})
    installer_ids = list({a["installer_id"] for a in alerts if a.get("installer_id")})

    jobs_map = {j["id"]: j for j in db.jobs.find({"id": {"$in": job_ids}}, {"id": 1, "title": 1, "client_name": 1})}
    installers_map = {i["id"]: i for i in db.installers.find({"id": {"$in": installer_ids}}, {"id": 1, "full_name": 1})}

    enriched = []
    for alert in alerts:
        job = jobs_map.get(alert.get("job_id"), {})
        installer = installers_map.get(alert.get("installer_id"), {})

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

_cors_env = os.environ.get('CORS_ORIGINS', '').strip()
if not _cors_env:
    # Falhar rápido em produção se env não estiver configurada.
    # Em dev local, definir CORS_ORIGINS=http://localhost:3000 no .env.
    raise RuntimeError(
        "CORS_ORIGINS env var obrigatória. "
        "Prod: https://instal-visual.com.br — Dev: http://localhost:3000"
    )
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in _cors_env.split(',') if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ LIFECYCLE ============

@app.on_event("startup")
async def startup_event():
    logger.info("Aplicacao iniciada em modo SERVERLESS (Vercel)" if IS_SERVERLESS else "Aplicacao iniciada")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Aplicacao encerrada")
