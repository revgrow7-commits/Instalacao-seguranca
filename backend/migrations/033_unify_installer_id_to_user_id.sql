-- Migration 033: Unificar installers.id = installers.user_id
--
-- 7 tabelas têm FK installer_id → installers.id sem ON UPDATE CASCADE.
-- Ordem: DROP FKs → atualizar dependentes → atualizar PK → re-add FKs.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Dropar todas as FKs que referenciam installers.id
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE checkins            DROP CONSTRAINT IF EXISTS checkins_installer_id_fkey;
ALTER TABLE item_checkins       DROP CONSTRAINT IF EXISTS item_checkins_installer_id_fkey;
ALTER TABLE item_pause_logs     DROP CONSTRAINT IF EXISTS item_pause_logs_installer_id_fkey;
ALTER TABLE job_justifications  DROP CONSTRAINT IF EXISTS job_justifications_installer_id_fkey;
ALTER TABLE location_alerts     DROP CONSTRAINT IF EXISTS location_alerts_installer_id_fkey;
ALTER TABLE visitas_tecnicas    DROP CONSTRAINT IF EXISTS visitas_tecnicas_installer_id_fkey;
ALTER TABLE productivity_history DROP CONSTRAINT IF EXISTS productivity_history_installer_id_fkey;

-- ─────────────────────────────────────────────────────────────────
-- 2. Atualizar installer_id nas 6 tabelas dependentes
-- ─────────────────────────────────────────────────────────────────
UPDATE checkins c
SET installer_id = i.user_id
FROM installers i
WHERE c.installer_id = i.id AND i.id != i.user_id;

UPDATE item_checkins ic
SET installer_id = i.user_id
FROM installers i
WHERE ic.installer_id = i.id AND i.id != i.user_id;

UPDATE item_pause_logs pl
SET installer_id = i.user_id
FROM installers i
WHERE pl.installer_id = i.id AND i.id != i.user_id;

UPDATE job_justifications jj
SET installer_id = i.user_id
FROM installers i
WHERE jj.installer_id = i.id AND i.id != i.user_id;

UPDATE location_alerts la
SET installer_id = i.user_id
FROM installers i
WHERE la.installer_id = i.id AND i.id != i.user_id;

UPDATE visitas_tecnicas vt
SET installer_id = i.user_id
FROM installers i
WHERE vt.installer_id = i.id AND i.id != i.user_id;

UPDATE productivity_history ph
SET installer_id = i.user_id
FROM installers i
WHERE ph.installer_id = i.id AND i.id != i.user_id;

-- ─────────────────────────────────────────────────────────────────
-- 3. jobs.assigned_installers (JSONB array)
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
-- 4. Atualizar o PK installers.id = user_id
-- ─────────────────────────────────────────────────────────────────
UPDATE installers SET id = user_id WHERE id != user_id;

-- ─────────────────────────────────────────────────────────────────
-- 5. Recriar todas as FKs
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE checkins
  ADD CONSTRAINT checkins_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id);

ALTER TABLE item_checkins
  ADD CONSTRAINT item_checkins_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id);

ALTER TABLE item_pause_logs
  ADD CONSTRAINT item_pause_logs_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id);

ALTER TABLE job_justifications
  ADD CONSTRAINT job_justifications_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id);

ALTER TABLE location_alerts
  ADD CONSTRAINT location_alerts_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id);

ALTER TABLE visitas_tecnicas
  ADD CONSTRAINT visitas_tecnicas_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id);

ALTER TABLE productivity_history
  ADD CONSTRAINT productivity_history_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id);

COMMIT;
