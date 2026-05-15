"""
Item Check-in routes - Migrated from server.py
Handles per-item check-ins for installers (modern flow).
"""
from fastapi import APIRouter, HTTPException, Depends, Form
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from db_supabase import db, upload_photo_to_storage
from security import get_current_user, require_role
from models.user import User, UserRole
from config import MAX_CHECKOUT_DISTANCE_METERS
from services.gps import calculate_gps_distance


router = APIRouter()
logger = logging.getLogger(__name__)

# Pause reason labels
# FIX B2 (auditoria 2026-05-14): sincronizado com frontend (InstallerJobDetail.jsx).
# Os valores legados (almoço/banheiro/etc) foram migrados para o conjunto operacional
# atual usado em campo. Para retro-compatibilidade com pause_logs antigos,
# o map LEGACY_PAUSE_REASON_LABELS mantém os labels históricos.
PAUSE_REASONS = [
    "aguardando_cliente",
    "chuva",
    "falta_material",
    "almoco_intervalo",
    "problema_acesso",
    "problema_equipamento",
    "aguardando_aprovacao",
    "outro",
]

PAUSE_REASON_LABELS = {
    "aguardando_cliente": "Aguardando Cliente",
    "chuva": "Chuva/Intempérie",
    "falta_material": "Falta de Material",
    "almoco_intervalo": "Almoço/Intervalo",
    "problema_acesso": "Problema de Acesso",
    "problema_equipamento": "Problema com Equipamento",
    "aguardando_aprovacao": "Aguardando Aprovação",
    "outro": "Outro Motivo",
}

# Mantém labels históricos para registros antigos no banco — relatórios
# de pausas anteriores à migração continuam legíveis.
LEGACY_PAUSE_REASON_LABELS = {
    "almoço": "Almoço/Refeição",
    "banheiro": "Banheiro",
    "esperando_material": "Esperando Material",
    "problema_tecnico": "Problema Técnico",
    "atendimento_cliente": "Atendimento ao Cliente",
    "deslocamento": "Deslocamento entre pontos",
}

# União usada apenas para resolver labels de leitura (relatórios). Não use
# este map para validação de entrada — novos motivos devem usar PAUSE_REASONS.
_ALL_PAUSE_REASON_LABELS = {**LEGACY_PAUSE_REASON_LABELS, **PAUSE_REASON_LABELS}


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


async def detect_product_family(product_names: list) -> tuple:
    """Detects the product family based on product names."""
    families = db.product_families.find({}, {"_id": 0})
    
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


async def update_productivity_history(product_data: dict):
    """Update productivity history aggregates - delegates to products module."""
    from routes.products import update_productivity_history as _update
    await _update(product_data)


def _resolve_job_id_for_checkin(checkin: dict) -> str:
    """Garante job_id não-nulo. Lança 400 com mensagem descritiva se impossível."""
    job_id = checkin.get("job_id")
    if job_id:
        return job_id
    raise HTTPException(
        status_code=400,
        detail=f"item_checkin {checkin.get('id')} sem job_id — não é possível registrar pausa",
    )


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
    duration_minutes: Optional[float] = None
    net_duration_minutes: Optional[float] = None
    total_pause_minutes: Optional[float] = None
    productivity_m2_h: Optional[float] = None
    status: str = "in_progress"


class ItemPauseLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    checkin_id: str
    job_id: str
    item_index: int
    installer_id: str
    reason: str
    paused_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resumed_at: Optional[datetime] = None
    duration_minutes: Optional[float] = None
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
    
    installer = db.installers.find_one({"user_id": current_user.id}, {"_id": 0})
    if not installer:
        raise HTTPException(status_code=404, detail="Installer not found")
    
    job = db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check if installer is assigned (check both installer.id and user.id for legacy compat)
    job_assigned_installers = job.get("assigned_installers", [])
    item_assignments = job.get("item_assignments", [])
    installer_id = installer["id"]
    user_id = current_user.id

    item_assigned = False
    for assignment in item_assignments:
        if assignment.get("item_index") == item_index:
            if assignment.get("installer_id") in [installer_id, user_id]:
                item_assigned = True
                break
            if installer_id in assignment.get("installer_ids", []) or user_id in assignment.get("installer_ids", []):
                item_assigned = True
                break

    is_job_assigned = installer_id in job_assigned_installers or user_id in job_assigned_installers
    if not item_assigned and not is_job_assigned:
        raise HTTPException(status_code=403, detail="Você não está atribuído a este item")
    
    products = job.get("products_with_area", [])
    if not products:
        products = job.get("items", [])

    if not products or item_index >= len(products) or item_index < 0:
        raise HTTPException(status_code=400, detail=f"Item inválido. O job tem {len(products)} itens.")

    # FIX M9 / B1 (auditoria 2026-05-14): bloqueia check-in em item arquivado.
    # Defesa em profundidade — o frontend já filtra arquivados, mas evita que
    # uma regressão (ou cliente alterado) grave dados no item errado.
    archived_indices = {a.get("item_index") for a in job.get("archived_items", []) if a.get("item_index") is not None}
    if item_index in archived_indices:
        raise HTTPException(
            status_code=400,
            detail="Este item foi arquivado e não aceita novos check-ins. Contate o gerente para desarquivar.",
        )

    product = products[item_index]
    
    # FIX C4 (auditoria 2026-05-14): idempotência — se já existe checkin
    # in_progress para este item+instalador, retornamos o existente em vez
    # de 400. Cenário comum em campo: instalador faz check-in, perde sinal
    # antes da resposta voltar, e tenta de novo. Antes: erro confuso "Item
    # already has an active check-in" e o instalador acha que falhou.
    # Agora: o segundo POST confirma o checkin já gravado.
    existing = db.item_checkins.find_one({
        "job_id": job_id,
        "item_index": item_index,
        "installer_id": installer["id"],
        "status": "in_progress"
    })
    if existing:
        # Verifica se o check-in é recente (últimos 5 min) — se for, trata
        # como retry idempotente. Se for antigo, sinaliza que está pendente.
        try:
            existing_at_raw = existing.get("checkin_at")
            if isinstance(existing_at_raw, str):
                existing_at = datetime.fromisoformat(existing_at_raw.replace('Z', '+00:00'))
            elif isinstance(existing_at_raw, datetime):
                existing_at = existing_at_raw
            else:
                existing_at = None

            if existing_at:
                if existing_at.tzinfo is None:
                    existing_at = existing_at.replace(tzinfo=timezone.utc)
                age_seconds = (datetime.now(timezone.utc) - existing_at).total_seconds()
                if age_seconds < 300:  # 5 minutos
                    logger.info(
                        f"Checkin idempotente: retornando existing {existing['id']} "
                        f"(criado há {int(age_seconds)}s) para item {item_index}"
                    )
                    return existing
        except Exception as _e:
            logger.warning(f"Falha ao parsear checkin_at de existing checkin: {_e}")

        raise HTTPException(
            status_code=409,
            detail=(
                "Já existe um check-in em andamento para este item. "
                "Faça o checkout antes de iniciar um novo check-in."
            ),
        )
    
    family_id, family_name = await detect_product_family([product.get("name", "")])
    
    compressed_photo = None
    photo_url = None
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

    if compressed_photo:
        photo_url = upload_photo_to_storage(
            compressed_photo, f"item-checkins/{item_checkin.id}_checkin.jpg"
        )

    checkin_dict = item_checkin.model_dump()
    checkin_dict['checkin_at'] = checkin_dict['checkin_at'].isoformat()
    if photo_url:
        checkin_dict['checkin_photo_url'] = photo_url
    db.item_checkins.insert_one(checkin_dict)
    
    checkin_dict.pop('_id', None)
    checkin_dict.pop('checkin_photo', None)
    checkin_dict.pop('checkout_photo', None)

    db.jobs.update_one({"id": job_id}, {"$set": {"status": "instalando"}})

    return checkin_dict


@router.get("/item-checkins")
async def get_item_checkins(
    job_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Get item check-ins for a job - optimized"""
    query = {}
    
    if current_user.role == UserRole.INSTALLER:
        installer = db.installers.find_one({"user_id": current_user.id}, {"_id": 0, "id": 1})
        if installer:
            query["installer_id"] = installer["id"]
    
    if job_id:
        query["job_id"] = job_id
    
    # Exclui fotos pesadas da listagem
    projection = {
        "_id": 0,
        "checkin_photo": 0,
        "checkout_photo": 0
    }
    
    checkins = db.item_checkins.find(query, projection, sort=[("checkin_at", -1)])
    
    for c in checkins:
        if isinstance(c.get('checkin_at'), str):
            c['checkin_at'] = datetime.fromisoformat(c['checkin_at'])
        if c.get('checkout_at') and isinstance(c['checkout_at'], str):
            c['checkout_at'] = datetime.fromisoformat(c['checkout_at'])
    
    return checkins


@router.get("/item-checkins/all")
async def get_all_item_checkins(
    limit: int = 500,
    offset: int = 0,
    current_user: User = Depends(get_current_user)
):
    """Get all item check-ins for reports (Admin/Manager only) - paginated"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])

    # Projeção otimizada - exclui fotos base64 pesadas
    projection = {
        "_id": 0,
        "checkin_photo": 0,
        "checkout_photo": 0
    }

    checkins = db.item_checkins.find({}, projection, sort=[("checkin_at", -1)], skip=offset, limit=limit)
    
    # Busca jobs e installers em paralelo com projeção mínima
    jobs_list = db.jobs.find({}, {"_id": 0, "id": 1, "title": 1, "client_name": 1})
    installers_list = db.installers.find({}, {"_id": 0, "id": 1, "full_name": 1})
    
    jobs = jobs_list
    installers = installers_list
    
    jobs_map = {job["id"]: job for job in jobs}
    installers_map = {inst["id"]: inst for inst in installers}
    
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
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Checkout request for checkin {checkin_id} by user {current_user.email} (role: {current_user.role})")
    
    if current_user.role != UserRole.INSTALLER:
        logger.error(f"User {current_user.email} is not an installer (role: {current_user.role})")
        raise HTTPException(status_code=403, detail="Only installers can complete item checkouts")
    
    checkin = db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        logger.error(f"Checkin {checkin_id} not found")
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    logger.info(f"Checkin status: {checkin.get('status')}, installed_m2: {installed_m2}")
    
    if checkin["status"] == "completed":
        logger.error(f"Checkin {checkin_id} already completed")
        raise HTTPException(status_code=400, detail="Item already checked out")

    # FIX M9 (relaxado para produção): se o item foi arquivado APÓS o check-in,
    # NÃO bloqueia o checkout — apenas loga warning. Bloquear deixaria o
    # instalador em campo sem poder concluir o trabalho que já executou.
    # O bloqueio só vale para NOVOS check-ins (create_item_checkin acima).
    _job_for_archive_check = db.jobs.find_one({"id": checkin.get("job_id")}, {"_id": 0})
    if _job_for_archive_check:
        _archived = {a.get("item_index") for a in _job_for_archive_check.get("archived_items", []) if a.get("item_index") is not None}
        if checkin.get("item_index") in _archived:
            logger.warning(
                f"Checkout permitido em item arquivado (item foi arquivado durante o check-in): "
                f"checkin={checkin_id} item_index={checkin.get('item_index')} "
                f"installer={checkin.get('installer_id')}"
            )
            # Continua normalmente — não bloqueia o instalador.

    # GPS Distance Validation
    location_alert = None
    auto_paused = False
    distance_meters = 0
    
    checkin_lat = checkin.get("gps_lat")
    checkin_long = checkin.get("gps_long")
    
    if all(v is not None for v in [checkin_lat, checkin_long, gps_lat, gps_long]):
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
            db.location_alerts.insert_one(location_log)
            
            if checkin["status"] != "paused":
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
        active_pause = db.item_pause_logs.find_one({
            "checkin_id": checkin_id,
            "resumed_at": None
        }, {"_id": 0})
        if active_pause:
            end_time = datetime.now(timezone.utc)
            paused_at = active_pause['paused_at']
            if isinstance(paused_at, str):
                paused_at = datetime.fromisoformat(paused_at.replace('Z', '+00:00'))
            if paused_at.tzinfo is None:
                paused_at = paused_at.replace(tzinfo=timezone.utc)
            pause_duration = round((end_time - paused_at).total_seconds() / 60, 2)
            db.item_pause_logs.update_one(
                {"id": active_pause["id"]},
                {"$set": {"resumed_at": end_time.isoformat(), "duration_minutes": pause_duration}}
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

    pause_logs = db.item_pause_logs.find({"checkin_id": checkin_id}, {"_id": 0})
    total_pause_minutes = sum(p.get("duration_minutes", 0) or 0 for p in pause_logs)
    
    net_duration_minutes = round(max(0, duration_minutes - total_pause_minutes), 2)
    
    productivity_m2_h = None
    if installed_m2 and installed_m2 > 0 and net_duration_minutes > 0:
        hours = net_duration_minutes / 60
        productivity_m2_h = round(installed_m2 / hours, 2)
    
    compressed_checkout_photo = None
    checkout_photo_url = None
    if photo_base64:
        compressed_checkout_photo = compress_base64_image(photo_base64, max_size_kb=300, max_dimension=1200)
        checkout_photo_url = upload_photo_to_storage(
            compressed_checkout_photo, f"item-checkins/{checkin_id}_checkout.jpg"
        )

    update_data = {
        "checkout_at": checkout_at.isoformat(),
        "checkout_photo": compressed_checkout_photo,
        **({"checkout_photo_url": checkout_photo_url} if checkout_photo_url else {}),
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
    
    db.item_checkins.update_one({"id": checkin_id}, {"$set": update_data})
    
    # Register installed product
    job = db.jobs.find_one({"id": checkin["job_id"]}, {"_id": 0})
    if job:
        products = job.get("products_with_area", [])
        product = products[checkin["item_index"]] if checkin["item_index"] < len(products) else {}
        
        family_id, family_name = await detect_product_family([product.get("name", "")])
        
        installed_product_dict = {
            "id": str(uuid.uuid4()),
            "job_id": checkin["job_id"],
            "checkin_id": checkin_id,
            "installer_id": checkin.get("installer_id"),
            "product_name": product.get("name", f"Item {checkin['item_index']}"),
            "family_id": family_id,
            "family_name": family_name,
            "width_m": product.get("width"),
            "height_m": product.get("height"),
            "quantity": product.get("quantity", 1),
            "area_m2": installed_m2 or product.get("total_area_m2", 0),
            "complexity_level": complexity_level or 1,
            "height_category": height_category or "terreo",
            "scenario_category": scenario_category or "loja_rua",
            "duration_minutes": net_duration_minutes,
            "productivity_m2_h": productivity_m2_h,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        try:
            db.installed_products.insert_one(installed_product_dict)
            await update_productivity_history(installed_product_dict)
        except Exception as _e:
            logger.warning(f"installed_products insert skipped (schema drift?): {_e}")
    
    # Check job completion
    job = db.jobs.find_one({"id": checkin["job_id"]}, {"_id": 0})
    job_checkins = db.item_checkins.find({"job_id": checkin["job_id"]}, {"_id": 0})
    
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
        db.jobs.update_one({"id": checkin["job_id"]}, {"$set": {"status": "finalizado"}})
    
    # Return result
    result = db.item_checkins.find_one({"id": checkin_id}, {"_id": 0, "checkin_photo": 0, "checkout_photo": 0})
    
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
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    checkin = db.item_checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    db.item_checkins.delete_one({"id": checkin_id})
    db.installed_products.delete_many({"checkin_id": checkin_id})
    
    return {"message": "Item check-in deleted successfully"}


@router.put("/item-checkins/{checkin_id}/archive")
async def archive_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Archive an item check-in - Only admin and managers"""
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    checkin = db.item_checkins.find_one({"id": checkin_id})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"is_archived": True}}
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
    
    checkin = db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
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

    # FIX B2 (auditoria 2026-05-14): aceita motivos atuais (PAUSE_REASONS) OU
    # legados (LEGACY_PAUSE_REASON_LABELS) para retro-compatibilidade com PWA
    # em cache antigo. Valores totalmente desconhecidos retornam 422 — evita
    # gravar lixo no banco silenciosamente.
    _all_valid = set(PAUSE_REASONS) | set(LEGACY_PAUSE_REASON_LABELS.keys())
    if reason not in _all_valid:
        raise HTTPException(
            status_code=422,
            detail=f"Motivo de pausa inválido: {reason}",
        )

    job_id = _resolve_job_id_for_checkin(checkin)
    pause_log = ItemPauseLog(
        checkin_id=checkin_id,
        job_id=job_id,
        item_index=checkin["item_index"],
        installer_id=checkin["installer_id"],
        reason=reason,
    )

    pause_dict = pause_log.model_dump()
    pause_dict['paused_at'] = pause_dict['paused_at'].isoformat()
    db.item_pause_logs.insert_one(pause_dict)

    db.item_checkins.update_one(
        {"id": checkin_id},
        {"$set": {"status": "paused"}}
    )

    return {
        "message": "Item paused successfully",
        "pause_id": pause_log.id,
        "reason": reason,
        "paused_at": pause_dict['paused_at']
    }


@router.post("/item-checkins/{checkin_id}/resume")
async def resume_item_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Resume a paused item checkin"""
    if current_user.role != UserRole.INSTALLER:
        raise HTTPException(status_code=403, detail="Only installers can resume item checkouts")
    
    checkin = db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Item check-in not found")
    
    if checkin["status"] != "paused":
        raise HTTPException(status_code=400, detail="Item is not paused")
    
    active_pause = db.item_pause_logs.find_one({
        "checkin_id": checkin_id,
        "resumed_at": None
    }, {"_id": 0})

    if not active_pause:
        raise HTTPException(status_code=400, detail="No active pause found")

    end_time = datetime.now(timezone.utc)
    paused_at = active_pause['paused_at']
    if isinstance(paused_at, str):
        paused_at = datetime.fromisoformat(paused_at.replace('Z', '+00:00'))
    if paused_at.tzinfo is None:
        paused_at = paused_at.replace(tzinfo=timezone.utc)

    pause_duration = round((end_time - paused_at).total_seconds() / 60, 2)

    db.item_pause_logs.update_one(
        {"id": active_pause["id"]},
        {"$set": {"resumed_at": end_time.isoformat(), "duration_minutes": pause_duration}}
    )

    db.item_checkins.update_one(
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
    pause_logs = db.item_pause_logs.find(
        {"checkin_id": checkin_id},
        {"_id": 0}
    )

    # FIX B2 (auditoria 2026-05-14): usa o map union para resolver labels -
    # cobre tanto motivos atuais quanto legados gravados antes da unificacao.
    for log in pause_logs:
        reason = log.get("reason")
        log["reason_label"] = _ALL_PAUSE_REASON_LABELS.get(reason, reason)

    total_pause_minutes = sum(
        p.get("duration_minutes", 0) or 0 for p in pause_logs if p.get("duration_minutes")
    )
    active_pause = next((p for p in pause_logs if p.get("resumed_at") is None), None)

    return {
        "pauses": pause_logs,
        "total_pause_minutes": total_pause_minutes,
        "has_active_pause": active_pause is not None,
        "active_pause": active_pause,
    }


@router.get("/pause-reasons")
async def get_pause_reasons():
    """Get list of valid pause reasons"""
    return {
        "reasons": PAUSE_REASONS,
        "labels": PAUSE_REASON_LABELS,
    }
