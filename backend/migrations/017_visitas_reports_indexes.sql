-- Migration 017: Índices e funções SQL para relatórios analíticos de visitas técnicas (Fase 3)
-- Cria índices para acelerar agregações e expõe 8 funções SECURITY INVOKER que servem
-- aos endpoints /visitas/reports/* via supabase.rpc(). Cada função aceita os mesmos filtros
-- opcionais (p_branch, p_date_from, p_date_to) e retorna SETOF JSON.

-- ============================================================
-- 1. Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_vt_vendedor          ON visitas_tecnicas (vendedor_nome);
CREATE INDEX IF NOT EXISTS idx_vt_branch_date       ON visitas_tecnicas (branch, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vt_aprovacao_date    ON visitas_tecnicas (aprovacao_status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vt_installer_date    ON visitas_tecnicas (installer_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vt_dificuldade       ON visitas_tecnicas (nivel_dificuldade);
CREATE INDEX IF NOT EXISTS idx_vt_tipos_servico     ON visitas_tecnicas USING GIN (tipos_servico);

-- ============================================================
-- 2. Funções de relatório
-- ============================================================
-- Convenção:
--  • Todas aceitam p_branch TEXT, p_date_from DATE, p_date_to DATE (qualquer um pode ser NULL).
--  • Retornam SETOF JSON para facilitar consumo pelo cliente Supabase.
--  • SECURITY INVOKER (default) — RLS aplica-se às consultas internas.
--  • Filtros NULL são ignorados via "(p_xxx IS NULL OR coluna = p_xxx)".

-- 2.1 by-vendedor
CREATE OR REPLACE FUNCTION report_visitas_by_vendedor(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'vendedor_nome',             vendedor_nome,
        'total',                     total,
        'concluidas',                concluidas,
        'aprovadas',                 aprovadas,
        'custo_deslocamento_total',  custo_deslocamento_total,
        'custo_medio',               custo_medio
    )
    FROM (
        SELECT
            vendedor_nome,
            COUNT(*)                                                  AS total,
            COUNT(*) FILTER (WHERE status = 'CONCLUIDA')              AS concluidas,
            COUNT(*) FILTER (WHERE aprovacao_status = 'APROVADO')     AS aprovadas,
            COALESCE(SUM(valor_total), 0)                             AS custo_deslocamento_total,
            COALESCE(AVG(valor_total), 0)                             AS custo_medio
        FROM visitas_tecnicas
        WHERE vendedor_nome IS NOT NULL
          AND (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
        GROUP BY vendedor_nome
        ORDER BY total DESC
    ) t;
$$;

-- 2.2 by-filial
CREATE OR REPLACE FUNCTION report_visitas_by_filial(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'branch',               branch,
        'total',                total,
        'concluidas',           concluidas,
        'custo_medio',          custo_medio,
        'taxa_aprovacao',       taxa_aprovacao,
        'tempo_medio_minutos',  tempo_medio_minutos
    )
    FROM (
        SELECT
            branch,
            COUNT(*)                                                                                  AS total,
            COUNT(*) FILTER (WHERE status = 'CONCLUIDA')                                              AS concluidas,
            COALESCE(AVG(valor_total), 0)                                                             AS custo_medio,
            COUNT(*) FILTER (WHERE aprovacao_status = 'APROVADO')::float
                / NULLIF(COUNT(*), 0)                                                                 AS taxa_aprovacao,
            AVG(EXTRACT(EPOCH FROM (relatorio_saida - relatorio_chegada)) / 60.0)                     AS tempo_medio_minutos
        FROM visitas_tecnicas
        WHERE (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
        GROUP BY branch
        ORDER BY total DESC
    ) t;
$$;

-- 2.3 by-aprovacao
CREATE OR REPLACE FUNCTION report_visitas_by_aprovacao(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'aprovacao_status',     aprovacao_status,
        'total',                total,
        'pendentes_atrasados',  pendentes_atrasados
    )
    FROM (
        SELECT
            aprovacao_status,
            COUNT(*) AS total,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id',            id,
                        'numero_vt',     numero_vt,
                        'client_name',   client_name,
                        'dias_pendente', EXTRACT(DAY FROM (now() - created_at))::int
                    )
                ) FILTER (
                    WHERE aprovacao_status = 'PENDENTE'
                      AND EXTRACT(DAY FROM (now() - created_at)) > 7
                ),
                '[]'::json
            ) AS pendentes_atrasados
        FROM visitas_tecnicas
        WHERE (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
        GROUP BY aprovacao_status
        ORDER BY total DESC
    ) t;
$$;

-- 2.4 by-dificuldade
CREATE OR REPLACE FUNCTION report_visitas_by_dificuldade(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'nivel_dificuldade',    nivel_dificuldade,
        'total',                total,
        'tempo_medio_minutos',  tempo_medio_minutos
    )
    FROM (
        SELECT
            nivel_dificuldade,
            COUNT(*) AS total,
            AVG(EXTRACT(EPOCH FROM (relatorio_saida - relatorio_chegada)) / 60.0) AS tempo_medio_minutos
        FROM visitas_tecnicas
        WHERE nivel_dificuldade IS NOT NULL
          AND (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
        GROUP BY nivel_dificuldade
        ORDER BY nivel_dificuldade
    ) t;
$$;

-- 2.5 by-tipo-servico
CREATE OR REPLACE FUNCTION report_visitas_by_tipo_servico(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object('tipo', tipo, 'total', total)
    FROM (
        SELECT tipo, COUNT(*) AS total
        FROM visitas_tecnicas, unnest(tipos_servico) AS tipo
        WHERE (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
        GROUP BY tipo
        ORDER BY total DESC
    ) t;
$$;

-- 2.6 by-altura
CREATE OR REPLACE FUNCTION report_visitas_by_altura(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'faixa',              faixa,
        'total',              total,
        'dificuldade_media',  dificuldade_media
    )
    FROM (
        SELECT
            CASE
                WHEN altura_estimada_m < 3 THEN '0-3m'
                WHEN altura_estimada_m < 6 THEN '3-6m'
                ELSE '6m+'
            END                                AS faixa,
            COUNT(*)                           AS total,
            AVG(nivel_dificuldade)             AS dificuldade_media,
            MIN(altura_estimada_m)             AS min_altura
        FROM visitas_tecnicas
        WHERE altura_estimada_m IS NOT NULL
          AND (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
        GROUP BY 1
        ORDER BY min_altura
    ) t;
$$;

-- 2.7 divergencia-remocao (retorna 1 linha)
CREATE OR REPLACE FUNCTION report_visitas_divergencia_remocao(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'divergencias',           divergencias,
        'total',                  total,
        'percentual_divergencia', percentual_divergencia,
        'lista_divergencias',     COALESCE(lista_divergencias, '[]'::json)
    )
    FROM (
        SELECT
            COUNT(*) FILTER (WHERE remocao_prevista_os IS DISTINCT FROM remocao_a_realizar) AS divergencias,
            COUNT(*)                                                                        AS total,
            ROUND(
                COUNT(*) FILTER (WHERE remocao_prevista_os IS DISTINCT FROM remocao_a_realizar)::numeric
                / NULLIF(COUNT(*), 0) * 100,
                1
            )                                                                               AS percentual_divergencia,
            json_agg(
                json_build_object(
                    'id',          id,
                    'numero_vt',   numero_vt,
                    'client_name', client_name,
                    'prevista',    remocao_prevista_os,
                    'realizada',   remocao_a_realizar
                )
            ) FILTER (WHERE remocao_prevista_os IS DISTINCT FROM remocao_a_realizar)        AS lista_divergencias
        FROM visitas_tecnicas
        WHERE remocao_prevista_os IS NOT NULL
          AND remocao_a_realizar IS NOT NULL
          AND (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
    ) t;
$$;

-- 2.8 custo-deslocamento (por filial × instalador × mês)
CREATE OR REPLACE FUNCTION report_visitas_custo_deslocamento(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'branch',       branch,
        'installer_id', installer_id,
        'mes',          to_char(mes, 'YYYY-MM-DD'),
        'custo_total',  custo_total,
        'km_total',     km_total,
        'visitas',      visitas
    )
    FROM (
        SELECT
            branch,
            installer_id,
            DATE_TRUNC('month', scheduled_date)::date AS mes,
            SUM(valor_total)                          AS custo_total,
            SUM(km_ida + km_volta)                    AS km_total,
            COUNT(*)                                  AS visitas
        FROM visitas_tecnicas
        WHERE valor_total IS NOT NULL
          AND (p_branch    IS NULL OR branch          = p_branch)
          AND (p_date_from IS NULL OR scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR scheduled_date <= p_date_to)
        GROUP BY branch, installer_id, DATE_TRUNC('month', scheduled_date)
        ORDER BY mes DESC, custo_total DESC
    ) t;
$$;

-- ============================================================
-- 3. Permissões
-- ============================================================
GRANT EXECUTE ON FUNCTION report_visitas_by_vendedor(TEXT, DATE, DATE)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION report_visitas_by_filial(TEXT, DATE, DATE)           TO authenticated, anon;
GRANT EXECUTE ON FUNCTION report_visitas_by_aprovacao(TEXT, DATE, DATE)        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION report_visitas_by_dificuldade(TEXT, DATE, DATE)      TO authenticated, anon;
GRANT EXECUTE ON FUNCTION report_visitas_by_tipo_servico(TEXT, DATE, DATE)     TO authenticated, anon;
GRANT EXECUTE ON FUNCTION report_visitas_by_altura(TEXT, DATE, DATE)           TO authenticated, anon;
GRANT EXECUTE ON FUNCTION report_visitas_divergencia_remocao(TEXT, DATE, DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION report_visitas_custo_deslocamento(TEXT, DATE, DATE)  TO authenticated, anon;
