"""
Item Check-in routes - Migrated from server.py
Handles per-item check-ins for installers (modern flow).
"""
from fastapi import APIRouter, HTTPException, Depends, Form
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging
import math

from database import db
from security import get_current_user, require_role
from models.user import User, UserRole
from models.product import ProductInstalled

router = APIRouter()
logger = logging.getLogger(__name__)

# Constants
MAX_CHECKOUT_DISTANCE_METERS = 500

# Pause reason labels
PAUSE_REASONS = [
    "almoço",
    "banheiro", 
    "esperando_material",
    "problema_tecnico",
    "atendimento_cliente",
    "deslocamento",
    "outro"
]

PAUSE_REASON_LABELS = {
    "almoço": "Almoço/Refeição",
    "banheiro": "Banheiro",
    "esperando_material": "Esperando Material",
    "problema_tecnico": "Problema Técnico",
    "atendimento_cliente": "Atendimento ao Cliente",
    "deslocamento": "Deslocamento entre pontos",
    "outro": "Outro motivo"
}


# ============ HELPER FUNCTIONS ============

def compress_base64_image(base64_string: str, max_size_kb: int = 300, max_dimension: int = 1200) -> str:
    """Compress a base64-encoded image string."""
    if not base64_string:
        return base64_string
    
    try:
        import base64
        from io import BytesIO
        from PIL import Image
        
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        original_size_kb = len(image_data) / 1024
        
        if original_size_kb <= max_size_kb:
            return base64_string
        
        img = Image.open(BytesIO(image_data))
        
        if img.mode in ('RGBA', 'P', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        if img.width > max_dimension or img.height > max_dimension:
            ratio = min(max_dimension / img.width, max_dimension / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        quality = 85
        output = BytesIO()
        
        while quality >= 20:
            output = BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            if len(output.getvalue()) / 1024 <= max_size_kb:
                break
            quality -= 5
        
        return base64.b64encode(output.getvalue()).decode('utf-8')
        
    except Exception as e:
        logger.error(f"Error compressing image: {e}")
        return base64_string


def calculate_gps_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS coordinates in meters using Haversine formula."""
    R = 6371000  # Earth's radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


async def detect_product_family(product_names: list) -> tuple:
    """Detects the product family based on product names."""
    families = await db.product_families.find({}, {"_id": 0}).to_list(100)
    
    family_keywords = {
        "adesivos": ["adesivo", "vinil", "adesivos", "plotagem", "recorte"],
        "lonas": ["lona", "banner", "faixa", "frontlight", "backlight"],
        "acm": ["acm", "alumínio composto", "chapa", "placa"],
        "painéis": ["painel", "outdoor", "totem", "display"],
        "outros": []
    }
    
    for name in product_names:
        name_lower = name.lower() if name else ""
        
        for family in families:
            family_name_lower = family.get("name", "").lower()
            
            if family_name_lower in name_lower:
                return family.get("id"), family.get("name")
            
            keywords = family_keywords.get(family_name_lower, [])
            for keyword in keywords:
                if keyword in name_lower:
                    return family.get("id"), family.get("name")
    
    if families:
        outros = next((f for f in families if "outro" in f.get("name", "").lower()), None)
        if outros:
            return outros.get("id"), outros.get("name")
        return families[0].get("id"), families[0].get("name")
    
    return None, None


async def update_productivity_history(installed_product):
    """Update productivity history aggregates."""
    pass


# Import gamification functions from server (these will be available when router is included)
async def calculate_checkout_coins(checkin, job):
    """Calculate coins for checkout - placeholder, actual implementation in server.py"""
    return {"total_coins": 0, "breakdown": [], "installed_m2": 0}


async def award_coins(user_id, amount, transaction_type, description, reference_id, breakdown):
    """Award coins to user - placeholder, actual implementation in server.py"""
    return None


# ============ PYDANTIC MODELS ============

from pydantic import BaseModel, Field, ConfigDict


class ItemCheckin(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    item_index: int
    installer_id: str
    checkin_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checkout_at: Optional[datetime] = None
    checkin_photo: Optional[str] = None
    checkout_photo: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    gps_accuracy: Optional[float] = None
    checkout_gps_lat: Optional[float] = None
    checkout_gps_long: Optional[float] = None
    checkout_gps_accuracy: Optional[float] = None
    product_name: Optional[str] = None
    family_name: Optional[str] = None
    installed_m2: Optional[float] = None
    complexity_level: Optional[int] = None
    height_category: Optional[str] = None
    scenario_category: Optional[str] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None
    net_duration_minutes: Optional[int] = None
    total_pause_minutes: Optional[int] = None
    productivity_m2_h: Optional[float] = None
    status: str = "in_progress"


class ItemPauseLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_checkin_id: str
    job_id: str
    item_index: int
    installer_id: str
    reason: str
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    auto_generated: bool = False


# ============ ROUTES ============

@router.post("/item-checkins")
async def create_item_checkin(
    job_id: str = Form(...),
    item_index: int = Form(...),
    photo_base64: Optional[str] = Form(None),
    gps_lat: Optional[float] = Form(None),
    gps_long: Optional[float] = Form(None),
    gps_accuracy: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Create a check-in for a specific item in a job"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can create item check-ins")
    
    installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
    if not installer:
        raise HTTPException(status_code=404, detail="Installer not found")
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check if installer is assigned
    job_assigned_installers = job.get("assigned_installers", [])
    item_assignments = job.get("item_assignments", [])
    
    item_assigned = False
    for assignment in item_assignments:
        if assignment.get("item_index") == item_index:
            if assignment.get("installer_id") == installer["id"]:
                item_assigned = True
                break
            if installer["id"] in assignment.get("installer_ids", []):
                item_assigned = True
                break
    
    if not item_assigned and installer["id"] not in job_assigned_installers:
        raise HTTPException(status_code=403, detail="Você não está atribuído a este item")
    
    products = job.get("products_with_area", [])
    if not products:
        products = job.get("items", [])
    
    if not products or item_index >= len(products):
        raise HTTPException(status_code=400, detail=f"Item inválido. O job tem {len(products)} itens.")
    
    product = products[item_index]
    
    existing = await db.item_checkins.find_one({
        "job_id": job_id,
        "item_index": item_index,
        "installer_id": installer["id"],
        "status": "in_progress"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Item already has an active check-in")
    
    family_id, family_name = await detect_product_family([product.get("name", "")])
    
    compressed_photo = None
    if photo_base64:
        compressed_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
    
    item_checkin = ItemCheckin(
        job_id=job_id,
        item_index=item_index,
        installer_id=installer["id"],
        checkin_photo=compressed_photo,
        gps_lat=gps_lat,
        gps_long=gps_long,
        gps_accuracy=gps_accuracy,
        product_name=product.get("name", f"Item {item_index}"),
        family_name=family_name
    )
    
    checkin_dict = item_checkin.model_dump()
    checkin_dict['checkin_at'] = checkin_dict['checkin_at'].isoformat()
    await db.item_checkins.insert_one(checkin_dict)
    
    checkin_dict.pop('_id', None)
    
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "in_progress"}})
    
    return checkin_dict


@router.get("/item-checkins")
async def get_item_checkins(
    job_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Get item check-ins for a job"""
    query = {}
    
    if current_user.role == UserRole.INSTALLER:
        installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
        if installer:
            query["installer_id"] = installer["id"]
    
    if job_id:
        query["job_id"] = job_id
    
    checkins = await db.item_checkins.find(query, {"_id": 0}).to_list(1000)
    
    for c in checkins:
        if isinstance(c.get('checkin_at'), str):
            c['checkin_at'] = datetime.fromisoformat(c['checkin_at'])
        if c.get('checkout_at') and isinstance(c['checkout_at'], str):
            c['checkout_at'] = datetime.fromisoformat(c['checkout_at'])
    
    return checkins


@router.get("/item-checkins/all")
async def get_all_item_checkins(
    current_user: User = Depends(get_current_user)
):
    """Get all item check-ins with photos for reports (Admin/Manager only)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    checkins = await db.item_checkins.find({}, {"_id": 0}).to_list(5000)
    jobs_map = {}
    installers_map = {}
    
    jobs = await db.jobs.find({}, {"_id": 0, "id": 1, "title": 1, "client_name": 1}).to_list(1000)
    installers = await db.installers.find({}, {"_id": 0, "id": 1, "full_name": 1}).to_list(100)
    
    for job in jobs:
        jobs_map[job["id"]] = job
    for installer in installers:
        installers_map[installer["id"]] = installer
    
    enriched_checkins = []
    for c in checkins:
        job = jobs_map.get(c.get("job_id"), {})
        installer = installers_map.get(c.get("installer_id"), {})
        
        checkin_at = c.get("checkin_at", "")
        if isinstance(checkin_at, datetime):
            checkin_at = checkin_at.isoformat()
        
        enriched = {
            **c,
            "checkin_at": checkin_at,
            "job_title": job.get("title", "N/A"),
            "client_name": job.get("client_name", "N/A"),
            "installer_name": installer.get("full_name", "N/A")
        }
        enriched_checkins.append(enriched)
    
    enriched_checkins.sort(key=lambda x: x.get("checkin_at", ""), reverse=True)
    
    return enriched_checkins


@router.put("/item-checkins/{checkin_id}/checkout")
async def complete_item_checkout(
    checkin_id: str,
    photo_base64: Optional[str] = Form(None),
    gps_lat: Optional[float] = Form(None),
    gps_long: Optional[float] = Form(None),
    gps_accuracy: Optional[float] = Form(None),
    installed_m2: Optional[float] = Form(None),
    complexity_level: Optional[int] = Form(None),
    height_category: Optional[str] = Form(None),
    scenario_category: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Complete checkout for a specific item, calculating net time (excluding pauses)"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can complete item checkouts")
    
    checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    if checkin["status"] == "completed":
        raise HTTPException(status_code=400, detail="Item already checked out")
    
    # GPS Distance Validation
    location_alert = None
    auto_paused = False
    distance_meters = 0
    
    checkin_lat = checkin.get("gps_lat")
    checkin_long = checkin.get("gps_long")
    
    if checkin_lat and checkin_long and gps_lat and gps_long:
        distance_meters = calculate_gps_distance(checkin_lat, checkin_long, gps_lat, gps_long)
        
        if distance_meters > MAX_CHECKOUT_DISTANCE_METERS:
            location_log = {
                "id": str(uuid.uuid4()),
                "item_checkin_id": checkin_id,
                "job_id": checkin.get("job_id"),
                "installer_id": checkin.get("installer_id"),
                "event_type": "location_alert",
                "checkin_lat": checkin_lat,
                "checkin_long": checkin_long,
                "checkout_lat": gps_lat,
                "checkout_long": gps_long,
                "distance_meters": round(distance_meters, 2),
                "max_allowed_meters": MAX_CHECKOUT_DISTANCE_METERS,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "action_taken": "auto_pause"
            }
            await db.location_alerts.insert_one(location_log)
            
            if checkin["status"] != "paused":
                pause_reason = f"Saiu do local sem justificar (distância: {round(distance_meters)}m)"
                pause_log = {
                    "id": str(uuid.uuid4()),
                    "item_checkin_id": checkin_id,
                    "reason": pause_reason,
                    "start_time": datetime.now(timezone.utc).isoformat(),
                    "end_time": datetime.now(timezone.utc).isoformat(),
                    "duration_minutes": 0,
                    "auto_generated": True
                }
                await db.item_pause_logs.insert_one(pause_log)
                auto_paused = True
            
            location_alert = {
                "type": "location_exceeded",
                "message": f"Checkout realizado a {round(distance_meters)}m do local do check-in (máximo: {MAX_CHECKOUT_DISTANCE_METERS}m)",
                "distance_meters": round(distance_meters, 2),
                "auto_paused": auto_paused
            }
            logger.warning(f"Location alert: Installer {checkin.get('installer_id')} checked out {round(distance_meters)}m from check-in location")
    
    # End any active pause
    if checkin["status"] == "paused":
        active_pause = await db.item_pause_logs.find_one({
            "item_checkin_id": checkin_id,
            "end_time": None
        }, {"_id": 0})
        if active_pause:
            end_time = datetime.now(timezone.utc)
            start_time = active_pause['start_time']
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)
            pause_duration = int((end_time - start_time).total_seconds() / 60)
            await db.item_pause_logs.update_one(
                {"id": active_pause["id"]},
                {"$set": {"end_time": end_time.isoformat(), "duration_minutes": pause_duration}}
            )
    
    # Calculate durations
    checkin_at = checkin['checkin_at']
    if isinstance(checkin_at, str):
        checkin_at = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
    if checkin_at.tzinfo is None:
        checkin_at = checkin_at.replace(tzinfo=timezone.utc)
    
    checkout_at = datetime.now(timezone.utc)
    
    # Calculate duration in minutes with decimal precision
    duration_seconds = (checkout_at - checkin_at).total_seconds()
    duration_minutes = round(duration_seconds / 60, 2)  # Keep decimal precision
    
    pause_logs = await db.item_pause_logs.find({"item_checkin_id": checkin_id}, {"_id": 0}).to_list(100)
    total_pause_minutes = sum(p.get("duration_minutes", 0) or 0 for p in pause_logs)
    
    net_duration_minutes = round(max(0, duration_minutes - total_pause_minutes), 2)
    
    productivity_m2_h = None
    if installed_m2 and installed_m2 > 0 and net_duration_minutes > 0:
        hours = net_duration_minutes / 60
        productivity_m2_h = round(installed_m2 / hours, 2)
    
    compressed_checkout_photo = None
    if photo_base64:
        compressed_checkout_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
    
    update_data = {
        "checkout_at": checkout_at.isoformat(),
        "checkout_photo": compressed_checkout_photo,
        "checkout_gps_lat": gps_lat,
        "checkout_gps_long": gps_long,
        "checkout_gps_accuracy": gps_accuracy,
        "installed_m2": installed_m2,
        "complexity_level": complexity_level,
        "height_category": height_category,
        "scenario_category": scenario_category,
        "notes": notes,
        "duration_minutes": duration_minutes,
        "net_duration_minutes": net_duration_minutes,
        "total_pause_minutes": total_pause_minutes,
        "productivity_m2_h": productivity_m2_h,
        "status": "completed"
    }
    
    await db.item_checkins.update_one({"id": checkin_id}, {"$set": update_data})
    
    # Register installed product
    job = await db.jobs.find_one({"id": checkin["job_id"]}, {"_id": 0})
    if job:
        products = job.get("products_with_area", [])
        product = products[checkin["item_index"]] if checkin["item_index"] < len(products) else {}
        
        family_id, family_name = await detect_product_family([product.get("name", "")])
        
        installed_product = ProductInstalled(
            job_id=checkin["job_id"],
            checkin_id=checkin_id,
            product_name=product.get("name", f"Item {checkin['item_index']}"),
            family_id=family_id,
            family_name=family_name,
            width_m=product.get("width"),
            height_m=product.get("height"),
            area_m2=installed_m2 or product.get("total_area_m2", 0),
            complexity_level=complexity_level or 1,
            height_category=height_category or "terreo",
            scenario_category=scenario_category or "loja_rua",
            actual_time_min=net_duration_minutes,
            productivity_m2_h=productivity_m2_h,
            cause_notes=notes
        )
        
        await db.installed_products.insert_one(installed_product.model_dump())
        await update_productivity_history(installed_product)
    
    # Check job completion
    job = await db.jobs.find_one({"id": checkin["job_id"]}, {"_id": 0})
    job_checkins = await db.item_checkins.find({"job_id": checkin["job_id"]}, {"_id": 0}).to_list(1000)
    
    item_assignments = job.get("item_assignments", []) if job else []
    assigned_item_indices = set()
    for assignment in item_assignments:
        if "item_index" in assignment:
            assigned_item_indices.add(assignment["item_index"])
        if "item_indices" in assignment:
            for idx in assignment["item_indices"]:
                assigned_item_indices.add(idx)
    
    if not assigned_item_indices:
        products = job.get("products_with_area", []) if job else []
        assigned_item_indices = set(range(len(products)))
    
    completed_item_indices = set(c["item_index"] for c in job_checkins if c["status"] == "completed")
    all_assigned_completed = assigned_item_indices.issubset(completed_item_indices) if assigned_item_indices else False
    
    if all_assigned_completed and len(assigned_item_indices) > 0:
        await db.jobs.update_one({"id": checkin["job_id"]}, {"$set": {"status": "completed"}})
    
    # Return result
    result = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    
    if location_alert:
        result["location_alert"] = location_alert
        result["checkout_distance_meters"] = round(distance_meters, 2)
    
    return result


@router.delete("/item-checkins/{checkin_id}")
async def delete_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an item check-in - Only admin and managers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    checkin = await db.item_checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    await db.item_checkins.delete_one({"id": checkin_id})
    await db.installed_products.delete_many({"checkin_id": checkin_id})
    
    return {"message": "Item check-in deleted successfully"}


@router.put("/item-checkins/{checkin_id}/archive")
async def archive_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Archive an item check-in - Only admin and managers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    checkin = await db.item_checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    await db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"archived": True, "archived_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Item check-in archived successfully"}


@router.post("/item-checkins/{checkin_id}/pause")
async def pause_item_checkin(
    checkin_id: str,
    reason: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Pause an item checkin and log the reason"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Pause request for checkin {checkin_id} by user {current_user.email} (role: {current_user.role})")
    
    if current_user.role != UserRole.INSTALLER:
        logger.error(f"User {current_user.email} is not an installer (role: {current_user.role})")
        raise HTTPException(status_code=403, detail="Only installers can pause item checkouts")
    
    checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        logger.error(f"Checkin {checkin_id} not found")
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    logger.info(f"Checkin status: {checkin.get('status')}")
    
    if checkin["status"] == "completed":
        logger.error(f"Cannot pause completed checkin {checkin_id}")
        raise HTTPException(status_code=400, detail="Cannot pause a completed item")
    
    if checkin["status"] == "paused":
        logger.error(f"Checkin {checkin_id} is already paused")
        raise HTTPException(status_code=400, detail="Item is already paused")
    
    pause_log = ItemPauseLog(
        item_checkin_id=checkin_id,
        job_id=checkin["job_id"],
        item_index=checkin["item_index"],
        installer_id=checkin["installer_id"],
        reason=reason
    )
    
    pause_dict = pause_log.model_dump()
    pause_dict['start_time'] = pause_dict['start_time'].isoformat()
    await db.item_pause_logs.insert_one(pause_dict)
    
    await db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"status": "paused"}}
    )
    
    return {
        "message": "Item paused successfully",
        "pause_id": pause_log.id,
        "reason": reason,
        "start_time": pause_dict['start_time']
    }


@router.post("/item-checkins/{checkin_id}/resume")
async def resume_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Resume a paused item checkin"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can resume item checkouts")
    
    checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    if checkin["status"] != "paused":
        raise HTTPException(status_code=400, detail="Item is not paused")
    
    active_pause = await db.item_pause_logs.find_one({
        "item_checkin_id": checkin_id,
        "end_time": None
    }, {"_id": 0})
    
    if not active_pause:
        raise HTTPException(status_code=400, detail="No active pause found")
    
    end_time = datetime.now(timezone.utc)
    start_time = active_pause['start_time']
    if isinstance(start_time, str):
        start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    
    pause_duration = int((end_time - start_time).total_seconds() / 60)
    
    await db.item_pause_logs.update_one(
        {"id": active_pause["id"]},
        {"$set": {"end_time": end_time.isoformat(), "duration_minutes": pause_duration}}
    )
    
    await db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"status": "in_progress"}}
    )
    
    return {
        "message": "Item resumed successfully",
        "pause_duration_minutes": pause_duration,
        "resumed_at": end_time.isoformat()
    }


@router.get("/item-checkins/{checkin_id}/pauses")
async def get_item_pause_logs(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all pause logs for an item checkin"""
    pause_logs = await db.item_pause_logs.find(
        {"item_checkin_id": checkin_id},
        {"_id": 0}
    ).to_list(100)
    
    for log in pause_logs:
        log["reason_label"] = PAUSE_REASON_LABELS.get(log.get("reason"), log.get("reason"))
    
    total_pause_minutes = sum(p.get("duration_minutes", 0) or 0 for p in pause_logs if p.get("duration_minutes"))
    active_pause = next((p for p in pause_logs if p.get("end_time") is None), None)
    
    return {
        "pauses": pause_logs,
        "total_pause_minutes": total_pause_minutes,
        "has_active_pause": active_pause is not None,
        "active_pause": active_pause
    }


@router.get("/pause-reasons")
async def get_pause_reasons():
    """Get list of valid pause reasons"""
    return {
        "reasons": PAUSE_REASONS,
        "labels": PAUSE_REASON_LABELS
    }
