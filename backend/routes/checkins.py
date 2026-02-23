"""
Check-in routes - Migrated from server.py
Handles legacy job-level check-ins (not item-level).
"""
from fastapi import APIRouter, HTTPException, Depends, Form
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from database import db
from security import get_current_user, require_role
from models.user import User, UserRole

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ HELPER FUNCTIONS ============

def compress_base64_image(base64_string: str, max_size_kb: int = 300, max_dimension: int = 1200) -> str:
    """Compress a base64-encoded image string."""
    if not base64_string:
        return base64_string
    
    try:
        import base64
        from io import BytesIO
        from PIL import Image
        
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64 to bytes
        image_data = base64.b64decode(base64_string)
        original_size_kb = len(image_data) / 1024
        
        # Skip compression for small images
        if original_size_kb <= max_size_kb:
            return base64_string
        
        img = Image.open(BytesIO(image_data))
        
        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'P', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if image is too large
        if img.width > max_dimension or img.height > max_dimension:
            ratio = min(max_dimension / img.width, max_dimension / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Progressive compression
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
    # This is called after product installation to update benchmarks
    pass  # Implementation kept simple for now


async def register_installed_products_from_checkout(
    checkin_id: str,
    job_id: str,
    installer_id: str,
    installed_m2: Optional[float],
    complexity_level: Optional[int],
    height_category: Optional[str],
    scenario_category: Optional[str],
    duration_minutes: int,
    notes: Optional[str]
):
    """Automatically registers installed products based on checkout data."""
    try:
        from models.product import ProductInstalled
        
        job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            return
        
        products = job.get("products_with_area", [])
        if not products:
            products = job.get("holdprint_data", {}).get("products", [])
        
        item_assignments = job.get("item_assignments", [])
        assigned_items = [a for a in item_assignments if a.get("installer_id") == installer_id]
        
        if not assigned_items and installed_m2 and installed_m2 > 0:
            product_name = f"Instalação - {job.get('title', 'Job')}"
            product_names = [p.get("name", "") for p in products]
            family_id, family_name = await detect_product_family(product_names)
            
            productivity_m2_h = None
            if duration_minutes > 0:
                hours = duration_minutes / 60
                productivity_m2_h = round(installed_m2 / hours, 2)
            
            installed_product = ProductInstalled(
                job_id=job_id,
                checkin_id=checkin_id,
                product_name=product_name,
                family_id=family_id,
                family_name=family_name,
                area_m2=installed_m2,
                complexity_level=complexity_level or 1,
                height_category=height_category or "terreo",
                scenario_category=scenario_category or "loja_rua",
                actual_time_min=duration_minutes,
                productivity_m2_h=productivity_m2_h,
                cause_notes=notes
            )
            
            await db.installed_products.insert_one(installed_product.model_dump())
            await update_productivity_history(installed_product)
            
        else:
            total_assigned_items = len(assigned_items)
            time_per_item = duration_minutes // total_assigned_items if total_assigned_items > 0 else duration_minutes
            
            for assignment in assigned_items:
                item_idx = assignment.get("item_index", 0)
                item_m2 = assignment.get("m2_assigned", 0)
                
                product = products[item_idx] if item_idx < len(products) else {}
                product_name = product.get("name", f"Item {item_idx}")
                width = product.get("width") or product.get("width_m")
                height = product.get("height") or product.get("height_m")
                
                family_id, family_name = await detect_product_family([product_name])
                final_m2 = item_m2 if item_m2 > 0 else (installed_m2 / total_assigned_items if installed_m2 else 0)
                
                productivity_m2_h = None
                if time_per_item > 0 and final_m2 > 0:
                    hours = time_per_item / 60
                    productivity_m2_h = round(final_m2 / hours, 2)
                
                installed_product = ProductInstalled(
                    job_id=job_id,
                    checkin_id=checkin_id,
                    product_name=product_name,
                    family_id=family_id,
                    family_name=family_name,
                    width_m=float(width) if width else None,
                    height_m=float(height) if height else None,
                    area_m2=final_m2,
                    complexity_level=complexity_level or 1,
                    height_category=height_category or "terreo",
                    scenario_category=scenario_category or "loja_rua",
                    actual_time_min=time_per_item,
                    productivity_m2_h=productivity_m2_h,
                    cause_notes=notes
                )
                
                await db.installed_products.insert_one(installed_product.model_dump())
                await update_productivity_history(installed_product)
                
    except Exception as e:
        logger.error(f"Error registering installed products: {e}")


# ============ PYDANTIC MODELS ============

from pydantic import BaseModel, Field, ConfigDict


class CheckIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
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
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None
    installed_m2: Optional[float] = None
    complexity_level: Optional[int] = None
    height_category: Optional[str] = None
    scenario_category: Optional[str] = None
    difficulty_description: Optional[str] = None
    productivity_m2_h: Optional[float] = None
    status: str = "in_progress"


# ============ ROUTES ============

@router.post("/checkins", response_model=CheckIn)
async def create_checkin(
    job_id: str = Form(...),
    photo_base64: str = Form(...),
    gps_lat: float = Form(...),
    gps_long: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Create check-in for a job with photo in Base64 and GPS coordinates"""
    installer = await db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
    if not installer:
        raise HTTPException(status_code=400, detail="User is not an installer")
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    existing = await db.checkins.find_one({
        "job_id": job_id,
        "installer_id": installer['id'],
        "status": "in_progress"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already checked in")
    
    compressed_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
    
    checkin_id = str(uuid.uuid4())
    checkin = CheckIn(
        id=checkin_id,
        job_id=job_id,
        installer_id=installer['id'],
        checkin_photo=compressed_photo,
        gps_lat=gps_lat,
        gps_long=gps_long,
        gps_accuracy=gps_accuracy
    )
    
    checkin_dict = checkin.model_dump()
    checkin_dict['checkin_at'] = checkin_dict['checkin_at'].isoformat()
    if checkin_dict.get('checkout_at'):
        checkin_dict['checkout_at'] = checkin_dict['checkout_at'].isoformat()
    
    await db.checkins.insert_one(checkin_dict)
    
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "in_progress"}}
    )
    
    return checkin


@router.put("/checkins/{checkin_id}/checkout", response_model=CheckIn)
async def checkout(
    checkin_id: str,
    photo_base64: str = Form(...),
    gps_lat: float = Form(...),
    gps_long: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    installed_m2: Optional[float] = Form(None),
    complexity_level: Optional[int] = Form(None),
    height_category: Optional[str] = Form(None),
    scenario_category: Optional[str] = Form(None),
    difficulty_description: Optional[str] = Form(None),
    notes: str = Form(""),
    current_user: User = Depends(get_current_user)
):
    """Check out from a job with photo in Base64, GPS coordinates and productivity metrics"""
    checkin_doc = await db.checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin_doc:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    if checkin_doc['status'] == "completed":
        raise HTTPException(status_code=400, detail="Already checked out")
    
    checkout_at = datetime.now(timezone.utc)
    checkin_at = datetime.fromisoformat(checkin_doc['checkin_at']) if isinstance(checkin_doc['checkin_at'], str) else checkin_doc['checkin_at']
    
    # Calculate duration in minutes with decimal precision
    duration_seconds = (checkout_at - checkin_at).total_seconds()
    duration_minutes = round(duration_seconds / 60, 2)  # Keep decimal precision
    
    productivity_m2_h = None
    if installed_m2 and installed_m2 > 0 and duration_minutes > 0:
        hours = duration_minutes / 60
        productivity_m2_h = round(installed_m2 / hours, 2)
    
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
        "difficulty_description": difficulty_description,
        "productivity_m2_h": productivity_m2_h,
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
    
    job_checkins = await db.checkins.find({"job_id": checkin_doc['job_id']}, {"_id": 0}).to_list(1000)
    all_completed = all(c['status'] == "completed" for c in job_checkins)
    
    if all_completed:
        await db.jobs.update_one(
            {"id": checkin_doc['job_id']},
            {"$set": {"status": "completed"}}
        )
    
    await register_installed_products_from_checkout(
        checkin_id=checkin_id,
        job_id=checkin_doc['job_id'],
        installer_id=checkin_doc['installer_id'],
        installed_m2=installed_m2,
        complexity_level=complexity_level,
        height_category=height_category,
        scenario_category=scenario_category,
        duration_minutes=duration_minutes,
        notes=notes
    )
    
    if isinstance(result['checkin_at'], str):
        result['checkin_at'] = datetime.fromisoformat(result['checkin_at'])
    if result.get('checkout_at') and isinstance(result['checkout_at'], str):
        result['checkout_at'] = datetime.fromisoformat(result['checkout_at'])
    
    return CheckIn(**result)


@router.get("/checkins", response_model=List[CheckIn])
async def list_checkins(job_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """List check-ins"""
    query = {}
    
    if job_id:
        query["job_id"] = job_id
    
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


@router.get("/checkins/{checkin_id}/details")
async def get_checkin_details(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get check-in details with photos and GPS data for managers/admins"""
    if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    checkin = await db.checkins.find_one({"id": checkin_id}, {"_id": 0})
    
    if not checkin:
        checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    installer = await db.installers.find_one({"id": checkin.get('installer_id')}, {"_id": 0})
    if not installer:
        installer = await db.users.find_one({"id": checkin.get('installer_id')}, {"_id": 0, "password_hash": 0})
    
    job = await db.jobs.find_one({"id": checkin.get('job_id')}, {"_id": 0})
    
    return {
        "checkin": checkin,
        "installer": installer or {"full_name": checkin.get('installer_name', 'N/A'), "email": ""},
        "job": job or {"title": checkin.get('job_title', 'N/A'), "client_name": ""}
    }


@router.delete("/checkins/{checkin_id}")
async def delete_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a check-in - Only admin and managers"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    checkin = await db.checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    await db.checkins.delete_one({"id": checkin_id})
    await db.installed_products.delete_many({"checkin_id": checkin_id})
    
    return {"message": "Check-in deleted successfully"}
