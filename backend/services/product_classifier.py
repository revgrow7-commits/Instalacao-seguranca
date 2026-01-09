"""
Product classification service.
"""
import re
from typing import Optional
from config import PRODUCT_FAMILY_MAPPING


def classify_product_to_family(product_name: str) -> tuple:
    """
    Classifica um produto em uma família baseado no nome.
    Retorna (family_name, confidence_score)
    """
    if not product_name:
        return (None, 0)
    
    product_lower = product_name.lower()
    
    # Mapeamento com prioridade (mais específico primeiro)
    priority_mapping = [
        ("Letras Caixa", ["letra caixa", "letra-caixa", "letras caixa"]),
        ("Totens", ["totem"]),
        ("Envelopamento", ["envelopamento", "envelopar"]),
        ("Painéis Luminosos", ["painel backlight", "painel luminoso", "backlight", "lightbox"]),
        ("Tecidos", ["tecido", "bandeira", "wind banner"]),
        ("Estruturas Metálicas", ["estrutura metálica", "estrutura metalica", "backdrop", "cavalete"]),
        ("Lonas e Banners", ["lona", "banner", "faixa", "empena"]),
        ("Adesivos", ["adesivo", "vinil", "fachada adesivada", "fachada com vinil"]),
        ("Chapas e Placas", ["chapa", "placa", "acm", "acrílico", "acrilico", "mdf", " ps ", "pvc", "polionda", 
                           "policarbonato", "petg", "compensado", "xps"]),
        ("Serviços", ["serviço", "serviços", "instalação", "instalacao", "entrega", "montagem", 
                     "pintura", "serralheria", "solda", "corte", "aplicação", "aplicacao"]),
        ("Materiais Promocionais", ["cartaz", "flyer", "folder", "panfleto", "imã", "marca-página"]),
        ("Sublimação", ["sublimação", "sublimática", "sublimatico", "sublimacao"]),
        ("Impressão", ["impressão uv", "impressão latex", "impressão solvente", "impresso"]),
        ("Display/PS", ["display", "móbile", "mobile", "orelha de monitor"]),
        ("Produtos Terceirizados", ["terceirizado", "produto genérico"]),
        ("Fundação/Estrutura", ["fundação", "sapata", "estrutura em madeira"]),
    ]
    
    best_match = None
    best_score = 0
    
    for family_name, keywords in priority_mapping:
        for keyword in keywords:
            if keyword.lower() in product_lower:
                keyword_len = len(keyword)
                product_len = len(product_name)
                
                base_score = (keyword_len / product_len) * 100
                
                if product_lower.startswith(keyword.lower()):
                    base_score += 30
                
                if keyword.lower() == product_lower:
                    base_score = 100
                
                score = min(base_score, 100)
                
                if score > best_score:
                    best_score = score
                    best_match = family_name
    
    if best_match:
        return (best_match, round(best_score, 1))
    
    return ("Outros", 10)


def extract_product_measures(description: str) -> dict:
    """
    Extrai medidas (largura, altura, cópias) da descrição HTML do produto.
    Retorna dict com width_m, height_m, copies e area_m2
    """
    result = {
        "width_m": None,
        "height_m": None,
        "copies": 1,
        "area_m2": None
    }
    
    if not description:
        return result
    
    # Extrair Largura
    width_patterns = [
        r'Largura:\s*<span[^>]*>([0-9.,]+)\s*m',
        r'Largura:\s*([0-9.,]+)\s*m',
        r'largura[:\s]+([0-9.,]+)\s*m',
    ]
    for pattern in width_patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            result["width_m"] = float(match.group(1).replace(',', '.'))
            break
    
    # Extrair Altura
    height_patterns = [
        r'Altura:\s*<span[^>]*>([0-9.,]+)\s*m',
        r'Altura:\s*([0-9.,]+)\s*m',
        r'altura[:\s]+([0-9.,]+)\s*m',
    ]
    for pattern in height_patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            result["height_m"] = float(match.group(1).replace(',', '.'))
            break
    
    # Extrair Cópias
    copies_patterns = [
        r'Cópias:\s*<span[^>]*>([0-9]+)',
        r'Cópias:\s*([0-9]+)',
        r'copias[:\s]+([0-9]+)',
    ]
    for pattern in copies_patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            result["copies"] = int(match.group(1))
            break
    
    # Calcular área
    if result["width_m"] and result["height_m"]:
        result["area_m2"] = round(result["width_m"] * result["height_m"] * result["copies"], 2)
    
    return result


def calculate_job_products_area(holdprint_data: dict) -> tuple:
    """
    Calcula a área de todos os produtos de um job.
    Retorna (products_with_area, total_area_m2, total_products, total_quantity)
    """
    products = holdprint_data.get("products", [])
    products_with_area = []
    total_area_m2 = 0
    total_quantity = 0
    
    for product in products:
        product_name = product.get("name", "")
        quantity = product.get("quantity", 1)
        description = product.get("description", "")
        
        measures = extract_product_measures(description)
        family_name, confidence = classify_product_to_family(product_name)
        
        item_area = None
        if measures["width_m"] and measures["height_m"]:
            unit_area = measures["width_m"] * measures["height_m"]
            item_area = round(unit_area * quantity * measures["copies"], 2)
            total_area_m2 += item_area
        
        total_quantity += quantity
        
        product_data = {
            "name": product_name,
            "family_name": family_name,
            "confidence": confidence,
            "quantity": quantity,
            "width_m": measures["width_m"],
            "height_m": measures["height_m"],
            "copies": measures["copies"],
            "unit_area_m2": round(measures["width_m"] * measures["height_m"], 2) if measures["width_m"] and measures["height_m"] else None,
            "total_area_m2": item_area,
            "unit_price": product.get("unitPrice", 0),
            "total_value": product.get("totalValue", 0)
        }
        products_with_area.append(product_data)
    
    return (products_with_area, round(total_area_m2, 2), len(products), total_quantity)
