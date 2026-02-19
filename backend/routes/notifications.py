"""
Notifications routes - Migrated from server.py
Handles push notifications, VAPID keys, and schedule conflict checks.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel
import logging
import json

from database import db
from security import get_current_user, require_role
from models.user import User, UserRole
from config import VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIMS_EMAIL
from pywebpush import webpush, WebPushException

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ MODELS ============

class PushSubscription(BaseModel):
    """Push subscription data from browser."""
    endpoint: str
    keys: dict  # Contains p256dh and auth keys


class PushNotificationRequest(BaseModel):
    """Request to send push notification."""
    title: str
    body: str
    icon: Optional[str] = "/logo192.png"
    badge: Optional[str] = "/logo192.png"
    url: Optional[str] = "/"
    user_ids: Optional[List[str]] = None  # If None, send to all installers


# ============ HELPER FUNCTIONS ============

async def send_push_notification(user_id: str, title: str, body: str, url: str = "/", data: dict = None):
    """Send push notification to a specific user."""
    subscription = await db.push_subscriptions.find_one(
        {"user_id": user_id, "is_active": True}
    )
    
    if not subscription:
        logger.info(f"No active push subscription for user {user_id}")
        return False
    
    try:
        payload = json.dumps({
            "title": title,
            "body": body,
            "icon": "/logo192.png",
            "badge": "/logo192.png",
            "url": url,
            "data": data or {}
        })
        
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": subscription["keys"]
            },
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={
                "sub": f"mailto:{VAPID_CLAIMS_EMAIL}"
            }
        )
        logger.info(f"Push notification sent to user {user_id}")
        return True
    except WebPushException as e:
        logger.error(f"Push notification failed for user {user_id}: {str(e)}")
        # If subscription is invalid, mark it as inactive
        if e.response and e.response.status_code in [404, 410]:
            await db.push_subscriptions.update_one(
                {"user_id": user_id},
                {"$set": {"is_active": False}}
            )
        return False


# ============ VAPID & SUBSCRIPTION ROUTES ============

@router.get("/notifications/vapid-public-key")
async def get_vapid_public_key():
    """Get VAPID public key for push subscription."""
    return {"publicKey": VAPID_PUBLIC_KEY}


@router.post("/notifications/subscribe")
async def subscribe_to_notifications(
    subscription: PushSubscription,
    current_user: User = Depends(get_current_user)
):
    """Subscribe user to push notifications."""
    try:
        # Store subscription in database
        await db.push_subscriptions.update_one(
            {"user_id": current_user.id},
            {
                "$set": {
                    "user_id": current_user.id,
                    "endpoint": subscription.endpoint,
                    "keys": subscription.keys,
                    "subscribed_at": datetime.now(timezone.utc).isoformat(),
                    "is_active": True
                }
            },
            upsert=True
        )
        logger.info(f"Push subscription saved for user {current_user.id}")
        return {"message": "Notificações ativadas com sucesso!"}
    except Exception as e:
        logger.error(f"Error saving push subscription: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro ao ativar notificações")


@router.delete("/notifications/unsubscribe")
async def unsubscribe_from_notifications(current_user: User = Depends(get_current_user)):
    """Unsubscribe user from push notifications."""
    await db.push_subscriptions.update_one(
        {"user_id": current_user.id},
        {"$set": {"is_active": False}}
    )
    return {"message": "Notificações desativadas"}


@router.get("/notifications/status")
async def get_notification_status(current_user: User = Depends(get_current_user)):
    """Check if user is subscribed to notifications."""
    subscription = await db.push_subscriptions.find_one(
        {"user_id": current_user.id, "is_active": True},
        {"_id": 0}
    )
    return {"subscribed": subscription is not None}


# ============ SEND NOTIFICATIONS ROUTES ============

@router.post("/notifications/send")
async def send_notification_to_users(
    notification: PushNotificationRequest,
    current_user: User = Depends(get_current_user)
):
    """Send push notification to specific users or all installers (admin/manager only)."""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    if notification.user_ids:
        # Send to specific users
        user_ids = notification.user_ids
    else:
        # Send to all installers
        installers = await db.installers.find({}, {"_id": 0, "user_id": 1}).to_list(1000)
        user_ids = [i["user_id"] for i in installers if i.get("user_id")]
    
    sent_count = 0
    for user_id in user_ids:
        success = await send_push_notification(
            user_id=user_id,
            title=notification.title,
            body=notification.body,
            url=notification.url or "/"
        )
        if success:
            sent_count += 1
    
    return {"message": f"Notificações enviadas para {sent_count} usuários"}


# ============ SCHEDULE CONFLICT ROUTES ============

@router.get("/notifications/check-schedule-conflicts")
async def check_schedule_conflicts(
    installer_id: str,
    date: str,
    time: str = "08:00",
    exclude_job_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Check if installer has schedule conflicts on a specific date/time."""
    try:
        # Parse date
        target_date = datetime.fromisoformat(date.replace('Z', '+00:00'))
        target_date_str = target_date.strftime('%Y-%m-%d')
        
        # Find jobs assigned to this installer on the same date
        query = {
            "assigned_installers": installer_id,
            "scheduled_date": {"$regex": f"^{target_date_str}"}
        }
        
        if exclude_job_id:
            query["id"] = {"$ne": exclude_job_id}
        
        conflicting_jobs = await db.jobs.find(query, {"_id": 0, "id": 1, "title": 1, "scheduled_date": 1}).to_list(100)
        
        has_conflict = len(conflicting_jobs) > 0
        
        return {
            "has_conflict": has_conflict,
            "conflicting_jobs": conflicting_jobs,
            "message": f"Instalador já tem {len(conflicting_jobs)} job(s) agendado(s) para esta data" if has_conflict else "Sem conflitos"
        }
    except Exception as e:
        logger.error(f"Error checking schedule conflicts: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro ao verificar conflitos")


# ============ PENDING CHECKINS & ALERTS ROUTES ============

@router.get("/notifications/pending-checkins")
async def get_pending_checkins(current_user: User = Depends(get_current_user)):
    """Get scheduled jobs that haven't been started (for late check-in alerts)."""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    now = datetime.now(timezone.utc)
    today_str = now.strftime('%Y-%m-%d')
    
    # Find jobs scheduled for today that are past their scheduled time
    jobs = await db.jobs.find({
        "status": "scheduled",
        "scheduled_date": {"$regex": f"^{today_str}"}
    }, {"_id": 0}).to_list(1000)
    
    pending = []
    for job in jobs:
        scheduled_date_str = job.get("scheduled_date", "")
        if scheduled_date_str:
            try:
                scheduled_time = datetime.fromisoformat(scheduled_date_str.replace('Z', '+00:00'))
                if scheduled_time < now:
                    # Job is late
                    minutes_late = int((now - scheduled_time).total_seconds() / 60)
                    job["minutes_late"] = minutes_late
                    job["is_late"] = True
                    
                    # Get assigned installers info
                    if job.get("assigned_installers"):
                        installers = await db.installers.find(
                            {"id": {"$in": job["assigned_installers"]}},
                            {"_id": 0, "id": 1, "full_name": 1, "user_id": 1}
                        ).to_list(100)
                        job["installers_info"] = installers
                    
                    pending.append(job)
            except (ValueError, TypeError):
                pass
    
    return {"pending_checkins": pending, "count": len(pending)}


@router.post("/notifications/send-late-alerts")
async def send_late_checkin_alerts(current_user: User = Depends(get_current_user)):
    """Send notifications for late check-ins."""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    result = await get_pending_checkins(current_user)
    pending = result["pending_checkins"]
    
    sent_count = 0
    for job in pending:
        installers_info = job.get("installers_info", [])
        for installer in installers_info:
            user_id = installer.get("user_id")
            if user_id:
                success = await send_push_notification(
                    user_id=user_id,
                    title="⚠️ Check-in Atrasado",
                    body=f"O job '{job.get('title', 'Job')}' está {job.get('minutes_late', 0)} minutos atrasado. Inicie o check-in!",
                    url=f"/installer/jobs/{job.get('id')}",
                    data={"type": "late_checkin", "job_id": job.get("id")}
                )
                if success:
                    sent_count += 1
    
    return {"message": f"Alertas enviados para {sent_count} instaladores", "jobs_count": len(pending)}


@router.post("/notifications/notify-job-scheduled")
async def notify_job_scheduled(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Send notification when a job is scheduled."""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    assigned_installers = job.get("assigned_installers", [])
    if not assigned_installers:
        return {"message": "Job não tem instaladores atribuídos", "sent_count": 0}
    
    # Get installer user IDs
    installers = await db.installers.find(
        {"id": {"$in": assigned_installers}},
        {"_id": 0, "user_id": 1, "full_name": 1}
    ).to_list(100)
    
    scheduled_date = job.get("scheduled_date", "")
    date_display = ""
    if scheduled_date:
        try:
            dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
            date_display = dt.strftime("%d/%m/%Y às %H:%M")
        except (ValueError, TypeError):
            date_display = scheduled_date
    
    sent_count = 0
    for installer in installers:
        user_id = installer.get("user_id")
        if user_id:
            success = await send_push_notification(
                user_id=user_id,
                title="📅 Novo Agendamento",
                body=f"Você foi agendado para: {job.get('title', 'Job')} em {date_display}",
                url=f"/installer/jobs/{job_id}",
                data={"type": "job_scheduled", "job_id": job_id}
            )
            if success:
                sent_count += 1
    
    return {"message": f"Notificações enviadas para {sent_count} instaladores"}
