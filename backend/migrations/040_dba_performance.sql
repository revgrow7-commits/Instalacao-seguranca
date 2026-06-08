-- ============================================================
-- 040_dba_performance.sql
-- Índices para o caminho quente + FKs faltantes + correção de auditoria.
-- Origem: AUDITORIA-DBA-BANCO.md (2026-06-07), itens I1–I5, S1–S3.
--
-- COMO APLICAR (Supabase SQL Editor):
--   - O editor roda cada statement fora de transação explícita,
--     então CREATE INDEX CONCURRENTLY funciona. Rodar bloco a bloco.
--   - Seguro aplicar ANTES do deploy de código: índices novos não
--     quebram nada; só passam a ser usados quando as queries mudarem.
--   - NÃO esquecer: nenhuma coluna nova aqui, então TABLE_COLUMNS
--     em db_supabase.py não precisa de mudança.
-- ============================================================

-- ------------------------------------------------------------
-- BLOCO 1 — Índices parciais do caminho quente de reports (I1, I5)
-- Suportam: WHERE status = X AND is_archived IS NOT TRUE ORDER BY checkin_at DESC
-- (Pré-requisito de código: reports.py deve filtrar is_archived no
--  find(), não em Python — ver correção P0 no relatório.)
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_checkins_status_active
  ON item_checkins (status, checkin_at DESC)
  WHERE is_archived IS NOT TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkins_status_active
  ON checkins (status, checkin_at DESC)
  WHERE is_archived IS NOT TRUE;

-- Substitui o uso do idx_jobs_archived (booleano de baixa seletividade):
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_active_status_branch
  ON jobs (status, branch)
  WHERE archived IS NOT TRUE;

-- ------------------------------------------------------------
-- BLOCO 2 — Paginação e ordenação (I2, I4)
-- ------------------------------------------------------------
-- GET /item-checkins/all ordena por checkin_at DESC com skip/limit:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_checkins_checkin_at
  ON item_checkins (checkin_at DESC);

-- Listagem de visitas técnicas ordena por created_at DESC:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vt_created_at
  ON visitas_tecnicas (created_at DESC);

-- ------------------------------------------------------------
-- BLOCO 3 — Lookup polimórfico de gamificação (I3)
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coin_transactions_reference
  ON coin_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ------------------------------------------------------------
-- BLOCO 4 — FKs faltantes (S1, S2) — NOT VALID não bloqueia escritas;
-- VALIDATE depois varre a tabela sem lock exclusivo prolongado.
-- ⚠ Se VALIDATE falhar, existem linhas órfãs: limpar antes
--   (SELECT ... LEFT JOIN ... WHERE pai IS NULL) e revalidar.
-- ------------------------------------------------------------
ALTER TABLE job_photos
  ADD CONSTRAINT job_photos_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE job_photos
  ADD CONSTRAINT job_photos_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE item_checkin_photos
  ADD CONSTRAINT icp_checkin_id_fkey
  FOREIGN KEY (checkin_id) REFERENCES item_checkins(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE item_checkin_photos
  ADD CONSTRAINT icp_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE item_checkin_photos
  ADD CONSTRAINT icp_installer_id_fkey
  FOREIGN KEY (installer_id) REFERENCES installers(id) ON DELETE SET NULL NOT VALID;

-- Validar (rodar um por vez; se falhar, há órfãos — ver nota acima):
ALTER TABLE job_photos          VALIDATE CONSTRAINT job_photos_job_id_fkey;
ALTER TABLE job_photos          VALIDATE CONSTRAINT job_photos_uploaded_by_fkey;
ALTER TABLE item_checkin_photos VALIDATE CONSTRAINT icp_checkin_id_fkey;
ALTER TABLE item_checkin_photos VALIDATE CONSTRAINT icp_job_id_fkey;
ALTER TABLE item_checkin_photos VALIDATE CONSTRAINT icp_installer_id_fkey;

-- ------------------------------------------------------------
-- BLOCO 5 — Auditoria financeira (S3): deletar usuário NÃO deve
-- apagar o histórico de moedas. RESTRICT força desativação
-- (is_active=false) em vez de delete físico.
-- ------------------------------------------------------------
ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_user_id_fkey;

ALTER TABLE coin_transactions
  ADD CONSTRAINT coin_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- BLOCO 6 — Guard-rail de estado (S4): CHECK em visitas_tecnicas.status
-- ⚠ ANTES de aplicar, conferir valores reais:
--   SELECT DISTINCT status FROM visitas_tecnicas;
-- e ajustar a lista abaixo se houver estados legítimos fora dela.
-- ------------------------------------------------------------
-- ALTER TABLE visitas_tecnicas
--   ADD CONSTRAINT visitas_tecnicas_status_check
--   CHECK (status IN ('AGUARDANDO','AGENDADA','EM_VISITA','CONCLUIDA','CANCELADA'))
--   NOT VALID;
-- ALTER TABLE visitas_tecnicas VALIDATE CONSTRAINT visitas_tecnicas_status_check;

-- ------------------------------------------------------------
-- PÓS-APLICAÇÃO
-- ------------------------------------------------------------
-- 1. ANALYZE nas tabelas tocadas:
ANALYZE item_checkins; ANALYZE checkins; ANALYZE jobs;
ANALYZE coin_transactions; ANALYZE visitas_tecnicas;
ANALYZE job_photos; ANALYZE item_checkin_photos;

-- 2. Em ~30 dias, rodar a seção 4 do db-diagnostico-dba.sql e avaliar
--    drop de: idx_jobs_archived, idx_vt_status/idx_vt_aprovacao (se os
--    compostos de 017 cobrirem), idx_productivity_history_installer_date (003).
