-- ============================================
-- COLUNAS FALTANTES - Executar no Supabase SQL Editor
-- ============================================

-- USERS TABLE - Adicionar colunas faltantes
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- INSTALLERS TABLE - Adicionar colunas faltantes  
ALTER TABLE installers ADD COLUMN IF NOT EXISTS total_area_installed DECIMAL(10,2) DEFAULT 0;
ALTER TABLE installers ADD COLUMN IF NOT EXISTS total_jobs INTEGER DEFAULT 0;
ALTER TABLE installers ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;

-- ITEM_PAUSE_LOGS TABLE - Adicionar coluna
ALTER TABLE item_pause_logs ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

-- PUSH_SUBSCRIPTIONS TABLE - Adicionar colunas
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS keys JSONB;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMPTZ DEFAULT NOW();

-- GAMIFICATION BALANCES - Criar se não existir
CREATE TABLE IF NOT EXISTS gamification_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    total_coins INTEGER DEFAULT 0,
    lifetime_coins INTEGER DEFAULT 0,
    current_level VARCHAR(50) DEFAULT 'bronze',
    level VARCHAR(50) DEFAULT 'bronze',
    daily_engagement_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOCATION ALERTS - Criar se não existir
CREATE TABLE IF NOT EXISTS location_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Remover Foreign Key constraints temporariamente para permitir migração
-- (Execute apenas se necessário)
-- ALTER TABLE item_checkins DROP CONSTRAINT IF EXISTS item_checkins_job_id_fkey;
-- ALTER TABLE item_checkins DROP CONSTRAINT IF EXISTS item_checkins_installer_id_fkey;
-- ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_user_id_fkey;
-- ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS password_resets_user_id_fkey;
-- ALTER TABLE job_justifications DROP CONSTRAINT IF EXISTS job_justifications_job_id_fkey;
