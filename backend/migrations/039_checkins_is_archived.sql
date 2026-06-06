-- Migration 039: adiciona is_archived à tabela checkins
-- Permite arquivar check-ins para excluí-los dos relatórios sem deletar permanentemente.

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

UPDATE checkins SET is_archived = FALSE WHERE is_archived IS NULL;
