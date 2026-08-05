begin;

-- B3: advisory lock helpers for central orchestration heartbeat.
-- Service-role only.

create or replace function public.try_advisory_lock_v1(in_lock_key bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_acquired boolean;
begin
  select pg_try_advisory_lock(in_lock_key) into v_acquired;
  return coalesce(v_acquired,false);
end;
$fn$;

create or replace function public.advisory_unlock_v1(in_lock_key bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_released boolean;
begin
  select pg_advisory_unlock(in_lock_key) into v_released;
  return coalesce(v_released,false);
end;
$fn$;

revoke execute on function public.try_advisory_lock_v1(bigint) from public;
revoke execute on function public.advisory_unlock_v1(bigint) from public;

revoke execute on function public.try_advisory_lock_v1(bigint) from anon, authenticated;
revoke execute on function public.advisory_unlock_v1(bigint) from anon, authenticated;

grant execute on function public.try_advisory_lock_v1(bigint) to service_role;
grant execute on function public.advisory_unlock_v1(bigint) to service_role;

commit;

