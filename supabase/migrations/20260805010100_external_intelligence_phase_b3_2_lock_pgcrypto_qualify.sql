-- Phase B3.2: qualify pgcrypto function resolution under restricted search_path
--
-- Root cause: acquire_internal_orchestration_lock_v1 runs with `search_path = public`.
-- pgcrypto is installed under `extensions`, so unqualified gen_random_bytes(integer) cannot be resolved.
--
-- This migration preserves signature, SECURITY DEFINER, search_path, and lock semantics.

create or replace function public.acquire_internal_orchestration_lock_v1(
  in_lock_key text,
  in_lease_owner text,
  in_lease_seconds integer
)
returns table(
  acquired boolean,
  lease_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_token text;
  v_expires timestamptz;
begin
  if coalesce(nullif(in_lock_key,''),'') = '' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if coalesce(nullif(in_lease_owner,''),'') = '' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if in_lease_seconds is null or in_lease_seconds <= 0 or in_lease_seconds > 600 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  -- NOTE: pgcrypto is installed under `extensions` in Supabase.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(secs => in_lease_seconds);

  -- Try insert-first.
  insert into public.internal_orchestration_locks_v1(
    lock_key, lease_token, lease_owner, acquired_at, expires_at, heartbeat_at, updated_at
  ) values (
    in_lock_key, v_token, in_lease_owner, now(), v_expires, now(), now()
  ) on conflict (lock_key) do nothing;

  if found then
    acquired := true;
    lease_token := v_token;
    expires_at := v_expires;
    return next;
    return;
  end if;

  -- If existing is expired (or empty), claim it atomically.
  update public.internal_orchestration_locks_v1
    set
      lease_token = v_token,
      lease_owner = in_lease_owner,
      acquired_at = now(),
      expires_at = v_expires,
      heartbeat_at = now(),
      updated_at = now()
    where public.internal_orchestration_locks_v1.lock_key = in_lock_key
      and (public.internal_orchestration_locks_v1.expires_at is null or public.internal_orchestration_locks_v1.expires_at <= now());

  if found then
    acquired := true;
    lease_token := v_token;
    expires_at := v_expires;
  else
    acquired := false;
    lease_token := null;
    expires_at := null;
  end if;

  return next;
end;
$fn$;

revoke execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) from public;
revoke execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) from anon, authenticated;
grant execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) to service_role;
