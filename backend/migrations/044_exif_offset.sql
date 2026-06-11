-- Migration 044: Offset de fuso horário do EXIF em item_checkins
-- O DateTimeOriginal do EXIF é um relógio de parede SEM fuso. Alguns celulares
-- gravam OffsetTimeOriginal (ex: "-03:00"), que é a fonte de verdade do fuso.
-- Quando ausente, o backend assume BRT (UTC-3, fixo no Brasil desde o fim do
-- horário de verão em 2019; POA e SP são ambos UTC-3).

ALTER TABLE item_checkins
  ADD COLUMN IF NOT EXISTS exif_offset          TEXT,
  ADD COLUMN IF NOT EXISTS checkout_exif_offset TEXT;

COMMENT ON COLUMN item_checkins.exif_offset          IS 'Offset UTC do EXIF da foto de check-in (OffsetTimeOriginal, ex: "-03:00"). NULL = assumido BRT.';
COMMENT ON COLUMN item_checkins.checkout_exif_offset IS 'Offset UTC do EXIF da foto de checkout (OffsetTimeOriginal, ex: "-03:00"). NULL = assumido BRT.';
