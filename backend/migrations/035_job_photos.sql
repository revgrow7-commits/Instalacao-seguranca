-- Migration 035: Tabela de fotos do job (nível de job, não de item-checkin)
-- Permite upload de múltiplas fotos com metadados EXIF por job.

CREATE TABLE IF NOT EXISTS job_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_by_name TEXT,
    photo_url   TEXT,
    photo_base64 TEXT,
    caption     TEXT,
    exif_lat    DOUBLE PRECISION,
    exif_long   DOUBLE PRECISION,
    exif_datetime TIMESTAMPTZ,
    exif_device TEXT,
    file_name   TEXT,
    file_size_bytes INTEGER,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_job_id ON job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_created_at ON job_photos(created_at DESC);
