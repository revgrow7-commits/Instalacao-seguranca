"""
Holdprint API integration service.
"""
import re
import logging

logger = logging.getLogger(__name__)


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

    # 3. HTML description — Holdprint sends values in cm ("Largura: 13cm") or meters ("Largura: 1.5m")
    description = product.get("description", "")
    if description and (not width_m or not height_m):
        def _parse_dimension(pattern, text):
            """Return dimension in meters. Handles cm and m units."""
            m = re.search(pattern, text, re.IGNORECASE)
            if not m:
                return 0.0
            try:
                value = float(m.group(1).replace(',', '.'))
                unit = (m.group(2) or 'm').lower().strip()
                return value / 100 if unit == 'cm' else value
            except (ValueError, TypeError, IndexError):
                return 0.0

        width_patterns = [
            r'Largura:\s*<span[^>]*>([0-9.,]+)\s*(cm|m)\b',
            r'Largura[:\s•&#8226;]+([0-9.,]+)\s*(cm|m)\b',
        ]
        for pattern in width_patterns:
            v = _parse_dimension(pattern, description)
            if v:
                width_m = v
                break

        height_patterns = [
            r'Altura:\s*<span[^>]*>([0-9.,]+)\s*(cm|m)\b',
            r'Altura[:\s•&#8226;]+([0-9.,]+)\s*(cm|m)\b',
        ]
        for pattern in height_patterns:
            v = _parse_dimension(pattern, description)
            if v:
                height_m = v
                break

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
