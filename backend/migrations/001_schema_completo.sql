-- ============================================================
-- INDUSTRIA VISUAL - Schema Reference (001)
--
-- ATENCAO: Este arquivo e uma REFERENCIA do schema atual.
-- Usar CREATE TABLE IF NOT EXISTS para ser idempotente.
-- Para aplicar correcoes, use 002_cleanup_and_fix.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. users (tabela principal)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    full_name VARCHAR,
    password_hash TEXT,
    role TEXT DEFAULT 'installer' CHECK (role IN ('admin', 'manager', 'installer')),
    phone VARCHAR,
    branch VARCHAR,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- ============================================================
-- 2. installers (perfil do instalador)
-- ============================================================
CREATE TABLE IF NOT EXISTS installers (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    full_name TEXT,
    phone TEXT,
    branch TEXT DEFAULT 'POA',
    is_active BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    coins INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    total_area_installed NUMERIC DEFAULT 0,
    total_jobs INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installers_user_id ON installers(user_id);
CREATE INDEX IF NOT EXISTS idx_installers_branch ON installers(branch);

-- ============================================================
-- 3. product_families (categorias de produtos)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_families (
    id TEXT PRIMARY KEY,
    name TEXT,
    keywords JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. jobs (ordens de servico)
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    holdprint_job_id TEXT UNIQUE,
    title TEXT,
    client_name TEXT,
    client_address TEXT,
    status TEXT DEFAULT 'aguardando',
    branch TEXT,
    area_m2 DOUBLE PRECISION,
    assigned_installers JSONB DEFAULT '[]',
    scheduled_date TIMESTAMPTZ,
    items JSONB DEFAULT '[]',
    holdprint_data JSONB DEFAULT '{}',
    products_with_area JSONB DEFAULT '[]',
    total_products INTEGER DEFAULT 0,
    total_quantity DOUBLE PRECISION DEFAULT 0,
    item_assignments JSONB DEFAULT '[]',
    archived_items JSONB DEFAULT '[]',
    archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    archived_by TEXT,
    archived_by_name TEXT,
    exclude_from_metrics BOOLEAN DEFAULT FALSE,
    no_installation BOOLEAN DEFAULT FALSE,
    notes TEXT,
    cancelled_at TIMESTAMPTZ,
    justification JSONB,
    justified_at TIMESTAMPTZ,
    installation_config JSONB DEFAULT '{}',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_holdprint_job_id ON jobs(holdprint_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_branch ON jobs(branch);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_archived ON jobs(archived);

-- ============================================================
-- 5. checkins (check-ins a nivel de job)
-- ============================================================
CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
    installer_id TEXT REFERENCES installers(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'in_progress',
    checkin_at TIMESTAMPTZ DEFAULT NOW(),
    checkout_at TIMESTAMPTZ,
    duration_minutes DOUBLE PRECISION,
    checkin_photo TEXT,
    checkout_photo TEXT,
    gps_lat DOUBLE PRECISION,
    gps_long DOUBLE PRECISION,
    checkout_gps_lat DOUBLE PRECISION,
    checkout_gps_long DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_job_id ON checkins(job_id);
CREATE INDEX IF NOT EXISTS idx_checkins_installer_id ON checkins(installer_id);
CREATE INDEX IF NOT EXISTS idx_checkins_checkin_at ON checkins(checkin_at DESC);

-- ============================================================
-- 6. item_checkins (check-ins por item)
-- ============================================================
CREATE TABLE IF NOT EXISTS item_checkins (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
    installer_id TEXT REFERENCES installers(id) ON DELETE CASCADE,
    item_index INTEGER,
    status TEXT DEFAULT 'in_progress',
    checkin_at TIMESTAMPTZ DEFAULT NOW(),
    checkout_at TIMESTAMPTZ,
    duration_minutes DOUBLE PRECISION,
    net_duration_minutes DOUBLE PRECISION,
    total_pause_minutes DOUBLE PRECISION,
    checkin_photo TEXT,
    checkout_photo TEXT,
    gps_lat DOUBLE PRECISION,
    gps_long DOUBLE PRECISION,
    gps_accuracy DOUBLE PRECISION,
    checkout_gps_lat DOUBLE PRECISION,
    checkout_gps_long DOUBLE PRECISION,
    checkout_gps_accuracy DOUBLE PRECISION,
    product_name TEXT,
    family_name TEXT,
    installed_m2 DOUBLE PRECISION,
    complexity_level INTEGER,
    height_category TEXT,
    scenario_category TEXT,
    notes TEXT,
    productivity_m2_h DOUBLE PRECISION,
    is_archived BOOLEAN DEFAULT FALSE,
    products_installed JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_checkins_job_id ON item_checkins(job_id);
CREATE INDEX IF NOT EXISTS idx_item_checkins_installer_id ON item_checkins(installer_id);
CREATE INDEX IF NOT EXISTS idx_item_checkins_status ON item_checkins(status);

-- ============================================================
-- 7. item_pause_logs (pausas durante execucao)
-- ============================================================
CREATE TABLE IF NOT EXISTS item_pause_logs (
    id TEXT PRIMARY KEY,
    checkin_id TEXT REFERENCES item_checkins(id) ON DELETE CASCADE,
    reason TEXT,
    paused_at TIMESTAMPTZ DEFAULT NOW(),
    resumed_at TIMESTAMPTZ,
    duration_minutes DOUBLE PRECISION,
    auto_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_pause_logs_checkin_id ON item_pause_logs(checkin_id);

-- ============================================================
-- 8. installed_products (produtos instalados)
-- ============================================================
CREATE TABLE IF NOT EXISTS installed_products (
    id TEXT PRIMARY KEY,
    checkin_id TEXT REFERENCES item_checkins(id) ON DELETE SET NULL,
    job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    installer_id TEXT REFERENCES installers(id) ON DELETE SET NULL,
    family_id TEXT REFERENCES product_families(id) ON DELETE SET NULL,
    family_name TEXT,
    product_name TEXT,
    quantity DOUBLE PRECISION,
    width_m DOUBLE PRECISION,
    height_m DOUBLE PRECISION,
    area_m2 DOUBLE PRECISION,
    complexity_level INTEGER,
    height_category TEXT,
    scenario_category TEXT,
    duration_minutes DOUBLE PRECISION,
    productivity_m2_h DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installed_products_checkin_id ON installed_products(checkin_id);
CREATE INDEX IF NOT EXISTS idx_installed_products_job_id ON installed_products(job_id);
CREATE INDEX IF NOT EXISTS idx_installed_products_installer_id ON installed_products(installer_id);
CREATE INDEX IF NOT EXISTS idx_installed_products_family_id ON installed_products(family_id);

-- ============================================================
-- 9. productivity_history (benchmarks de produtividade)
-- ============================================================
CREATE TABLE IF NOT EXISTS productivity_history (
    id TEXT PRIMARY KEY,
    family_id TEXT REFERENCES product_families(id) ON DELETE SET NULL,
    family_name TEXT,
    installer_id TEXT REFERENCES installers(id) ON DELETE SET NULL,
    date TEXT,
    total_m2 DOUBLE PRECISION,
    total_minutes DOUBLE PRECISION,
    items_count INTEGER,
    productivity_m2_h DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productivity_history_installer_id ON productivity_history(installer_id);
CREATE INDEX IF NOT EXISTS idx_productivity_history_family_id ON productivity_history(family_id);

-- ============================================================
-- 10. gamification_balances (saldo de moedas)
-- ============================================================
CREATE TABLE IF NOT EXISTS gamification_balances (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_gamification_balances_user_id ON gamification_balances(user_id);

-- ============================================================
-- 11. coin_transactions (historico de moedas)
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER,
    transaction_type TEXT,
    description TEXT,
    reference_type TEXT,
    reference_id TEXT,
    breakdown JSONB,
    balance_after INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_created_at ON coin_transactions(created_at);

-- ============================================================
-- 12. rewards (catalogo de recompensas)
-- ============================================================
CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    cost_coins INTEGER,
    category TEXT,
    image_url TEXT,
    stock INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 13. reward_requests (pedidos de resgate)
-- ============================================================
CREATE TABLE IF NOT EXISTS reward_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    reward_id TEXT REFERENCES rewards(id) ON DELETE SET NULL,
    reward_name TEXT,
    cost_coins INTEGER,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_requests_user_id ON reward_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_requests_status ON reward_requests(status);

-- ============================================================
-- 14. location_alerts (alertas de localizacao)
-- ============================================================
CREATE TABLE IF NOT EXISTS location_alerts (
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

CREATE INDEX IF NOT EXISTS idx_location_alerts_job_id ON location_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_location_alerts_installer_id ON location_alerts(installer_id);
CREATE INDEX IF NOT EXISTS idx_location_alerts_created_at ON location_alerts(created_at DESC);

-- ============================================================
-- 15. password_resets
-- ============================================================
CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at);

-- ============================================================
-- 16. push_subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    subscription JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    endpoint TEXT,
    keys JSONB,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 17. google_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS google_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 18. job_justifications
-- ============================================================
CREATE TABLE IF NOT EXISTS job_justifications (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
    job_title TEXT,
    job_code TEXT,
    type TEXT,
    type_label TEXT,
    reason TEXT,
    submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    submitted_by_name TEXT,
    submitted_by_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_justifications_job_id ON job_justifications(job_id);

-- ============================================================
-- 19. system_config
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    key TEXT UNIQUE,
    value TEXT,
    total_imported INTEGER,
    total_skipped INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20. scheduler_sync_status
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
-- DIAGRAMA DE RELACIONAMENTOS:
--
-- users ─┬─> installers (user_id)
--         ├─> gamification_balances (user_id)
--         ├─> coin_transactions (user_id)
--         ├─> reward_requests (user_id)
--         ├─> password_resets (user_id)
--         ├─> push_subscriptions (user_id)
--         ├─> google_tokens (user_id)
--         └─> job_justifications (submitted_by)
--
-- jobs ──┬─> checkins (job_id)
--         ├─> item_checkins (job_id)
--         ├─> installed_products (job_id)
--         ├─> location_alerts (job_id)
--         └─> job_justifications (job_id)
--
-- installers ──┬─> checkins (installer_id)
--               ├─> item_checkins (installer_id)
--               ├─> installed_products (installer_id)
--               ├─> productivity_history (installer_id)
--               └─> location_alerts (installer_id)
--
-- item_checkins ──┬─> item_pause_logs (checkin_id)
--                  ├─> installed_products (checkin_id)
--                  └─> location_alerts (item_checkin_id)
--
-- product_families ──┬─> installed_products (family_id)
--                     └─> productivity_history (family_id)
--
-- rewards ──> reward_requests (reward_id)
-- ============================================================
