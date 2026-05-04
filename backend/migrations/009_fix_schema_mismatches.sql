-- Migration 009: Fix schema mismatches between real DB and backend expectations
--
-- Problema: O banco real foi criado com um schema diferente do 001_schema_completo.sql.
-- Colunas usadas pelo backend nao existiam na tabela real.

-- jobs: adiciona colunas usadas pelo backend
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT,
  ADD COLUMN IF NOT EXISTS archived_by_name TEXT,
  ADD COLUMN IF NOT EXISTS no_installation BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS justification JSONB,
  ADD COLUMN IF NOT EXISTS justified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS installation_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_archived ON jobs(archived);

-- item_checkins: adiciona colunas usadas pelo backend
ALTER TABLE item_checkins
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS products_installed JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- system_config: adiciona colunas que o backend tenta escrever
ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS total_imported INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_skipped INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_errors INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS sync_type TEXT;
