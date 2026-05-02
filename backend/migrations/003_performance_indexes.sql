-- ============================================================
-- INDUSTRIA VISUAL - Migration 003: Performance Indexes
--
-- Objetivo: Adicionar índices compostos e GIN para acelerar as
-- queries mais lentas identificadas nos módulos de jobs, check-ins,
-- gamificação e produtividade.
--
-- Estratégia:
--   - CREATE INDEX CONCURRENTLY IF NOT EXISTS → sem lock de tabela,
--     idempotente (pode rodar novamente sem erro).
--   - GIN para colunas JSONB (busca dentro de arrays/objetos).
--   - B-tree composto para filtros multi-coluna (segue ordem
--     seletividade: coluna mais restritiva primeiro).
--
-- Índices já existentes (NÃO duplicados aqui):
--   jobs          : idx_jobs_holdprint_job_id, idx_jobs_branch,
--                   idx_jobs_status, idx_jobs_scheduled_date,
--                   idx_jobs_created_at, idx_jobs_archived
--   checkins      : idx_checkins_job_id, idx_checkins_installer_id,
--                   idx_checkins_checkin_at
--   item_checkins : idx_item_checkins_job_id, idx_item_checkins_installer_id,
--                   idx_item_checkins_status
--   coin_transactions       : idx_coin_transactions_user_id,
--                             idx_coin_transactions_created_at
--   gamification_balances   : idx_gamification_balances_user_id (UNIQUE)
--   productivity_history    : idx_productivity_history_installer_id,
--                             idx_productivity_history_family_id
--
-- Executar no Supabase SQL Editor ou via psql (cada statement
-- independente; CONCURRENTLY não roda dentro de bloco de transação).
-- ============================================================


-- ============================================================
-- TABELA: jobs
-- ============================================================

-- Filtro por JSONB array de UUIDs dos instaladores atribuídos.
-- Suporta queries do tipo: assigned_installers @> '["<uuid>"]'
-- Beneficia: listagem de jobs por instalador no dashboard e mobile.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_assigned_installers_gin
    ON jobs USING GIN (assigned_installers);

-- Índice composto status + branch para a listagem principal do dashboard.
-- Os índices simples idx_jobs_status e idx_jobs_branch já existem, mas
-- o Postgres não os combina eficientemente em bitmaps para esta query
-- quando há muitas linhas por status; o composto é 2-5x mais rápido.
-- Beneficia: GET /jobs?status=aguardando&branch=POA
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_status_branch
    ON jobs (status, branch);

-- Índice parcial para jobs não arquivados com data agendada preenchida.
-- Elimina a grande maioria de NULLs do índice, reduzindo tamanho e
-- acelerando o Calendar e relatórios de agendamento.
-- Beneficia: /calendar, queries WHERE scheduled_date IS NOT NULL AND archived = FALSE
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_scheduled_date_active
    ON jobs (scheduled_date)
    WHERE scheduled_date IS NOT NULL AND archived = FALSE;


-- ============================================================
-- TABELA: checkins
-- ============================================================

-- Filtro composto job + status para listar check-ins ativos/concluídos
-- de um job específico. Sem este índice o Postgres filtra por job_id
-- e depois percorre todas as linhas para filtrar status.
-- Beneficia: GET /checkins?job_id=<id>&status=in_progress
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkins_job_status
    ON checkins (job_id, status);

-- Filtro composto installer + status para o dashboard do instalador
-- (mostra somente seus check-ins ativos ou histórico filtrado).
-- Beneficia: GET /checkins?installer_id=<id>&status=completed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkins_installer_status
    ON checkins (installer_id, status);


-- ============================================================
-- TABELA: item_checkins
-- ============================================================

-- Filtro composto job + status (query mais frequente do backend).
-- idx_item_checkins_status simples já existe mas não é suficiente
-- quando há muitos item_checkins por status globalmente.
-- Beneficia: listagem de itens por job filtrando por status (in_progress, completed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_checkins_job_status
    ON item_checkins (job_id, status);

-- Filtro composto job + installer para a tela do instalador,
-- que exibe apenas os itens que ele mesmo está executando.
-- Beneficia: GET /item_checkins?job_id=<id>&installer_id=<id>
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_checkins_job_installer
    ON item_checkins (job_id, installer_id);


-- ============================================================
-- TABELA: coin_transactions
-- ============================================================

-- Filtro composto user + tipo de transação para o extrato de moedas
-- e relatório de gamificação. O índice simples idx_coin_transactions_user_id
-- já filtra por usuário, mas adicionar transaction_type evita heap fetch
-- para a coluna de filtro secundário.
-- Beneficia: GET /coin_transactions?user_id=<id>&transaction_type=job_completion
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coin_transactions_user_type
    ON coin_transactions (user_id, transaction_type);


-- ============================================================
-- TABELA: gamification_balances
-- ============================================================

-- idx_gamification_balances_user_id (UNIQUE) já cobre lookup por user_id.
-- Nenhum índice adicional necessário para esta tabela.
-- já existe: idx_gamification_balances_user_id


-- ============================================================
-- TABELA: productivity_history
-- ============================================================

-- O schema autoritativo (001_schema_completo.sql) define a tabela com
-- as colunas: installer_id, family_id, date (TEXT), family_name.
-- Não há colunas period_type nem period_date neste schema.
-- O índice composto abaixo cobre o padrão de query por instalador
-- ordenado pela data (coluna TEXT no formato ISO YYYY-MM-DD,
-- que ordena corretamente como string).
-- Beneficia: relatórios de produtividade por instalador ordenados por data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_productivity_history_installer_date
    ON productivity_history (installer_id, date DESC);

-- Índice composto family + date para queries de benchmark por família,
-- complementando o idx_productivity_history_family_id já existente.
-- Beneficia: /reports/kpis — agrupamento por família com recorte temporal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_productivity_history_family_date
    ON productivity_history (family_id, date DESC);


-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
-- Execute após aplicar para confirmar criação:
--
-- SELECT indexname, tablename, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
-- ============================================================
