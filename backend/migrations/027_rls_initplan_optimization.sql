-- Migration 027: Otimizar políticas RLS com auth_rls_initplan
-- Substitui auth.uid() por (select auth.uid()) para evitar re-avaliação por linha.
-- Refs: Supabase advisor auth_rls_initplan (5 ocorrências em profiles, job_items, job_installer_assignments)

-- profiles: profiles_select
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    (id = (SELECT auth.uid()))
    OR ((SELECT get_user_role()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  );

-- profiles: profiles_update_own
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (id = (SELECT auth.uid()));

-- job_items: job_items_select
DROP POLICY IF EXISTS job_items_select ON public.job_items;
CREATE POLICY job_items_select ON public.job_items
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- job_installer_assignments: job_assignments_select
DROP POLICY IF EXISTS job_assignments_select ON public.job_installer_assignments;
CREATE POLICY job_assignments_select ON public.job_installer_assignments
  FOR SELECT
  USING (
    (installer_id = (SELECT auth.uid()))
    OR ((SELECT get_user_role()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  );

-- job_installer_assignments: job_assignments_admin_write (ALL)
DROP POLICY IF EXISTS job_assignments_admin_write ON public.job_installer_assignments;
CREATE POLICY job_assignments_admin_write ON public.job_installer_assignments
  FOR ALL
  USING ((SELECT get_user_role()) = ANY (ARRAY['admin'::text, 'manager'::text]));
