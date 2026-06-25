"""
Backfill idempotente — reclassifica famílias e recalcula áreas (parser multi-linha)
nos dados históricos do Instal-Visual.

Por quê: a classificação de família estava quebrada (quase tudo em "Outros") e o
parser de "Medidas do trabalho" lia só a primeira linha (subdimensionava itens com
várias peças). O código novo corrige isso na importação e ao vivo no relatório;
este script persiste a correção nos jobs e check-ins JÁ existentes.

O que faz (idempotente — rodar 2x dá o mesmo resultado):
  1. Para cada job: reextrai dimensões (multi-linha) de cada produto, classifica a
     família (classificador único), regrava products_with_area com family_id/
     family_name + total_area_m2 corrigido e recalcula job.area_m2.
  2. Para cada item_checkin: grava family_id/family_name herdados do item do job.

Uso:
    python backfill_families_areas.py --dry-run     # só relatório, não escreve
    python backfill_families_areas.py --apply       # aplica as alterações

Roda com as credenciais do backend/.env (mesmo SUPABASE_SERVICE_KEY do app).
"""
import sys
import logging

from db_supabase import db
from services.holdprint import extract_product_dimensions
from services.product_classifier import classify_family, reset_cache

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("backfill")


def _rebuild_products(job: dict) -> tuple:
    """Recalcula dimensões (parser multi-linha) e família, MESCLANDO sobre o item
    já gravado (preserva campos que a UI usa, ex.: unit_area_m2, unit_price).
    Retorna (products_with_area, total_area_m2)."""
    raw = (job.get("holdprint_data") or {}).get("products", []) or []
    existing = job.get("products_with_area") or []
    rebuilt = []
    total = 0.0
    for i, product in enumerate(raw):
        dims = extract_product_dimensions(product)
        fam_id, fam_name = classify_family(dims.get("name", ""))
        base = dict(existing[i]) if i < len(existing) and isinstance(existing[i], dict) else {}
        # Atualiza só os campos recalculados; mantém o resto do item.
        base["name"] = dims.get("name") or base.get("name")
        base["width_m"] = dims.get("width_m")
        base["height_m"] = dims.get("height_m")
        base["quantity"] = dims.get("quantity")
        base["copies"] = dims.get("quantity")
        base["area_m2"] = dims.get("area_m2")
        base["total_area_m2"] = dims.get("total_area_m2")
        if dims.get("width_m") and dims.get("height_m"):
            base["unit_area_m2"] = round(dims["width_m"] * dims["height_m"], 4)
        base["family_id"] = fam_id
        base["family_name"] = fam_name
        base["family"] = fam_name  # alias legado mantido em sincronia
        rebuilt.append(base)
        total += dims.get("total_area_m2", 0) or 0
    return rebuilt, round(total, 4)


def run(apply: bool):
    reset_cache()
    jobs = list(db.jobs.find({}, {"_id": 0}))
    log.info(f"Jobs: {len(jobs)}")

    # índice job_id → products_with_area reconstruído (para herdar nos check-ins)
    job_products = {}
    jobs_updated = 0
    for job in jobs:
        if not (job.get("holdprint_data") or {}).get("products"):
            # job sem dados crus (ex.: criado manualmente) — preserva o que tem
            job_products[job["id"]] = job.get("products_with_area", []) or []
            continue
        rebuilt, total = _rebuild_products(job)
        job_products[job["id"]] = rebuilt
        if apply:
            db.jobs.update_one(
                {"id": job["id"]},
                {"$set": {"products_with_area": rebuilt, "area_m2": total}},
            )
        jobs_updated += 1

    # check-ins: herda família do item correspondente
    checkins = list(db.item_checkins.find({}, {"_id": 0, "checkin_photo": 0, "checkout_photo": 0}))
    log.info(f"Item check-ins: {len(checkins)}")
    ck_updated = 0
    fam_count = {}
    for c in checkins:
        prods = job_products.get(c.get("job_id"))
        if not prods:
            continue
        idx = c.get("item_index", 0)
        if not (isinstance(idx, int) and 0 <= idx < len(prods)):
            continue
        item = prods[idx] or {}
        fam_id = item.get("family_id")
        fam_name = item.get("family_name")
        if not fam_name:
            fam_id, fam_name = classify_family(item.get("name") or c.get("product_name") or "")
        fam_count[fam_name] = fam_count.get(fam_name, 0) + 1
        if apply and (c.get("family_name") != fam_name or c.get("family_id") != fam_id):
            db.item_checkins.update_one(
                {"id": c["id"]},
                {"$set": {"family_name": fam_name, "family_id": fam_id}},
            )
            ck_updated += 1

    log.info("\nDistribuição de família resultante (check-ins):")
    for fam, n in sorted(fam_count.items(), key=lambda x: -x[1]):
        log.info(f"  {n:4}  {fam}")

    mode = "APLICADO" if apply else "DRY-RUN (nada escrito)"
    log.info(f"\n{mode}: jobs reprocessados={jobs_updated}, check-ins atualizados={ck_updated}")


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    if not apply and "--dry-run" not in sys.argv:
        log.info("Informe --dry-run ou --apply.")
        sys.exit(1)
    run(apply)
