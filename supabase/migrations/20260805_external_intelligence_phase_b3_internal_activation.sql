begin;

-- B3: durable internal orchestration lock (no session-affinity).
-- Service-role only.

create table if not exists public.internal_orchestration_locks_v1 (
  lock_key text primary key,
  lease_token text,
  lease_owner text,
  acquired_at timestamptz,
  expires_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_orchestration_jobs_v1 (
  job_name text primary key,
  job_version text not null,
  handler_identity text not null,

  enabled boolean not null default false,
  environment text not null,

  cadence_type text not null,
  cadence_minutes integer,
  timezone text not null default 'UTC',

  timeout_seconds integer not null,
  maximum_attempts integer not null,
  concurrency_key text not null,

  next_run_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,

  review_by text,
  governing_policy_version text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint internal_orchestration_jobs_v1__cadence_type_check
    check (cadence_type in ('hourly','daily')),
  constraint internal_orchestration_jobs_v1__environment_check
    check (environment in ('production','staging','local')),
  constraint internal_orchestration_jobs_v1__maximum_attempts_check
    check (maximum_attempts >= 0)
);

create index if not exists internal_orchestration_jobs_v1__enabled_due_idx
  on public.internal_orchestration_jobs_v1 (enabled, next_run_at);

create index if not exists internal_orchestration_locks_v1__expires_idx
  on public.internal_orchestration_locks_v1 (expires_at);

create or replace function public.acquire_internal_orchestration_lock_v1(
  in_lock_key text,
  in_lease_owner text,
  in_lease_seconds integer
)
returns table(acquired boolean, lease_token text, expires_at timestamptz)
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

  v_token := encode(gen_random_bytes(32), 'hex');
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

create or replace function public.renew_internal_orchestration_lock_v1(
  in_lock_key text,
  in_lease_token text,
  in_lease_seconds integer
)
returns table(renewed boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_expires timestamptz;
begin
  if coalesce(nullif(in_lock_key,''),'') = '' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if coalesce(nullif(in_lease_token,''),'') = '' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if in_lease_seconds is null or in_lease_seconds <= 0 or in_lease_seconds > 600 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  v_expires := now() + make_interval(secs => in_lease_seconds);

  -- Detect mismatch vs expiry with stable machine-readable codes.
  if not exists (select 1 from public.internal_orchestration_locks_v1 where lock_key = in_lock_key) then
    raise exception 'lock_not_acquired' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.internal_orchestration_locks_v1
      where lock_key = in_lock_key
        and lease_token is not null
        and lease_token <> in_lease_token
  ) then
    raise exception 'lock_token_mismatch' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.internal_orchestration_locks_v1
      where lock_key = in_lock_key
        and lease_token = in_lease_token
        and (public.internal_orchestration_locks_v1.expires_at is null or public.internal_orchestration_locks_v1.expires_at <= now())
  ) then
    raise exception 'lock_expired' using errcode = 'P0001';
  end if;

  update public.internal_orchestration_locks_v1
    set expires_at = v_expires, heartbeat_at = now(), updated_at = now()
    where public.internal_orchestration_locks_v1.lock_key = in_lock_key
      and public.internal_orchestration_locks_v1.lease_token = in_lease_token
      and public.internal_orchestration_locks_v1.expires_at > now();

  if found then
    renewed := true;
    expires_at := v_expires;
  else
    renewed := false;
    expires_at := null;
  end if;

  return next;
end;
$fn$;

create or replace function public.release_internal_orchestration_lock_v1(
  in_lock_key text,
  in_lease_token text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if coalesce(nullif(in_lock_key,''),'') = '' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if coalesce(nullif(in_lease_token,''),'') = '' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.internal_orchestration_locks_v1
      where lock_key = in_lock_key
        and lease_token is not null
        and lease_token <> in_lease_token
  ) then
    raise exception 'lock_token_mismatch' using errcode = 'P0001';
  end if;

  update public.internal_orchestration_locks_v1
    set
      lease_token = null,
      lease_owner = null,
      acquired_at = null,
      expires_at = null,
      updated_at = now()
    where public.internal_orchestration_locks_v1.lock_key = in_lock_key
      and public.internal_orchestration_locks_v1.lease_token = in_lease_token;

  -- Idempotent: if no row matched, treat as already released.
  return true;
end;
$fn$;

revoke all on table public.internal_orchestration_locks_v1 from public;
revoke all on table public.internal_orchestration_locks_v1 from anon, authenticated;
grant all on table public.internal_orchestration_locks_v1 to service_role;

revoke all on table public.internal_orchestration_jobs_v1 from public;
revoke all on table public.internal_orchestration_jobs_v1 from anon, authenticated;
grant all on table public.internal_orchestration_jobs_v1 to service_role;

revoke execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) from public;
revoke execute on function public.renew_internal_orchestration_lock_v1(text,text,integer) from public;
revoke execute on function public.release_internal_orchestration_lock_v1(text,text) from public;

revoke execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) from anon, authenticated;
revoke execute on function public.renew_internal_orchestration_lock_v1(text,text,integer) from anon, authenticated;
revoke execute on function public.release_internal_orchestration_lock_v1(text,text) from anon, authenticated;

grant execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) to service_role;
grant execute on function public.renew_internal_orchestration_lock_v1(text,text,integer) to service_role;
grant execute on function public.release_internal_orchestration_lock_v1(text,text) to service_role;

commit;
