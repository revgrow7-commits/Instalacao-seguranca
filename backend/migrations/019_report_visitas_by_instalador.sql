-- Migration 019: função de relatório analítico de visitas por instalador
-- Usado pelo endpoint GET /visitas/reports/by-instalador
-- JOIN com tabela installers para resolver installer_id → full_name

CREATE OR REPLACE FUNCTION report_visitas_by_instalador(
    p_branch    TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to   DATE DEFAULT NULL
) RETURNS SETOF JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'installer_id',         installer_id,
        'installer_name',       installer_name,
        'total',                total,
        'concluidas',           concluidas,
        'aprovadas',            aprovadas,
        'tempo_medio_minutos',  tempo_medio_minutos,
        'custo_total',          custo_total
    )
    FROM (
        SELECT
            vt.installer_id,
            COALESCE(i.full_name, vt.installer_id)                                       AS installer_name,
            COUNT(*)                                                                       AS total,
            COUNT(*) FILTER (WHERE vt.status = 'CONCLUIDA')                               AS concluidas,
            COUNT(*) FILTER (WHERE vt.aprovacao_status = 'APROVADO')                      AS aprovadas,
            AVG(EXTRACT(EPOCH FROM (vt.relatorio_saida - vt.relatorio_chegada)) / 60.0)   AS tempo_medio_minutos,
            COALESCE(SUM(vt.valor_total), 0)                                               AS custo_total
        FROM visitas_tecnicas vt
        LEFT JOIN installers i ON i.id = vt.installer_id
        WHERE vt.installer_id IS NOT NULL
          AND (p_branch    IS NULL OR vt.branch          = p_branch)
          AND (p_date_from IS NULL OR vt.scheduled_date >= p_date_from)
          AND (p_date_to   IS NULL OR vt.scheduled_date <= p_date_to)
        GROUP BY vt.installer_id, i.full_name
        ORDER BY total DESC
    ) t;
$$;
