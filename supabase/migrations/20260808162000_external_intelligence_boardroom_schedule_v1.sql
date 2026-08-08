-- Boardroom RSS schedule seed + operator enable/disable RPCs.
-- Additive, rerunnable. Disabled-by-default.

begin;

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
  'sports_business.boardroom:production',
  'sports_business.boardroom',
  'v1',
  repeat('0',64),
  repeat('0',64),
  repeat('0',64),
  'boardroom.rss.hourly.v1',
  'hourly',
  3600,
  'UTC',
  jsonb_build_object('max_items_per_run', 5, 'feed_url', 'https://boardroom.tv/feed/'),
  86400,
  604800,
  20,
  3,
  '{}'::jsonb,
  '{}'::jsonb,
  'sports_business:boardroom',
  'low',
  false,
  'automated',
  'production',
  'legal'
) on conflict (schedule_id) do nothing;

create or replace function public.enable_boardroom_collection_v1(
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
begin
  if in_environment <> 'production' then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;

  -- Refuse enabling if any other real external schedule is enabled.
  select count(*) into v_other_enabled
    from public.external_collection_schedules_v1 s
    where s.environment = 'production'
      and s.enabled = true
      and s.source_id not in ('internal.lifecycle_probe','sports_business.boardroom');

  if v_other_enabled > 0 then
    raise exception 'precondition_failed' using errcode = 'P0001';
  end if;

  update public.external_collection_schedules_v1
    set enabled = true,
        next_run_at = now(),
        updated_at = now()
    where public.external_collection_schedules_v1.schedule_id = 'sports_business.boardroom:production'
      and public.external_collection_schedules_v1.source_id = 'sports_business.boardroom'
      and public.external_collection_schedules_v1.environment = 'production';

  return query
    select s.schedule_id, s.enabled
    from public.external_collection_schedules_v1 s
    where s.schedule_id = 'sports_business.boardroom:production';
end;
$fn$;

create or replace function public.disable_boardroom_collection_v1(
  in_requested_by text,
  in_environment text
)
returns table(schedule_id text, enabled boolean)
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
    where public.external_collection_jobs_v1.schedule_id = 'sports_business.boardroom:production'
      and public.external_collection_jobs_v1.source_id = 'sports_business.boardroom'
      and public.external_collection_jobs_v1.status in ('queued','retry_wait','leased','running');

  update public.external_collection_schedules_v1
    set enabled = false,
        next_run_at = null,
        updated_at = now()
    where public.external_collection_schedules_v1.schedule_id = 'sports_business.boardroom:production'
      and public.external_collection_schedules_v1.source_id = 'sports_business.boardroom'
      and public.external_collection_schedules_v1.environment = 'production';

  return query
    select s.schedule_id, s.enabled
    from public.external_collection_schedules_v1 s
    where s.schedule_id = 'sports_business.boardroom:production';
end;
$fn$;

revoke execute on function public.enable_boardroom_collection_v1(text,text) from public;
revoke execute on function public.disable_boardroom_collection_v1(text,text) from public;
revoke execute on function public.enable_boardroom_collection_v1(text,text) from anon, authenticated;
revoke execute on function public.disable_boardroom_collection_v1(text,text) from anon, authenticated;
grant execute on function public.enable_boardroom_collection_v1(text,text) to service_role;
grant execute on function public.disable_boardroom_collection_v1(text,text) to service_role;

commit;

