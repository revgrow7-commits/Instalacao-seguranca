"""
Holdprint API integration service.
"""
import re
import logging
import requests
from fastapi import HTTPException
from config import HOLDPRINT_API_KEY_POA, HOLDPRINT_API_KEY_SP, HOLDPRINT_API_URL

logger = logging.getLogger(__name__)


async def fetch_holdprint_jobs(branch: str):
    """Fetch jobs from Holdprint API - Janeiro 2026 (1 a 7)"""
    api_key = HOLDPRINT_API_KEY_POA if branch == "POA" else HOLDPRINT_API_KEY_SP
    
    if not api_key:
        raise HTTPException(status_code=500, detail=f"API key not configured for branch {branch}")
    
    headers = {"x-api-key": api_key}
    
    # Período fixo: 1 a 7 de Janeiro de 2026
    start_date_str = "2026-01-01"
    end_date_str = "2026-01-07"
    
    params = {
        "page": 1,
        "pageSize": 100,
        "startDate": start_date_str,
        "endDate": end_date_str,
        "language": "pt-BR"
    }
    
    try:
        response = requests.get(HOLDPRINT_API_URL, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        jobs = []
        if isinstance(data, dict) and 'data' in data:
            jobs = data['data']
        elif isinstance(data, list):
            jobs = data
        
        # Filtrar jobs NÃO finalizados
        filtered_jobs = [job for job in jobs if not job.get('isFinalized', False)]
        
        logger.info(f"Holdprint {branch}: {len(jobs)} jobs encontrados, {len(filtered_jobs)} não finalizados (período: {start_date_str} a {end_date_str})")
        
        return filtered_jobs
    except requests.RequestException as e:
        logger.error(f"Error fetching from Holdprint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching from Holdprint: {str(e)}")


def extract_product_dimensions(product: dict) -> dict:
    """
    Canonical dimension extractor for Holdprint products. Single source of truth.

    Priority order:
      1. widthMm / heightMm fields (explicit mm → ÷1000)
      2. width / height fields (assume mm → ÷1000, based on Holdprint API format)
      3. HTML description "Largura/Altura: X m" (already in meters)
      4. Product name "NxN" pattern (already in meters)

    Uses 'quantity' (primary) or 'copies' (fallback) as the multiplier.
    Returns dict with: width_m, height_m, quantity, area_m2, total_area_m2, name, family.
    """
    width_m = 0.0
    height_m = 0.0

    quantity = 1
    for field in ("quantity", "copies"):
        try:
            val = int(product.get(field) or 0)
            if val > 0:
                quantity = val
                break
        except (ValueError, TypeError):
            pass

    # 1. Explicit mm fields
    if product.get("widthMm") or product.get("heightMm"):
        try:
            width_m = float(product.get("widthMm") or 0) / 1000
        except (ValueError, TypeError):
            pass
        try:
            height_m = float(product.get("heightMm") or 0) / 1000
        except (ValueError, TypeError):
            pass

    # 2. Generic width/height — Holdprint API sends values in mm
    if not width_m and product.get("width"):
        try:
            width_m = float(str(product["width"]).replace(',', '.')) / 1000
        except (ValueError, TypeError):
            pass
    if not height_m and product.get("height"):
        try:
            height_m = float(str(product["height"]).replace(',', '.')) / 1000
        except (ValueError, TypeError):
            pass

    # 3. HTML description — values are already in meters ("Largura: 1.5 m")
    description = product.get("description", "")
    if description and (not width_m or not height_m):
        width_patterns = [
            r'Largura:\s*<span[^>]*>([0-9.,]+)\s*m',
            r'Largura[:\s]+([0-9.,]+)\s*m',
        ]
        for pattern in width_patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                try:
                    width_m = float(match.group(1).replace(',', '.'))
                    break
                except (ValueError, TypeError):
                    pass

        height_patterns = [
            r'Altura:\s*<span[^>]*>([0-9.,]+)\s*m',
            r'Altura[:\s]+([0-9.,]+)\s*m',
        ]
        for pattern in height_patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                try:
                    height_m = float(match.group(1).replace(',', '.'))
                    break
                except (ValueError, TypeError):
                    pass

        if quantity == 1:
            copies_patterns = [
                r'Cópias:\s*<span[^>]*>([0-9]+)',
                r'Cópias[:\s]+([0-9]+)',
            ]
            for pattern in copies_patterns:
                match = re.search(pattern, description, re.IGNORECASE)
                if match:
                    try:
                        quantity = int(match.group(1))
                        break
                    except (ValueError, TypeError):
                        pass

    # 4. Product name fallback — e.g. "Banner 2,5x1,2m" (values in meters)
    name = product.get("name", product.get("title", ""))
    if name and (not width_m or not height_m):
        match = re.search(r'(\d+[.,]?\d*)\s*[xX]\s*(\d+[.,]?\d*)\s*m?', name)
        if match:
            try:
                w = float(match.group(1).replace(',', '.'))
                h = float(match.group(2).replace(',', '.'))
                if not width_m:
                    width_m = w
                if not height_m:
                    height_m = h
            except (ValueError, TypeError):
                pass

    area_m2 = round(width_m * height_m, 4) if width_m and height_m else 0.0
    total_area_m2 = round(area_m2 * quantity, 4)

    return {
        "name": name or "Produto sem nome",
        "width_m": round(width_m, 4),
        "height_m": round(height_m, 4),
        "quantity": quantity,
        "copies": quantity,  # alias for callers using the old field name
        "area_m2": area_m2,
        "total_area_m2": total_area_m2,
        "family": product.get("family", product.get("category", "Outros")),
    }
