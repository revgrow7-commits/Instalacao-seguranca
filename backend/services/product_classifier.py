"""
Product classification service — FONTE ÚNICA de classificação de família.

Mapeia o NOME de um produto do Holdprint para uma das famílias cadastradas em
`product_families`. Antes existiam 3 classificadores divergentes (este,
`routes/reports.py:classify_product_to_family` e `routes/item_checkins.py:
detect_product_family`); agora todos delegam para cá.

`classify_family(name)` devolve (family_id, family_name) resolvendo o id no
banco por correspondência insensível a acento — assim nomes canônicos com
acento ("Painéis Luminosos") casam com a linha real do banco ("Paineis
Luminosos"). Qualquer rótulo que não exista no banco cai em "Outros".
"""
import logging
import unicodedata

from db_supabase import db
from services.holdprint import extract_product_dimensions

logger = logging.getLogger(__name__)

FALLBACK_FAMILY = "Outros"

# Cache {nome_normalizado: (id, nome_oficial)} carregado de product_families.
_family_index = None


def _strip(s: str) -> str:
    """Minúsculas + sem acento, para casamento robusto."""
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def _family_ids() -> dict:
    global _family_index
    if _family_index is not None:
        return _family_index
    mapping = {}
    try:
        for f in db.product_families.find({}, {"_id": 0}):
            nome = f.get("name")
            if nome:
                mapping[_strip(nome)] = (f.get("id"), nome)
    except Exception as e:
        logger.warning(f"product_classifier: falha ao carregar product_families: {e}")
    _family_index = mapping
    return mapping


def reset_cache():
    """Limpa o cache nome→id (usar em scripts de backfill)."""
    global _family_index
    _family_index = None


def normalize_family_name(name: str) -> str:
    """Resolve um rótulo de família (possivelmente acentuado/variante, ex.:
    'Serviços', 'Painéis Luminosos') para o nome OFICIAL cadastrado em
    product_families ('Servicos', 'Paineis Luminosos'). Mantém o valor original
    se não houver correspondência. Unifica buckets divergentes nos relatórios."""
    if not name:
        return FALLBACK_FAMILY
    r = _family_ids().get(_strip(name))
    return r[1] if r else name


def classify_family(product_name: str) -> tuple:
    """
    Retorna (family_id, family_name) para um nome de produto.

    Resolve o id no banco; se o rótulo canônico não existir em product_families,
    cai em "Outros". family_id pode ser None se o próprio "Outros" não estiver
    cadastrado (devolve ainda assim o nome).
    """
    canonical, _score = classify_product_to_family(product_name)
    ids = _family_ids()

    resolved = ids.get(_strip(canonical))
    if resolved:
        return resolved[0], resolved[1]

    # Rótulo canônico não cadastrado (ex.: "Produtos Terceirizados") → Outros.
    outros = ids.get(_strip(FALLBACK_FAMILY))
    if outros:
        return outros[0], outros[1]
    return None, canonical or FALLBACK_FAMILY


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
    """Legacy shim — delegates to extract_product_dimensions for backwards compatibility."""
    dims = extract_product_dimensions({"description": description})
    return {
        "width_m": dims["width_m"] or None,
        "height_m": dims["height_m"] or None,
        "copies": dims["quantity"],
        "area_m2": dims["area_m2"] or None,
    }


def calculate_job_products_area(holdprint_data: dict) -> tuple:
    """
    Calcula a área de todos os produtos de um job.
    Retorna (products_with_area, total_area_m2, total_products, total_quantity)
    """
    products = holdprint_data.get("products", [])
    products_with_area = []
    total_area_m2 = 0.0
    total_quantity = 0

    for product in products:
        dims = extract_product_dimensions(product)
        family_id, family_name = classify_family(dims["name"])
        confidence = classify_product_to_family(dims["name"])[1]

        if dims["area_m2"]:
            total_area_m2 += dims["total_area_m2"]

        total_quantity += dims["quantity"]

        unit_area = round(dims["width_m"] * dims["height_m"], 4) if dims["width_m"] and dims["height_m"] else None
        product_data = {
            "name": dims["name"],
            "family_id": family_id,
            "family_name": family_name,
            "confidence": confidence,
            "quantity": dims["quantity"],
            "width_m": dims["width_m"] or None,
            "height_m": dims["height_m"] or None,
            "copies": dims["quantity"],
            "unit_area_m2": unit_area,
            "total_area_m2": dims["total_area_m2"] or None,
            "unit_price": product.get("unitPrice", 0),
            "total_value": product.get("totalValue", 0),
        }
        products_with_area.append(product_data)

    return (products_with_area, round(total_area_m2, 2), len(products), total_quantity)
