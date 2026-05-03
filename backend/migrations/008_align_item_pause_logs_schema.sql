-- Migration 008: Align item_pause_logs column names with code expectations
-- The DB had item_checkin_id/start_time/end_time but code uses checkin_id/paused_at/resumed_at.
-- Also adds auto_generated and created_at columns expected by ItemPauseLog model.

ALTER TABLE item_pause_logs RENAME COLUMN item_checkin_id TO checkin_id;
ALTER TABLE item_pause_logs RENAME COLUMN start_time TO paused_at;
ALTER TABLE item_pause_logs RENAME COLUMN end_time TO resumed_at;

ALTER TABLE item_pause_logs ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;
ALTER TABLE item_pause_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
