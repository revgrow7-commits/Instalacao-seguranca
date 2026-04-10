-- ============================================
-- TABELAS FALTANTES - Executar no Supabase SQL Editor
-- ============================================

-- LOCATION ALERTS TABLE
CREATE TABLE IF NOT EXISTS location_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_checkin_id UUID,
    job_id UUID,
    installer_id UUID,
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

CREATE INDEX IF NOT EXISTS idx_location_alerts_created_at ON location_alerts(created_at);

-- GAMIFICATION BALANCES TABLE
CREATE TABLE IF NOT EXISTS gamification_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE,
    total_coins INTEGER DEFAULT 0,
    lifetime_coins INTEGER DEFAULT 0,
    current_level VARCHAR(50) DEFAULT 'bronze',
    level VARCHAR(50) DEFAULT 'bronze',
    daily_engagement_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gamification_user_id ON gamification_balances(user_id);
