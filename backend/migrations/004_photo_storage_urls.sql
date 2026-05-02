-- ============================================================
-- INDUSTRIA VISUAL - Migration 004: Photo Storage URLs
--
-- Adiciona colunas *_photo_url em checkins e item_checkins
-- para armazenar a URL pública do Supabase Storage enquanto
-- os dados base64 antigos permanecem durante a janela de
-- compatibilidade (~60 dias).
--
-- Estratégia de migração sem downtime:
--   Fase 1 (esta migration): adicionar colunas URL (nullable)
--   Fase 2: backend faz dual-write (base64 + URL)
--   Fase 3: frontend lê URL primeiro, fallback base64
--   Fase 4: script de migração de dados históricos + drop base64
--
-- Executar no Supabase SQL Editor (não requer CONCURRENTLY).
-- ============================================================

ALTER TABLE checkins
    ADD COLUMN IF NOT EXISTS checkin_photo_url  TEXT,
    ADD COLUMN IF NOT EXISTS checkout_photo_url TEXT;

ALTER TABLE item_checkins
    ADD COLUMN IF NOT EXISTS checkin_photo_url  TEXT,
    ADD COLUMN IF NOT EXISTS checkout_photo_url TEXT;
