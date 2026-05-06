-- Migration 011: Reconciliação de schema (2026-05-05)
-- Corrige divergências confirmadas via information_schema vs TABLE_COLUMNS no código.
-- Idempotente: todas as operações usam IF NOT EXISTS / IF EXISTS.

-- ============================================================
-- 1. Adicionar scheduled_time_end (ausente no banco; presente em TABLE_COLUMNS e 010_add_scheduled_time_end)
-- A migration 010_add_scheduled_time_end_google_token.sql nunca foi aplicada ao banco real.
-- ============================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_time_end TIMESTAMPTZ;

-- Garantir que installers também tenha as colunas do 010 (caso não aplicadas)
ALTER TABLE installers ADD COLUMN IF NOT EXISTS google_token JSONB;
ALTER TABLE installers ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

-- ============================================================
-- 2. Corrigir índice idx_jobs_archived
-- Situação: índice estava em is_archived (coluna legacy), mas código usa archived.
-- Resultado: filtros WHERE archived = false não usavam o índice → full scan em cada query de calendário.
-- ============================================================

DROP INDEX IF EXISTS idx_jobs_archived;

CREATE INDEX IF NOT EXISTS idx_jobs_archived
    ON public.jobs (archived);

-- ============================================================
-- 3. Recriar índice parcial de agendamentos ativos (scheduled_date_active)
-- Situação: estava filtrando WHERE is_archived = false, código usa archived.
-- ============================================================

DROP INDEX IF EXISTS idx_jobs_scheduled_date_active;

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date_active
    ON public.jobs (scheduled_date)
    WHERE (scheduled_date IS NOT NULL AND archived = false);

-- ============================================================
-- 4. Remover índice duplicado em holdprint_job_id
-- Advisor: idx_jobs_holdprint_id e jobs_holdprint_job_id_unique são idênticos.
-- Mantemos jobs_holdprint_job_id_unique (gerado pelo UNIQUE constraint).
-- ============================================================

DROP INDEX IF EXISTS idx_jobs_holdprint_id;

-- ============================================================
-- 5. Índice composto (branch, scheduled_date) para queries de calendário por filial
-- Cobertura: GET /api/calendar?branch=POA (query quente)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_jobs_branch_scheduled
    ON public.jobs (branch, scheduled_date)
    WHERE (archived = false);
