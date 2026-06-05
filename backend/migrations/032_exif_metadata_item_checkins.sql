-- Migration 032: Metadados EXIF em item_checkins
-- Adiciona colunas para armazenar metadados extraídos do EXIF da foto.
-- O GPS do EXIF vem da câmera do dispositivo no momento da captura,
-- servindo como evidência de localização independente do GPS do navegador.

ALTER TABLE item_checkins
  ADD COLUMN IF NOT EXISTS exif_lat             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS exif_long            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS exif_datetime        TEXT,
  ADD COLUMN IF NOT EXISTS exif_device          TEXT,
  ADD COLUMN IF NOT EXISTS checkout_exif_lat    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS checkout_exif_long   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS checkout_exif_datetime TEXT,
  ADD COLUMN IF NOT EXISTS checkout_exif_device TEXT;

COMMENT ON COLUMN item_checkins.exif_lat             IS 'Latitude GPS extraída do EXIF da foto de check-in';
COMMENT ON COLUMN item_checkins.exif_long            IS 'Longitude GPS extraída do EXIF da foto de check-in';
COMMENT ON COLUMN item_checkins.exif_datetime        IS 'Data/hora de captura registrada no EXIF da foto de check-in (ISO 8601)';
COMMENT ON COLUMN item_checkins.exif_device          IS 'Make + Model do dispositivo registrado no EXIF da foto de check-in';
COMMENT ON COLUMN item_checkins.checkout_exif_lat    IS 'Latitude GPS extraída do EXIF da foto de checkout';
COMMENT ON COLUMN item_checkins.checkout_exif_long   IS 'Longitude GPS extraída do EXIF da foto de checkout';
COMMENT ON COLUMN item_checkins.checkout_exif_datetime IS 'Data/hora de captura registrada no EXIF da foto de checkout (ISO 8601)';
COMMENT ON COLUMN item_checkins.checkout_exif_device IS 'Make + Model do dispositivo registrado no EXIF da foto de checkout';
