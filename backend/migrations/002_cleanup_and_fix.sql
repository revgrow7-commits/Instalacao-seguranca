-- ============================================================
-- INDUSTRIA VISUAL - Migration 002: Cleanup & Fix
-- Executar no Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Esta migration:
--   1. Remove 22 tabelas legadas (instalacao_*, installation_*, etc.)
--   2. Corrige tipos UUID→TEXT em gamification_balances e location_alerts
--   3. Adiciona colunas faltantes
--   4. Adiciona FKs faltantes
--   5. Adiciona indexes faltantes
-- ============================================================

-- ============================================================
-- 1. DROP TABELAS LEGADAS
-- ============================================================
DROP TABLE IF EXISTS instalacao_checkins CASCADE;
DROP TABLE IF EXISTS instalacao_coin_balances CASCADE;
DROP TABLE IF EXISTS instalacao_gamification_transactions CASCADE;
DROP TABLE IF EXISTS instalacao_instaladores CASCADE;
DROP TABLE IF EXISTS instalacao_item_assignments CASCADE;
DROP TABLE IF EXISTS instalacao_job_assignments CASCADE;
DROP TABLE IF EXISTS instalacao_jobs CASCADE;
DROP TABLE IF EXISTS instalacao_product_families CASCADE;
DROP TABLE IF EXISTS instalacao_redemptions CASCADE;
DROP TABLE IF EXISTS instalacao_reward_requests CASCADE;
DROP TABLE IF EXISTS instalacao_rewards CASCADE;

DROP TABLE IF EXISTS installation_coin_transactions CASCADE;
DROP TABLE IF EXISTS installation_gamification_balances CASCADE;
DROP TABLE IF EXISTS installation_item_checkins CASCADE;
DROP TABLE IF EXISTS installation_items CASCADE;
DROP TABLE IF EXISTS installation_jobs CASCADE;
DROP TABLE IF EXISTS installation_pause_logs CASCADE;
DROP TABLE IF EXISTS installation_reward_requests CASCADE;
DROP TABLE IF EXISTS installation_rewards CASCADE;

DROP TABLE IF EXISTS gateway_users CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS coin_balances CASCADE;

-- ============================================================
-- 2. FIX gamification_balances (UUID → TEXT para compatibilidade)
-- ============================================================
-- A tabela usa UUID para id e user_id, mas users.id e TEXT.
-- Precisamos recriar com tipos corretos.

-- Salvar dados existentes
CREATE TEMP TABLE _gb_backup AS
SELECT
  id::text AS id,
  user_id::text AS user_id,
  total_coins,
  lifetime_coins,
  current_level,
  level,
  daily_engagement_date,
  created_at,
  updated_at
FROM gamification_balances;

-- Recriar tabela com tipos corretos
DROP TABLE IF EXISTS gamification_balances CASCADE;
CREATE TABLE gamification_balances (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_coins INTEGER DEFAULT 0,
    lifetime_coins INTEGER DEFAULT 0,
    current_level VARCHAR(20) DEFAULT 'bronze',
    level VARCHAR(20) DEFAULT 'bronze',
    streak_days INTEGER DEFAULT 0,
    last_activity TIMESTAMPTZ,
    daily_engagement_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurar dados
INSERT INTO gamification_balances (id, user_id, total_coins, lifetime_coins, current_level, level, daily_engagement_date, created_at, updated_at)
SELECT id, user_id, total_coins, lifetime_coins, current_level, level, daily_engagement_date, created_at, updated_at
FROM _gb_backup
WHERE user_id IN (SELECT id FROM users);

DROP TABLE _gb_backup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gamification_balances_user_id ON gamification_balances(user_id);

-- ============================================================
-- 3. FIX location_alerts (UUID → TEXT para compatibilidade)
-- ============================================================
-- Salvar dados existentes
CREATE TEMP TABLE _la_backup AS
SELECT
  id::text AS id,
  item_checkin_id::text AS item_checkin_id,
  job_id::text AS job_id,
  installer_id::text AS installer_id,
  event_type,
  checkin_lat,
  checkin_long,
  checkout_lat,
  checkout_long,
  distance_meters,
  max_allowed_meters,
  action_taken,
  created_at
FROM location_alerts;

DROP TABLE IF EXISTS location_alerts CASCADE;
CREATE TABLE location_alerts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    item_checkin_id TEXT REFERENCES item_checkins(id) ON DELETE SET NULL,
    job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    installer_id TEXT REFERENCES installers(id) ON DELETE SET NULL,
    event_type VARCHAR(30),
    checkin_lat NUMERIC(10,7),
    checkin_long NUMERIC(10,7),
    checkout_lat NUMERIC(10,7),
    checkout_long NUMERIC(10,7),
    distance_meters NUMERIC(10,2),
    max_allowed_meters INTEGER DEFAULT 500,
    action_taken VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurar dados
INSERT INTO location_alerts (id, item_checkin_id, job_id, installer_id, event_type, checkin_lat, checkin_long, checkout_lat, checkout_long, distance_meters, max_allowed_meters, action_taken, created_at)
SELECT id, item_checkin_id, job_id, installer_id, event_type, checkin_lat, checkin_long, checkout_lat, checkout_long, distance_meters, max_allowed_meters, action_taken, created_at
FROM _la_backup
WHERE (job_id IS NULL OR job_id IN (SELECT id FROM jobs))
  AND (installer_id IS NULL OR installer_id IN (SELECT id FROM jobs));

DROP TABLE _la_backup;

CREATE INDEX IF NOT EXISTS idx_location_alerts_job_id ON location_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_location_alerts_installer_id ON location_alerts(installer_id);
CREATE INDEX IF NOT EXISTS idx_location_alerts_created_at ON location_alerts(created_at DESC);

-- ============================================================
-- 4. COLUNAS FALTANTES em coin_transactions
-- ============================================================
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS balance_after INTEGER;

-- ============================================================
-- 5. INDEXES FALTANTES nas tabelas ativas
-- ============================================================

-- checkins
CREATE INDEX IF NOT EXISTS idx_checkins_installer_id ON checkins(installer_id);
CREATE INDEX IF NOT EXISTS idx_checkins_checkin_at ON checkins(checkin_at DESC);

-- reward_requests
CREATE INDEX IF NOT EXISTS idx_reward_requests_user_id ON reward_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_requests_status ON reward_requests(status);

-- installed_products
CREATE INDEX IF NOT EXISTS idx_installed_products_checkin_id ON installed_products(checkin_id);
CREATE INDEX IF NOT EXISTS idx_installed_products_job_id ON installed_products(job_id);
CREATE INDEX IF NOT EXISTS idx_installed_products_installer_id ON installed_products(installer_id);
CREATE INDEX IF NOT EXISTS idx_installed_products_family_id ON installed_products(family_id);

-- job_justifications
CREATE INDEX IF NOT EXISTS idx_job_justifications_job_id ON job_justifications(job_id);

-- password_resets
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at);

-- productivity_history
CREATE INDEX IF NOT EXISTS idx_productivity_history_installer_id ON productivity_history(installer_id);
CREATE INDEX IF NOT EXISTS idx_productivity_history_family_id ON productivity_history(family_id);

-- item_pause_logs
CREATE INDEX IF NOT EXISTS idx_item_pause_logs_checkin_id ON item_pause_logs(checkin_id);

-- jobs (complementar)
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_archived ON jobs(archived);

-- users (complementar)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- installers (complementar)
CREATE INDEX IF NOT EXISTS idx_installers_branch ON installers(branch);

-- ============================================================
-- 6. SCHEDULER_SYNC_STATUS (tabela usada pelo server.py)
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduler_sync_status (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sync_type TEXT NOT NULL UNIQUE,
    last_sync_at TIMESTAMPTZ,
    total_imported INTEGER DEFAULT 0,
    total_skipped INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DONE! Verificacao final
-- ============================================================
SELECT 'Migration 002 concluida!' AS status,
       (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS total_tables;
