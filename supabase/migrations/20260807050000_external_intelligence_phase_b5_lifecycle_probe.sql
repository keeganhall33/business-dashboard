-- Phase B5: Governed external job lifecycle probe (internal/no-network).
-- Additive, idempotent, rerunnable.

begin;

-- Seed the probe schedule (disabled by default).
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
  'internal.lifecycle_probe:production',
  'internal.lifecycle_probe',
  'v1',
  repeat('0',64),
  repeat('0',64),
  repeat('0',64),
  'b5_success_v1',
  'hourly',
  3600,
  'UTC',
  '{}'::jsonb,
  3600,
  86400,
  30,
  3,
  '{}'::jsonb,
  '{}'::jsonb,
  'internal:lifecycle_probe',
  'low',
  false,
  'internal/no-network',
  'production',
  'owner'
) on conflict (schedule_id) do nothing;

-- Controlled operator enable (service-role-only).
create or replace function public.enable_external_lifecycle_probe_v1(
  in_requested_by text,
  in_environment text,
  in_mode text default 'b5_success_v1'
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

  if in_mode not in ('b5_success_v1','b5_synthetic_retryable_failure_v1','b5_synthetic_permanent_failure_v1') then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;

  select count(*) into v_other_enabled
    from public.external_collection_schedules_v1 s
    where s.environment = 'production'
      and s.enabled = true
      and s.source_id <> 'internal.lifecycle_probe';

  if v_other_enabled > 0 then
    raise exception 'precondition_failed' using errcode = 'P0001';
  end if;

  update public.external_collection_schedules_v1
    set enabled = true,
        schedule_policy_version = in_mode,
        next_run_at = now(),
        updated_at = now()
    where public.external_collection_schedules_v1.schedule_id = 'internal.lifecycle_probe:production'
      and public.external_collection_schedules_v1.source_id = 'internal.lifecycle_probe'
      and public.external_collection_schedules_v1.environment = 'production'
      and public.external_collection_schedules_v1.collection_mode = 'internal/no-network';

  v_key := 'b5.lifecycle_probe.enable:' || extract(epoch from now())::bigint::text;
  insert into public.system_state(key, value_json, updated_at)
    values (
      v_key,
      jsonb_build_object(
        'schema_version','b5_lifecycle_probe_audit_v1',
        'action','enable',
        'requested_by',coalesce(in_requested_by,''),
        'environment','production',
        'mode',in_mode,
        'at',timezone('utc', now())
      ),
      now()
    )
    on conflict (key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at;

  return query
    select s.schedule_id, s.enabled
    from public.external_collection_schedules_v1 s
    where s.schedule_id = 'internal.lifecycle_probe:production';
end;
$fn$;

-- Controlled operator disable (service-role-only).
create or replace function public.disable_external_lifecycle_probe_v1(
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

  -- Cancel any outstanding probe jobs and clear leases (emergency disable).
  update public.external_collection_jobs_v1
    set status = 'cancelled',
        lease_owner = null,
        lease_acquired_at = null,
        lease_expires_at = null,
        updated_at = now()
    where public.external_collection_jobs_v1.schedule_id = 'internal.lifecycle_probe:production'
      and public.external_collection_jobs_v1.source_id = 'internal.lifecycle_probe'
      and public.external_collection_jobs_v1.status in ('queued','retry_wait','leased','running');

  update public.external_collection_schedules_v1
    set enabled = false,
        next_run_at = null,
        updated_at = now()
    where public.external_collection_schedules_v1.schedule_id = 'internal.lifecycle_probe:production'
      and public.external_collection_schedules_v1.source_id = 'internal.lifecycle_probe'
      and public.external_collection_schedules_v1.environment = 'production'
      and public.external_collection_schedules_v1.collection_mode = 'internal/no-network';

  v_key := 'b5.lifecycle_probe.disable:' || extract(epoch from now())::bigint::text;
  insert into public.system_state(key, value_json, updated_at)
    values (
      v_key,
      jsonb_build_object(
        'schema_version','b5_lifecycle_probe_audit_v1',
        'action','disable',
        'requested_by',coalesce(in_requested_by,''),
        'environment','production',
        'at',timezone('utc', now())
      ),
      now()
    )
    on conflict (key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at;

  return query
    select s.schedule_id, s.enabled
    from public.external_collection_schedules_v1 s
    where s.schedule_id = 'internal.lifecycle_probe:production';
end;
$fn$;

revoke execute on function public.enable_external_lifecycle_probe_v1(text,text,text) from public;
revoke execute on function public.disable_external_lifecycle_probe_v1(text,text) from public;
revoke execute on function public.enable_external_lifecycle_probe_v1(text,text,text) from anon, authenticated;
revoke execute on function public.disable_external_lifecycle_probe_v1(text,text) from anon, authenticated;

grant execute on function public.enable_external_lifecycle_probe_v1(text,text,text) to service_role;
grant execute on function public.disable_external_lifecycle_probe_v1(text,text) to service_role;

commit;
