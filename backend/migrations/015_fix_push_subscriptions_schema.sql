-- Fix push_subscriptions table: add missing columns and fix keys column type
-- Columns is_active, subscribed_at, subscription were missing in production.
-- keys was TEXT instead of JSONB, causing 500 on subscribe endpoint.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS subscription JSONB;

ALTER TABLE push_subscriptions ALTER COLUMN keys DROP DEFAULT;
ALTER TABLE push_subscriptions
  ALTER COLUMN keys TYPE JSONB USING
    CASE
      WHEN keys IS NULL OR keys = '' OR keys = '{}' THEN '{}'::jsonb
      ELSE keys::jsonb
    END;
ALTER TABLE push_subscriptions ALTER COLUMN keys SET DEFAULT '{}'::jsonb;
