-- Migration 037: Fotos múltiplas por item-checkin
-- Compatível com tabela existente — item_checkins não é alterada.
-- Foto principal continua em checkin_photo_url / checkout_photo_url (retrocompat).

CREATE TABLE IF NOT EXISTS item_checkin_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkin_id      TEXT NOT NULL,
    job_id          TEXT NOT NULL,
    installer_id    TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('checkin', 'checkout')),
    photo_url       TEXT,
    photo_base64    TEXT,
    exif_lat        DOUBLE PRECISION,
    exif_long       DOUBLE PRECISION,
    exif_datetime   TIMESTAMPTZ,
    exif_device     TEXT,
    file_name       TEXT,
    file_size_bytes INTEGER,
    ordem           SMALLINT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icp_checkin_id ON item_checkin_photos(checkin_id);
CREATE INDEX IF NOT EXISTS idx_icp_job_id     ON item_checkin_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_icp_tipo       ON item_checkin_photos(checkin_id, tipo);
