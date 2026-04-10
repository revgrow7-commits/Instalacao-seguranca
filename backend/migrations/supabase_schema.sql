-- ============================================
-- SUPABASE SCHEMA - INDUSTRIA VISUAL
-- Migração de MongoDB para PostgreSQL/Supabase
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'installer',
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    branch VARCHAR(50),
    phone VARCHAR(50),
    full_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_branch ON users(branch);

-- ============================================
-- INSTALLERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS installers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    branch VARCHAR(50),
    coins INTEGER DEFAULT 0,
    total_area_installed DECIMAL(10,2) DEFAULT 0,
    total_jobs INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_installers_user_id ON installers(user_id);
CREATE INDEX idx_installers_branch ON installers(branch);

-- ============================================
-- JOBS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    holdprint_job_id VARCHAR(100) UNIQUE,
    job_number INTEGER,
    title VARCHAR(500),
    client_name VARCHAR(255),
    client_address TEXT,
    status VARCHAR(50) DEFAULT 'aguardando',
    branch VARCHAR(50),
    area_m2 DECIMAL(10,2) DEFAULT 0,
    scheduled_date TIMESTAMPTZ,
    scheduled_time VARCHAR(10),
    assigned_installers UUID[] DEFAULT '{}',
    item_assignments JSONB DEFAULT '[]',
    archived_items JSONB DEFAULT '[]',
    items JSONB DEFAULT '[]',
    holdprint_data JSONB,
    products_with_area JSONB DEFAULT '[]',
    total_products INTEGER DEFAULT 0,
    total_quantity DECIMAL(10,2) DEFAULT 0,
    is_archived BOOLEAN DEFAULT false,
    exclude_from_metrics BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_holdprint_id ON jobs(holdprint_job_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_branch ON jobs(branch);
CREATE INDEX idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE INDEX idx_jobs_is_archived ON jobs(is_archived);

-- ============================================
-- ITEM CHECKINS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS item_checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    item_index INTEGER NOT NULL,
    installer_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'in_progress',
    checkin_at TIMESTAMPTZ,
    checkout_at TIMESTAMPTZ,
    checkin_photo TEXT,
    checkout_photo TEXT,
    gps_lat DECIMAL(10,7),
    gps_long DECIMAL(10,7),
    checkout_lat DECIMAL(10,7),
    checkout_long DECIMAL(10,7),
    products_installed JSONB DEFAULT '[]',
    total_area_m2 DECIMAL(10,2) DEFAULT 0,
    productivity_m2_h DECIMAL(10,2),
    time_worked_minutes INTEGER DEFAULT 0,
    pause_time_minutes INTEGER DEFAULT 0,
    coins_earned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_item_checkins_job_id ON item_checkins(job_id);
CREATE INDEX idx_item_checkins_installer_id ON item_checkins(installer_id);
CREATE INDEX idx_item_checkins_status ON item_checkins(status);
CREATE INDEX idx_item_checkins_checkin_at ON item_checkins(checkin_at);

-- ============================================
-- ITEM PAUSE LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS item_pause_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_checkin_id UUID REFERENCES item_checkins(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id),
    item_index INTEGER,
    installer_id UUID REFERENCES users(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    reason VARCHAR(100),
    reason_label VARCHAR(255),
    duration_minutes INTEGER DEFAULT 0,
    auto_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_item_pause_logs_checkin_id ON item_pause_logs(item_checkin_id);
CREATE INDEX idx_item_pause_logs_job_id ON item_pause_logs(job_id);

-- ============================================
-- CHECKINS TABLE (Legacy)
-- ============================================
CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    installer_id UUID REFERENCES users(id),
    checkin_time TIMESTAMPTZ,
    checkout_time TIMESTAMPTZ,
    checkin_photo TEXT,
    checkout_photo TEXT,
    gps_lat DECIMAL(10,7),
    gps_long DECIMAL(10,7),
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LOCATION ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS location_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_checkin_id UUID REFERENCES item_checkins(id),
    job_id UUID REFERENCES jobs(id),
    installer_id UUID REFERENCES users(id),
    event_type VARCHAR(50),
    checkin_lat DECIMAL(10,7),
    checkin_long DECIMAL(10,7),
    checkout_lat DECIMAL(10,7),
    checkout_long DECIMAL(10,7),
    distance_meters DECIMAL(10,2),
    max_allowed_meters INTEGER DEFAULT 500,
    action_taken VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_location_alerts_created_at ON location_alerts(created_at);

-- ============================================
-- GAMIFICATION BALANCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS gamification_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    total_coins INTEGER DEFAULT 0,
    lifetime_coins INTEGER DEFAULT 0,
    current_level VARCHAR(50) DEFAULT 'bronze',
    level VARCHAR(50) DEFAULT 'bronze',
    daily_engagement_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gamification_user_id ON gamification_balances(user_id);

-- ============================================
-- COIN TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    description TEXT,
    reference_id VARCHAR(255),
    breakdown JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX idx_coin_transactions_type ON coin_transactions(transaction_type);
CREATE INDEX idx_coin_transactions_created_at ON coin_transactions(created_at);

-- ============================================
-- REWARDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cost_coins INTEGER NOT NULL,
    category VARCHAR(100),
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    stock INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PRODUCT FAMILIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS product_families (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INSTALLED PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS installed_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id),
    checkin_id UUID REFERENCES item_checkins(id),
    product_name VARCHAR(500),
    family_id UUID REFERENCES product_families(id),
    family_name VARCHAR(255),
    width_m DECIMAL(10,4),
    height_m DECIMAL(10,4),
    quantity INTEGER DEFAULT 1,
    area_m2 DECIMAL(10,4),
    total_area_m2 DECIMAL(10,4),
    actual_time_min DECIMAL(10,2),
    expected_time_min DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_installed_products_job_id ON installed_products(job_id);
CREATE INDEX idx_installed_products_checkin_id ON installed_products(checkin_id);

-- ============================================
-- PRODUCTIVITY HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS productivity_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES product_families(id),
    family_name VARCHAR(255),
    complexity_level VARCHAR(50),
    height_category VARCHAR(50),
    scenario_category VARCHAR(50),
    avg_productivity_m2_h DECIMAL(10,4),
    avg_time_per_m2_min DECIMAL(10,4),
    sample_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- JOB JUSTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS job_justifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id),
    job_title VARCHAR(500),
    job_code VARCHAR(100),
    type VARCHAR(100),
    type_label VARCHAR(255),
    reason TEXT,
    submitted_by UUID REFERENCES users(id),
    submitted_by_name VARCHAR(255),
    submitted_by_email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PASSWORD RESETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_resets_token ON password_resets(token);

-- ============================================
-- PUSH SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    keys JSONB,
    subscribed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ============================================
-- SYSTEM CONFIG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    total_imported INTEGER,
    total_skipped INTEGER,
    total_errors INTEGER,
    sync_type VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS) - Opcional
-- ============================================
-- Habilitar RLS se necessário
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
-- etc.

