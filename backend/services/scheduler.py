"""
Scheduler module for automated background tasks.
Uses APScheduler for cron-like job scheduling.
"""
import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()

# Store for job configurations
scheduled_jobs = {}


def get_scheduler():
    """Get the scheduler instance"""
    return scheduler


async def sync_holdprint_job():
    """Sync Holdprint data automatically"""
    from database import db
    
    logger.info("🔄 Iniciando sincronização automática com Holdprint...")
    
    try:
        import os
        import httpx
        import uuid
        from services.holdprint import extract_product_dimensions
        
        HOLDPRINT_API_KEY_POA = os.environ.get('HOLDPRINT_API_KEY_POA')
        HOLDPRINT_API_KEY_SP = os.environ.get('HOLDPRINT_API_KEY_SP')
        API_URL = "https://api.holdworks.ai/api-key/jobs/data"
        
        total_imported = 0
        total_skipped = 0
        total_errors = 0
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            for branch in ["POA", "SP"]:
                api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
                
                if not api_key:
                    logger.warning(f"API key not configured for {branch}")
                    continue
                
                headers = {"x-api-key": api_key, "Accept": "application/json"}
                page = 1
                
                try:
                    while True:
                        response = await client.get(f"{API_URL}?page={page}", headers=headers)
                        response.raise_for_status()
                        data = response.json()
                        
                        jobs = data.get('data', []) if isinstance(data, dict) else data
                        has_next = data.get('hasNextPage', False) if isinstance(data, dict) else False
                        
                        if not jobs:
                            break
                        
                        for holdprint_job in jobs:
                            holdprint_job_id = str(holdprint_job.get('id', ''))
                            
                            existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                            if existing:
                                total_skipped += 1
                                continue
                            
                            try:
                                products = holdprint_job.get('production', {}).get('products', [])
                                products_with_area = []
                                total_area_m2 = 0.0
                                
                                for product in products:
                                    product_info = extract_product_dimensions(product)
                                    products_with_area.append(product_info)
                                    total_area_m2 += product_info.get('total_area_m2', 0)
                                
                                job_doc = {
                                    "id": str(uuid.uuid4()),
                                    "holdprint_job_id": holdprint_job_id,
                                    "title": holdprint_job.get('title', 'Sem título'),
                                    "client_name": holdprint_job.get('customerName', 'Cliente não informado'),
                                    "branch": branch,
                                    "status": "aguardando",
                                    "scheduled_date": None,
                                    "assigned_installers": [],
                                    "item_assignments": [],
                                    "items": holdprint_job.get('production', {}).get('items', []),
                                    "holdprint_data": holdprint_job,
                                    "area_m2": total_area_m2,
                                    "products_with_area": products_with_area,
                                    "total_products": len(products),
                                    "total_quantity": sum(p.get('quantity', 1) for p in products),
                                    "created_at": datetime.now(timezone.utc).isoformat()
                                }
                                
                                await db.jobs.insert_one(job_doc)
                                total_imported += 1
                                
                            except Exception as e:
                                total_errors += 1
                                logger.error(f"Error importing job {holdprint_job_id}: {e}")
                        
                        if not has_next:
                            break
                        page += 1
                        if page > 50:
                            break
                    
                    logger.info(f"Sync {branch}: {total_imported} imported")
                    
                except Exception as e:
                    logger.error(f"Error syncing {branch}: {e}")
        
        await db.system_config.update_one(
            {"key": "last_holdprint_sync"},
            {"$set": {
                "key": "last_holdprint_sync",
                "value": datetime.now(timezone.utc).isoformat(),
                "total_imported": total_imported,
                "total_skipped": total_skipped,
                "total_errors": total_errors
            }},
            upsert=True
        )
        
        logger.info(f"✅ Sync concluída: {total_imported} importados, {total_skipped} existentes")
        
    except Exception as e:
        logger.error(f"❌ Erro na sincronização: {e}")


def setup_scheduler(db_instance):
    """
    Setup scheduled jobs.
    Call this during application startup.
    """
    global scheduler
    
    # Add Holdprint sync job - runs daily at 6:00 AM (Brazil time, UTC-3)
    scheduler.add_job(
        sync_holdprint_job,
        CronTrigger(hour=9, minute=0),  # 9:00 UTC = 6:00 BRT
        id='holdprint_daily_sync',
        name='Sincronização diária Holdprint',
        replace_existing=True
    )
    
    scheduled_jobs['holdprint_daily_sync'] = {
        'name': 'Sincronização diária Holdprint',
        'schedule': 'Diariamente às 06:00 (horário de Brasília)',
        'description': 'Busca novas OS da Holdprint e importa para o sistema'
    }
    
    logger.info("📅 Scheduler configurado: Sincronização Holdprint às 06:00 (BRT)")


def start_scheduler():
    """Start the scheduler"""
    if not scheduler.running:
        scheduler.start()
        logger.info("🚀 Scheduler iniciado")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("🛑 Scheduler encerrado")


def get_scheduled_jobs():
    """Get list of scheduled jobs and their next run times"""
    jobs_info = []
    
    for job in scheduler.get_jobs():
        job_config = scheduled_jobs.get(job.id, {})
        jobs_info.append({
            "id": job.id,
            "name": job_config.get('name', job.name),
            "schedule": job_config.get('schedule', str(job.trigger)),
            "description": job_config.get('description', ''),
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            "is_paused": job.next_run_time is None
        })
    
    return jobs_info


def pause_job(job_id: str):
    """Pause a scheduled job"""
    scheduler.pause_job(job_id)
    logger.info(f"⏸️ Job pausado: {job_id}")


def resume_job(job_id: str):
    """Resume a paused job"""
    scheduler.resume_job(job_id)
    logger.info(f"▶️ Job retomado: {job_id}")


def run_job_now(job_id: str):
    """Trigger a job to run immediately"""
    job = scheduler.get_job(job_id)
    if job:
        scheduler.modify_job(job_id, next_run_time=datetime.now(timezone.utc))
        logger.info(f"🔄 Job executado manualmente: {job_id}")
        return True
    return False
