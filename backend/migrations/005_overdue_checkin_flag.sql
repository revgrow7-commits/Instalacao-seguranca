-- Adiciona flag de atraso em item_checkins para check-ins sem checkout >4h.
-- Populado automaticamente pelo job scheduler (check_overdue_checkins, a cada 30 min).
ALTER TABLE item_checkins
    ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_item_checkins_is_late
    ON item_checkins (is_late)
    WHERE is_late = TRUE;
