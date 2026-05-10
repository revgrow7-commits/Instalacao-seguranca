-- Migration 024: Fixar search_path em todas as funções públicas
-- Previne ataques de schema-injection via search_path mutável.
-- Refs: Supabase advisor function_search_path_mutable (12 ocorrências)

-- Funções de relatório de visitas técnicas
ALTER FUNCTION public.report_visitas_by_altura(text, date, date)       SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_by_aprovacao(text, date, date)    SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_by_dificuldade(text, date, date)  SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_by_filial(text, date, date)       SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_by_instalador(text, date, date)   SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_by_tipo_servico(text, date, date) SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_by_vendedor(text, date, date)     SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_custo_deslocamento(text, date, date)    SET search_path = public, pg_catalog;
ALTER FUNCTION public.report_visitas_divergencia_remocao(text, date, date)   SET search_path = public, pg_catalog;

-- Funções utilitárias / trigger
ALTER FUNCTION public.auto_confirm_email()  SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_user_role()       SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_new_user()     SET search_path = public, pg_catalog;
ALTER FUNCTION public.rls_auto_enable()     SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_updated_at()   SET search_path = public, pg_catalog;
