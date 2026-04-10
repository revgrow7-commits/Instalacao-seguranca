"""
Supabase Database Module - Native Implementation
Industria Visual PWA

This module provides direct Supabase access with a simplified interface.
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional, Union
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://otyrrvkixegiqsthmaaj.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', os.environ.get('SUPABASE_ANON_KEY', ''))

# Global client
_client: Optional[Client] = None


def get_client() -> Client:
    """Get or create Supabase client"""
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info(f"✅ Supabase connected: {SUPABASE_URL}")
    return _client


def _serialize(value: Any) -> Any:
    """Serialize value for Supabase"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (list, dict)):
        # Check if it's already a string (JSONB)
        if isinstance(value, str):
            return value
        return json.dumps(value)
    return value


"""
Campos TEXT que armazenam JSON e precisam ser desserializados automaticamente.
Centralizado aqui para evitar duplicacao. Adicione novos campos JSON nesta lista.
"""
JSON_TEXT_FIELDS = frozenset([
    'items', 'holdprint_data', 'products_with_area', 'item_assignments',
    'archived_items', 'products_installed', 'breakdown', 'keys',
    'assigned_installers', 'checklists', 'scopes', 'token',
    'justification', 'installation_config', 'subscription'
])

# Registry of actual Supabase table columns (from 001_schema_completo.sql + 002_cleanup_and_fix.sql)
# Used to auto-filter insert/update payloads and prevent PGRST204 errors
TABLE_COLUMNS = {
    "users": frozenset([
        "id", "email", "name", "full_name", "password_hash", "role", "phone",
        "branch", "is_active", "created_at"
    ]),
    "installers": frozenset([
        "id", "user_id", "full_name", "phone", "branch", "is_active", "avatar_url",
        "coins", "level", "total_area_installed", "total_jobs", "created_at"
    ]),
    "jobs": frozenset([
        "id", "holdprint_job_id", "title", "client_name", "client_address", "status",
        "branch", "area_m2", "assigned_installers", "scheduled_date", "items",
        "holdprint_data", "products_with_area", "total_products", "total_quantity",
        "item_assignments", "archived_items", "archived", "archived_at", "archived_by",
        "archived_by_name", "exclude_from_metrics", "no_installation", "notes",
        "cancelled_at", "justification", "justified_at", "installation_config",
        "completed_at", "created_at"
    ]),
    "checkins": frozenset([
        "id", "job_id", "installer_id", "status", "checkin_at", "checkout_at",
        "duration_minutes", "checkin_photo", "checkout_photo", "gps_lat", "gps_long",
        "checkout_gps_lat", "checkout_gps_long", "notes", "created_at"
    ]),
    "item_checkins": frozenset([
        "id", "job_id", "installer_id", "item_index", "status", "checkin_at",
        "checkout_at", "duration_minutes", "net_duration_minutes", "total_pause_minutes",
        "checkin_photo", "checkout_photo", "gps_lat", "gps_long", "gps_accuracy",
        "checkout_gps_lat", "checkout_gps_long", "checkout_gps_accuracy", "product_name",
        "family_name", "installed_m2", "complexity_level", "height_category",
        "scenario_category", "notes", "productivity_m2_h", "is_archived",
        "products_installed", "created_at"
    ]),
    "item_pause_logs": frozenset([
        "id", "checkin_id", "reason", "paused_at", "resumed_at", "duration_minutes",
        "auto_generated", "created_at"
    ]),
    "installed_products": frozenset([
        "id", "checkin_id", "job_id", "installer_id", "family_id", "family_name",
        "product_name", "quantity", "width_m", "height_m", "area_m2",
        "complexity_level", "height_category", "scenario_category", "duration_minutes",
        "productivity_m2_h", "created_at"
    ]),
    "product_families": frozenset(["id", "name", "keywords", "created_at"]),
    "productivity_history": frozenset([
        "id", "family_id", "family_name", "installer_id", "date", "total_m2",
        "total_minutes", "items_count", "productivity_m2_h", "created_at"
    ]),
    "gamification_balances": frozenset([
        "id", "user_id", "total_coins", "lifetime_coins", "current_level", "level",
        "streak_days", "last_activity", "daily_engagement_date", "created_at", "updated_at"
    ]),
    "coin_transactions": frozenset([
        "id", "user_id", "amount", "transaction_type", "description", "reference_type",
        "reference_id", "breakdown", "balance_after", "created_at"
    ]),
    "rewards": frozenset([
        "id", "name", "description", "cost_coins", "category", "image_url", "stock",
        "is_active", "created_at"
    ]),
    "reward_requests": frozenset([
        "id", "user_id", "reward_id", "reward_name", "cost_coins", "status", "notes",
        "processed_at", "created_at"
    ]),
    "location_alerts": frozenset([
        "id", "item_checkin_id", "job_id", "installer_id", "event_type", "checkin_lat",
        "checkin_long", "checkout_lat", "checkout_long", "distance_meters",
        "max_allowed_meters", "action_taken", "created_at"
    ]),
    "password_resets": frozenset(["id", "user_id", "token", "expires_at", "created_at"]),
    "google_tokens": frozenset(["id", "user_id", "token", "created_at", "updated_at"]),
    "job_justifications": frozenset([
        "id", "job_id", "job_title", "job_code", "type", "type_label", "reason",
        "submitted_by", "submitted_by_name", "submitted_by_email", "created_at"
    ]),
    "push_subscriptions": frozenset([
        "id", "user_id", "subscription", "is_active", "endpoint", "keys",
        "subscribed_at", "created_at"
    ]),
    "system_config": frozenset([
        "id", "key", "value", "total_imported", "total_skipped", "updated_at"
    ]),
    "scheduler_sync_status": frozenset([
        "id", "sync_type", "last_sync_at", "total_imported", "total_skipped",
        "total_errors", "updated_at"
    ]),
}


def _filter_columns(table_name: str, data: dict) -> dict:
    """Filter dict to only include columns that exist in the actual Supabase table."""
    allowed = TABLE_COLUMNS.get(table_name)
    if not allowed:
        return data
    rejected = set(data.keys()) - allowed
    if rejected:
        logger.debug(f"Filtered non-DB fields from {table_name}: {rejected}")
    return {k: v for k, v in data.items() if k in allowed}


def _deserialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Deserialize JSON TEXT fields from Supabase"""
    if not doc:
        return doc

    for field in JSON_TEXT_FIELDS:
        if field in doc and isinstance(doc[field], str):
            try:
                doc[field] = json.loads(doc[field])
            except (json.JSONDecodeError, TypeError):
                pass

    return doc


class SupabaseTable:
    """Wrapper for Supabase table operations"""
    
    def __init__(self, table_name: str):
        self.table_name = table_name
        self._client = get_client()
    
    def _table(self):
        return self._client.table(self.table_name)
    
    # ============ FIND OPERATIONS ============
    
    def find_one(self, query: Dict[str, Any], projection: Dict[str, Any] = None) -> Optional[Dict]:
        """Find single document"""
        try:
            columns = '*'
            if projection:
                cols = [k for k, v in projection.items() if v and k != '_id']
                if cols:
                    columns = ','.join(cols)
            
            builder = self._table().select(columns)
            
            for key, value in query.items():
                if isinstance(value, dict):
                    for op, op_val in value.items():
                        if op == '$in':
                            builder = builder.in_(key, op_val)
                        elif op == '$gte':
                            builder = builder.gte(key, op_val)
                        elif op == '$lte':
                            builder = builder.lte(key, op_val)
                        elif op == '$ne':
                            builder = builder.neq(key, op_val)
                else:
                    builder = builder.eq(key, value)
            
            result = builder.limit(1).execute()
            
            if result.data:
                return _deserialize(result.data[0])
            return None
            
        except Exception as e:
            logger.error(f"find_one error on {self.table_name}: {e}")
            return None
    
    def find(
        self, 
        query: Dict[str, Any] = None, 
        projection: Dict[str, Any] = None,
        sort: List[tuple] = None,
        limit: int = None,
        skip: int = None
    ) -> List[Dict]:
        """Find multiple documents"""
        try:
            query = query or {}
            
            columns = '*'
            if projection:
                cols = [k for k, v in projection.items() if v and k != '_id']
                if cols:
                    columns = ','.join(cols)
            
            builder = self._table().select(columns)
            
            # Handle $or operator specially
            or_conditions = query.pop('$or', None)
            
            # Apply standard filters
            for key, value in query.items():
                if isinstance(value, dict):
                    for op, op_val in value.items():
                        if op == '$in':
                            builder = builder.in_(key, op_val)
                        elif op == '$gte':
                            builder = builder.gte(key, op_val)
                        elif op == '$lte':
                            builder = builder.lte(key, op_val)
                        elif op == '$ne':
                            builder = builder.neq(key, op_val)
                        elif op == '$regex':
                            builder = builder.ilike(key, f'%{op_val}%')
                        elif op == '$contains':
                            builder = builder.contains(key, op_val)
                elif value is not None:
                    builder = builder.eq(key, value)
            
            # Handle $or by making separate queries and combining results
            if or_conditions:
                all_results = []
                seen_ids = set()
                
                for condition in or_conditions:
                    # Create a new builder for each OR condition
                    or_builder = self._table().select(columns)
                    
                    # Apply the same base filters (excluding $or)
                    for key, value in query.items():
                        if isinstance(value, dict):
                            for op, op_val in value.items():
                                if op == '$in':
                                    or_builder = or_builder.in_(key, op_val)
                                elif op == '$gte':
                                    or_builder = or_builder.gte(key, op_val)
                                elif op == '$lte':
                                    or_builder = or_builder.lte(key, op_val)
                                elif op == '$ne':
                                    or_builder = or_builder.neq(key, op_val)
                                elif op == '$regex':
                                    or_builder = or_builder.ilike(key, f'%{op_val}%')
                        elif value is not None:
                            or_builder = or_builder.eq(key, value)
                    
                    # Apply the OR condition - handle array contains for JSONB/TEXT fields
                    for cond_key, cond_val in condition.items():
                        if isinstance(cond_val, dict):
                            # Handle operators like $in
                            for op, op_val in cond_val.items():
                                if op == '$in':
                                    or_builder = or_builder.in_(cond_key, op_val)
                                elif op == '$contains':
                                    # Use ilike for TEXT columns storing JSON arrays
                                    or_builder = or_builder.ilike(cond_key, f'%{op_val}%')
                        elif isinstance(cond_val, list):
                            # For array contains - use ilike since column may be TEXT
                            for val in cond_val:
                                or_builder = or_builder.ilike(cond_key, f'%{val}%')
                        else:
                            # For checking if a value is contained in a JSON array stored as TEXT
                            # Use ilike to search for the value as substring
                            or_builder = or_builder.ilike(cond_key, f'%{cond_val}%')
                    
                    # Apply sorting
                    if sort:
                        for field, direction in sort:
                            or_builder = or_builder.order(field, desc=(direction == -1))
                    
                    try:
                        result = or_builder.execute()
                        for doc in (result.data or []):
                            doc_id = doc.get('id')
                            if doc_id and doc_id not in seen_ids:
                                seen_ids.add(doc_id)
                                all_results.append(_deserialize(doc))
                    except Exception as or_err:
                        logger.warning(f"$or condition query failed: {or_err}")
                        continue
                
                # Sort combined results if needed
                if sort and all_results:
                    for field, direction in reversed(sort):
                        reverse = (direction == -1)
                        all_results.sort(key=lambda x: x.get(field) or '', reverse=reverse)
                
                # Apply skip first, then limit
                if skip:
                    all_results = all_results[skip:]
                if limit:
                    all_results = all_results[:limit]
                    
                return all_results
            
            # Apply sorting
            if sort:
                for field, direction in sort:
                    builder = builder.order(field, desc=(direction == -1))
            
            # Apply limit
            if limit:
                builder = builder.limit(limit)
            
            # Apply skip/offset
            if skip:
                builder = builder.offset(skip)
            
            result = builder.execute()
            return [_deserialize(doc) for doc in (result.data or [])]
            
        except Exception as e:
            logger.error(f"find error on {self.table_name}: {e}")
            return []
    
    # ============ INSERT OPERATIONS ============
    
    def insert_one(self, document: Dict[str, Any]) -> Dict:
        """Insert single document"""
        try:
            # Remove _id if present
            document.pop('_id', None)

            # Serialize values and filter to valid columns
            clean_doc = {k: _serialize(v) for k, v in document.items() if v is not None}
            clean_doc = _filter_columns(self.table_name, clean_doc)

            result = self._table().insert(clean_doc).execute()
            return {'inserted_id': result.data[0]['id'] if result.data else None}
            
        except Exception as e:
            logger.error(f"insert_one error on {self.table_name}: {e}")
            raise
    
    def insert_many(self, documents: List[Dict[str, Any]]) -> Dict:
        """Insert multiple documents"""
        try:
            clean_docs = []
            for doc in documents:
                doc.pop('_id', None)
                clean = {k: _serialize(v) for k, v in doc.items() if v is not None}
                clean_docs.append(_filter_columns(self.table_name, clean))
            
            result = self._table().insert(clean_docs).execute()
            return {'inserted_count': len(result.data) if result.data else 0}
            
        except Exception as e:
            logger.error(f"insert_many error on {self.table_name}: {e}")
            raise
    
    # ============ UPDATE OPERATIONS ============
    
    def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> Dict:
        """Update single document"""
        try:
            # Handle $set, $inc, $push operators
            update_data = {}
            
            if '$set' in update:
                update_data.update(update['$set'])
            elif '$inc' in update:
                # For increment, we need to fetch first then update
                existing = self.find_one(query)
                if existing:
                    for field, inc_val in update['$inc'].items():
                        update_data[field] = (existing.get(field, 0) or 0) + inc_val
            elif '$push' in update:
                # For push, fetch first then append
                existing = self.find_one(query)
                if existing:
                    for field, push_val in update['$push'].items():
                        current = existing.get(field, []) or []
                        if isinstance(current, str):
                            current = json.loads(current)
                        current.append(push_val)
                        update_data[field] = current
            else:
                update_data = update
            
            # Serialize and filter to valid columns
            clean_update = {k: _serialize(v) for k, v in update_data.items() if v is not None}
            clean_update = _filter_columns(self.table_name, clean_update)
            
            if not clean_update:
                return {'modified_count': 0, 'matched_count': 0}
            
            builder = self._table().update(clean_update)
            
            for key, value in query.items():
                if not key.startswith('$'):
                    builder = builder.eq(key, value)
            
            result = builder.execute()
            
            return {
                'modified_count': len(result.data) if result.data else 0,
                'matched_count': len(result.data) if result.data else 0
            }
            
        except Exception as e:
            logger.error(f"update_one error on {self.table_name}: {e}")
            raise
    
    def update_many(self, query: Dict[str, Any], update: Dict[str, Any]) -> Dict:
        """Update multiple documents"""
        return self.update_one(query, update)
    
    def find_one_and_update(
        self, 
        query: Dict[str, Any], 
        update: Dict[str, Any],
        return_document: str = 'after',
        projection: Dict[str, Any] = None  # Ignored for Supabase compatibility
    ) -> Optional[Dict]:
        """Find and update, returning the document"""
        try:
            # First update
            self.update_one(query, update)
            
            # Then fetch
            return self.find_one(query)
            
        except Exception as e:
            logger.error(f"find_one_and_update error on {self.table_name}: {e}")
            return None
    
    # ============ DELETE OPERATIONS ============
    
    def delete_one(self, query: Dict[str, Any]) -> Dict:
        """Delete single document"""
        try:
            builder = self._table().delete()
            
            for key, value in query.items():
                builder = builder.eq(key, value)
            
            result = builder.execute()
            return {'deleted_count': len(result.data) if result.data else 0}
            
        except Exception as e:
            logger.error(f"delete_one error on {self.table_name}: {e}")
            raise
    
    def delete_many(self, query: Dict[str, Any]) -> Dict:
        """Delete multiple documents"""
        return self.delete_one(query)
    
    # ============ COUNT OPERATIONS ============
    
    def count_documents(self, query: Dict[str, Any] = None) -> int:
        """Count documents matching query"""
        try:
            builder = self._table().select('id', count='exact')
            
            if query:
                for key, value in query.items():
                    if isinstance(value, dict):
                        for op, op_val in value.items():
                            if op == '$in':
                                builder = builder.in_(key, op_val)
                            elif op == '$gte':
                                builder = builder.gte(key, op_val)
                            elif op == '$lte':
                                builder = builder.lte(key, op_val)
                    elif value is not None:
                        builder = builder.eq(key, value)
            
            result = builder.execute()
            return result.count if hasattr(result, 'count') and result.count else len(result.data or [])
            
        except Exception as e:
            logger.error(f"count_documents error on {self.table_name}: {e}")
            return 0
    
    # ============ AGGREGATION (LIMITED) ============
    
    def aggregate(self, pipeline: List[Dict]) -> List[Dict]:
        """Basic aggregation support"""
        # For now, just return all documents
        # Complex aggregations should use Supabase RPC functions
        return self.find({})


class SupabaseDB:
    """Database wrapper providing table access"""
    
    def __init__(self):
        self._tables: Dict[str, SupabaseTable] = {}
    
    def __getattr__(self, name: str) -> SupabaseTable:
        if name.startswith('_'):
            raise AttributeError(name)
        
        if name not in self._tables:
            self._tables[name] = SupabaseTable(name)
        
        return self._tables[name]


# Create singleton instance
db = SupabaseDB()
client = get_client()
