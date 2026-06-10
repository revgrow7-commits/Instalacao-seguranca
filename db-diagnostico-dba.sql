-- ============================================================
-- DIAGNÓSTICO DBA — instal-visual (qfsxtwkltfraounsjjah)
-- Rodar no Supabase SQL Editor. Somente leitura — não altera nada.
-- Cada seção pode ser executada isoladamente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. VOLUME: tamanho e contagem por tabela
-- ------------------------------------------------------------
SELECT
  c.relname                                   AS tabela,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS tamanho_total,
  pg_size_pretty(pg_relation_size(c.oid))     AS tamanho_dados,
  pg_size_pretty(pg_indexes_size(c.oid))      AS tamanho_indices,
  c.reltuples::bigint                         AS linhas_estimadas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;

-- ------------------------------------------------------------
-- 2. LEITURA vs ESCRITA por tabela (desde o último stats reset)
--    n_tup_ins/upd/del = escrita; seq_scan+idx_scan = leitura
-- ------------------------------------------------------------
SELECT
  relname AS tabela,
  seq_scan, idx_scan,
  CASE WHEN seq_scan + idx_scan > 0
       THEN round(100.0 * idx_scan / (seq_scan + idx_scan), 1) END AS pct_via_indice,
  n_tup_ins AS inserts, n_tup_upd AS updates, n_tup_del AS deletes,
  n_live_tup AS linhas_vivas, n_dead_tup AS linhas_mortas,
  last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY seq_scan DESC;
-- ⚠ seq_scan alto + linhas_estimadas alto = tabela varrida inteira (confirma Q1–Q5 do relatório)

-- ------------------------------------------------------------
-- 3. SLOW QUERIES — top 20 por tempo total (pg_stat_statements)
-- ------------------------------------------------------------
SELECT
  round(total_exec_time::numeric, 0)        AS tempo_total_ms,
  calls,
  round(mean_exec_time::numeric, 1)         AS media_ms,
  round(max_exec_time::numeric, 0)          AS max_ms,
  rows,
  round(100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0), 1) AS cache_hit_pct,
  left(query, 160)                          AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%' AND query NOT ILIKE '%pg_catalog%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- Top 20 por tempo MÉDIO (queries individualmente lentas):
SELECT
  round(mean_exec_time::numeric, 1) AS media_ms, calls,
  round(total_exec_time::numeric, 0) AS tempo_total_ms,
  left(query, 160) AS query
FROM pg_stat_statements
WHERE calls > 5 AND query NOT ILIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Após aplicar correções, zerar e re-medir em 48h:
-- SELECT pg_stat_statements_reset();

-- ------------------------------------------------------------
-- 4. ÍNDICES NÃO UTILIZADOS (candidatos a drop — esperar 30 dias de stats)
-- ------------------------------------------------------------
SELECT
  s.indexrelname AS indice,
  s.relname      AS tabela,
  s.idx_scan     AS vezes_usado,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamanho
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique          -- nunca dropar unique/PK
  AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- ------------------------------------------------------------
-- 5. ÍNDICES DUPLICADOS/REDUNDANTES (mesmas colunas-prefixo)
-- ------------------------------------------------------------
SELECT
  a.indexrelid::regclass AS indice_1,
  b.indexrelid::regclass AS indice_2,
  a.indrelid::regclass   AS tabela
FROM pg_index a
JOIN pg_index b ON a.indrelid = b.indrelid
  AND a.indexrelid > b.indexrelid
  AND (a.indkey::text LIKE b.indkey::text || '%' OR b.indkey::text LIKE a.indkey::text || '%')
JOIN pg_class c ON c.oid = a.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public';

-- ------------------------------------------------------------
-- 6. FKs SEM ÍNDICE na coluna referenciadora
-- ------------------------------------------------------------
SELECT
  conrelid::regclass AS tabela,
  conname            AS constraint_fk,
  a.attname          AS coluna_sem_indice
FROM pg_constraint ct
JOIN LATERAL unnest(ct.conkey) AS k(attnum) ON true
JOIN pg_attribute a ON a.attrelid = ct.conrelid AND a.attnum = k.attnum
WHERE ct.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = ct.conrelid
      AND a.attnum = ANY(i.indkey)
      AND i.indkey[0] = a.attnum    -- precisa ser primeira coluna do índice
  )
ORDER BY 1;

-- ------------------------------------------------------------
-- 7. CACHE HIT RATIO global (saudável: > 99%)
-- ------------------------------------------------------------
SELECT
  round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) AS cache_hit_pct
FROM pg_stat_database
WHERE datname = current_database();

-- ------------------------------------------------------------
-- 8. CONEXÕES ATIVAS (PostgREST/Supavisor) e estado
-- ------------------------------------------------------------
SELECT state, count(*), max(now() - state_change) AS mais_antiga
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;

-- ------------------------------------------------------------
-- 9. BLOAT rápido (linhas mortas acumuladas — autovacuum dando conta?)
-- ------------------------------------------------------------
SELECT relname, n_live_tup, n_dead_tup,
  round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) AS pct_morto
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- ------------------------------------------------------------
-- 10. PESO DO JSONB em jobs (maiores linhas — explica payload dos full scans)
-- ------------------------------------------------------------
SELECT
  pg_size_pretty(avg(pg_column_size(holdprint_data))::bigint)  AS media_holdprint_data,
  pg_size_pretty(max(pg_column_size(holdprint_data))::bigint)  AS max_holdprint_data,
  pg_size_pretty(avg(pg_column_size(items))::bigint)           AS media_items,
  pg_size_pretty(avg(pg_column_size(products_with_area))::bigint) AS media_products_with_area
FROM jobs;

-- ------------------------------------------------------------
-- 11. VERIFICAÇÃO: migrations 038/039 aplicadas?
-- ------------------------------------------------------------
SELECT 'login_attempts existe' AS check_, EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='login_attempts') AS ok
UNION ALL
SELECT 'RPC increment_field existe', EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='increment_field');
