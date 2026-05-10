-- Migration: Add end time to jobs and Google Calendar token storage for installers
-- Purpose: Support job duration ranges and per-installer Google Calendar integration

-- Add end time to jobs for duration support
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_time_end TIMESTAMPTZ;

-- Add Google Calendar token storage for installers
ALTER TABLE installers ADD COLUMN IF NOT EXISTS google_token JSONB;
ALTER TABLE installers ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
