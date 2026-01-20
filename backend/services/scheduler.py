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
    """
    Job function to sync Holdprint data.
    This runs as a background task.
    """
    from database import db
    
    logger.info("🔄 Iniciando sincronização automática com Holdprint...")
    
    try:
        # Import the fetch function from server
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        # Use httpx for async requests
        import httpx
        from calendar import monthrange
        from services.holdprint import extract_product_dimensions
        import uuid
        
        # Get API keys from environment
        HOLDPRINT_API_KEY_POA = os.environ.get('HOLDPRINT_API_KEY_POA')
        HOLDPRINT_API_KEY_SP = os.environ.get('HOLDPRINT_API_KEY_SP')
        HOLDPRINT_API_URL = "https://api.holdprint.com.br/v1/orders"
        
        total_imported = 0
        total_skipped = 0
        total_errors = 0
        
        # Sync last 2 months
        now = datetime.now(timezone.utc)
        months_to_sync = []
        
        for i in range(3):  # Current month + 2 months back
            target_month = now.month - i
            target_year = now.year
            if target_month <= 0:
                target_month += 12
                target_year -= 1
            months_to_sync.append((target_month, target_year))
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for branch in ["POA", "SP"]:
                api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
                
                if not api_key:
                    logger.warning(f"API key not configured for branch {branch}")
                    continue
                
                headers = {"x-api-key": api_key}
                
                for month, year in months_to_sync:
                    try:
                        last_day = monthrange(year, month)[1]
                        start_date_str = f"{year}-{month:02d}-01"
                        end_date_str = f"{year}-{month:02d}-{last_day:02d}"
                        
                        params = {
                            "page": 1,
                            "pageSize": 100,
                            "startDate": start_date_str,
                            "endDate": end_date_str,
                            "language": "pt-BR"
                        }
                        
                        response = await client.get(HOLDPRINT_API_URL, headers=headers, params=params)
                        response.raise_for_status()
                        data = response.json()
                        
                        jobs = []
                        if isinstance(data, dict) and 'data' in data:
                            jobs = data['data']
                        elif isinstance(data, list):
                            jobs = data
                        
                        # Filter non-finalized jobs
                        filtered_jobs = [job for job in jobs if not job.get('isFinalized', False)]
                        
                        for holdprint_job in filtered_jobs:
                            holdprint_job_id = str(holdprint_job.get('id', ''))
                            
                            # Check if already exists
                            existing = await db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                            if existing:
                                total_skipped += 1
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
                                
                                # Create job document
                                job_doc = {
                                    "id": str(uuid.uuid4()),
                                    "holdprint_job_id": holdprint_job_id,
                                    "title": holdprint_job.get('title', 'Sem título'),
                                    "client_name": holdprint_job.get('customerName', 'Cliente não informado'),
                                    "client_address": '',
                                    "branch": branch,
                                    "status": "aguardando",
                                    "scheduled_date": None,
                                    "assigned_installers": [],
                                    "item_assignments": [],
                                    "items": holdprint_job.get('production', {}).get('items', []),
                                    "holdprint_data": holdprint_job,
                                    "area_m2": total_area_m2,
                                    "products_with_area": products_with_area,
                                    "total_products": total_products,
                                    "total_quantity": total_quantity,
                                    "created_at": datetime.now(timezone.utc).isoformat()
                                }
                                
                                await db.jobs.insert_one(job_doc)
                                total_imported += 1
                                
                            except Exception as e:
                                total_errors += 1
                                logger.error(f"Error importing job {holdprint_job_id}: {str(e)}")
                        
                        logger.info(f"Sync {branch} {month}/{year}: processed {len(filtered_jobs)} jobs")
                        
                    except httpx.HTTPError as e:
                        logger.error(f"Error fetching {branch} {month}/{year}: {str(e)}")
                    except Exception as e:
                        logger.error(f"Error processing {branch} {month}/{year}: {str(e)}")
        
        # Record sync result
        await db.system_config.update_one(
            {"key": "last_holdprint_sync"},
            {
                "$set": {
                    "key": "last_holdprint_sync",
                    "value": datetime.now(timezone.utc).isoformat(),
                    "total_imported": total_imported,
                    "total_skipped": total_skipped,
                    "total_errors": total_errors,
                    "sync_type": "automatic"
                }
            },
            upsert=True
        )
        
        logger.info(f"✅ Sincronização automática concluída: {total_imported} importados, {total_skipped} existentes, {total_errors} erros")
        
    except Exception as e:
        logger.error(f"❌ Erro na sincronização automática: {str(e)}")


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
