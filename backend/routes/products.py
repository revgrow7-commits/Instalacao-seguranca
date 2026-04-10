"""
Products routes - Migrated from server.py
Handles product families, installed products, and productivity metrics.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict
import logging
import uuid

from db_supabase import db
from security import get_current_user, require_role
from models.user import User, UserRole
from config import PRODUCT_FAMILY_MAPPING

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ MODELS ============

class ProductFamily(BaseModel):
    """Product family for categorization."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductFamilyCreate(BaseModel):
    """Create product family request."""
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"


class ProductInstalled(BaseModel):
    """Record of installed product with productivity metrics."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    checkin_id: Optional[str] = None
    product_name: str
    family_id: Optional[str] = None
    family_name: Optional[str] = None
    
    # Measurements
    width_m: Optional[float] = None
    height_m: Optional[float] = None
    quantity: int = 1
    area_m2: Optional[float] = None
    
    # Complexity and context
    complexity_level: int = 1  # 1-5
    height_category: str = "terreo"
    scenario_category: str = "loja_rua"
    
    # Times
    estimated_time_min: Optional[float] = None
    actual_time_min: Optional[float] = None
    
    # Calculated productivity
    productivity_m2_h: Optional[float] = None
    
    # Metadata
    installers_count: int = 1
    installation_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cause_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductInstalledCreate(BaseModel):
    """Create installed product request."""
    job_id: str
    checkin_id: Optional[str] = None
    product_name: str
    family_id: Optional[str] = None
    width_m: Optional[float] = None
    height_m: Optional[float] = None
    quantity: int = 1
    complexity_level: int = 1
    height_category: str = "terreo"
    scenario_category: str = "loja_rua"
    estimated_time_min: Optional[int] = None
    actual_time_min: Optional[int] = None
    installers_count: int = 1
    cause_notes: Optional[str] = None


class ProductivityHistory(BaseModel):
    """Consolidated productivity history for benchmarks."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    family_id: Optional[str] = None
    family_name: Optional[str] = None
    installer_id: Optional[str] = None
    date: Optional[str] = None
    total_m2: float = 0
    total_minutes: float = 0
    items_count: int = 0
    productivity_m2_h: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============ HELPER FUNCTIONS ============

async def update_productivity_history(product_data: dict):
    """Update the productivity history based on new installed product data."""
    family_id = product_data.get("family_id")
    installer_id = product_data.get("installer_id")
    area_m2 = product_data.get("area_m2", 0) or 0
    duration_min = product_data.get("duration_minutes", 0) or 0

    if not family_id or area_m2 <= 0:
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key = {"family_id": family_id, "installer_id": installer_id, "date": today}

    existing = db.productivity_history.find_one(key, {"_id": 0})

    if existing:
        new_m2 = (existing.get("total_m2", 0) or 0) + area_m2
        new_min = (existing.get("total_minutes", 0) or 0) + duration_min
        new_count = (existing.get("items_count", 0) or 0) + 1
        prod = round((new_m2 / (new_min / 60)), 2) if new_min > 0 else 0

        db.productivity_history.update_one(key, {"$set": {
            "total_m2": round(new_m2, 2),
            "total_minutes": round(new_min, 2),
            "items_count": new_count,
            "productivity_m2_h": prod
        }})
    else:
        prod = round((area_m2 / (duration_min / 60)), 2) if duration_min > 0 else 0
        new_history = ProductivityHistory(
            family_id=family_id,
            family_name=product_data.get("family_name", ""),
            installer_id=installer_id,
            date=today,
            total_m2=round(area_m2, 2),
            total_minutes=round(duration_min, 2),
            items_count=1,
            productivity_m2_h=prod
        )
        history_dict = new_history.model_dump()
        history_dict["created_at"] = history_dict["created_at"].isoformat()
        db.productivity_history.insert_one(history_dict)


# ============ PRODUCT FAMILIES ROUTES ============

@router.get("/product-families")
async def get_product_families(current_user: User = Depends(get_current_user)):
    """List all product families."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    families = db.product_families.find({}, {"_id": 0})
    return families


@router.post("/product-families")
async def create_product_family(family: ProductFamilyCreate, current_user: User = Depends(get_current_user)):
    """Create a new product family."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    new_family = ProductFamily(**family.model_dump())
    db.product_families.insert_one(new_family.model_dump())
    return new_family.model_dump()


@router.put("/product-families/{family_id}")
async def update_product_family(family_id: str, family: ProductFamilyCreate, current_user: User = Depends(get_current_user)):
    """Update a product family."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    result = db.product_families.update_one(
        {"id": family_id},
        {"$set": family.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Family not found")
    
    updated = db.product_families.find_one({"id": family_id}, {"_id": 0})
    return updated


@router.delete("/product-families/{family_id}")
async def delete_product_family(family_id: str, current_user: User = Depends(get_current_user)):
    """Delete a product family."""
    require_role(current_user, [UserRole.ADMIN])
    
    result = db.product_families.delete_one({"id": family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Family not found")
    return {"message": "Family deleted"}


@router.post("/product-families/seed")
async def seed_product_families(current_user: User = Depends(get_current_user)):
    """Seed initial product families from Holdprint catalog."""
    require_role(current_user, [UserRole.ADMIN])
    
    # Default families based on Holdprint catalog
    default_families = [
        {"name": "Adesivos", "description": "Adesivos impressos, coloridos, jateados, etc.", "color": "#EF4444"},
        {"name": "Lonas e Banners", "description": "Lonas frontlight, backlight, banners", "color": "#F97316"},
        {"name": "Chapas e Placas", "description": "ACM, acrílico, PVC, PS, MDF com ou sem impressão", "color": "#EAB308"},
        {"name": "Estruturas Metálicas", "description": "Estruturas com lona, ACM ou chapa galvanizada", "color": "#22C55E"},
        {"name": "Tecidos", "description": "Bandeiras, faixas, wind banners em tecido", "color": "#14B8A6"},
        {"name": "Letras Caixa", "description": "Letras planas, em relevo, iluminadas", "color": "#3B82F6"},
        {"name": "Totens", "description": "Totens em diversos materiais e formatos", "color": "#8B5CF6"},
        {"name": "Envelopamento", "description": "Envelopamento de veículos", "color": "#EC4899"},
        {"name": "Painéis Luminosos", "description": "Backlight, painéis com iluminação", "color": "#F59E0B"},
        {"name": "Serviços", "description": "Instalação, entrega, montagem, pintura", "color": "#6B7280"},
        {"name": "Materiais Promocionais", "description": "Cartazes, flyers, folders, panfletos", "color": "#84CC16"},
        {"name": "Produtos Terceirizados", "description": "Produtos de terceiros", "color": "#A855F7"},
    ]
    
    inserted = 0
    for family_data in default_families:
        existing = db.product_families.find_one({"name": family_data["name"]})
        if not existing:
            new_family = ProductFamily(**family_data)
            db.product_families.insert_one(new_family.model_dump())
            inserted += 1
    
    return {"message": f"{inserted} families created", "total": len(default_families)}


# ============ PRODUCTS INSTALLED ROUTES ============

@router.get("/products-installed")
async def get_products_installed(
    job_id: Optional[str] = None,
    family_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List installed products with optional filters."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    query = {}
    if job_id:
        query["job_id"] = job_id
    if family_id:
        query["family_id"] = family_id
    
    products = db.installed_products.find(query, {"_id": 0})
    return products


@router.post("/products-installed")
async def create_product_installed(product: ProductInstalledCreate, current_user: User = Depends(get_current_user)):
    """Register a new installed product with productivity metrics."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTALLER])
    
    # Calculate area
    area_m2 = None
    if product.width_m and product.height_m:
        area_m2 = product.width_m * product.height_m * product.quantity
    
    # Calculate productivity (m²/hour)
    productivity_m2_h = None
    if area_m2 and product.actual_time_min and product.actual_time_min > 0:
        hours = product.actual_time_min / 60
        productivity_m2_h = round(area_m2 / hours, 2)
    
    # Get family name if family_id provided
    family_name = None
    if product.family_id:
        family = db.product_families.find_one({"id": product.family_id}, {"_id": 0})
        if family:
            family_name = family.get("name")
    
    new_product = ProductInstalled(
        **product.model_dump(),
        area_m2=area_m2,
        productivity_m2_h=productivity_m2_h,
        family_name=family_name
    )
    
    product_dict = new_product.model_dump()
    # Map model fields to DB column names
    product_dict["duration_minutes"] = product_dict.pop("actual_time_min", None)
    db.installed_products.insert_one(product_dict)

    # Update productivity history
    await update_productivity_history({
        "family_id": new_product.family_id,
        "family_name": family_name,
        "area_m2": area_m2,
        "duration_minutes": new_product.actual_time_min
    })
    
    return new_product.model_dump()


# ============ PRODUCTIVITY ROUTES ============

@router.get("/productivity-history")
async def get_productivity_history(
    family_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get productivity benchmarks."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    query = {}
    if family_id:
        query["family_id"] = family_id
    
    history = db.productivity_history.find(query, {"_id": 0})
    return history


@router.get("/productivity-metrics")
async def get_productivity_metrics(current_user: User = Depends(get_current_user)):
    """Get comprehensive productivity metrics."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Get all product families
    families = db.product_families.find({}, {"_id": 0})
    
    # Get all products installed
    products = db.installed_products.find({}, {"_id": 0})
    
    # Get productivity history
    history = db.productivity_history.find({}, {"_id": 0})
    
    # Calculate metrics by family
    family_metrics = {}
    for family in families:
        family_products = [p for p in products if p.get("family_id") == family["id"]]
        
        total_area = sum(p.get("area_m2", 0) or 0 for p in family_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in family_products)
        total_products = len(family_products)
        
        avg_productivity = 0
        if total_time > 0:
            avg_productivity = round((total_area / (total_time / 60)), 2) if total_area > 0 else 0
        
        family_metrics[family["name"]] = {
            "family_id": family["id"],
            "color": family.get("color", "#3B82F6"),
            "total_products": total_products,
            "total_area_m2": round(total_area, 2),
            "total_time_hours": round(total_time / 60, 2),
            "avg_productivity_m2_h": avg_productivity,
            "avg_time_per_m2_min": round(60 / avg_productivity, 2) if avg_productivity > 0 else 0
        }
    
    # Calculate overall metrics
    total_area_all = sum(p.get("area_m2", 0) or 0 for p in products)
    total_time_all = sum(p.get("actual_time_min", 0) or 0 for p in products)
    overall_productivity = round((total_area_all / (total_time_all / 60)), 2) if total_time_all > 0 and total_area_all > 0 else 0
    
    # Metrics by complexity
    complexity_metrics = {}
    for level in [1, 2, 3, 4, 5]:
        level_products = [p for p in products if p.get("complexity_level") == level]
        total_area = sum(p.get("area_m2", 0) or 0 for p in level_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in level_products)
        
        complexity_metrics[f"level_{level}"] = {
            "total_products": len(level_products),
            "total_area_m2": round(total_area, 2),
            "avg_productivity_m2_h": round((total_area / (total_time / 60)), 2) if total_time > 0 and total_area > 0 else 0
        }
    
    # Metrics by height category
    height_metrics = {}
    for category in ["terreo", "media", "alta", "muito_alta"]:
        cat_products = [p for p in products if p.get("height_category") == category]
        total_area = sum(p.get("area_m2", 0) or 0 for p in cat_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in cat_products)
        
        height_metrics[category] = {
            "total_products": len(cat_products),
            "total_area_m2": round(total_area, 2),
            "avg_productivity_m2_h": round((total_area / (total_time / 60)), 2) if total_time > 0 and total_area > 0 else 0
        }
    
    # Metrics by scenario
    scenario_metrics = {}
    for scenario in ["loja_rua", "shopping", "evento", "fachada", "outdoor", "veiculo"]:
        scen_products = [p for p in products if p.get("scenario_category") == scenario]
        total_area = sum(p.get("area_m2", 0) or 0 for p in scen_products)
        total_time = sum(p.get("actual_time_min", 0) or 0 for p in scen_products)
        
        scenario_metrics[scenario] = {
            "total_products": len(scen_products),
            "total_area_m2": round(total_area, 2),
            "avg_productivity_m2_h": round((total_area / (total_time / 60)), 2) if total_time > 0 and total_area > 0 else 0
        }
    
    return {
        "overall": {
            "total_products": len(products),
            "total_area_m2": round(total_area_all, 2),
            "total_time_hours": round(total_time_all / 60, 2),
            "avg_productivity_m2_h": overall_productivity
        },
        "by_family": family_metrics,
        "by_complexity": complexity_metrics,
        "by_height": height_metrics,
        "by_scenario": scenario_metrics,
        "benchmarks": history
    }
