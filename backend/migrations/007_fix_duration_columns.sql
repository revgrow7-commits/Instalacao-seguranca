-- Migration 007: Fix duration columns from INTEGER to NUMERIC(10,2)
-- Reason: ALTO 3 from audit — int() truncation was replaced with round(value, 2)
-- but the DB columns were still INTEGER, causing "invalid input syntax for type integer"
-- when the REST API received float values like 69.44.

ALTER TABLE item_checkins
    ALTER COLUMN duration_minutes TYPE NUMERIC(10,2) USING duration_minutes::NUMERIC,
    ALTER COLUMN net_duration_minutes TYPE NUMERIC(10,2) USING net_duration_minutes::NUMERIC,
    ALTER COLUMN total_pause_minutes TYPE NUMERIC(10,2) USING total_pause_minutes::NUMERIC;

ALTER TABLE item_pause_logs
    ALTER COLUMN duration_minutes TYPE NUMERIC(10,2) USING duration_minutes::NUMERIC;
