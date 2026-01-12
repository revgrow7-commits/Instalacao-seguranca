"""
Gamification routes - Full implementation migrated from server.py.
"""
from fastapi import APIRouter, HTTPException, Depends, Form, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from database import db
from security import get_current_user, require_role
from models.user import User, UserRole

router = APIRouter()

# ============ COIN LEVELS & CONSTANTS ============
BASE_COINS_PER_M2 = 10

LEVEL_TIERS = {
    "bronze": {"min": 0, "max": 500, "name": "Bronze", "icon": "🥉"},
    "prata": {"min": 501, "max": 2000, "name": "Prata", "icon": "🥈"},
    "ouro": {"min": 2001, "max": 5000, "name": "Ouro", "icon": "🥇"},
    "faixa_preta": {"min": 5001, "max": float('inf'), "name": "Faixa Preta", "icon": "🥋"}
}


# ============ PYDANTIC MODELS ============
from pydantic import BaseModel, Field, ConfigDict


class GamificationBalance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    total_coins: int = 0
    lifetime_coins: int = 0
    daily_engagement_date: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CoinTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: int
    transaction_type: str
    description: str
    reference_id: Optional[str] = None
    breakdown: Optional[dict] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Reward(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    cost_coins: int
    category: str
    image_url: Optional[str] = None
    stock: Optional[int] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RewardRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    reward_id: str
    reward_name: str
    cost_coins: int
    status: str = "pending"
    notes: Optional[str] = None
    processed_at: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============ HELPER FUNCTIONS ============
def get_level_from_coins(lifetime_coins: int) -> dict:
    """Determine user level based on lifetime coins"""
    for level_key, level_data in LEVEL_TIERS.items():
        if level_data["min"] <= lifetime_coins <= level_data["max"]:
            # Calculate progress to next level
            if level_key == "faixa_preta":
                progress = 100
                coins_to_next = 0
            else:
                levels = list(LEVEL_TIERS.keys())
                next_idx = levels.index(level_key) + 1
                next_min = LEVEL_TIERS[levels[next_idx]]["min"]
                progress = int(((lifetime_coins - level_data["min"]) / (next_min - level_data["min"])) * 100)
                coins_to_next = next_min - lifetime_coins
            
            return {
                "level": level_key,
                "name": level_data["name"],
                "icon": level_data["icon"],
                "progress": progress,
                "next_level": levels[levels.index(level_key) + 1] if level_key != "faixa_preta" else None,
                "coins_to_next": coins_to_next
            }
    return {"level": "bronze", "name": "Bronze", "icon": "🥉", "progress": 0, "next_level": "prata", "coins_to_next": 500}


async def calculate_checkout_coins(checkin_data: dict, job_data: dict) -> dict:
    """
    Calculate coins earned from a checkout based on triggers:
    1. Check-in no Prazo (50%): Se check-in <= horário agendado
    2. Check-out com Evidências (20%): Se foto de checkout foi enviada
    3. Engajamento na Agenda (10%): Bônus diário ao acessar o app
    4. Produtividade Base (20%): Por conclusão do item em m²
    
    Conversion: 1 m² with 100% approval = 10 coins
    """
    installed_m2 = checkin_data.get("installed_m2", 0) or 0
    if installed_m2 <= 0:
        return {"total_coins": 0, "breakdown": {}, "base_coins": 0}
    
    # Base coins from m² (this is 100% if all triggers are met)
    base_coins = int(installed_m2 * BASE_COINS_PER_M2)
    
    breakdown = {
        "checkin_on_time": {"earned": 0, "max": 0, "achieved": False, "description": "Check-in no prazo"},
        "checkout_evidence": {"earned": 0, "max": 0, "achieved": False, "description": "Foto no checkout"},
        "daily_engagement": {"earned": 0, "max": 0, "achieved": False, "description": "Engajamento diário"},
        "base_productivity": {"earned": 0, "max": 0, "achieved": False, "description": "Produtividade base"}
    }
    
    breakdown["checkin_on_time"]["max"] = int(base_coins * 0.50)
    breakdown["checkout_evidence"]["max"] = int(base_coins * 0.20)
    breakdown["daily_engagement"]["max"] = int(base_coins * 0.10)
    breakdown["base_productivity"]["max"] = int(base_coins * 0.20)
    
    # 1. Check-in on time (50%)
    checkin_at = checkin_data.get("checkin_at")
    scheduled_date = job_data.get("scheduled_date")
    if checkin_at and scheduled_date:
        if isinstance(checkin_at, str):
            checkin_at = datetime.fromisoformat(checkin_at.replace('Z', '+00:00'))
        if isinstance(scheduled_date, str):
            scheduled_date = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
        
        # Consider on-time if within 30 minutes of scheduled
        time_diff = (checkin_at - scheduled_date).total_seconds() / 60
        if time_diff <= 30:
            breakdown["checkin_on_time"]["earned"] = breakdown["checkin_on_time"]["max"]
            breakdown["checkin_on_time"]["achieved"] = True
    
    # 2. Checkout with evidence (20%)
    if checkin_data.get("checkout_photo"):
        breakdown["checkout_evidence"]["earned"] = breakdown["checkout_evidence"]["max"]
        breakdown["checkout_evidence"]["achieved"] = True
    
    # 3. Daily engagement (10%) - always give this if checkout
    breakdown["daily_engagement"]["earned"] = breakdown["daily_engagement"]["max"]
    breakdown["daily_engagement"]["achieved"] = True
    
    # 4. Base productivity (20%) - always give for completing
    breakdown["base_productivity"]["earned"] = breakdown["base_productivity"]["max"]
    breakdown["base_productivity"]["achieved"] = True
    
    total_coins = sum(trigger["earned"] for trigger in breakdown.values())
    
    return {
        "total_coins": total_coins,
        "breakdown": breakdown,
        "base_coins": base_coins,
        "installed_m2": installed_m2
    }


async def award_coins(user_id: str, amount: int, transaction_type: str, description: str, reference_id: str = None, breakdown: dict = None):
    """Award coins to a user and update their balance"""
    # Get or create balance
    balance = await db.gamification_balances.find_one({"user_id": user_id}, {"_id": 0})
    
    if not balance:
        new_balance = GamificationBalance(user_id=user_id)
        balance = new_balance.model_dump()
        balance["created_at"] = balance["created_at"].isoformat()
        balance["updated_at"] = balance["updated_at"].isoformat()
        await db.gamification_balances.insert_one(balance)
    
    # Update balance
    new_total = (balance.get("total_coins", 0) or 0) + amount
    new_lifetime = (balance.get("lifetime_coins", 0) or 0) + amount
    new_level = get_level_from_coins(new_lifetime)["level"]
    
    await db.gamification_balances.update_one(
        {"user_id": user_id},
        {"$set": {
            "total_coins": new_total,
            "lifetime_coins": new_lifetime,
            "level": new_level,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create transaction
    transaction = CoinTransaction(
        user_id=user_id,
        amount=amount,
        transaction_type=transaction_type,
        description=description,
        reference_id=reference_id,
        breakdown=breakdown
    )
    trans_dict = transaction.model_dump()
    trans_dict["created_at"] = trans_dict["created_at"].isoformat()
    await db.coin_transactions.insert_one(trans_dict)
    
    return {
        "coins_awarded": amount,
        "new_balance": new_total,
        "level": new_level
    }


# ============ BALANCE ROUTES ============
@router.get("/gamification/balance")
async def get_gamification_balance(current_user: User = Depends(get_current_user)):
    """Get current user's gamification balance and level info"""
    balance = await db.gamification_balances.find_one({"user_id": current_user.id}, {"_id": 0})
    
    if not balance:
        # Create default balance
        balance = GamificationBalance(user_id=current_user.id).model_dump()
        balance["created_at"] = balance["created_at"].isoformat()
        balance["updated_at"] = balance["updated_at"].isoformat()
        await db.gamification_balances.insert_one(balance)
        # Remove _id after insert
        balance.pop("_id", None)
    
    level_info = get_level_from_coins(balance.get("lifetime_coins", 0))
    
    return {
        **balance,
        "level_info": level_info
    }


@router.get("/gamification/balance/{user_id}")
async def get_user_gamification_balance(user_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific user's gamification balance (admin/manager only for other users)"""
    if user_id != current_user.id:
        await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    balance = await db.gamification_balances.find_one({"user_id": user_id}, {"_id": 0})
    
    if not balance:
        balance = GamificationBalance(user_id=user_id).model_dump()
        balance["created_at"] = balance["created_at"].isoformat()
        balance["updated_at"] = balance["updated_at"].isoformat()
        await db.gamification_balances.insert_one(balance)
        # Remove _id after insert
        balance.pop("_id", None)
    
    level_info = get_level_from_coins(balance.get("lifetime_coins", 0))
    
    return {
        **balance,
        "level_info": level_info
    }


# ============ TRANSACTION ROUTES ============
@router.get("/gamification/transactions")
async def get_gamification_transactions(
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user)
):
    """Get current user's coin transaction history"""
    transactions = await db.coin_transactions.find(
        {"user_id": current_user.id}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return transactions


@router.get("/gamification/transactions/{user_id}")
async def get_user_transactions(
    user_id: str,
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user)
):
    """Get a specific user's transactions (admin/manager only for other users)"""
    if user_id != current_user.id:
        await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    transactions = await db.coin_transactions.find(
        {"user_id": user_id}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return transactions


# ============ ENGAGEMENT ROUTES ============
@router.post("/gamification/daily-engagement")
async def register_daily_engagement(current_user: User = Depends(get_current_user)):
    """Register daily engagement bonus (first calendar access of the day)"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Check if already claimed today
    balance = await db.gamification_balances.find_one({"user_id": current_user.id}, {"_id": 0})
    
    if balance and balance.get("daily_engagement_date") == today:
        return {"already_claimed": True, "message": "Bônus diário já foi coletado hoje"}
    
    # Award daily engagement bonus (fixed 10 coins)
    daily_bonus = 10
    result = await award_coins(
        user_id=current_user.id,
        amount=daily_bonus,
        transaction_type="earn_engagement",
        description="Bônus diário de engajamento na agenda"
    )
    
    # Update engagement date
    await db.gamification_balances.update_one(
        {"user_id": current_user.id},
        {"$set": {"daily_engagement_date": today}}
    )
    
    return {
        "success": True,
        "coins_awarded": daily_bonus,
        "message": f"Parabéns! Você ganhou {daily_bonus} moedas pelo acesso diário!",
        **result
    }


@router.post("/gamification/process-checkout/{checkin_id}")
async def process_checkout_gamification(
    checkin_id: str,
    current_user: User = Depends(get_current_user)
):
    """Process gamification rewards for a completed checkout"""
    # Get checkin data
    checkin = await db.item_checkins.find_one({"id": checkin_id}, {"_id": 0})
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in não encontrado")
    
    if checkin.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Check-in ainda não foi finalizado")
    
    # Check if already processed
    existing = await db.coin_transactions.find_one({
        "reference_id": checkin_id,
        "transaction_type": "earn_checkout"
    }, {"_id": 0})
    
    if existing:
        return {"already_processed": True, "transaction": existing}
    
    # Get job data for scheduled date comparison
    job = await db.jobs.find_one({"id": checkin.get("job_id")}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    # Calculate coins
    coin_result = await calculate_checkout_coins(checkin, job)
    
    if coin_result["total_coins"] <= 0:
        return {"coins_awarded": 0, "message": "Nenhum m² registrado para bonificação"}
    
    # Award the coins
    result = await award_coins(
        user_id=checkin.get("installer_id") or current_user.id,
        amount=coin_result["total_coins"],
        transaction_type="earn_checkout",
        description=f"Checkout do item - {job.get('title', 'Job')[:30]}",
        reference_id=checkin_id,
        breakdown=coin_result["breakdown"]
    )
    
    return {
        **result,
        "breakdown": coin_result["breakdown"],
        "installed_m2": coin_result["installed_m2"],
        "base_coins": coin_result["base_coins"]
    }


# ============ REWARDS STORE (LOJA FAIXA PRETA) ============
@router.get("/gamification/rewards")
async def get_rewards(current_user: User = Depends(get_current_user)):
    """Get all available rewards"""
    rewards = await db.rewards.find({"is_active": True}, {"_id": 0}).to_list(100)
    return rewards


@router.post("/gamification/rewards")
async def create_reward(
    name: str = Form(...),
    description: str = Form(...),
    cost_coins: int = Form(...),
    category: str = Form(...),
    image_url: Optional[str] = Form(None),
    stock: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Create a new reward (admin only)"""
    await require_role(current_user, [UserRole.ADMIN])
    
    reward = Reward(
        name=name,
        description=description,
        cost_coins=cost_coins,
        category=category,
        image_url=image_url,
        stock=stock
    )
    
    reward_dict = reward.model_dump()
    reward_dict["created_at"] = reward_dict["created_at"].isoformat()
    await db.rewards.insert_one(reward_dict)
    
    # Remove _id before returning
    reward_dict.pop("_id", None)
    return reward_dict


@router.put("/gamification/rewards/{reward_id}")
async def update_reward(
    reward_id: str,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    cost_coins: Optional[int] = Form(None),
    category: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
    stock: Optional[int] = Form(None),
    is_active: Optional[bool] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Update a reward (admin only)"""
    await require_role(current_user, [UserRole.ADMIN])
    
    update_data = {}
    if name is not None: update_data["name"] = name
    if description is not None: update_data["description"] = description
    if cost_coins is not None: update_data["cost_coins"] = cost_coins
    if category is not None: update_data["category"] = category
    if image_url is not None: update_data["image_url"] = image_url
    if stock is not None: update_data["stock"] = stock
    if is_active is not None: update_data["is_active"] = is_active
    
    if update_data:
        await db.rewards.update_one({"id": reward_id}, {"$set": update_data})
    
    return await db.rewards.find_one({"id": reward_id}, {"_id": 0})


@router.delete("/gamification/rewards/{reward_id}")
async def delete_reward(reward_id: str, current_user: User = Depends(get_current_user)):
    """Delete a reward (admin only)"""
    await require_role(current_user, [UserRole.ADMIN])
    await db.rewards.delete_one({"id": reward_id})
    return {"message": "Prêmio excluído com sucesso"}


@router.post("/gamification/rewards/seed")
async def seed_default_rewards(current_user: User = Depends(get_current_user)):
    """Seed default rewards (admin only)"""
    await require_role(current_user, [UserRole.ADMIN])
    
    default_rewards = [
        {"name": "Voucher R$50", "description": "Vale-compras de R$50 para usar em lojas parceiras", "cost_coins": 500, "category": "voucher"},
        {"name": "Kit Ferramentas Básico", "description": "Kit com ferramentas essenciais para instalação", "cost_coins": 1500, "category": "equipment"},
        {"name": "Bônus R$200", "description": "Bônus em dinheiro de R$200 creditado na folha", "cost_coins": 2000, "category": "bonus"},
        {"name": "Day Off", "description": "Um dia de folga para usar quando quiser", "cost_coins": 3000, "category": "experience"},
        {"name": "Voucher R$100", "description": "Vale-compras de R$100 para usar em lojas parceiras", "cost_coins": 1000, "category": "voucher"},
        {"name": "Camiseta Faixa Preta", "description": "Camiseta exclusiva do programa Faixa Preta", "cost_coins": 800, "category": "equipment"},
        {"name": "Almoço com o CEO", "description": "Almoço especial com a diretoria da empresa", "cost_coins": 5000, "category": "experience"},
    ]
    
    created = 0
    for reward_data in default_rewards:
        existing = await db.rewards.find_one({"name": reward_data["name"]}, {"_id": 0})
        if not existing:
            reward = Reward(**reward_data)
            reward_dict = reward.model_dump()
            reward_dict["created_at"] = reward_dict["created_at"].isoformat()
            await db.rewards.insert_one(reward_dict)
            created += 1
    
    return {"message": f"{created} prêmios criados com sucesso"}


@router.post("/gamification/redeem/{reward_id}")
async def redeem_reward(reward_id: str, current_user: User = Depends(get_current_user)):
    """Redeem a reward with coins"""
    # Get reward
    reward = await db.rewards.find_one({"id": reward_id, "is_active": True}, {"_id": 0})
    if not reward:
        raise HTTPException(status_code=404, detail="Prêmio não encontrado ou indisponível")
    
    # Check stock
    if reward.get("stock") is not None and reward["stock"] <= 0:
        raise HTTPException(status_code=400, detail="Prêmio esgotado")
    
    # Get user balance
    balance = await db.gamification_balances.find_one({"user_id": current_user.id}, {"_id": 0})
    if not balance or balance.get("total_coins", 0) < reward["cost_coins"]:
        raise HTTPException(status_code=400, detail="Saldo de moedas insuficiente")
    
    # Deduct coins
    new_total = balance["total_coins"] - reward["cost_coins"]
    await db.gamification_balances.update_one(
        {"user_id": current_user.id},
        {"$set": {
            "total_coins": new_total,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create spend transaction
    transaction = CoinTransaction(
        user_id=current_user.id,
        amount=-reward["cost_coins"],
        transaction_type="spend_reward",
        description=f"Resgate: {reward['name']}",
        reference_id=reward_id
    )
    trans_dict = transaction.model_dump()
    trans_dict["created_at"] = trans_dict["created_at"].isoformat()
    await db.coin_transactions.insert_one(trans_dict)
    
    # Update stock if applicable
    if reward.get("stock") is not None:
        await db.rewards.update_one({"id": reward_id}, {"$inc": {"stock": -1}})
    
    # Create redemption request
    request = RewardRequest(
        user_id=current_user.id,
        reward_id=reward_id,
        reward_name=reward["name"],
        cost_coins=reward["cost_coins"]
    )
    request_dict = request.model_dump()
    request_dict["created_at"] = request_dict["created_at"].isoformat()
    await db.reward_requests.insert_one(request_dict)
    
    return {
        "success": True,
        "message": f"Prêmio '{reward['name']}' resgatado com sucesso!",
        "new_balance": new_total,
        "request_id": request.id
    }


# ============ REDEMPTION MANAGEMENT ============
@router.get("/gamification/redemptions")
async def get_my_redemptions(current_user: User = Depends(get_current_user)):
    """Get current user's reward redemptions"""
    redemptions = await db.reward_requests.find(
        {"user_id": current_user.id}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return redemptions


@router.get("/gamification/redemptions/all")
async def get_all_redemptions(current_user: User = Depends(get_current_user)):
    """Get all redemption requests (admin/manager only)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    redemptions = await db.reward_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    # Enrich with user info
    enriched = []
    for redemption in redemptions:
        user = await db.users.find_one({"id": redemption["user_id"]}, {"_id": 0, "name": 1, "email": 1})
        enriched.append({
            **redemption,
            "user_name": user.get("name") if user else "N/A",
            "user_email": user.get("email") if user else "N/A"
        })
    
    return enriched


@router.put("/gamification/redemptions/{request_id}/status")
async def update_redemption_status(
    request_id: str,
    status: str = Form(...),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Update redemption request status (admin/manager only)"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    if status not in ["pending", "approved", "delivered", "rejected"]:
        raise HTTPException(status_code=400, detail="Status inválido")
    
    update_data = {
        "status": status,
        "processed_at": datetime.now(timezone.utc).isoformat()
    }
    if notes:
        update_data["notes"] = notes
    
    # If rejected, refund the coins
    if status == "rejected":
        request = await db.reward_requests.find_one({"id": request_id}, {"_id": 0})
        if request and request.get("status") != "rejected":
            await db.gamification_balances.update_one(
                {"user_id": request["user_id"]},
                {"$inc": {"total_coins": request["cost_coins"]}}
            )
            # Create refund transaction
            refund_trans = CoinTransaction(
                user_id=request["user_id"],
                amount=request["cost_coins"],
                transaction_type="refund",
                description=f"Reembolso: {request['reward_name']}",
                reference_id=request_id
            )
            refund_dict = refund_trans.model_dump()
            refund_dict["created_at"] = refund_dict["created_at"].isoformat()
            await db.coin_transactions.insert_one(refund_dict)
    
    await db.reward_requests.update_one({"id": request_id}, {"$set": update_data})
    
    return await db.reward_requests.find_one({"id": request_id}, {"_id": 0})


# ============ GAMIFICATION REPORTS ============
@router.get("/gamification/report")
async def get_gamification_report(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """Get gamification report for admin/manager"""
    await require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    
    # Default to current month
    now = datetime.now(timezone.utc)
    report_month = month or now.month
    report_year = year or now.year
    
    # Date range for the month
    start_date = datetime(report_year, report_month, 1, tzinfo=timezone.utc)
    if report_month == 12:
        end_date = datetime(report_year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(report_year, report_month + 1, 1, tzinfo=timezone.utc)
    
    # Get all installers
    installers = await db.installers.find({}, {"_id": 0}).to_list(100)
    
    report_data = []
    for installer in installers:
        user_id = installer.get("user_id")
        if not user_id:
            continue
        
        # Get balance
        balance = await db.gamification_balances.find_one({"user_id": user_id}, {"_id": 0})
        
        # Get transactions for the month
        transactions = await db.coin_transactions.find({
            "user_id": user_id,
            "created_at": {
                "$gte": start_date.isoformat(),
                "$lt": end_date.isoformat()
            }
        }, {"_id": 0}).to_list(500)
        
        # Calculate monthly stats
        month_earned = sum(t["amount"] for t in transactions if t["amount"] > 0)
        month_spent = abs(sum(t["amount"] for t in transactions if t["amount"] < 0))
        checkouts_count = len([t for t in transactions if t["transaction_type"] == "earn_checkout"])
        
        # Get user info
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
        
        level_info = get_level_from_coins(balance.get("lifetime_coins", 0) if balance else 0)
        
        report_data.append({
            "installer_id": installer.get("id"),
            "user_id": user_id,
            "name": installer.get("full_name") or (user.get("name") if user else "N/A"),
            "email": user.get("email") if user else "N/A",
            "branch": installer.get("branch", "N/A"),
            "total_coins": balance.get("total_coins", 0) if balance else 0,
            "lifetime_coins": balance.get("lifetime_coins", 0) if balance else 0,
            "current_level": level_info["name"],
            "level_icon": level_info["icon"],
            "month_earned": month_earned,
            "month_spent": month_spent,
            "checkouts_count": checkouts_count
        })
    
    # Sort by month_earned descending
    report_data.sort(key=lambda x: x["month_earned"], reverse=True)
    
    # Calculate totals
    totals = {
        "total_coins_distributed": sum(r["month_earned"] for r in report_data),
        "total_coins_redeemed": sum(r["month_spent"] for r in report_data),
        "total_checkouts": sum(r["checkouts_count"] for r in report_data),
        "active_installers": len([r for r in report_data if r["month_earned"] > 0])
    }
    
    return {
        "month": report_month,
        "year": report_year,
        "report_date": now.isoformat(),
        "totals": totals,
        "installers": report_data
    }


@router.get("/gamification/leaderboard")
async def get_leaderboard(
    period: str = Query("month", regex="^(week|month|all)$"),
    limit: int = Query(10, le=50),
    current_user: User = Depends(get_current_user)
):
    """Get gamification leaderboard"""
    now = datetime.now(timezone.utc)
    
    # Determine date range
    if period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:
        start_date = None
    
    # Build query
    query = {"amount": {"$gt": 0}}
    if start_date:
        query["created_at"] = {"$gte": start_date.isoformat()}
    
    # Aggregate coins by user
    transactions = await db.coin_transactions.find(query, {"_id": 0}).to_list(10000)
    
    user_coins = {}
    for t in transactions:
        user_id = t["user_id"]
        if user_id not in user_coins:
            user_coins[user_id] = 0
        user_coins[user_id] += t["amount"]
    
    # Sort and limit
    sorted_users = sorted(user_coins.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    # Enrich with user info
    leaderboard = []
    for rank, (user_id, coins) in enumerate(sorted_users, 1):
        installer = await db.installers.find_one({"user_id": user_id}, {"_id": 0})
        balance = await db.gamification_balances.find_one({"user_id": user_id}, {"_id": 0})
        level_info = get_level_from_coins(balance.get("lifetime_coins", 0) if balance else 0)
        
        leaderboard.append({
            "rank": rank,
            "user_id": user_id,
            "name": installer.get("full_name") if installer else "N/A",
            "coins_earned": coins,
            "level": level_info["name"],
            "level_icon": level_info["icon"]
        })
    
    return {
        "period": period,
        "leaderboard": leaderboard
    }
