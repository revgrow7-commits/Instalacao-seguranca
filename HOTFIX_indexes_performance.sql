-- =====================================================================
-- HOTFIX: Índices de performance — quick win sem downtime
-- =====================================================================
-- Data: 2026-05-15
-- Projeto: qfsxtwkltfraounsjjah (instal-visual.com.br)
-- Origem: PERFORMANCE_GUIA.md seções 2.1, 2.2, 2.5
--
-- Como aplicar:
--   1. Abrir Supabase Dashboard → SQL Editor
--   2. Colar este arquivo INTEIRO em uma nova query
--   3. Rodar de UMA VEZ — CREATE INDEX CONCURRENTLY é seguro em produção
--      (não trava escrita, demora um pouco mais que CREATE INDEX normal)
--   4. No final, rodar o bloco de verificação para conferir
--
-- IMPORTANTE: CONCURRENTLY não pode rodar dentro de BEGIN/COMMIT.
--   Não envolva isto em transação. Cada CREATE INDEX é atômico por si.
--
-- Em caso de erro "index already exists" em algum dos comandos:
--   - O IF NOT EXISTS já cobre isso, então não vai falhar.
--   - Se cair em erro de qualquer outro tipo, parar e me avisar.
--
-- Estimativa de ganho:
--   - Queries de listagem ativa: 2–5× mais rápidas
--   - Dashboard admin: -200 a -500ms percebido
--   - Endpoints /reports/*: até 10× em datasets grandes
-- =====================================================================


-- ---------- 1. checkins ativos por (job, instalador) ----------
-- Caller: routes/checkins.py:275-279
-- Antes: full scan filtrando por status='in_progress'
-- Depois: index parcial pequeno, lookup direto
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkins_active
  ON checkins (job_id, installer_id)
  WHERE status = 'in_progress';


-- ---------- 2. item_checkins ativos por (job, item, instalador) ----------
-- Caller: routes/item_checkins.py:265-270
-- Esta é a query MAIS executada do app (instalador abre cada item).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_checkins_active
  ON item_checkins (job_id, installer_id, item_index)
  WHERE status = 'in_progress';


-- ---------- 3. jobs não arquivados ordenados por data ----------
-- Caller: routes/jobs.py:283-292 (listagem padrão do dashboard)
-- Antes: scan + ORDER BY (lento quando há muitos jobs arquivados)
-- Depois: scan apenas dos ativos, ordenados pelo próprio índice
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_unarchived_recent
  ON jobs (created_at DESC)
  WHERE archived = false OR archived IS NULL;


-- ---------- 4. jobs por holdprint_job_id (integration_schedule) ----------
-- Caller: routes/integration.py:52
-- Cada agendamento da Visual Connect faz lookup por holdprint_job_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_holdprint_id
  ON jobs (holdprint_job_id)
  WHERE holdprint_job_id IS NOT NULL;


-- ---------- 5. jobs por status (kanban, dashboard) ----------
-- Caller: routes/jobs.py várias rotas com filter status=X
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_status
  ON jobs (status)
  WHERE status IN ('aguardando', 'agendado', 'instalando', 'in_progress');


-- ---------- 6. GIN em assigned_installers (UUID[]) ----------
-- Caller: rotas que filtram jobs por instalador atribuído
-- Sem este índice: full scan + array containment a cada query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_assigned_installers_gin
  ON jobs USING GIN (assigned_installers);


-- ---------- 7. GIN em item_assignments (JSONB) ----------
-- Caller: routes/jobs.py:1051-1060 (lookup por item)
-- Permite queries do tipo @> '[{"installer_id": "..."}]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_item_assignments_gin
  ON jobs USING GIN (item_assignments);


-- ---------- 8. push_subscriptions ativas por usuário ----------
-- Caller: routes/notifications.py (envio de push notification)
-- Notificações são enviadas para todas as subs ativas de um user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_push_subscriptions_active
  ON push_subscriptions (user_id)
  WHERE enabled = true;


-- ---------- 9. location_alerts recentes por instalador ----------
-- Caller: server.py:172-198 (/location-alerts)
-- Dashboard busca alertas das últimas 24h
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_location_alerts_recent
  ON location_alerts (created_at DESC, installer_id);


-- ---------- 10. coin_transactions parcial para leaderboard ----------
-- Caller: routes/gamification.py:746-753
-- IMPORTANTE: gamificação está DESATIVADA neste momento (GAMIFICATION_ENABLED=False)
--             mas o índice fica preparado para quando reativar.
--             Custo de manter: ~zero (tabela cresce devagar com gamification off)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coin_transactions_earned
  ON coin_transactions (created_at DESC, user_id)
  WHERE amount > 0;


-- ---------- 11. coin_transactions por referência ----------
-- Caller: routes/gamification.py:354-357 (verifica duplicata por checkin)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coin_transactions_ref
  ON coin_transactions (reference_id, transaction_type)
  WHERE reference_id IS NOT NULL;


-- ---------- 12. visitas técnicas por status + data ----------
-- Caller: routes/visitas.py listagens
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitas_status_date
  ON visitas (status, scheduled_date DESC)
  WHERE status IN ('AGUARDANDO', 'CONFIRMADA', 'EM_ANDAMENTO');


-- =====================================================================
-- VERIFICAÇÃO — rodar SEPARADAMENTE depois de tudo acima terminar
-- =====================================================================
-- Cola este SELECT em uma nova query e roda:
/*
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  idx_scan AS times_used
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, indexname)
WHERE indexname LIKE 'idx_%'
  AND schemaname = 'public'
ORDER BY tablename, indexname;
*/
--
-- Deve mostrar 12 linhas (uma por índice acima). times_used começa em 0
-- e vai subir conforme o app usa os índices.
--
-- Para ver o impacto real, rode 1 hora depois:
--   - Se algum índice tem times_used = 0 → não está sendo usado, considerar drop
--   - Se algum índice cresceu muito (>100MB) → reavaliar
-- =====================================================================


-- =====================================================================
-- ROLLBACK — se precisar reverter por algum motivo
-- =====================================================================
/*
DROP INDEX CONCURRENTLY IF EXISTS idx_checkins_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_item_checkins_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_unarchived_recent;
DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_holdprint_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_assigned_installers_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_item_assignments_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_push_subscriptions_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_location_alerts_recent;
DROP INDEX CONCURRENTLY IF EXISTS idx_coin_transactions_earned;
DROP INDEX CONCURRENTLY IF EXISTS idx_coin_transactions_ref;
DROP INDEX CONCURRENTLY IF EXISTS idx_visitas_status_date;
*/
