-- Migration 030: Corrige FK de installed_products para apontar para item_checkins
-- Contexto: fluxo migrou de checkins (legado, 0 linhas) para item_checkins.
-- A FK antiga causava violations recorrentes nos logs de produção.

BEGIN;

-- 1. Remove FK legada (aponta para checkins com 0 linhas)
ALTER TABLE installed_products
  DROP CONSTRAINT IF EXISTS installed_products_checkin_id_fkey;

-- 2. Remove registros órfãos (checkin_id que não existe em item_checkins)
--    São dados já corrompidos — sem checkin válido, sem valor para manter.
DELETE FROM installed_products
WHERE checkin_id IS NOT NULL
  AND checkin_id NOT IN (SELECT id FROM item_checkins);

-- 3. Recria FK apontando para item_checkins
ALTER TABLE installed_products
  ADD CONSTRAINT installed_products_checkin_id_fkey
  FOREIGN KEY (checkin_id)
  REFERENCES item_checkins(id)
  ON DELETE CASCADE;

COMMIT;
