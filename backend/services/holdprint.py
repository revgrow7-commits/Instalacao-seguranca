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

    # 3. HTML description — "Medidas do trabalho" pode ter VÁRIAS linhas (ex.: Totem
    #    Face e Verso, ou várias matérias-primas). Cada linha traz Largura/Altura/Cópias.
    #    Somamos a área de TODAS as linhas (antes lia só a primeira → subdimensionava).
    #    Holdprint manda em cm ("Largura: 13cm") ou metros ("Largura: 1.5m").
    description = product.get("description", "")
    desc_total_area = 0.0
    if description and (not width_m or not height_m):
        def _to_m(raw_value, raw_unit):
            try:
                value = float(str(raw_value).replace(',', '.'))
            except (ValueError, TypeError):
                return 0.0
            return value / 100 if (raw_unit or 'm').lower().strip() == 'cm' else value

        # Captura TODAS as ocorrências (findall), na ordem do texto, e pareia por índice.
        # `<span ...>` é opcional (cobre "Largura: <span>0.9m</span>" e "Largura: 1.12m").
        widths = [_to_m(v, u) for v, u in re.findall(
            r'Largura\s*[:\-]?\s*(?:<span[^>]*>)?\s*([0-9.,]+)\s*(cm|m)\b', description, re.IGNORECASE)]
        heights = [_to_m(v, u) for v, u in re.findall(
            r'Altura\s*[:\-]?\s*(?:<span[^>]*>)?\s*([0-9.,]+)\s*(cm|m)\b', description, re.IGNORECASE)]
        copies_raw = re.findall(
            r'C[óo]pias\s*[:\-]?\s*(?:<span[^>]*>)?\s*([0-9]+)', description, re.IGNORECASE)
        copies = []
        for c in copies_raw:
            try:
                copies.append(int(c))
            except (ValueError, TypeError):
                copies.append(1)

        n_lines = max(len(widths), len(heights))
        for i in range(n_lines):
            w_i = widths[i] if i < len(widths) else 0.0
            h_i = heights[i] if i < len(heights) else 0.0
            c_i = copies[i] if i < len(copies) else 1
            if w_i and h_i:
                desc_total_area += w_i * h_i * c_i

        # width_m/height_m da PRIMEIRA linha apenas para exibição (a área usa a soma).
        if not width_m and widths:
            width_m = widths[0]
        if not height_m and heights:
            height_m = heights[0]

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
    if desc_total_area > 0:
        # Soma multi-linha da descrição (já inclui as cópias por linha). O quantity
        # de nível de produto multiplica o conjunto (normalmente 1).
        total_area_m2 = round(desc_total_area * quantity, 4)
    else:
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
