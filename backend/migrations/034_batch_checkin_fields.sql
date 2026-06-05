-- Migration 034: Campos para checkin em lote com múltiplas fotos
-- Suporta importação de várias imagens de uma vez, com relatório de tempo por EXIF.

ALTER TABLE item_checkins
  ADD COLUMN IF NOT EXISTS exif_checkin_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exif_checkout_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exif_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS photos_count          INTEGER DEFAULT 1;

COMMENT ON COLUMN item_checkins.exif_checkin_at       IS 'Timestamp EXIF mais antigo entre as fotos do lote (hora de início estimada)';
COMMENT ON COLUMN item_checkins.exif_checkout_at      IS 'Timestamp EXIF mais recente entre as fotos do lote (hora de fim estimada)';
COMMENT ON COLUMN item_checkins.exif_duration_minutes IS 'Duração estimada em minutos calculada pelos timestamps EXIF do lote';
COMMENT ON COLUMN item_checkins.photos_count          IS 'Número de fotos enviadas no checkin (1 = fluxo padrão, >1 = lote)';
