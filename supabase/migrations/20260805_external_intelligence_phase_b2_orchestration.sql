-- Phase B2: Durable collection orchestrator + milestone alert infrastructure.
-- Additive, idempotent, rerunnable.

begin;

create table if not exists public.external_collection_schedules_v1 (
  schedule_id text primary key,

  source_id text not null,
  source_config_version text not null,

  registry_hash text not null,
  source_sets_hash text not null,
  eligibility_fingerprint text not null,

  schedule_policy_version text not null,
  cadence_type text not null,
  cadence_interval_seconds integer not null,
  timezone text not null,
  preferred_window_json jsonb not null default '{}'::jsonb,

  freshness_sla_seconds integer not null,
  maximum_staleness_seconds integer not null,
  timeout_seconds integer not null,
  maximum_attempts integer not null,
  backoff_policy_json jsonb not null default '{}'::jsonb,
  rate_limit_budget_json jsonb not null default '{}'::jsonb,

  concurrency_key text not null,
  priority text not null,
  enabled boolean not null default false,
  collection_mode text not null,
  environment text not null,

  last_evaluated_at timestamptz null,
  next_run_at timestamptz null,

  review_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint external_collection_schedules_v1__source_env_unique unique (source_id, environment)
);

create index if not exists external_collection_schedules_v1__next_run_idx
  on public.external_collection_schedules_v1 (environment, enabled, next_run_at);

create table if not exists public.external_collection_jobs_v1 (
  job_id text primary key,

  schedule_id text not null references public.external_collection_schedules_v1(schedule_id) on delete cascade,
  source_id text not null,

  collection_plan_id text not null,

  planned_for timestamptz not null,
  run_after timestamptz not null,

  status text not null,
  attempt_count integer not null default 0,
  maximum_attempts integer not null,

  lease_owner text null,
  lease_acquired_at timestamptz null,
  lease_expires_at timestamptz null,

  started_at timestamptz null,
  completed_at timestamptz null,
  next_retry_at timestamptz null,

  reason_codes text[] not null default '{}'::text[],
  error_code text null,
  error_summary text null,
  rate_limit_state_json jsonb not null default '{}'::jsonb,

  input_fingerprint text not null,
  idempotency_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint external_collection_jobs_v1__logical_unique unique (schedule_id, planned_for, input_fingerprint)
);

-- Concurrency key is denormalized onto jobs for leasing/caps.
alter table public.external_collection_jobs_v1
  add column if not exists concurrency_key text;

create index if not exists external_collection_jobs_v1__status_idx
  on public.external_collection_jobs_v1 (status, run_after);

create index if not exists external_collection_jobs_v1__lease_idx
  on public.external_collection_jobs_v1 (status, lease_expires_at);

create table if not exists public.external_collection_health_v1 (
  source_id text primary key,
  source_config_version text not null,

  health_state text not null,

  last_attempt_at timestamptz null,
  last_success_at timestamptz null,
  last_artifact_at timestamptz null,
  next_scheduled_at timestamptz null,

  consecutive_failures integer not null default 0,

  credential_state text not null,
  access_state text not null,
  terms_state text not null,
  rate_limit_state jsonb not null default '{}'::jsonb,

  freshness_age_seconds integer null,
  is_overdue boolean not null default false,
  is_stale boolean not null default false,

  blocker_codes text[] not null default '{}'::text[],
  warning_codes text[] not null default '{}'::text[],

  evaluated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists external_collection_health_v1__state_idx
  on public.external_collection_health_v1 (health_state);

-- Milestones

create table if not exists public.sports_milestones_v1 (
  milestone_id text primary key,
  current_content_hash text not null,

  milestone_type text not null,
  primary_subject_id text not null,

  team_id text null,
  league_id text not null,

  milestone_date date not null,
  anniversary_number integer null,

  lifecycle_status text not null,
  review_status text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_milestone_versions_v1 (
  milestone_id text not null references public.sports_milestones_v1(milestone_id) on delete cascade,
  content_hash text not null,

  canonical_payload_json jsonb not null,
  schema_version text not null,

  policy_refs_json jsonb not null default '[]'::jsonb,
  evidence_refs_json jsonb not null default '[]'::jsonb,
  source_ids_json jsonb not null default '[]'::jsonb,

  original_event_date date null,
  milestone_date date not null,
  anniversary_number integer null,

  project_class text not null,
  historical_significance text not null,
  partnership_potential text not null,

  licensing_considerations_json jsonb not null default '[]'::jsonb,

  correction_status text not null,

  valid_from timestamptz not null,
  valid_until timestamptz null,

  created_at timestamptz not null default now(),

  primary key (milestone_id, content_hash)
);

create index if not exists sports_milestone_versions_v1__milestone_date_idx
  on public.sports_milestone_versions_v1 (milestone_date);

create table if not exists public.sports_milestone_alerts_v1 (
  alert_id text primary key,

  milestone_id text not null references public.sports_milestones_v1(milestone_id) on delete cascade,
  milestone_content_hash text not null,

  horizon_days integer not null,
  policy_version text not null,
  suppression_policy_version text not null,

  suppression_identity text not null,
  alert_hash text not null,

  project_class text not null,
  planning_stage text not null,

  milestone_date date not null,
  days_remaining_at_creation integer not null,

  status text not null,
  reason_codes text[] not null default '{}'::text[],

  created_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  dismissed_at timestamptz null,
  invalidated_at timestamptz null,
  expires_at timestamptz null,

  constraint sports_milestone_alerts_v1__suppression_unique unique (suppression_identity)
);

create index if not exists sports_milestone_alerts_v1__status_idx
  on public.sports_milestone_alerts_v1 (status);

commit;

-- =========================================================
-- Phase B2 RPCs (atomic lease + milestone persistence)
-- =========================================================

create or replace function public.lease_external_collection_job_v1(
  in_lease_owner text,
  in_lease_seconds integer,
  in_global_concurrency_limit integer,
  in_concurrency_key_limit integer
)
returns table(job_id text, schedule_id text, source_id text, status text, lease_owner text, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_job_id text;
begin
  if in_lease_seconds <= 0 then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;

  -- Global cap.
  if in_global_concurrency_limit > 0 then
    if (select count(*) from public.external_collection_jobs_v1 j where j.status in ('leased','running') and j.lease_expires_at > now()) >= in_global_concurrency_limit then
      return;
    end if;
  end if;

  -- Pick one eligible job. SKIP LOCKED prevents double-lease.
  select j.job_id
    into v_job_id
  from public.external_collection_jobs_v1 j
  where j.status in ('queued','retry_wait')
    and (j.run_after <= now())
    and (j.lease_expires_at is null or j.lease_expires_at <= now())
  order by j.run_after asc, j.created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  -- Concurrency-key cap.
  if in_concurrency_key_limit > 0 then
    if (
      select count(*)
      from public.external_collection_jobs_v1 a
      join public.external_collection_jobs_v1 b on b.job_id = v_job_id
      where a.status in ('leased','running')
        and a.lease_expires_at > now()
        and a.concurrency_key is not null
        and b.concurrency_key is not null
        and a.concurrency_key = b.concurrency_key
    ) >= in_concurrency_key_limit then
      return;
    end if;
  end if;

  update public.external_collection_jobs_v1
    set
      status = 'leased',
      lease_owner = in_lease_owner,
      lease_acquired_at = now(),
      lease_expires_at = now() + make_interval(secs => in_lease_seconds),
      updated_at = now()
    where public.external_collection_jobs_v1.job_id = v_job_id
      and public.external_collection_jobs_v1.status in ('queued','retry_wait')
      and (public.external_collection_jobs_v1.lease_expires_at is null or public.external_collection_jobs_v1.lease_expires_at <= now());

  return query
    select j.job_id, j.schedule_id, j.source_id, j.status, j.lease_owner, j.lease_expires_at
    from public.external_collection_jobs_v1 j
    where j.job_id = v_job_id and j.lease_owner = in_lease_owner;
end;
$fn$;

create or replace function public.renew_external_collection_job_lease_v1(
  in_job_id text,
  in_lease_owner text,
  in_lease_seconds integer
)
returns table(job_id text, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.external_collection_jobs_v1
    set lease_expires_at = now() + make_interval(secs => in_lease_seconds), updated_at = now()
    where job_id = in_job_id
      and lease_owner = in_lease_owner
      and lease_expires_at > now();

  return query
    select j.job_id, j.lease_expires_at from public.external_collection_jobs_v1 j
    where j.job_id = in_job_id and j.lease_owner = in_lease_owner and j.lease_expires_at > now();
end;
$fn$;

create or replace function public.release_external_collection_job_lease_v1(
  in_job_id text,
  in_lease_owner text,
  in_new_status text
)
returns table(job_id text, status text)
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.external_collection_jobs_v1
    set
      status = in_new_status,
      lease_owner = null,
      lease_acquired_at = null,
      lease_expires_at = null,
      updated_at = now()
    where job_id = in_job_id
      and lease_owner = in_lease_owner;

  return query select j.job_id, j.status from public.external_collection_jobs_v1 j where j.job_id = in_job_id;
end;
$fn$;

create or replace function public.recover_expired_external_collection_leases_v1()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_count integer;
begin
  update public.external_collection_jobs_v1
    set status = 'retry_wait', lease_owner = null, lease_acquired_at = null, lease_expires_at = null, updated_at = now()
    where status in ('leased','running') and lease_expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

create or replace function public.persist_sports_milestone_v1(
  in_milestone_id text,
  in_content_hash text,
  in_schema_version text,
  in_canonical_payload_json jsonb,
  in_policy_refs_json jsonb,
  in_evidence_refs_json jsonb,
  in_source_ids_json jsonb,
  in_milestone_type text,
  in_primary_subject_id text,
  in_team_id text,
  in_league_id text,
  in_original_event_date date,
  in_milestone_date date,
  in_anniversary_number integer,
  in_project_class text,
  in_historical_significance text,
  in_partnership_potential text,
  in_licensing_considerations_json jsonb,
  in_correction_status text
)
returns table(milestone_id text, content_hash text, created_new_version boolean, idempotent_replay boolean)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_existing jsonb;
begin
  if jsonb_array_length(coalesce(in_evidence_refs_json,'[]'::jsonb)) = 0 then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(in_source_ids_json,'[]'::jsonb)) = 0 then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(in_policy_refs_json,'[]'::jsonb)) = 0 then
    raise exception 'invalid_argument' using errcode = 'P0001';
  end if;

  insert into public.sports_milestones_v1(
    milestone_id,
    current_content_hash,
    milestone_type,
    primary_subject_id,
    team_id,
    league_id,
    milestone_date,
    anniversary_number,
    lifecycle_status,
    review_status
  ) values (
    in_milestone_id,
    in_content_hash,
    in_milestone_type,
    in_primary_subject_id,
    nullif(in_team_id,''),
    in_league_id,
    in_milestone_date,
    in_anniversary_number,
    'active',
    'unreviewed'
  ) on conflict on constraint sports_milestones_v1_pkey do nothing;

  select canonical_payload_json into v_existing
    from public.sports_milestone_versions_v1 v
    where v.milestone_id = in_milestone_id and v.content_hash = in_content_hash;

  if v_existing is not null then
    if v_existing <> in_canonical_payload_json then
      raise exception 'integrity_conflict' using errcode = 'P0001';
    end if;
    milestone_id := in_milestone_id;
    content_hash := in_content_hash;
    created_new_version := false;
    idempotent_replay := true;
    return next;
    return;
  end if;

  insert into public.sports_milestone_versions_v1(
    milestone_id,
    content_hash,
    canonical_payload_json,
    schema_version,
    policy_refs_json,
    evidence_refs_json,
    source_ids_json,
    original_event_date,
    milestone_date,
    anniversary_number,
    project_class,
    historical_significance,
    partnership_potential,
    licensing_considerations_json,
    correction_status,
    valid_from,
    valid_until
  ) values (
    in_milestone_id,
    in_content_hash,
    in_canonical_payload_json,
    in_schema_version,
    in_policy_refs_json,
    in_evidence_refs_json,
    in_source_ids_json,
    in_original_event_date,
    in_milestone_date,
    in_anniversary_number,
    in_project_class,
    in_historical_significance,
    in_partnership_potential,
    coalesce(in_licensing_considerations_json,'[]'::jsonb),
    in_correction_status,
    now(),
    null
  );

  update public.sports_milestones_v1
    set current_content_hash = in_content_hash, updated_at = now()
    where public.sports_milestones_v1.milestone_id = in_milestone_id;

  milestone_id := in_milestone_id;
  content_hash := in_content_hash;
  created_new_version := true;
  idempotent_replay := false;
  return next;
end;
$fn$;

revoke execute on function public.lease_external_collection_job_v1(text,integer,integer,integer) from public;
revoke execute on function public.renew_external_collection_job_lease_v1(text,text,integer) from public;
revoke execute on function public.release_external_collection_job_lease_v1(text,text,text) from public;
revoke execute on function public.recover_expired_external_collection_leases_v1() from public;
revoke execute on function public.persist_sports_milestone_v1(text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text,date,date,integer,text,text,text,jsonb,text) from public;

revoke execute on function public.lease_external_collection_job_v1(text,integer,integer,integer) from anon, authenticated;
revoke execute on function public.renew_external_collection_job_lease_v1(text,text,integer) from anon, authenticated;
revoke execute on function public.release_external_collection_job_lease_v1(text,text,text) from anon, authenticated;
revoke execute on function public.recover_expired_external_collection_leases_v1() from anon, authenticated;
revoke execute on function public.persist_sports_milestone_v1(text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text,date,date,integer,text,text,text,jsonb,text) from anon, authenticated;

grant execute on function public.lease_external_collection_job_v1(text,integer,integer,integer) to service_role;
grant execute on function public.renew_external_collection_job_lease_v1(text,text,integer) to service_role;
grant execute on function public.release_external_collection_job_lease_v1(text,text,text) to service_role;
grant execute on function public.recover_expired_external_collection_leases_v1() to service_role;
grant execute on function public.persist_sports_milestone_v1(text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text,date,date,integer,text,text,text,jsonb,text) to service_role;
