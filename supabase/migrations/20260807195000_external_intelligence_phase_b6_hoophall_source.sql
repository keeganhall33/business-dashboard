-- Phase B6: Hoophall (Naismith Basketball Hall of Fame) governed source enablement.
-- Additive, rerunnable. Seeds schedule disabled-by-default and adds service_role-only operator RPCs.

begin;

-- Seed the Hoophall schedule (disabled by default).
insert into public.external_collection_schedules_v1(
  schedule_id,
  source_id,
  source_config_version,
  registry_hash,
  source_sets_hash,
  eligibility_fingerprint,
  schedule_policy_version,
  cadence_type,
  cadence_interval_seconds,
  timezone,
  preferred_window_json,
  freshness_sla_seconds,
  maximum_staleness_seconds,
  timeout_seconds,
  maximum_attempts,
  backoff_policy_json,
  rate_limit_budget_json,
  concurrency_key,
  priority,
  enabled,
  collection_mode,
  environment,
  review_by
) values (
  'sports.basketball.hoophall.official:production',
  'sports.basketball.hoophall.official',
  'v1',
  repeat('0',64),
  repeat('0',64),
  repeat('0',64),
  'b6.hoophall.daily.v1',
  'daily',
  86400,
  'UTC',
  '{}'::jsonb,
  86400,
  604800,
  20,
  3,
  '{}'::jsonb,
  '{}'::jsonb,
  'sports:hoophall',
  'low',
  false,
  'automated',
  'production',
  'legal'
) on conflict (schedule_id) do nothing;

-- Enable Hoophall collection (service_role only).
create or replace function public.enable_hoophall_collection_v1(
  in_requested_by text,
  in_environment text
)
returns table(schedule_id text, enabled boolean)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_other_enabled integer;
  v_key text;
begin
  if in_environment <> 'production' then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;

  -- Refuse enabling if any other real external schedule is enabled.
  select count(*) into v_other_enabled
    from public.external_collection_schedules_v1 s
    where s.environment = 'production'
      and s.enabled = true
      and s.source_id not in ('internal.lifecycle_probe','sports.basketball.hoophall.official');

  if v_other_enabled > 0 then
    raise exception 'precondition_failed' using errcode = 'P0001';
  end if;

  update public.external_collection_schedules_v1
    set enabled = true,
        next_run_at = now(),
        updated_at = now()
    where public.external_collection_schedules_v1.schedule_id = 'sports.basketball.hoophall.official:production'
      and public.external_collection_schedules_v1.source_id = 'sports.basketball.hoophall.official'
      and public.external_collection_schedules_v1.environment = 'production';

  v_key := 'b6.hoophall.enable:' || extract(epoch from now())::bigint::text;
  insert into public.system_state(key, value_json, updated_at)
    values (
      v_key,
      jsonb_build_object(
        'schema_version','b6_hoophall_audit_v1',
        'action','enable',
        'requested_by',coalesce(in_requested_by,''),
        'environment','production',
        'source_id','sports.basketball.hoophall.official',
        'allowed_host','www.hoophall.com',
        'at',timezone('utc', now())
      ),
      now()
    )
    on conflict (key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at;

  return query
    select s.schedule_id, s.enabled
    from public.external_collection_schedules_v1 s
    where s.schedule_id = 'sports.basketball.hoophall.official:production';
end;
$fn$;

-- Disable Hoophall collection (service_role only).
create or replace function public.disable_hoophall_collection_v1(
  in_requested_by text,
  in_environment text
)
returns table(schedule_id text, enabled boolean)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_key text;
begin
  if in_environment <> 'production' then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;

  update public.external_collection_jobs_v1
    set status = 'cancelled',
        lease_owner = null,
        lease_acquired_at = null,
        lease_expires_at = null,
        updated_at = now()
    where public.external_collection_jobs_v1.schedule_id = 'sports.basketball.hoophall.official:production'
      and public.external_collection_jobs_v1.source_id = 'sports.basketball.hoophall.official'
      and public.external_collection_jobs_v1.status in ('queued','retry_wait','leased','running');

  update public.external_collection_schedules_v1
    set enabled = false,
        next_run_at = null,
        updated_at = now()
    where public.external_collection_schedules_v1.schedule_id = 'sports.basketball.hoophall.official:production'
      and public.external_collection_schedules_v1.source_id = 'sports.basketball.hoophall.official'
      and public.external_collection_schedules_v1.environment = 'production';

  v_key := 'b6.hoophall.disable:' || extract(epoch from now())::bigint::text;
  insert into public.system_state(key, value_json, updated_at)
    values (
      v_key,
      jsonb_build_object(
        'schema_version','b6_hoophall_audit_v1',
        'action','disable',
        'requested_by',coalesce(in_requested_by,''),
        'environment','production',
        'source_id','sports.basketball.hoophall.official',
        'allowed_host','www.hoophall.com',
        'at',timezone('utc', now())
      ),
      now()
    )
    on conflict (key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at;

  return query
    select s.schedule_id, s.enabled
    from public.external_collection_schedules_v1 s
    where s.schedule_id = 'sports.basketball.hoophall.official:production';
end;
$fn$;

revoke execute on function public.enable_hoophall_collection_v1(text,text) from public;
revoke execute on function public.disable_hoophall_collection_v1(text,text) from public;
revoke execute on function public.enable_hoophall_collection_v1(text,text) from anon, authenticated;
revoke execute on function public.disable_hoophall_collection_v1(text,text) from anon, authenticated;
grant execute on function public.enable_hoophall_collection_v1(text,text) to service_role;
grant execute on function public.disable_hoophall_collection_v1(text,text) to service_role;

commit;

