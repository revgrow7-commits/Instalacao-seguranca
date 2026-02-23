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
    Extract dimensions from product data.
    Tries multiple sources: description HTML, product fields, and product name.
    Returns dict with width_m, height_m, copies, area_m2.
    """
    result = {
        "width_m": 0,
        "height_m": 0,
        "copies": 1,
        "area_m2": 0
    }
    
    # First, check if dimensions are directly in the product fields
    if product.get("width"):
        try:
            # May be in cm or m
            width = float(str(product.get("width")).replace(',', '.'))
            result["width_m"] = width if width < 100 else width / 100  # Assume cm if > 100
        except (ValueError, TypeError):
            pass
    
    if product.get("height"):
        try:
            height = float(str(product.get("height")).replace(',', '.'))
            result["height_m"] = height if height < 100 else height / 100
        except (ValueError, TypeError):
            pass
    
    if product.get("copies"):
        try:
            result["copies"] = int(product.get("copies"))
        except (ValueError, TypeError):
            pass
    
    # Check for measures field (some APIs provide this)
    measures = product.get("measures", {})
    if isinstance(measures, dict):
        if measures.get("width") and not result["width_m"]:
            try:
                result["width_m"] = float(str(measures.get("width")).replace(',', '.'))
            except (ValueError, TypeError):
                pass
        if measures.get("height") and not result["height_m"]:
            try:
                result["height_m"] = float(str(measures.get("height")).replace(',', '.'))
            except (ValueError, TypeError):
                pass
    
    # Try to extract from description HTML
    description = product.get("description", "")
    if description and (not result["width_m"] or not result["height_m"]):
        # Width patterns
        width_patterns = [
            r'Largura:\s*<span[^>]*>([0-9.,]+)\s*m',
            r'Largura:\s*([0-9.,]+)\s*m',
            r'largura[:\s]+([0-9.,]+)\s*m',
            r'Largura[:\s]+([0-9.,]+)\s*(?:m|cm)',
        ]
        for pattern in width_patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                try:
                    width = float(match.group(1).replace(',', '.'))
                    result["width_m"] = width if width < 100 else width / 100
                    break
                except (ValueError, TypeError):
                    pass
        
        # Height patterns
        height_patterns = [
            r'Altura:\s*<span[^>]*>([0-9.,]+)\s*m',
            r'Altura:\s*([0-9.,]+)\s*m',
            r'altura[:\s]+([0-9.,]+)\s*m',
            r'Altura[:\s]+([0-9.,]+)\s*(?:m|cm)',
        ]
        for pattern in height_patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                try:
                    height = float(match.group(1).replace(',', '.'))
                    result["height_m"] = height if height < 100 else height / 100
                    break
                except (ValueError, TypeError):
                    pass
        
        # Copies patterns
        if result["copies"] == 1:
            copies_patterns = [
                r'Cópias:\s*<span[^>]*>([0-9]+)',
                r'Cópias:\s*([0-9]+)',
                r'copias[:\s]+([0-9]+)',
                r'(\d+)\s*(?:cópia|copia|copy)',
            ]
            for pattern in copies_patterns:
                match = re.search(pattern, description, re.IGNORECASE)
                if match:
                    try:
                        result["copies"] = int(match.group(1))
                        break
                    except (ValueError, TypeError):
                        pass
    
    # Last resort: try to extract from product name (e.g., "Placa 1x0.5m" or "Banner 2,5x1,2m")
    name = product.get("name", "")
    if name and (not result["width_m"] or not result["height_m"]):
        # Pattern for "NxN" format (e.g., "1x0.5m", "2,5x1,2m", "1.5 x 0.8 m")
        name_pattern = r'(\d+[.,]?\d*)\s*[xX]\s*(\d+[.,]?\d*)\s*m?'
        match = re.search(name_pattern, name)
        if match:
            try:
                w = float(match.group(1).replace(',', '.'))
                h = float(match.group(2).replace(',', '.'))
                if not result["width_m"]:
                    result["width_m"] = w if w < 100 else w / 100
                if not result["height_m"]:
                    result["height_m"] = h if h < 100 else h / 100
            except (ValueError, TypeError):
                pass
    
    # Calculate area
    if result["width_m"] and result["height_m"]:
        result["area_m2"] = round(result["width_m"] * result["height_m"] * result["copies"], 2)
    
    return result
