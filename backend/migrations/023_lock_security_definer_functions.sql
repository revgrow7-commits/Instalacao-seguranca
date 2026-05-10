-- Migration 023: Revogar EXECUTE de funções SECURITY DEFINER do role anon
-- Essas funções estavam expostas via /rest/v1/rpc/ sem autenticação.
-- O backend usa service_role (bypass), então revogar anon não quebra nada.

REVOKE EXECUTE ON FUNCTION public.auto_confirm_email() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon;
