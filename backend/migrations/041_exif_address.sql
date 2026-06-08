-- Migration 041: Endereço obtido por geocodificação reversa das coordenadas EXIF
-- Populado pelo frontend via Nominatim (OpenStreetMap) no momento do upload da foto.

ALTER TABLE item_checkins
  ADD COLUMN IF NOT EXISTS exif_address           TEXT,
  ADD COLUMN IF NOT EXISTS checkout_exif_address  TEXT;

COMMENT ON COLUMN item_checkins.exif_address          IS 'Endereço resolvido via geocodificação reversa das coordenadas EXIF do check-in';
COMMENT ON COLUMN item_checkins.checkout_exif_address IS 'Endereço resolvido via geocodificação reversa das coordenadas EXIF do checkout';
