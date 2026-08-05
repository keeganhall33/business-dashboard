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
