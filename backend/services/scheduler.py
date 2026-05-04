"""
Scheduler module for automated background tasks.
Uses APScheduler for cron-like job scheduling.
"""
import logging
from datetime import datetime, timezone, timedelta
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
    """Sync Holdprint data automatically (delegates to sync_holdprint_jobs_sync)."""
    from db_supabase import db
    from services.sync_holdprint import sync_holdprint_jobs_sync
    logger.info("🔄 Iniciando sincronização automática com Holdprint...")
    try:
        sync_holdprint_jobs_sync(db)
    except Exception as e:
        logger.error(f"❌ Erro na sincronização: {e}")


async def check_overdue_checkins():
    """Mark item_checkins still in_progress after 4 hours."""
    from db_supabase import db

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
    try:
        overdue = db.item_checkins.find(
            {"status": "in_progress", "checkin_at": {"$lte": cutoff}, "is_late": {"$ne": True}}
        )
        if not overdue:
            return

        for checkin in overdue:
            db.item_checkins.update_one(
                {"id": checkin["id"]},
                {"$set": {"is_late": True}}
            )
            logger.warning(
                f"⚠️ Check-in {checkin['id']} sem checkout há >4h "
                f"(job {checkin.get('job_id')}, instalador {checkin.get('user_id')})"
            )

        logger.info(f"⏰ Overdue check-ins marcados: {len(overdue)}")
    except Exception as e:
        logger.error(f"❌ Erro ao verificar check-ins atrasados: {e}")


def setup_scheduler(db_instance):
    """
    Setup scheduled jobs.
    Call this during application startup.
    """
    global scheduler

    # Holdprint sync — daily at 6:00 BRT (9:00 UTC)
    scheduler.add_job(
        sync_holdprint_job,
        CronTrigger(hour=9, minute=0),
        id='holdprint_daily_sync',
        name='Sincronização diária Holdprint',
        replace_existing=True
    )
    scheduled_jobs['holdprint_daily_sync'] = {
        'name': 'Sincronização diária Holdprint',
        'schedule': 'Diariamente às 06:00 (horário de Brasília)',
        'description': 'Busca novas OS da Holdprint e importa para o sistema'
    }

    # Overdue check-in alerts — every 30 minutes
    scheduler.add_job(
        check_overdue_checkins,
        IntervalTrigger(minutes=30),
        id='overdue_checkins_alert',
        name='Alerta check-ins sem checkout >4h',
        replace_existing=True
    )
    scheduled_jobs['overdue_checkins_alert'] = {
        'name': 'Alerta check-ins atrasados',
        'schedule': 'A cada 30 minutos',
        'description': 'Marca is_late=true em item_checkins abertos há mais de 4h'
    }

    logger.info("📅 Scheduler configurado: Holdprint 06:00 BRT + alerta overdue a cada 30 min")


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
