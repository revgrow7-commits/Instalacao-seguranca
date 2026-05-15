-- Migration 031: Recria productivity_history com schema correto
-- Contexto: tabela existia com schema de benchmarks agregados (avg por família/complexidade)
-- mas o código (routes/products.py:update_productivity_history) espera registros
-- por instalador/família/dia (installer_id, date, total_m2, total_minutes, items_count).
-- O mismatch causava crash no checkout com "column installer_id does not exist".
-- Workaround atual: try/except em item_checkins.py:643 (commit 730d4d8).
-- Esta migration corrige o schema definitivamente.

BEGIN;

-- 1. Preservar dados da tabela antiga (caso seja útil futuramente)
ALTER TABLE IF EXISTS productivity_history RENAME TO productivity_history_benchmarks_legacy;

-- 2. Criar nova tabela com o schema que o código espera
CREATE TABLE productivity_history (
    id          TEXT PRIMARY KEY,
    family_id   TEXT REFERENCES product_families(id) ON DELETE SET NULL,
    family_name TEXT,
    installer_id TEXT REFERENCES installers(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,           -- YYYY-MM-DD
    total_m2    NUMERIC(10,2) DEFAULT 0,
    total_minutes NUMERIC(10,2) DEFAULT 0,
    items_count INTEGER DEFAULT 0,
    productivity_m2_h NUMERIC(10,2) DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (family_id, installer_id, date)
);

-- 3. Index para as queries frequentes (find_one por family_id + installer_id + date)
CREATE INDEX idx_productivity_history_lookup
    ON productivity_history (family_id, installer_id, date);

CREATE INDEX idx_productivity_history_installer
    ON productivity_history (installer_id, date DESC);

COMMIT;
