"""
Gamification service - coin calculations and rewards.
"""
from datetime import datetime, timezone
from database import db

# Coin reward values
COIN_REWARDS = {
    "checkin_on_time": 10,       # Check-in no horário agendado
    "checkout_complete": 15,     # Checkout com foto e notas
    "no_pause": 5,               # Execução sem pausas
    "fast_execution": 10,        # Execução mais rápida que o esperado
    "quality_photo": 5,          # Foto de boa qualidade
    "full_evidence": 20,         # Evidência completa (foto entrada + saída)
    "daily_streak": 5,           # Bônus por dias consecutivos
    "weekly_bonus": 50,          # Bônus semanal
    "monthly_bonus": 200,        # Bônus mensal
}


def calculate_level(total_earned: int) -> int:
    """Calculate level based on total coins earned."""
    if total_earned < 100:
        return 1
    elif total_earned < 300:
        return 2
    elif total_earned < 600:
        return 3
    elif total_earned < 1000:
        return 4
    elif total_earned < 1500:
        return 5
    elif total_earned < 2500:
        return 6
    elif total_earned < 4000:
        return 7
    elif total_earned < 6000:
        return 8
    elif total_earned < 9000:
        return 9
    else:
        return 10


async def add_coins(user_id: str, amount: int, transaction_type: str, description: str, 
                    reference_type: str = None, reference_id: str = None) -> dict:
    """
    Add or remove coins from user balance.
    Returns updated balance info.
    """
    # Get or create balance
    balance = await db.gamification_balances.find_one({"user_id": user_id}, {"_id": 0})
    
    if not balance:
        balance = {
            "user_id": user_id,
            "coins": 0,
            "level": 1,
            "total_earned": 0,
            "total_redeemed": 0,
            "streak_days": 0,
            "last_activity": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.gamification_balances.insert_one(balance)
    
    # Calculate new balance
    new_coins = balance.get("coins", 0) + amount
    new_total_earned = balance.get("total_earned", 0) + (amount if amount > 0 else 0)
    new_total_redeemed = balance.get("total_redeemed", 0) + (abs(amount) if amount < 0 else 0)
    new_level = calculate_level(new_total_earned)
    
    # Update balance
    await db.gamification_balances.update_one(
        {"user_id": user_id},
        {"$set": {
            "coins": new_coins,
            "total_earned": new_total_earned,
            "total_redeemed": new_total_redeemed,
            "level": new_level,
            "last_activity": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Record transaction
    transaction = {
        "user_id": user_id,
        "amount": amount,
        "transaction_type": transaction_type,
        "description": description,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "balance_after": new_coins,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.gamification_transactions.insert_one(transaction)
    
    return {
        "coins": new_coins,
        "level": new_level,
        "amount_added": amount,
        "total_earned": new_total_earned
    }


async def calculate_checkout_coins(checkin: dict, job: dict = None) -> dict:
    """
    Calculate coins earned for a checkout.
    Returns dict with total coins and breakdown.
    """
    coins = 0
    breakdown = []
    
    # Base checkout reward
    coins += COIN_REWARDS["checkout_complete"]
    breakdown.append({"type": "checkout_complete", "coins": COIN_REWARDS["checkout_complete"], "desc": "Checkout realizado"})
    
    # Check if has checkout photo
    if checkin.get("checkout_photo"):
        coins += COIN_REWARDS["full_evidence"]
        breakdown.append({"type": "full_evidence", "coins": COIN_REWARDS["full_evidence"], "desc": "Evidência fotográfica completa"})
    
    # Check for no pauses
    total_pause = checkin.get("total_pause_minutes", 0) or 0
    if total_pause == 0:
        coins += COIN_REWARDS["no_pause"]
        breakdown.append({"type": "no_pause", "coins": COIN_REWARDS["no_pause"], "desc": "Execução sem pausas"})
    
    # Check for fast execution (if we have expected time)
    net_duration = checkin.get("net_duration_minutes") or checkin.get("duration_minutes")
    if net_duration and job:
        # If completed faster than average (this would need more logic)
        pass
    
    return {
        "total_coins": coins,
        "breakdown": breakdown
    }
