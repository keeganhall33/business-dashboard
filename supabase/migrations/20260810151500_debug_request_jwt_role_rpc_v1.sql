-- debug_request_jwt_role_v1
--
-- Purpose:
-- - No-write diagnostic RPC to prove what PostgREST resolves as request.jwt.claim.role (and request.jwt.claim.ref)
--   inside the database execution context.
--
-- Safety:
-- - STABLE (no writes)
-- - No table reads
-- - Returns ONLY non-secret role/ref strings (no JWT contents)
-- - No SECURITY DEFINER

create or replace function public.debug_request_jwt_role_v1()
returns jsonb
language plpgsql
stable
as $$
declare
  v_role text;
  v_ref text;
begin
  v_role := nullif(current_setting('request.jwt.claim.role', true), '');
  v_ref := nullif(current_setting('request.jwt.claim.ref', true), '');

  return jsonb_build_object(
    'role', coalesce(v_role, '<missing>'),
    'ref',  coalesce(v_ref, '<missing>')
  );
end;
$$;

revoke all on function public.debug_request_jwt_role_v1() from public;
grant execute on function public.debug_request_jwt_role_v1() to anon, authenticated, service_role;
