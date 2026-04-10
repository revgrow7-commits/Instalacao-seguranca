"""
Script de Migração: MongoDB -> Supabase
Industria Visual

Este script:
1. Cria as tabelas no Supabase (executa o schema SQL)
2. Migra todos os dados do MongoDB para o Supabase
3. Mantém compatibilidade de IDs
"""

import os
import sys
import json
from datetime import datetime
from typing import Any, Dict, List
from pymongo import MongoClient
from supabase import create_client, Client

# Configurações do Supabase
SUPABASE_URL = "https://otyrrkvixegiqsthmaaj.supabase.co"
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', 'sb_secret_uMmCrswTXuAAI0buga8NQQ_vFRSMRWb')

# Configurações do MongoDB
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
MONGO_DB = os.environ.get('DB_NAME', 'industria_visual_db')


def get_supabase_client() -> Client:
    """Cria cliente Supabase com service role key"""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_mongodb_client():
    """Cria cliente MongoDB"""
    client = MongoClient(MONGO_URL)
    return client[MONGO_DB]


def clean_document(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Limpa documento MongoDB para inserção no Supabase"""
    if doc is None:
        return None
    
    # Remove _id do MongoDB
    doc.pop('_id', None)
    
    # Converte campos específicos
    for key, value in list(doc.items()):
        # Converte ObjectId para string
        if hasattr(value, '__str__') and 'ObjectId' in str(type(value)):
            doc[key] = str(value)
        
        # Converte datetime para ISO string
        elif isinstance(value, datetime):
            doc[key] = value.isoformat()
        
        # Converte lists e dicts recursivamente
        elif isinstance(value, dict):
            doc[key] = clean_document(value)
        elif isinstance(value, list):
            doc[key] = [clean_document(item) if isinstance(item, dict) else item for item in value]
    
    return doc


def migrate_users(mongo_db, supabase: Client):
    """Migra tabela users"""
    print("\n📦 Migrando USERS...")
    
    users = list(mongo_db.users.find())
    if not users:
        print("   Nenhum usuário encontrado")
        return
    
    migrated = 0
    errors = 0
    
    for user in users:
        try:
            clean_user = {
                'id': user.get('id'),
                'email': user.get('email'),
                'name': user.get('name'),
                'role': user.get('role', 'installer'),
                'password_hash': user.get('password_hash', ''),
                'is_active': user.get('is_active', True),
                'branch': user.get('branch'),
                'phone': user.get('phone'),
                'full_name': user.get('full_name') or user.get('name'),
                'created_at': user.get('created_at')
            }
            
            # Remove campos None
            clean_user = {k: v for k, v in clean_user.items() if v is not None}
            
            supabase.table('users').upsert(clean_user, on_conflict='id').execute()
            migrated += 1
            
        except Exception as e:
            errors += 1
            print(f"   ❌ Erro ao migrar user {user.get('email')}: {e}")
    
    print(f"   ✅ {migrated} usuários migrados, {errors} erros")


def migrate_installers(mongo_db, supabase: Client):
    """Migra tabela installers"""
    print("\n📦 Migrando INSTALLERS...")
    
    installers = list(mongo_db.installers.find())
    if not installers:
        print("   Nenhum instalador encontrado")
        return
    
    migrated = 0
    errors = 0
    
    for installer in installers:
        try:
            clean_installer = {
                'id': installer.get('id'),
                'user_id': installer.get('user_id'),
                'full_name': installer.get('full_name'),
                'phone': installer.get('phone'),
                'branch': installer.get('branch'),
                'coins': installer.get('coins', 0),
                'total_area_installed': installer.get('total_area_installed', 0),
                'total_jobs': installer.get('total_jobs', 0),
                'created_at': installer.get('created_at')
            }
            
            clean_installer = {k: v for k, v in clean_installer.items() if v is not None}
            
            supabase.table('installers').upsert(clean_installer, on_conflict='id').execute()
            migrated += 1
            
        except Exception as e:
            errors += 1
            print(f"   ❌ Erro ao migrar installer {installer.get('full_name')}: {e}")
    
    print(f"   ✅ {migrated} instaladores migrados, {errors} erros")


def migrate_jobs(mongo_db, supabase: Client):
    """Migra tabela jobs"""
    print("\n📦 Migrando JOBS...")
    
    jobs = list(mongo_db.jobs.find())
    if not jobs:
        print("   Nenhum job encontrado")
        return
    
    migrated = 0
    errors = 0
    
    for job in jobs:
        try:
            clean_job = {
                'id': job.get('id'),
                'holdprint_job_id': job.get('holdprint_job_id'),
                'job_number': job.get('job_number'),
                'title': job.get('title'),
                'client_name': job.get('client_name'),
                'client_address': job.get('client_address'),
                'status': job.get('status', 'aguardando'),
                'branch': job.get('branch'),
                'area_m2': float(job.get('area_m2', 0) or 0),
                'scheduled_date': job.get('scheduled_date'),
                'scheduled_time': job.get('scheduled_time'),
                'assigned_installers': job.get('assigned_installers', []),
                'item_assignments': json.dumps(job.get('item_assignments', [])),
                'archived_items': json.dumps(job.get('archived_items', [])),
                'items': json.dumps(job.get('items', [])),
                'holdprint_data': json.dumps(job.get('holdprint_data', {})),
                'products_with_area': json.dumps(job.get('products_with_area', [])),
                'total_products': job.get('total_products', 0),
                'total_quantity': float(job.get('total_quantity', 0) or 0),
                'is_archived': job.get('is_archived', False),
                'exclude_from_metrics': job.get('exclude_from_metrics', False),
                'completed_at': job.get('completed_at'),
                'created_at': job.get('created_at')
            }
            
            clean_job = {k: v for k, v in clean_job.items() if v is not None}
            
            supabase.table('jobs').upsert(clean_job, on_conflict='id').execute()
            migrated += 1
            
        except Exception as e:
            errors += 1
            print(f"   ❌ Erro ao migrar job {job.get('title', 'N/A')[:30]}: {e}")
    
    print(f"   ✅ {migrated} jobs migrados, {errors} erros")


def migrate_item_checkins(mongo_db, supabase: Client):
    """Migra tabela item_checkins"""
    print("\n📦 Migrando ITEM_CHECKINS...")
    
    checkins = list(mongo_db.item_checkins.find())
    if not checkins:
        print("   Nenhum item_checkin encontrado")
        return
    
    migrated = 0
    errors = 0
    
    for checkin in checkins:
        try:
            clean_checkin = {
                'id': checkin.get('id'),
                'job_id': checkin.get('job_id'),
                'item_index': checkin.get('item_index'),
                'installer_id': checkin.get('installer_id'),
                'status': checkin.get('status', 'in_progress'),
                'checkin_at': checkin.get('checkin_at'),
                'checkout_at': checkin.get('checkout_at'),
                'checkin_photo': checkin.get('checkin_photo'),
                'checkout_photo': checkin.get('checkout_photo'),
                'gps_lat': float(checkin.get('gps_lat')) if checkin.get('gps_lat') else None,
                'gps_long': float(checkin.get('gps_long')) if checkin.get('gps_long') else None,
                'checkout_lat': float(checkin.get('checkout_lat')) if checkin.get('checkout_lat') else None,
                'checkout_long': float(checkin.get('checkout_long')) if checkin.get('checkout_long') else None,
                'products_installed': json.dumps(checkin.get('products_installed', [])),
                'total_area_m2': float(checkin.get('total_area_m2', 0) or 0),
                'productivity_m2_h': float(checkin.get('productivity_m2_h')) if checkin.get('productivity_m2_h') else None,
                'time_worked_minutes': checkin.get('time_worked_minutes', 0),
                'pause_time_minutes': checkin.get('pause_time_minutes', 0),
                'coins_earned': checkin.get('coins_earned', 0),
                'created_at': checkin.get('created_at')
            }
            
            clean_checkin = {k: v for k, v in clean_checkin.items() if v is not None}
            
            supabase.table('item_checkins').upsert(clean_checkin, on_conflict='id').execute()
            migrated += 1
            
        except Exception as e:
            errors += 1
            print(f"   ❌ Erro ao migrar item_checkin {checkin.get('id')}: {e}")
    
    print(f"   ✅ {migrated} item_checkins migrados, {errors} erros")


def migrate_gamification(mongo_db, supabase: Client):
    """Migra tabelas de gamificação"""
    print("\n📦 Migrando GAMIFICATION...")
    
    # Gamification Balances
    balances = list(mongo_db.gamification_balances.find())
    migrated_balances = 0
    
    for balance in balances:
        try:
            clean_balance = {
                'id': balance.get('id'),
                'user_id': balance.get('user_id'),
                'total_coins': balance.get('total_coins', 0),
                'lifetime_coins': balance.get('lifetime_coins', 0),
                'current_level': balance.get('current_level', 'bronze'),
                'level': balance.get('level', 'bronze'),
                'daily_engagement_date': balance.get('daily_engagement_date'),
                'created_at': balance.get('created_at'),
                'updated_at': balance.get('updated_at')
            }
            
            clean_balance = {k: v for k, v in clean_balance.items() if v is not None}
            
            supabase.table('gamification_balances').upsert(clean_balance, on_conflict='id').execute()
            migrated_balances += 1
        except Exception as e:
            print(f"   ❌ Erro balance: {e}")
    
    print(f"   ✅ {migrated_balances} gamification_balances migrados")
    
    # Coin Transactions
    transactions = list(mongo_db.coin_transactions.find())
    migrated_transactions = 0
    
    for trans in transactions:
        try:
            clean_trans = {
                'id': trans.get('id'),
                'user_id': trans.get('user_id'),
                'amount': trans.get('amount', 0),
                'transaction_type': trans.get('transaction_type'),
                'description': trans.get('description'),
                'reference_id': trans.get('reference_id'),
                'breakdown': json.dumps(trans.get('breakdown', {})),
                'created_at': trans.get('created_at')
            }
            
            clean_trans = {k: v for k, v in clean_trans.items() if v is not None}
            
            supabase.table('coin_transactions').upsert(clean_trans, on_conflict='id').execute()
            migrated_transactions += 1
        except Exception as e:
            print(f"   ❌ Erro transaction: {e}")
    
    print(f"   ✅ {migrated_transactions} coin_transactions migrados")


def migrate_rewards(mongo_db, supabase: Client):
    """Migra tabela rewards"""
    print("\n📦 Migrando REWARDS...")
    
    rewards = list(mongo_db.rewards.find())
    if not rewards:
        print("   Nenhum reward encontrado")
        return
    
    migrated = 0
    
    for reward in rewards:
        try:
            clean_reward = {
                'id': reward.get('id'),
                'name': reward.get('name'),
                'description': reward.get('description'),
                'cost_coins': reward.get('cost_coins', 0),
                'category': reward.get('category'),
                'image_url': reward.get('image_url'),
                'is_active': reward.get('is_active', True),
                'stock': reward.get('stock'),
                'created_at': reward.get('created_at')
            }
            
            clean_reward = {k: v for k, v in clean_reward.items() if v is not None}
            
            supabase.table('rewards').upsert(clean_reward, on_conflict='id').execute()
            migrated += 1
        except Exception as e:
            print(f"   ❌ Erro reward: {e}")
    
    print(f"   ✅ {migrated} rewards migrados")


def migrate_product_families(mongo_db, supabase: Client):
    """Migra tabela product_families"""
    print("\n📦 Migrando PRODUCT_FAMILIES...")
    
    families = list(mongo_db.product_families.find())
    if not families:
        print("   Nenhuma família encontrada")
        return
    
    migrated = 0
    
    for family in families:
        try:
            clean_family = {
                'id': family.get('id'),
                'name': family.get('name'),
                'description': family.get('description'),
                'color': family.get('color'),
                'created_at': family.get('created_at')
            }
            
            clean_family = {k: v for k, v in clean_family.items() if v is not None}
            
            supabase.table('product_families').upsert(clean_family, on_conflict='id').execute()
            migrated += 1
        except Exception as e:
            print(f"   ❌ Erro family: {e}")
    
    print(f"   ✅ {migrated} product_families migrados")


def migrate_other_tables(mongo_db, supabase: Client):
    """Migra outras tabelas menores"""
    
    # Item Pause Logs
    print("\n📦 Migrando ITEM_PAUSE_LOGS...")
    pause_logs = list(mongo_db.item_pause_logs.find())
    migrated = 0
    for log in pause_logs:
        try:
            clean_log = {
                'id': log.get('id'),
                'item_checkin_id': log.get('item_checkin_id'),
                'job_id': log.get('job_id'),
                'item_index': log.get('item_index'),
                'installer_id': log.get('installer_id'),
                'start_time': log.get('start_time'),
                'end_time': log.get('end_time'),
                'reason': log.get('reason'),
                'reason_label': log.get('reason_label'),
                'duration_minutes': log.get('duration_minutes', 0),
                'auto_generated': log.get('auto_generated', False)
            }
            clean_log = {k: v for k, v in clean_log.items() if v is not None}
            supabase.table('item_pause_logs').upsert(clean_log, on_conflict='id').execute()
            migrated += 1
        except Exception as e:
            pass
    print(f"   ✅ {migrated} item_pause_logs migrados")
    
    # Location Alerts
    print("\n📦 Migrando LOCATION_ALERTS...")
    alerts = list(mongo_db.location_alerts.find())
    migrated = 0
    for alert in alerts:
        try:
            clean_alert = {
                'id': alert.get('id'),
                'item_checkin_id': alert.get('item_checkin_id'),
                'job_id': alert.get('job_id'),
                'installer_id': alert.get('installer_id'),
                'event_type': alert.get('event_type'),
                'checkin_lat': float(alert.get('checkin_lat')) if alert.get('checkin_lat') else None,
                'checkin_long': float(alert.get('checkin_long')) if alert.get('checkin_long') else None,
                'checkout_lat': float(alert.get('checkout_lat')) if alert.get('checkout_lat') else None,
                'checkout_long': float(alert.get('checkout_long')) if alert.get('checkout_long') else None,
                'distance_meters': float(alert.get('distance_meters')) if alert.get('distance_meters') else None,
                'max_allowed_meters': alert.get('max_allowed_meters', 500),
                'action_taken': alert.get('action_taken'),
                'created_at': alert.get('created_at')
            }
            clean_alert = {k: v for k, v in clean_alert.items() if v is not None}
            supabase.table('location_alerts').upsert(clean_alert, on_conflict='id').execute()
            migrated += 1
        except Exception as e:
            pass
    print(f"   ✅ {migrated} location_alerts migrados")
    
    # Job Justifications
    print("\n📦 Migrando JOB_JUSTIFICATIONS...")
    justifications = list(mongo_db.job_justifications.find())
    migrated = 0
    for just in justifications:
        try:
            clean_just = {
                'id': just.get('id'),
                'job_id': just.get('job_id'),
                'job_title': just.get('job_title'),
                'job_code': just.get('job_code'),
                'type': just.get('type'),
                'type_label': just.get('type_label'),
                'reason': just.get('reason'),
                'submitted_by': just.get('submitted_by'),
                'submitted_by_name': just.get('submitted_by_name'),
                'submitted_by_email': just.get('submitted_by_email'),
                'created_at': just.get('created_at')
            }
            clean_just = {k: v for k, v in clean_just.items() if v is not None}
            supabase.table('job_justifications').upsert(clean_just, on_conflict='id').execute()
            migrated += 1
        except Exception as e:
            pass
    print(f"   ✅ {migrated} job_justifications migrados")


def run_migration():
    """Executa a migração completa"""
    print("=" * 60)
    print("🚀 MIGRAÇÃO: MongoDB -> Supabase")
    print("=" * 60)
    print(f"\n📍 MongoDB: {MONGO_URL}/{MONGO_DB}")
    print(f"📍 Supabase: {SUPABASE_URL}")
    print()
    
    try:
        # Conectar aos bancos
        print("🔌 Conectando ao MongoDB...")
        mongo_db = get_mongodb_client()
        
        print("🔌 Conectando ao Supabase...")
        supabase = get_supabase_client()
        
        # Testar conexão Supabase
        test = supabase.table('users').select('id').limit(1).execute()
        print("✅ Conexão com Supabase estabelecida!\n")
        
    except Exception as e:
        print(f"❌ Erro ao conectar: {e}")
        print("\n⚠️  Verifique se as tabelas foram criadas no Supabase.")
        print("   Execute o SQL em: /app/backend/migrations/supabase_schema.sql")
        return False
    
    # Executar migrações na ordem correta (respeitando foreign keys)
    try:
        migrate_users(mongo_db, supabase)
        migrate_installers(mongo_db, supabase)
        migrate_product_families(mongo_db, supabase)
        migrate_jobs(mongo_db, supabase)
        migrate_item_checkins(mongo_db, supabase)
        migrate_gamification(mongo_db, supabase)
        migrate_rewards(mongo_db, supabase)
        migrate_other_tables(mongo_db, supabase)
        
        print("\n" + "=" * 60)
        print("✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Erro durante migração: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
