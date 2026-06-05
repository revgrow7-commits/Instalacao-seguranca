-- Migration 033: Unificar installers.id = installers.user_id
--
-- Causa do bug (P0-1): o endpoint /register criava installers com id=uuid4() diferente do user_id.
-- Com isso, jobs.assigned_installers armazenava installers.id, mas o JWT levava users.id,
-- causando filtros que nunca batiam e dashboard zerado para instaladores reais.
--
-- Esta migration:
--   1. Atualiza item_checkins.installer_id dos registros divergentes (installers.id → user_id)
--   2. Atualiza checkins.installer_id (tabela legada) — seguro se não existir
--   3. Atualiza jobs.assigned_installers (JSONB array) trocando o antigo id pelo user_id
--   4. Atualiza installers.id = user_id para os registros divergentes
--
-- O fix no código (auth_new.py) garante que NOVOS registros usem id = user_id desde já.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. item_checkins.installer_id
-- ─────────────────────────────────────────────────────────────────
UPDATE item_checkins ic
SET installer_id = i.user_id
FROM installers i
WHERE ic.installer_id = i.id
  AND i.id != i.user_id;

-- ─────────────────────────────────────────────────────────────────
-- 2. checkins.installer_id (tabela legada — pode ter 0 linhas)
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'checkins'
  ) THEN
    UPDATE checkins c
    SET installer_id = i.user_id
    FROM installers i
    WHERE c.installer_id = i.id
      AND i.id != i.user_id;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. jobs.assigned_installers (JSONB array de strings)
--    Troca cada elemento que seja um antigo installers.id pelo user_id correspondente.
-- ─────────────────────────────────────────────────────────────────
WITH divergent AS (
  SELECT id, user_id FROM installers WHERE id != user_id
)
UPDATE jobs
SET assigned_installers = (
  SELECT jsonb_agg(
    COALESCE(
      (SELECT to_jsonb(d.user_id) FROM divergent d WHERE d.id = (elem #>> '{}')),
      elem
    )
  )
  FROM jsonb_array_elements(assigned_installers) AS elem
)
WHERE assigned_installers IS NOT NULL
  AND jsonb_array_length(assigned_installers) > 0
  AND EXISTS (
    SELECT 1 FROM divergent d
    WHERE assigned_installers @> jsonb_build_array(d.id)
  );

-- ─────────────────────────────────────────────────────────────────
-- 4. installers.id = user_id para os divergentes
--    (feito por último para não quebrar os passos anteriores)
-- ─────────────────────────────────────────────────────────────────
UPDATE installers SET id = user_id WHERE id != user_id;

COMMIT;
