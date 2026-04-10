"""
Supabase Database Connection Module
Industria Visual - PWA

This module provides connection to Supabase (PostgreSQL) database.
It maintains backward compatibility with the MongoDB interface where possible.
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Supabase Configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://otyrrvkixegiqsthmaaj.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', os.environ.get('SUPABASE_ANON_KEY', ''))

# Global client instance
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """Get or create Supabase client instance"""
    global _supabase_client
    
    if _supabase_client is None:
        if not SUPABASE_KEY:
            raise ValueError("SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY must be set")
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info(f"✅ Connected to Supabase: {SUPABASE_URL}")
    
    return _supabase_client


class SupabaseCollection:
    """
    Wrapper class that provides MongoDB-like interface for Supabase tables.
    This allows for easier migration from MongoDB to Supabase.
    """
    
    def __init__(self, table_name: str):
        self.table_name = table_name
        self._client = get_supabase_client()
    
    @property
    def table(self):
        return self._client.table(self.table_name)
    
    async def find_one(self, query: Dict[str, Any], projection: Dict[str, Any] = None) -> Optional[Dict]:
        """Find single document matching query"""
        try:
            builder = self.table.select('*')
            
            for key, value in query.items():
                if isinstance(value, dict):
                    # Handle operators like $in, $gte, etc.
                    for op, op_value in value.items():
                        if op == '$in':
                            builder = builder.in_(key, op_value)
                        elif op == '$gte':
                            builder = builder.gte(key, op_value)
                        elif op == '$lte':
                            builder = builder.lte(key, op_value)
                        elif op == '$ne':
                            builder = builder.neq(key, op_value)
                else:
                    builder = builder.eq(key, value)
            
            result = builder.limit(1).execute()
            
            if result.data and len(result.data) > 0:
                return self._parse_json_fields(result.data[0])
            return None
            
        except Exception as e:
            logger.error(f"find_one error on {self.table_name}: {e}")
            return None
    
    async def find(self, query: Dict[str, Any] = None, projection: Dict[str, Any] = None) -> 'SupabaseCursor':
        """Find documents matching query, returns cursor-like object"""
        return SupabaseCursor(self.table_name, query or {}, projection)
    
    async def insert_one(self, document: Dict[str, Any]) -> Dict:
        """Insert single document"""
        try:
            clean_doc = self._prepare_document(document)
            result = self.table.insert(clean_doc).execute()
            return {'inserted_id': result.data[0]['id'] if result.data else None}
        except Exception as e:
            logger.error(f"insert_one error on {self.table_name}: {e}")
            raise
    
    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> Dict:
        """Update single document"""
        try:
            # Handle $set operator
            update_data = update.get('$set', update)
            clean_update = self._prepare_document(update_data)
            
            builder = self.table.update(clean_update)
            
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
    
    async def delete_one(self, query: Dict[str, Any]) -> Dict:
        """Delete single document"""
        try:
            builder = self.table.delete()
            
            for key, value in query.items():
                builder = builder.eq(key, value)
            
            result = builder.execute()
            
            return {'deleted_count': len(result.data) if result.data else 0}
            
        except Exception as e:
            logger.error(f"delete_one error on {self.table_name}: {e}")
            raise
    
    async def delete_many(self, query: Dict[str, Any]) -> Dict:
        """Delete multiple documents"""
        return await self.delete_one(query)  # Supabase handles multiple
    
    async def count_documents(self, query: Dict[str, Any] = None) -> int:
        """Count documents matching query"""
        try:
            builder = self.table.select('id', count='exact')
            
            if query:
                for key, value in query.items():
                    if isinstance(value, dict):
                        for op, op_value in value.items():
                            if op == '$in':
                                builder = builder.in_(key, op_value)
                            elif op == '$gte':
                                builder = builder.gte(key, op_value)
                            elif op == '$lte':
                                builder = builder.lte(key, op_value)
                    else:
                        builder = builder.eq(key, value)
            
            result = builder.execute()
            return result.count if hasattr(result, 'count') else len(result.data)
            
        except Exception as e:
            logger.error(f"count_documents error on {self.table_name}: {e}")
            return 0
    
    async def aggregate(self, pipeline: List[Dict]) -> List[Dict]:
        """
        Execute aggregation pipeline (limited support).
        For complex aggregations, use raw SQL via Supabase RPC.
        """
        logger.warning(f"Aggregation on {self.table_name} - limited support, returning all docs")
        cursor = await self.find({})
        return await cursor.to_list(length=1000)
    
    def _prepare_document(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare document for Supabase insert/update"""
        clean = {}
        
        for key, value in doc.items():
            if key == '_id':
                continue
            
            # Convert complex types to JSON strings for JSONB fields
            if isinstance(value, (list, dict)) and key in [
                'items', 'holdprint_data', 'products_with_area', 'item_assignments',
                'archived_items', 'products_installed', 'breakdown', 'keys'
            ]:
                clean[key] = json.dumps(value) if not isinstance(value, str) else value
            elif isinstance(value, datetime):
                clean[key] = value.isoformat()
            else:
                clean[key] = value
        
        return clean
    
    def _parse_json_fields(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Parse JSONB fields back to Python objects"""
        json_fields = [
            'items', 'holdprint_data', 'products_with_area', 'item_assignments',
            'archived_items', 'products_installed', 'breakdown', 'keys',
            'assigned_installers'
        ]
        
        for field in json_fields:
            if field in doc and isinstance(doc[field], str):
                try:
                    doc[field] = json.loads(doc[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        
        return doc


class SupabaseCursor:
    """Cursor-like object for Supabase queries"""
    
    def __init__(self, table_name: str, query: Dict[str, Any], projection: Dict[str, Any] = None):
        self.table_name = table_name
        self.query = query
        self.projection = projection
        self._sort_field = None
        self._sort_direction = 1
        self._limit_value = None
        self._skip_value = 0
        self._client = get_supabase_client()
    
    def sort(self, field: str, direction: int = 1) -> 'SupabaseCursor':
        """Sort results"""
        if isinstance(field, list):
            # Handle list of tuples [(field, direction), ...]
            if field:
                self._sort_field = field[0][0]
                self._sort_direction = field[0][1]
        else:
            self._sort_field = field
            self._sort_direction = direction
        return self
    
    def limit(self, n: int) -> 'SupabaseCursor':
        """Limit results"""
        self._limit_value = n
        return self
    
    def skip(self, n: int) -> 'SupabaseCursor':
        """Skip results"""
        self._skip_value = n
        return self
    
    async def to_list(self, length: int = None) -> List[Dict]:
        """Execute query and return list"""
        try:
            # Determine columns to select
            if self.projection:
                columns = [k for k, v in self.projection.items() if v and k != '_id']
                select_str = ','.join(columns) if columns else '*'
            else:
                select_str = '*'
            
            builder = self._client.table(self.table_name).select(select_str)
            
            # Apply filters
            for key, value in self.query.items():
                if isinstance(value, dict):
                    for op, op_value in value.items():
                        if op == '$in':
                            builder = builder.in_(key, op_value)
                        elif op == '$gte':
                            builder = builder.gte(key, op_value)
                        elif op == '$lte':
                            builder = builder.lte(key, op_value)
                        elif op == '$ne':
                            builder = builder.neq(key, op_value)
                        elif op == '$regex':
                            builder = builder.ilike(key, f'%{op_value}%')
                elif value is not None:
                    builder = builder.eq(key, value)
            
            # Apply sorting
            if self._sort_field:
                desc = self._sort_direction == -1
                builder = builder.order(self._sort_field, desc=desc)
            
            # Apply pagination
            limit = length or self._limit_value
            if limit:
                builder = builder.limit(limit)
            
            if self._skip_value:
                builder = builder.offset(self._skip_value)
            
            result = builder.execute()
            
            # Parse JSON fields
            return [self._parse_json_fields(doc) for doc in (result.data or [])]
            
        except Exception as e:
            logger.error(f"to_list error on {self.table_name}: {e}")
            return []
    
    def _parse_json_fields(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Parse JSONB fields"""
        json_fields = [
            'items', 'holdprint_data', 'products_with_area', 'item_assignments',
            'archived_items', 'products_installed', 'breakdown', 'keys',
            'assigned_installers'
        ]
        
        for field in json_fields:
            if field in doc and isinstance(doc[field], str):
                try:
                    doc[field] = json.loads(doc[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        
        return doc


class SupabaseDB:
    """
    Database wrapper that provides MongoDB-like interface for Supabase.
    Usage: db.users.find_one({'email': 'test@test.com'})
    """
    
    def __init__(self):
        self._collections = {}
    
    def __getattr__(self, name: str) -> SupabaseCollection:
        """Get collection by name"""
        if name.startswith('_'):
            raise AttributeError(name)
        
        if name not in self._collections:
            self._collections[name] = SupabaseCollection(name)
        
        return self._collections[name]
    
    def list_collection_names(self) -> List[str]:
        """List all table names"""
        return [
            'users', 'installers', 'jobs', 'item_checkins', 'checkins',
            'item_pause_logs', 'location_alerts', 'gamification_balances',
            'coin_transactions', 'rewards', 'product_families',
            'installed_products', 'productivity_history', 'job_justifications',
            'password_resets', 'push_subscriptions', 'system_config'
        ]


# Create global database instance
supabase_db = SupabaseDB()


def get_supabase_db() -> SupabaseDB:
    """Get the Supabase database instance"""
    return supabase_db
