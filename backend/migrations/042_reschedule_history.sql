-- Migration 042: Add reschedule_history to jobs
-- Stores a JSONB array of reschedule events for auditability
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reschedule_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs.reschedule_history IS 'Array of reschedule events: [{rescheduled_at, rescheduled_by, old_date, new_date, note, job_status}]';
