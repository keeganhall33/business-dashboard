-- debug_request_jwt_role_v1: diagnostic expansion to prove PostgREST request-role impersonation.
--
-- Scope:
-- - Modify ONLY public.debug_request_jwt_role_v1()
-- - No table reads
-- - No writes
-- - No SECURITY DEFINER
-- - Returns only safe role/ref + role-surface diagnostics (no JWT contents)

create or replace function public.debug_request_jwt_role_v1()
returns jsonb
language plpgsql
stable
as $$
declare
  v_auth jsonb;
  v_auth_role text;
  v_auth_ref text;
  v_legacy_role text;
  v_legacy_ref text;
  v_setting_role text;
begin
  v_auth := auth.jwt();
  v_auth_role := nullif((v_auth ->> 'role'), '');
  v_auth_ref := nullif((v_auth ->> 'ref'), '');

  v_legacy_role := nullif(current_setting('request.jwt.claim.role', true), '');
  v_legacy_ref := nullif(current_setting('request.jwt.claim.ref', true), '');

  v_setting_role := nullif(current_setting('role', true), '');

  return jsonb_build_object(
    'current_user', current_user,
    'current_role', current_role,
    'current_setting_role', coalesce(v_setting_role, '<blank>'),
    'session_user', session_user,
    'auth_jwt_role', coalesce(v_auth_role, '<blank>'),
    'auth_jwt_ref',  coalesce(v_auth_ref, '<blank>'),
    'legacy_setting_role', coalesce(v_legacy_role, '<blank>'),
    'legacy_setting_ref',  coalesce(v_legacy_ref, '<blank>')
  );
end;
$$;

revoke all on function public.debug_request_jwt_role_v1() from public;
grant execute on function public.debug_request_jwt_role_v1() to anon, authenticated, service_role;
