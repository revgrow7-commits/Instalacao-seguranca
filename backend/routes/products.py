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
    if result.get('modified_count', 0) == 0:
        raise HTTPException(status_code=404, detail="Family not found")
    
    updated = db.product_families.find_one({"id": family_id}, {"_id": 0})
    return updated


@router.delete("/product-families/{family_id}")
async def delete_product_family(family_id: str, current_user: User = Depends(get_current_user)):
    """Delete a product family."""
    require_role(current_user, [UserRole.ADMIN])
    
    result = db.product_families.delete_one({"id": family_id})
    if result.get('deleted_count', 0) == 0:
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
    """Métricas de produtividade — agora derivadas de item_checkins + jobs (mesma
    fonte de /reports/kpis), reusando os helpers do reports.py. Antes lia
    installed_products: agrupava por family_id histórico (classificador antigo),
    somava area_m2 cheio por linha (dupla contagem em itens multi-instalador) e
    NÃO excluía check-ins arquivados/jobs fora de métrica."""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    # Import local evita qualquer ciclo no carregamento dos routers.
    from routes.reports import (
        _participant_index, _item_family, _checkin_area_share,
        _exif_duration_min, _metrics_excluded,
    )

    families = db.product_families.find({}, {"_id": 0})
    history = db.productivity_history.find({}, {"_id": 0})

    jobs = db.jobs.find({}, {"_id": 0})
    jobs_map = {j["id"]: j for j in jobs if not _metrics_excluded(j)}
    checkins = [
        c for c in db.item_checkins.find(
            {"status": "completed", "is_archived": {"$ne": True}},
            {"_id": 0, "checkin_photo": 0, "checkout_photo": 0})
        if c.get("job_id") in jobs_map
    ]
    participants = _participant_index(checkins)

    fam_acc, comp_acc, height_acc, scen_acc = {}, {}, {}, {}
    total_area_all = 0.0
    total_time_all = 0.0

    def _acc(bucket, key, area, tmin):
        d = bucket.setdefault(key, {"area": 0.0, "time": 0.0, "count": 0})
        d["area"] += area
        d["time"] += tmin
        d["count"] += 1

    for c in checkins:
        job = jobs_map.get(c.get("job_id"))
        idx = c.get("item_index", 0)
        area = _checkin_area_share(c, job, participants)  # m² dividido p/ participantes
        tmin = _exif_duration_min(c) or 0                  # duração só pelo EXIF
        total_area_all += area
        total_time_all += tmin
        _acc(fam_acc, _item_family(job, idx, c), area, tmin)
        if c.get("complexity_level") is not None:
            _acc(comp_acc, c.get("complexity_level"), area, tmin)
        if c.get("height_category"):
            _acc(height_acc, c.get("height_category"), area, tmin)
        if c.get("scenario_category"):
            _acc(scen_acc, c.get("scenario_category"), area, tmin)

    def _prod(area, time_min):
        return round(area / (time_min / 60), 2) if time_min > 0 and area > 0 else 0

    fam_color = {f["name"]: f.get("color", "#3B82F6") for f in families}
    fam_id_by_name = {f["name"]: f["id"] for f in families}
    family_metrics = {}
    for name, d in fam_acc.items():
        p = _prod(d["area"], d["time"])
        family_metrics[name] = {
            "family_id": fam_id_by_name.get(name),
            "color": fam_color.get(name, "#3B82F6"),
            "total_products": d["count"],
            "total_area_m2": round(d["area"], 2),
            "total_time_hours": round(d["time"] / 60, 2),
            "avg_productivity_m2_h": p,
            "avg_time_per_m2_min": round(60 / p, 2) if p > 0 else 0,
        }

    complexity_metrics = {}
    for level in [1, 2, 3, 4, 5]:
        d = comp_acc.get(level, {"area": 0.0, "time": 0.0, "count": 0})
        complexity_metrics[f"level_{level}"] = {
            "total_products": d["count"], "total_area_m2": round(d["area"], 2),
            "avg_productivity_m2_h": _prod(d["area"], d["time"]),
        }

    height_metrics = {}
    for category in ["terreo", "media", "alta", "muito_alta"]:
        d = height_acc.get(category, {"area": 0.0, "time": 0.0, "count": 0})
        height_metrics[category] = {
            "total_products": d["count"], "total_area_m2": round(d["area"], 2),
            "avg_productivity_m2_h": _prod(d["area"], d["time"]),
        }

    scenario_metrics = {}
    for scenario in ["loja_rua", "shopping", "evento", "fachada", "outdoor", "veiculo"]:
        d = scen_acc.get(scenario, {"area": 0.0, "time": 0.0, "count": 0})
        scenario_metrics[scenario] = {
            "total_products": d["count"], "total_area_m2": round(d["area"], 2),
            "avg_productivity_m2_h": _prod(d["area"], d["time"]),
        }

    return {
        "overall": {
            "total_products": len(checkins),
            "total_area_m2": round(total_area_all, 2),
            "total_time_hours": round(total_time_all / 60, 2),
            "avg_productivity_m2_h": _prod(total_area_all, total_time_all),
        },
        "by_family": family_metrics,
        "by_complexity": complexity_metrics,
        "by_height": height_metrics,
        "by_scenario": scenario_metrics,
        "benchmarks": history,
    }
