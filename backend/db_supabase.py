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


def _deserialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Deserialize JSONB fields from Supabase"""
    if not doc:
        return doc
    
    json_fields = [
        'items', 'holdprint_data', 'products_with_area', 'item_assignments',
        'archived_items', 'products_installed', 'breakdown', 'keys',
        'assigned_installers', 'checklists'
    ]
    
    for field in json_fields:
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
            
            # Apply filters
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
                elif value is not None:
                    builder = builder.eq(key, value)
            
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
            
            # Serialize values
            clean_doc = {k: _serialize(v) for k, v in document.items() if v is not None}
            
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
                clean_docs.append({k: _serialize(v) for k, v in doc.items() if v is not None})
            
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
            
            # Serialize
            clean_update = {k: _serialize(v) for k, v in update_data.items() if v is not None}
            
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
        return_document: str = 'after'
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
