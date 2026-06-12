-- Migration 045: Conjuntos de fotos por fase (Início / Conclusão) com metadados EXIF
--
-- Suporte ao registro por foto (horário e localização 100% EXIF). Guarda TODAS as
-- fotos importadas em cada fase, cada uma com seu próprio EXIF, para rastreabilidade
-- e galeria por fase no viewer. Armazena APENAS a URL do Storage + os metadados EXIF,
-- NUNCA o base64 da imagem (evita payloads gigantes na listagem — vide bug de 20 MB).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Após aplicar, registrar as duas colunas em
-- backend/db_supabase.py -> TABLE_COLUMNS['item_checkins'], senão _filter_columns()
-- descarta os campos em silêncio na escrita.

ALTER TABLE item_checkins
    ADD COLUMN IF NOT EXISTS fotos_inicio    JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS fotos_conclusao JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN item_checkins.fotos_inicio    IS 'Fotos de início: array de objetos {url, exif_datetime, exif_offset, exif_lat, exif_long, exif_device}. Só URL do Storage + EXIF, sem base64.';
COMMENT ON COLUMN item_checkins.fotos_conclusao IS 'Fotos de conclusão: array de objetos {url, exif_datetime, exif_offset, exif_lat, exif_long, exif_device}. Só URL do Storage + EXIF, sem base64.';
