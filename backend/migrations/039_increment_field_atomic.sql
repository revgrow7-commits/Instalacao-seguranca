-- Migration 039: Incremento atômico de campos (M4 — resolve $inc não atômico)
-- Substitui o read-then-write do wrapper (db_supabase.py) por um UPDATE atômico
-- no banco, eliminando a race condition em contadores (PENDING-001 / ARCH-003).
-- Chamada via RPC pelo backend (service role). Assume PK/identificador "id".

CREATE OR REPLACE FUNCTION public.increment_field(
    p_table TEXT,
    p_id    TEXT,
    p_field TEXT,
    p_delta NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- %I cita identificadores com segurança (anti-injeção). O incremento é
    -- atômico: coalesce trata NULL como 0. Comparação por (id)::text cobre
    -- colunas id do tipo uuid ou text.
    EXECUTE format(
        'UPDATE %I SET %I = COALESCE(%I, 0) + $1 WHERE (id)::text = $2',
        p_table, p_field, p_field
    ) USING p_delta, p_id;
END;
$$;

-- Menor privilégio: somente o backend (service role) pode executar.
REVOKE ALL ON FUNCTION public.increment_field(TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_field(TEXT, TEXT, TEXT, NUMERIC) TO service_role;
