"""
Holdprint Sync Service - Stateless version for Vercel Serverless
This module handles synchronization with Holdprint API without persistent state.
"""
import os
import logging
import httpx
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Tuple

logger = logging.getLogger(__name__)

# API Configuration
HOLDPRINT_API_URL = "https://api.holdworks.ai/api-key/jobs/data"


def extract_product_dimensions(product: Dict[str, Any]) -> Dict[str, Any]:
    """Extract dimensions from product data"""
    width_m = 0.0
    height_m = 0.0
    quantity = product.get('quantity', 1) or 1
    
    # Try to get dimensions from various possible fields
    if 'width' in product and 'height' in product:
        width_m = float(product.get('width', 0) or 0) / 1000  # mm to m
        height_m = float(product.get('height', 0) or 0) / 1000
    elif 'widthMm' in product and 'heightMm' in product:
        width_m = float(product.get('widthMm', 0) or 0) / 1000
        height_m = float(product.get('heightMm', 0) or 0) / 1000
    
    area_m2 = width_m * height_m
    total_area_m2 = area_m2 * quantity
    
    return {
        "name": product.get('name', product.get('title', 'Produto sem nome')),
        "width_m": round(width_m, 4),
        "height_m": round(height_m, 4),
        "quantity": quantity,
        "area_m2": round(area_m2, 4),
        "total_area_m2": round(total_area_m2, 4),
        "family": product.get('family', product.get('category', 'Outros'))
    }


def sync_holdprint_jobs_sync(db) -> Dict[str, Any]:
    """
    Synchronous version of Holdprint sync for Vercel Cron.
    Returns summary of the sync operation.
    """
    logger.info("🔄 Iniciando sincronização com Holdprint (Vercel Cron)...")
    
    HOLDPRINT_API_KEY_POA = os.environ.get('HOLDPRINT_API_KEY_POA')
    HOLDPRINT_API_KEY_SP = os.environ.get('HOLDPRINT_API_KEY_SP')
    
    total_imported = 0
    total_skipped = 0
    total_errors = 0
    branches_synced = []
    
    with httpx.Client(timeout=60.0) as client:
        for branch in ["POA", "SP"]:
            api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
            
            if not api_key:
                logger.warning(f"API key not configured for {branch}")
                continue
            
            headers = {"x-api-key": api_key, "Accept": "application/json"}
            page = 1
            branch_imported = 0
            branch_skipped = 0
            
            try:
                while True:
                    response = client.get(f"{HOLDPRINT_API_URL}?page={page}", headers=headers)
                    response.raise_for_status()
                    data = response.json()
                    
                    jobs = data.get('data', []) if isinstance(data, dict) else data
                    has_next = data.get('hasNextPage', False) if isinstance(data, dict) else False
                    
                    if not jobs:
                        break
                    
                    for holdprint_job in jobs:
                        holdprint_job_id = str(holdprint_job.get('id', ''))
                        
                        # Check if already exists
                        existing = db.jobs.find_one({"holdprint_job_id": holdprint_job_id})
                        if existing:
                            branch_skipped += 1
                            total_skipped += 1
                            continue
                        
                        try:
                            # Process products
                            products = holdprint_job.get('production', {}).get('products', [])
                            products_with_area = []
                            total_area_m2 = 0.0
                            
                            for product in products:
                                product_info = extract_product_dimensions(product)
                                products_with_area.append(product_info)
                                total_area_m2 += product_info.get('total_area_m2', 0)
                            
                            # Create job document
                            job_doc = {
                                "id": str(uuid.uuid4()),
                                "holdprint_job_id": holdprint_job_id,
                                "title": holdprint_job.get('title', 'Sem título'),
                                "client_name": holdprint_job.get('customerName', 'Cliente não informado'),
                                "client_address": holdprint_job.get('address', ''),
                                "branch": branch,
                                "status": "aguardando",
                                "scheduled_date": None,
                                "assigned_installers": [],
                                "item_assignments": [],
                                "archived_items": [],
                                "items": holdprint_job.get('production', {}).get('items', []),
                                "holdprint_data": holdprint_job,
                                "area_m2": total_area_m2,
                                "products_with_area": products_with_area,
                                "total_products": len(products),
                                "total_quantity": sum(p.get('quantity', 1) or 1 for p in products),
                                "archived": False,
                                "exclude_from_metrics": False,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            
                            db.jobs.insert_one(job_doc)
                            branch_imported += 1
                            total_imported += 1
                            
                        except Exception as e:
                            total_errors += 1
                            logger.error(f"Error importing job {holdprint_job_id}: {e}")
                    
                    if not has_next:
                        break
                    page += 1
                    if page > 50:  # Safety limit
                        break
                
                branches_synced.append({
                    "branch": branch,
                    "imported": branch_imported,
                    "skipped": branch_skipped
                })
                logger.info(f"Sync {branch}: {branch_imported} imported, {branch_skipped} skipped")
                
            except Exception as e:
                total_errors += 1
                logger.error(f"Error syncing {branch}: {e}")
    
    # Update sync status
    sync_result = {
        "key": "last_holdprint_sync",
        "value": datetime.now(timezone.utc).isoformat(),
        "total_imported": total_imported,
        "total_skipped": total_skipped,
        "total_errors": total_errors,
        "sync_type": "vercel_cron",
        "branches": branches_synced,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        # Upsert sync status
        existing = db.system_config.find_one({"key": "last_holdprint_sync"})
        if existing:
            db.system_config.update_one(
                {"key": "last_holdprint_sync"},
                {"$set": sync_result}
            )
        else:
            db.system_config.insert_one(sync_result)
    except Exception as e:
        logger.error(f"Error updating sync status: {e}")
    
    logger.info(f"✅ Sync completed: {total_imported} imported, {total_skipped} skipped, {total_errors} errors")
    
    return sync_result
