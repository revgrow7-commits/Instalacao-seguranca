-- Migration 043: soft-delete de jobs
-- Permite excluir um job de forma reversível (soft-delete). Jobs deletados saem de
-- listas, relatórios e KPIs (ver _metrics_excluded em routes/reports.py), mas os dados
-- permanecem no banco para auditoria/reversão (rota POST /jobs/{id}/restore).

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS deleted         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by      TEXT,
  ADD COLUMN IF NOT EXISTS deleted_by_name TEXT;

UPDATE jobs SET deleted = FALSE WHERE deleted IS NULL;

-- Acelera a listagem, que sempre filtra deleted != true
CREATE INDEX IF NOT EXISTS idx_jobs_deleted ON jobs (deleted);
