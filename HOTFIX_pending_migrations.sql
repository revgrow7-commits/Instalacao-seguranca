-- ============================================================================
-- HOTFIX: aplicar migrations pendentes em instal-visual.com.br (qfsxtwkltfraounsjjah)
-- Gerado em 2026-05-13. Cole TUDO no SQL Editor do Supabase do projeto correto.
--
-- Inclui migrations 023, 024, 025, 027, 028, 029 do diretório backend/migrations/.
-- Todas são idempotentes (DROP IF EXISTS, ADD COLUMN IF NOT EXISTS, REVOKE,
-- ALTER FUNCTION SET) — rodar várias vezes não causa estrago.
--
-- ANTES de rodar, confirme:
--   SELECT current_database(), current_schema();
--   -- deve retornar postgres / public
--
-- Confirme também que está no projeto certo:
--   SELECT * FROM auth.users LIMIT 1;
--   -- valide o email é de uma conta sua de instal-visual.com.br,
--   -- não somos-industriavisual.com.br
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 023: Revogar EXECUTE de funções SECURITY DEFINER do role anon
-- (estavam expostas via /rest/v1/rpc/ sem autenticação; backend usa service_role)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_confirm_email' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.auto_confirm_email() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_role' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 024: Fixar search_path em todas as funções públicas
-- (previne ataques de schema-injection via search_path mutável)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'report_visitas_by_altura', 'report_visitas_by_aprovacao',
        'report_visitas_by_dificuldade', 'report_visitas_by_filial',
        'report_visitas_by_instalador', 'report_visitas_by_tipo_servico',
        'report_visitas_by_vendedor', 'report_visitas_custo_deslocamento',
        'report_visitas_divergencia_remocao',
        'auto_confirm_email', 'get_user_role', 'handle_new_user',
        'rls_auto_enable', 'update_updated_at'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog;', fn.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 025: Alinhar CHECK constraint de coin_transactions com valores reais do backend
-- BUG ATIVO: constraint original não incluía 'earn_engagement','earn_checkout',
-- 'spend_reward','refund' — causando violação recorrente nos logs do Postgres.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_transaction_type_check;

ALTER TABLE IF EXISTS coin_transactions
  ADD CONSTRAINT coin_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'earn', 'redeem', 'bonus', 'penalty',
    'earn_engagement', 'earn_checkout', 'spend_reward', 'refund'
  ));

-- ----------------------------------------------------------------------------
-- 027: Otimizar políticas RLS com auth_rls_initplan
-- (substitui auth.uid() por (SELECT auth.uid()) — evita re-avaliação por linha)
-- ----------------------------------------------------------------------------

-- profiles.profiles_select
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    (id = (SELECT auth.uid()))
    OR ((SELECT get_user_role()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  );

-- profiles.profiles_update_own
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (id = (SELECT auth.uid()));

-- job_items.job_items_select
DROP POLICY IF EXISTS job_items_select ON public.job_items;
CREATE POLICY job_items_select ON public.job_items
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- job_installer_assignments.job_assignments_select
DROP POLICY IF EXISTS job_assignments_select ON public.job_installer_assignments;
CREATE POLICY job_assignments_select ON public.job_installer_assignments
  FOR SELECT
  USING (
    (installer_id = (SELECT auth.uid()))
    OR ((SELECT get_user_role()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  );

-- job_installer_assignments.job_assignments_admin_write
DROP POLICY IF EXISTS job_assignments_admin_write ON public.job_installer_assignments;
CREATE POLICY job_assignments_admin_write ON public.job_installer_assignments
  FOR ALL
  USING ((SELECT get_user_role()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- ----------------------------------------------------------------------------
-- 028: Campo vendedor_email para envio automático de relatório ao vendedor
-- (usado por commit eef53a2 — feat: vendedor e instalador com busca no Visual Connect)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS visitas_tecnicas
  ADD COLUMN IF NOT EXISTS vendedor_email TEXT;

-- ----------------------------------------------------------------------------
-- 029: Campos installer_nome / installer_email para instalador externo (Visual Connect)
-- (usado por commit cc44100 — feat: integration/schedule aceita installer_emails)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS visitas_tecnicas
  ADD COLUMN IF NOT EXISTS installer_nome  TEXT,
  ADD COLUMN IF NOT EXISTS installer_email TEXT;

COMMENT ON COLUMN visitas_tecnicas.installer_nome  IS
  'Nome do instalador externo (Visual Connect). Redundante quando installer_id está preenchido.';
COMMENT ON COLUMN visitas_tecnicas.installer_email IS
  'E-mail do instalador externo (Visual Connect). Usado para envio de convite quando sem conta local.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO PÓS-EXECUÇÃO — rode estes SELECTs e confira:
-- ============================================================================

-- 1) Colunas novas em visitas_tecnicas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'visitas_tecnicas'
  AND column_name IN ('vendedor_email', 'installer_nome', 'installer_email')
ORDER BY column_name;
-- Esperado: 3 linhas (todas text, nullable)

-- 2) CHECK constraint de coin_transactions
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'coin_transactions_transaction_type_check';
-- Esperado: CHECK ((transaction_type)::text = ANY (ARRAY['earn'::text, 'redeem'::text, ...]))

-- 3) search_path fixado em funções públicas
SELECT proname, prosrc IS NOT NULL AS has_body,
       proconfig
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE 'report_visitas_%'
ORDER BY proname;
-- Esperado: cada linha com proconfig contendo 'search_path=public, pg_catalog'

-- 4) RLS policies atualizadas
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'job_items', 'job_installer_assignments')
ORDER BY tablename, policyname;
-- Esperado: políticas com (SELECT auth.uid()) em vez de só auth.uid()
