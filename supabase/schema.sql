-- Operator Command System — Supabase schema
-- Canonical schema for business-dashboard backend.
-- Apply this in Supabase SQL editor (or as a migration) in order.

-- =========================================================
-- 0. EXTENSIONS
-- =========================================================
create extension if not exists pgcrypto;

-- =========================================================
-- 1. UPDATED_AT trigger helper
-- =========================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 2. CORE DOMAIN TABLES
-- =========================================================

-- 2.1 Agent profiles
create table if not exists agent_profiles (
  agent_key text primary key,
  display_name text not null,
  role_title text not null,
  mandate text not null,
  decision_scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_agent_profiles_updated_at on agent_profiles;
create trigger trg_agent_profiles_updated_at
before update on agent_profiles
for each row execute function set_updated_at();

-- 2.2 Scoreboard metric definitions
create table if not exists scoreboard_metrics (
  metric_key text primary key,
  metric_name text not null,
  category text,
  unit text,
  target_value numeric,
  owner_agent text references agent_profiles(agent_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_scoreboard_metrics_updated_at on scoreboard_metrics;
create trigger trg_scoreboard_metrics_updated_at
before update on scoreboard_metrics
for each row execute function set_updated_at();

-- 2.3 Scoreboard metric readings (time series)
create table if not exists scoreboard_metric_readings (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null references scoreboard_metrics(metric_key) on delete cascade,
  current_value numeric,
  measured_at timestamptz not null default now(),
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_metric_readings_metric_key_measured_at
  on scoreboard_metric_readings(metric_key, measured_at desc);

-- 2.4 Latest scoreboard view used by API
create or replace view vw_latest_scoreboard as
select
  m.metric_key,
  m.metric_name,
  m.category,
  m.unit,
  m.target_value,
  m.owner_agent,
  r.current_value,
  r.measured_at
from scoreboard_metrics m
left join lateral (
  select current_value, measured_at
  from scoreboard_metric_readings rr
  where rr.metric_key = m.metric_key
  order by rr.measured_at desc
  limit 1
) r on true;

-- 2.5 Task queue
create table if not exists task_queue (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  priority text not null check (priority in ('critical','high','medium','low')),
  status text not null check (status in ('pending','in_review','approved','rejected','in_progress','blocked','completed')),
  expected_impact text,
  impact_score numeric,
  why_this_matters text,
  related_metric_keys text[] not null default array[]::text[],
  requires_approval boolean not null default false,
  approved_by_user boolean not null default false,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  execution_type text not null,
  created_by text,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  expected_duration_days numeric,
  result_summary text,
  deliverable_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_queue_agent_key_created_at on task_queue(agent_key, created_at desc);
create index if not exists idx_task_queue_status_created_at on task_queue(status, created_at desc);
create index if not exists idx_task_queue_priority_created_at on task_queue(priority, created_at desc);

drop trigger if exists trg_task_queue_updated_at on task_queue;
create trigger trg_task_queue_updated_at
before update on task_queue
for each row execute function set_updated_at();

-- 2.6 Agent updates
create table if not exists agent_updates (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  -- NOTE: 'summary' is used by automation + status snapshots (see src/lib/agents/automation.ts).
  update_type text not null check (update_type in ('insight','action','big_bet','directive','health','note','summary')),
  title text not null,
  summary text not null,
  detail_md text,
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  related_metric_keys text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_updates_agent_key_created_at
  on agent_updates(agent_key, created_at desc);

-- 2.7 Agent conversation threads
create table if not exists agent_threads (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  thread_type text not null check (thread_type in ('default','war_room','plan')),
  title text not null,
  status text not null default 'open' check (status in ('open','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_threads_agent_key_created_at
  on agent_threads(agent_key, created_at desc);

drop trigger if exists trg_agent_threads_updated_at on agent_threads;
create trigger trg_agent_threads_updated_at
before update on agent_threads
for each row execute function set_updated_at();

-- 2.8 Agent conversation messages
create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads(id) on delete cascade,
  sender_type text not null check (sender_type in ('agent','ceo','avery','system')),
  sender_key text,
  message_type text not null check (message_type in ('plan','comment','directive','status','war_room')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_messages_thread_created_at
  on agent_messages(thread_id, created_at asc);

-- 2.9 Agent plans
create table if not exists agent_plans (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  thread_id uuid references agent_threads(id) on delete set null,
  title text not null,
  summary text,
  detail_md text,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  submitted_by text,
  submitted_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_plans_agent_key_created_at
  on agent_plans(agent_key, created_at desc);

drop trigger if exists trg_agent_plans_updated_at on agent_plans;
create trigger trg_agent_plans_updated_at
before update on agent_plans
for each row execute function set_updated_at();

-- 2.7 Opportunity pipeline
create table if not exists opportunity_pipeline (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text,
  opportunity_type text not null check (opportunity_type in ('brand_partnership','licensing','press','collector_intro','athlete_collab','institutional')),
  status text not null check (status in ('identified','researching','ready_for_outreach','outreach_drafted','in_conversation','negotiating','won','lost','parked')),
  value_estimate numeric,
  prestige_score numeric,
  probability_score numeric,
  owner_agent text not null references agent_profiles(agent_key) on delete cascade,
  next_step text,
  next_step_due_at timestamptz,
  notes_md text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_opportunity_pipeline_owner_agent_created_at
  on opportunity_pipeline(owner_agent, created_at desc);
create index if not exists idx_opportunity_pipeline_status_updated_at
  on opportunity_pipeline(status, updated_at desc);

drop trigger if exists trg_opportunity_pipeline_updated_at on opportunity_pipeline;
create trigger trg_opportunity_pipeline_updated_at
before update on opportunity_pipeline
for each row execute function set_updated_at();

-- 2.8 Decision log
create table if not exists decision_log (
  id uuid primary key default gen_random_uuid(),
  decision_type text not null check (decision_type in ('strategic','pricing','partnership','operational')),
  title text not null,
  summary text not null,
  detail_md text,
  expected_outcome text,
  outcome_review_date date,
  decided_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_decision_log_created_at on decision_log(created_at desc);

-- 2.9 System runs
create table if not exists system_runs (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  run_type text not null check (run_type in ('manual','weekly','rule_evaluation','scheduler')),
  status text not null check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outputs_json jsonb not null default '{}'::jsonb,
  errors_md text,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_runs_agent_key_started_at on system_runs(agent_key, started_at desc);
create index if not exists idx_system_runs_status on system_runs(status);

-- 2.9.1 System run checkpoints (progress / handshake / resume metadata)
create table if not exists system_run_checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references system_runs(id) on delete cascade,
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  checkpoint_key text not null,
  status text not null check (status in ('started','completed','failed')),
  detail_md text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_run_checkpoints_run_id_created_at
  on system_run_checkpoints(run_id, created_at asc);
create index if not exists idx_system_run_checkpoints_agent_key_created_at
  on system_run_checkpoints(agent_key, created_at desc);
create unique index if not exists idx_system_run_checkpoints_unique
  on system_run_checkpoints(run_id, checkpoint_key);

drop trigger if exists trg_system_run_checkpoints_updated_at on system_run_checkpoints;
create trigger trg_system_run_checkpoints_updated_at
before update on system_run_checkpoints
for each row execute function set_updated_at();

-- 2.10 Metric alert rules
create table if not exists metric_alert_rules (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null references scoreboard_metrics(metric_key) on delete cascade,
  condition_operator text not null check (condition_operator in ('<','<=','>','>=','=','!=')),
  threshold_value numeric not null,
  assigned_agent text not null references agent_profiles(agent_key) on delete cascade,
  severity text not null check (severity in ('critical','high','medium','low')),
  trigger_action text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_metric_alert_rules_metric_key on metric_alert_rules(metric_key);
create index if not exists idx_metric_alert_rules_is_active on metric_alert_rules(is_active);

create table if not exists research_memory (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  focus_area text not null,
  subject text not null,
  subject_type text,
  status text not null default 'open',
  summary text not null,
  detail_md text,
  importance_score numeric not null default 0,
  confidence numeric not null default 0,
  payload jsonb not null default '{}'::jsonb,
  related_task_id uuid references task_queue(id) on delete set null,
  related_metric_keys text[] not null default array[]::text[],
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_memory_agent_key_created_at
  on research_memory(agent_key, created_at desc);
create index if not exists idx_research_memory_focus_area
  on research_memory(focus_area);
create index if not exists idx_research_memory_status
  on research_memory(status);
create index if not exists idx_research_memory_related_metric_keys_gin
  on research_memory using gin (related_metric_keys);

drop trigger if exists trg_research_memory_updated_at on research_memory;
create trigger trg_research_memory_updated_at
before update on research_memory
for each row execute function set_updated_at();

create table if not exists outcome_memory (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  outcome_type text not null check (outcome_type in ('task','decision','experiment','launch','partnership','content','note')),
  title text not null,
  summary text not null,
  detail_md text,
  impact_score numeric,
  impact_window text,
  related_task_id uuid references task_queue(id) on delete set null,
  related_metric_keys text[] not null default array[]::text[],
  happened_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outcome_memory_agent_key_happened_at
  on outcome_memory(agent_key, happened_at desc);
create index if not exists idx_outcome_memory_outcome_type
  on outcome_memory(outcome_type);
create index if not exists idx_outcome_memory_related_metric_keys_gin
  on outcome_memory using gin (related_metric_keys);

drop trigger if exists trg_outcome_memory_updated_at on outcome_memory;
create trigger trg_outcome_memory_updated_at
before update on outcome_memory
for each row execute function set_updated_at();

-- 2.11 Finance snapshot
create table if not exists finance_snapshot (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'default',
  cash_on_hand numeric,
  monthly_burn numeric,
  projected_30d_revenue numeric,
  survival_floor numeric not null default 7000,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_finance_snapshot_label on finance_snapshot(label);

drop trigger if exists trg_finance_snapshot_updated_at on finance_snapshot;
create trigger trg_finance_snapshot_updated_at
before update on finance_snapshot
for each row execute function set_updated_at();

-- 2.12 Collector relationships
create table if not exists collector_relationships (
  id uuid primary key default gen_random_uuid(),
  collector_name text not null,
  tier text not null check (tier in ('A','B','C','Unrated')),
  relationship_status text not null default 'quiet',
  last_outreach_at timestamptz,
  last_touch_at timestamptz,
  next_move text,
  next_move_due_at timestamptz,
  next_touch_due_at timestamptz,
  estimated_value numeric,
  priority integer not null default 0,
  notes text,
  source text,
  identity_hash text,
  updated_by text,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collector_relationships_tier_priority
  on collector_relationships(tier, priority desc);
create index if not exists idx_collector_relationships_next_move_due
  on collector_relationships(next_move_due_at);
create index if not exists idx_collector_relationships_last_touch
  on collector_relationships(last_touch_at desc);
create unique index if not exists idx_collector_identity_hash_unique
  on collector_relationships(identity_hash)
  where identity_hash is not null;

drop trigger if exists trg_collector_relationships_updated_at on collector_relationships;
create trigger trg_collector_relationships_updated_at
before update on collector_relationships
for each row execute function set_updated_at();

-- 2.13 Agent KPI tracking
create table if not exists agent_kpis (
  kpi_key text primary key,
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  kpi_name text not null,
  description text,
  target_value numeric,
  unit text,
  frequency text,
  priority text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_agent_kpis_updated_at on agent_kpis;
create trigger trg_agent_kpis_updated_at
before update on agent_kpis
for each row execute function set_updated_at();

create table if not exists agent_kpi_readings (
  id uuid primary key default gen_random_uuid(),
  kpi_key text not null references agent_kpis(kpi_key) on delete cascade,
  value numeric,
  measured_at timestamptz not null default now(),
  source text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_kpi_readings_kpi_key_measured_at
  on agent_kpi_readings(kpi_key, measured_at desc);

-- 2.14 Agent idea engine
create table if not exists agent_ideas (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  idea_type text not null check (idea_type in ('minor','major')),
  title text not null,
  summary text,
  expected_impact numeric,
  status text not null default 'proposed' check (status in ('proposed','in_review','approved','rejected','in_progress','shipped','archived')),
  requires_ceo_approval boolean not null default false,
  approver text,
  approved_at timestamptz,
  linked_task_id uuid references task_queue(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_agent_ideas_updated_at on agent_ideas;
create trigger trg_agent_ideas_updated_at
before update on agent_ideas
for each row execute function set_updated_at();

create table if not exists agent_idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references agent_ideas(id) on delete cascade,
  commenter text not null,
  comment text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_idea_comments_idea_id_created_at
  on agent_idea_comments(idea_id, created_at);

-- 2.15 CEO question desk
create table if not exists ceo_questions (
  id uuid primary key default gen_random_uuid(),
  asked_by text not null references agent_profiles(agent_key) on delete cascade,
  escalation_level text not null default 'avery' check (escalation_level in ('avery','keegan')),
  question text not null,
  context text,
  status text not null default 'open' check (status in ('open','answered','needs_followup','closed')),
  priority text,
  owner_agent text references agent_profiles(agent_key) on delete set null,
  due_at timestamptz,
  answered_by text,
  answered_at timestamptz,
  escalated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ceo_questions_updated_at on ceo_questions;
create trigger trg_ceo_questions_updated_at
before update on ceo_questions
for each row execute function set_updated_at();

create table if not exists ceo_question_comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references ceo_questions(id) on delete cascade,
  commenter text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ceo_question_comments_question_id_created_at
  on ceo_question_comments(question_id, created_at);

-- 2.16 Daily idea quota view
create or replace view agent_daily_idea_quota as
select
  agent_key,
  date_trunc('day', created_at) as idea_date,
  count(*) as ideas_logged,
  1 as required_ideas,
  (count(*) >= 1) as met_quota
from agent_ideas
group by agent_key, date_trunc('day', created_at);

-- =========================================================
-- 3. SCHEDULER TABLES (from SCHEDULER_SPEC.md canonical block)
-- =========================================================

-- 16. SCHEDULED JOBS
create table if not exists scheduled_jobs (
 id uuid primary key default gen_random_uuid(),
 job_key text unique not null,
 job_name text not null,
 cron_expression text not null,
 timezone text not null default 'America/Los_Angeles',
 route_path text not null,
 is_active boolean not null default true,
 last_run_at timestamptz,
 next_run_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_jobs_job_key on scheduled_jobs(job_key);
create index if not exists idx_scheduled_jobs_is_active on scheduled_jobs(is_active);

drop trigger if exists trg_scheduled_jobs_updated_at on scheduled_jobs;
create trigger trg_scheduled_jobs_updated_at
before update on scheduled_jobs
for each row execute function set_updated_at();

-- 17. JOB RUN LOG
create table if not exists job_run_log (
 id uuid primary key default gen_random_uuid(),
 job_key text not null,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null check (status in ('running','completed','failed')),
 summary text,
 details_json jsonb not null default '{}'::jsonb,
 error_md text,
 created_at timestamptz not null default now()
);

create index if not exists idx_job_run_log_job_key_started_at
 on job_run_log(job_key, started_at desc);
create index if not exists idx_job_run_log_status on job_run_log(status);

-- 18. SYSTEM ALERTS
create table if not exists system_alerts (
 id uuid primary key default gen_random_uuid(),
 alert_type text not null,
 severity text not null check (severity in ('critical','high','medium','low')),
 title text not null,
 summary text not null,
 related_agent_key text,
 related_task_id uuid references task_queue(id) on delete set null,
 related_metric_key text,
 dedupe_key text not null,
 escalation_count integer not null default 0,
 last_escalated_at timestamptz,
 is_resolved boolean not null default false,
 resolved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create unique index if not exists idx_system_alerts_open_dedupe_key
 on system_alerts(dedupe_key)
 where is_resolved = false;
create index if not exists idx_system_alerts_alert_type on system_alerts(alert_type);
create index if not exists idx_system_alerts_severity on system_alerts(severity);
create index if not exists idx_system_alerts_related_agent_key on system_alerts(related_agent_key);

drop trigger if exists trg_system_alerts_updated_at on system_alerts;
create trigger trg_system_alerts_updated_at
before update on system_alerts
for each row execute function set_updated_at();

-- 19. SYSTEM STATE
create table if not exists system_state (
 key text primary key,
 value_json jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

-- Phase 2 Intelligence: v1 persisted chain tables
-- Facts → Findings → Hypotheses → Opportunities → Recommendations → Outcomes

create table if not exists intelligence_facts_v1 (
  fact_id uuid primary key default gen_random_uuid(),
  metric_id text not null,
  value numeric not null,
  unit text not null,
  business_date date not null,
  window_start timestamptz,
  window_end timestamptz,
  timezone text not null default 'America/Los_Angeles',
  window_type text not null,
  dimensions jsonb not null default '{}'::jsonb,
  dimensions_hash text not null,
  source_system text not null,
  source_run_id text,
  snapshot_id text,
  retrieved_at timestamptz,
  source_as_of timestamptz,
  freshness_state text,
  coverage_state text,
  attribution_defensible text,
  confidence_state text,
  metric_definition_version text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_intelligence_facts_v1_unique
  on intelligence_facts_v1(metric_id, business_date, window_type, source_system, metric_definition_version, dimensions_hash);

create table if not exists intelligence_findings_v1 (
  finding_id text primary key,
  detector_id text not null,
  engine_version text not null,
  type text not null,
  title text not null,
  summary text not null,
  analysis_window jsonb not null,
  materiality_score numeric,
  false_positive_guards jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  facts_primary jsonb not null,
  evidence_for jsonb not null,
  evidence_against jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists intelligence_hypotheses_v1 (
  hypothesis_id text primary key,
  finding_id text not null references intelligence_findings_v1(finding_id) on delete cascade,
  engine_version text not null,
  statement text not null,
  mechanism text not null,
  predictions jsonb not null default '[]'::jsonb,
  tests jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  evidence_for jsonb not null,
  evidence_against jsonb not null,
  created_at timestamptz not null default now()
);

-- Canonical intelligence recommendation history store (read-only by default).
-- Actions will later reference these recommendation records.
create table if not exists intelligence_recommendations_v1 (
  recommendation_id text primary key,
  recommendation_fingerprint text not null,
  action_key text not null,
  detector_id text not null,
  detector_version text not null,
  recommendation_policy_version text not null,
  finding_id text not null references intelligence_findings_v1(finding_id) on delete cascade,
  hypothesis_ids text[] not null default array[]::text[],
  opportunity_id text not null,
  evidence_window jsonb not null,
  baseline_window jsonb not null,
  evaluation_window jsonb not null,
  success_metrics jsonb not null,
  success_threshold text not null,
  stop_condition text not null,
  what_changes_my_mind jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_intelligence_recommendations_v1_fingerprint
  on intelligence_recommendations_v1(recommendation_fingerprint);

-- NOTE: We intentionally do not persist separate recommendation/opportunity tables yet.
-- This vertical slice reuses the existing recommendation + action-store contracts and
-- records the full chain in system_runs/job_run_log outputs_json for audit.

create table if not exists intelligence_evidence_edges_v1 (
  edge_id uuid primary key default gen_random_uuid(),
  from_type text not null,
  from_id text not null,
  to_type text not null,
  to_id text not null,
  relation text not null,
  weight numeric not null default 1,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_intelligence_edges_from on intelligence_evidence_edges_v1(from_type, from_id);
create index if not exists idx_intelligence_edges_to on intelligence_evidence_edges_v1(to_type, to_id);

-- =========================================================
-- 4. RPC STUBS (Optional; prevents API failures if telemetry integrations aren’t installed yet)
-- =========================================================
create or replace function get_woo_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest_run as (
    select *
    from woo_ingestion_runs_v1
    where status = 'success'
      and definition_version = 'woo_paid_net_v1'
      and proven_coverage_start is not null
      and start_date >= proven_coverage_start
      and end_date <= proven_coverage_end
    order by completed_at desc
    limit 1
  ),
  orders as (
    select *
    from woo_order_telemetry_v1
    where paid_pacific_date between start_date and end_date
      and is_deleted = false
      and status in ('completed','processing')
  ),
  ts as (
    select
      paid_pacific_date as bucket,
      coalesce(sum(net_revenue_cents), 0)::numeric / 100 as revenue,
      count(*)::numeric as orders
    from orders
    group by paid_pacific_date
    order by bucket
  ),
  agg as (
    select
      count(*)::numeric as orders,
      coalesce(sum(gross_total_cents), 0)::numeric / 100 as gross_revenue,
      coalesce(sum(refunded_cents), 0)::numeric / 100 as refunded,
      coalesce(sum(net_revenue_cents), 0)::numeric / 100 as revenue,
      coalesce(sum(discount_cents), 0)::numeric / 100 as discounts,
      coalesce(sum(shipping_cents), 0)::numeric / 100 as shipping,
      coalesce(sum(tax_cents), 0)::numeric / 100 as taxes
    from orders
  ),
  coverage as (
    select
      (select proven_coverage_start from latest_run) as coverage_start,
      (select proven_coverage_end from latest_run) as coverage_end,
      coalesce(
        (select source_as_of_gmt from latest_run),
        (select completed_at from latest_run)
      ) as as_of
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'orders', orders,
      'revenue', revenue,
      'avgOrderValue', case when (select as_of from coverage) is not null and orders > 0 then revenue / orders else null end,
      'discountTotal', discounts,
      'shippingTotal', shipping,
      'taxTotal', taxes,
      'items', orders,
      'grossRevenue', gross_revenue,
      'refundedTotal', refunded,
      'netRevenue', revenue,
      'definitionVersion', 'woo_paid_net_v1',
      'source', 'selected_range_telemetry',
      'completeness', case
        when (select as_of from coverage) is null then 'unknown'
        when (select as_of from coverage) < (now() - interval '48 hours') then 'unknown'
        else 'complete'
      end,
      'asOf', (select as_of from coverage),
      'coverageStart', (select coverage_start from coverage),
      'coverageEnd', (select coverage_end from coverage),
      'comparisonAvailable', false
    ),
    'timeseries', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'revenue', revenue,
        'orders', orders
      )) from ts), '[]'::jsonb)
  )
  from agg;
$$;

create or replace function get_ga4_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public, exec_dashboard
as $$
  with source as (
    select *
    from exec_dashboard.raw_ga4_events
    where event_date between start_date and end_date
  ),
  ts as (
    select
      event_date as bucket,
      coalesce(sum(sessions), 0)::numeric as sessions,
      coalesce(sum(engaged_sessions), 0)::numeric as engaged_sessions,
      coalesce(sum(revenue), 0)::numeric as revenue
    from source
    group by event_date
    order by bucket
  ),
  agg as (
    select
      coalesce(sum(sessions), 0)::numeric as sessions,
      coalesce(sum(engaged_sessions), 0)::numeric as engaged_sessions,
      coalesce(sum(event_count), 0)::numeric as events,
      coalesce(avg(user_engagement_duration_ms), 0)::numeric as avg_engagement_ms,
      coalesce(sum(revenue), 0)::numeric as revenue
    from source
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'sessions', sessions,
      'engagedSessions', engaged_sessions,
      'eventCount', events,
      'avgEngagementSeconds', case when avg_engagement_ms > 0 then avg_engagement_ms / 1000 else null end,
      'revenue', revenue
    ),
    'timeseries', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'sessions', sessions,
        'engagedSessions', engaged_sessions,
        'revenue', revenue
      )) from ts), '[]'::jsonb)
  )
  from agg;
$$;

create or replace function get_funnelkit_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public, exec_dashboard
as $$
  with steps as (
    select *
    from exec_dashboard.raw_funnelkit_steps
    where collected_at between start_date and end_date
  ),
  ts as (
    select
      collected_at as bucket,
      coalesce(sum(entries), 0)::numeric as entries,
      coalesce(sum(completions), 0)::numeric as completions
    from steps
    group by collected_at
    order by bucket
  ),
  agg as (
    select
      coalesce(sum(entries), 0)::numeric as entries,
      coalesce(sum(completions), 0)::numeric as completions,
      coalesce(sum(upsell_offers), 0)::numeric as offers,
      coalesce(sum(upsell_accepts), 0)::numeric as accepts
    from steps
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'entries', entries,
      'completions', completions,
      'conversionRate', case when entries > 0 then (completions / entries) * 100 else null end,
      'upsellOffers', offers,
      'upsellAccepts', accepts,
      'upsellTakeRate', case when offers > 0 then (accepts / offers) * 100 else null end
    ),
    'timeseries', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'entries', entries,
        'completions', completions,
        'conversionRate', case when entries > 0 then (completions / entries) * 100 else null end
      )) from ts), '[]'::jsonb)
  )
  from agg;
$$;

-- =========================================================
-- 5. SEEDS (agents, metrics, rules, scheduler jobs, system state)
-- =========================================================

-- Agent profiles
insert into agent_profiles (agent_key, display_name, role_title, mandate, decision_scope)
values
  ('avery','Avery','Executive Operator','Synthesize priorities, issue directives, and keep the system focused.','Directive setting, prioritization, approvals discipline.'),
  ('sloan','Sloan','Head of Product & Ecommerce','Increase revenue, conversion rate, AOV, repeat purchase rate, and monetization efficiency.','Pricing, conversion, offer structure, checkout optimization, collector monetization.'),
  ('lyra','Lyra','Head of Brand & Narrative','Increase engagement, cultural relevance, and message clarity without diluting premium positioning.','Narrative, campaign language, homepage hierarchy, brand authority.'),
  ('noah','Noah','Head of Partnerships & Research','Expand prestige partnerships and keep the opportunity pipeline full and moving.','Target discovery, partnership strategy, outreach prep, pipeline management.')
on conflict (agent_key) do nothing;

-- Scoreboard metrics (minimal starter set used by API + rules)
insert into scoreboard_metrics (metric_key, metric_name, category, unit, target_value, owner_agent)
values
  ('monthly_revenue','Monthly Revenue','financial','usd',83000,'sloan'),
  ('aov','Average Order Value','conversion','usd',300,'sloan'),
  ('conversion_rate','Website Conversion Rate','conversion','percent',3.0,'sloan'),
  ('cart_abandonment_rate','Cart Abandonment Rate','conversion','percent',55,'sloan'),
  ('revenue_per_visitor','Revenue Per Visitor','conversion','usd',6.0,'sloan'),
  ('repeat_purchase_rate','Repeat Purchase Rate','retention','percent',20,'sloan'),
  ('social_growth_monthly','Social Growth (Monthly)','brand','percent',10,'lyra'),
  ('engagement_rate','Engagement Rate','brand','percent',5,'lyra'),
  ('cultural_relevance_score','Cultural Relevance Score','brand','score',8.5,'lyra'),
  ('active_brand_conversations','Active Brand Conversations','partnerships','count',10,'noah'),
  ('tier1_brand_collabs','Tier 1 Brand Collabs','partnerships','count',3,'noah'),
  ('agent_task_completion_rate','Agent Task Completion Rate','system','percent',80,'avery')
on conflict (metric_key) do nothing;

-- Alert rules (per BACKEND_SPEC.md)
insert into metric_alert_rules (
  metric_key, condition_operator, threshold_value, assigned_agent, severity, trigger_action, is_active
) values
  ('aov','<',150,'sloan','critical','Design premium pricing architecture and strengthen offer ladder.',true),
  ('conversion_rate','<',2.0,'sloan','critical','Audit homepage/PDP/checkout friction and propose CRO fixes.',true),
  ('conversion_rate','<',2.0,'lyra','high','Sharpen brand messaging to improve conversion clarity.',true),
  ('cart_abandonment_rate','>',70,'sloan','high','Fix checkout and deploy cart recovery strategy.',true),
  ('engagement_rate','<',3.0,'lyra','high','Tighten authority-based storytelling and campaign language.',true),
  ('social_growth_monthly','<',5.0,'lyra','medium','Create visibility plan and collaboration-driven content push.',true),
  ('active_brand_conversations','<',5,'noah','critical','Run a prestige-target research sprint and pipeline expansion plan.',true)
on conflict do nothing;

-- Scheduled job seeds (from SCHEDULER_SPEC.md)
insert into scheduled_jobs (
 job_key, job_name, cron_expression, timezone, route_path, is_active
) values
 ('daily-agent-cycle','Daily Agent Cycle','5 6 * * *','America/Los_Angeles','/api/scheduler/daily-agent-cycle',true),
 ('daily-health-check','Daily Health Check','15 6 * * *','America/Los_Angeles','/api/scheduler/daily-health-check',true),
 ('agent-idea-pulse','Agent Idea Pulse','0 9 * * *','America/Los_Angeles','/api/scheduler/agent-idea-pulse',true),
 ('ceo-digest','CEO Digest','30 6 * * *','America/Los_Angeles','/api/scheduler/ceo-digest',true),
 ('weekly-command-cycle','Weekly Command Cycle','0 7 * * 1','America/Los_Angeles','/api/scheduler/weekly-command-cycle',true),
 ('midweek-opportunity-pulse','Midweek Opportunity Pulse','30 11 * * 3','America/Los_Angeles','/api/scheduler/midweek-opportunity-pulse',true),
 ('evening-closeout','Evening Closeout','30 19 * * *','America/Los_Angeles','/api/scheduler/evening-closeout',true),
 ('proof-enforcement','Proof Enforcement','0 20 * * *','America/Los_Angeles','/api/scheduler/proof-enforcement',true),
 ('scoreboard-refresh','Scoreboard Refresh','5 7 * * *','America/Los_Angeles','/api/scheduler/scoreboard-refresh',true),
 ('intelligence-traffic-quality','Intelligence: Traffic Quality','10 7 * * *','America/Los_Angeles','/api/scheduler/intelligence-traffic-quality',true)
on conflict (job_key) do nothing;

-- System state seeds (from SCHEDULER_SPEC.md)
insert into system_state (key, value_json)
values
 ('operating_mode', jsonb_build_object('mode','normal','reason',null,'activatedAt',null)),
 ('weekly_summary', jsonb_build_object()),
 ('latest_directive', jsonb_build_object()),
 ('dashboard_snapshot_meta', jsonb_build_object('lastRefreshedAt',null)),
 ('missing_proof', jsonb_build_object('missingProofCount',0,'missingProofTaskIds','[]'::jsonb,'updatedAt',null)),
 ('ceo_digest_latest', jsonb_build_object('pendingApprovals',0,'unresolvedAlerts',0,'taskCountsByStatus',jsonb_build_object(),'digestMd',null,'updatedAt',null))
on conflict (key) do nothing;

-- Fusion Engine v1 persistence tables
create table if not exists fusion_runs_v1 (
  run_id text primary key,
  generated_at timestamptz not null,
  input_set_fingerprint text not null,
  fusion_policy_version text not null,
  fusion_score_version text not null,
  constitution_hash text not null,
  roadmap_hash text not null,
  strategic_constraints_hash text not null,
  strategic_constraints_version text not null,
  external_context_snapshot jsonb not null default '{}'::jsonb,
  competitor_context_snapshot jsonb not null default '{}'::jsonb,
  strategic_constraints_snapshot jsonb not null default '{}'::jsonb,
  selected_candidate_id text not null,
  review_by timestamptz,
  daily_decision_package jsonb not null,
  decision_package_hash text not null,
  created_at timestamptz not null default now(),
  unique(input_set_fingerprint, fusion_policy_version, fusion_score_version, strategic_constraints_hash)
);

alter table fusion_runs_v1
  add column if not exists run_status text,
  add column if not exists reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists candidate_total_count integer not null default 0,
  add column if not exists candidate_fresh_count integer not null default 0,
  add column if not exists candidate_stale_count integer not null default 0,
  add column if not exists candidate_gated_count integer not null default 0,
  add column if not exists candidate_eligible_count integer not null default 0,
  add column if not exists independent_cluster_count integer not null default 0,
  add column if not exists next_review_at timestamptz,
  add column if not exists execution_mode text;

alter table fusion_runs_v1
  drop constraint if exists chk_fusion_runs_v1_run_status,
  add constraint chk_fusion_runs_v1_run_status
    check (run_status is null or run_status in (
      'completed_with_decision',
      'completed_hold',
      'completed_monitor',
      'insufficient_candidates',
      'no_fresh_candidates',
      'blocked_by_data_quality',
      'failed'
    ));

alter table fusion_runs_v1
  drop constraint if exists chk_fusion_runs_v1_execution_mode,
  add constraint chk_fusion_runs_v1_execution_mode
    check (execution_mode is null or execution_mode in ('comparative','single_candidate','no_candidate'));

create index if not exists idx_fusion_runs_v1_status_generated
  on fusion_runs_v1(run_status, generated_at desc);
create index if not exists idx_fusion_runs_v1_generated_at
  on fusion_runs_v1(generated_at desc);

create table if not exists fusion_candidates_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references fusion_runs_v1(run_id) on delete cascade,
  candidate_id text not null,
  candidate_fingerprint text,
  normalized_candidate jsonb not null,
  gated_out boolean not null default false,
  gate_reasons jsonb not null default '[]'::jsonb,
  cluster_id text,
  created_at timestamptz not null default now(),
  unique(run_id, candidate_id)
);
create index if not exists idx_fusion_candidates_v1_run
  on fusion_candidates_v1(run_id);

create table if not exists fusion_rankings_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references fusion_runs_v1(run_id) on delete cascade,
  candidate_id text not null,
  rank integer not null,
  score_before_penalties numeric not null,
  final_score numeric not null,
  feature_values jsonb not null default '{}'::jsonb,
  penalties jsonb not null default '{}'::jsonb,
  gates jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '{}'::jsonb,
  dedupe_cluster_id text,
  created_at timestamptz not null default now(),
  unique(run_id, candidate_id)
);
create index if not exists idx_fusion_rankings_v1_run_rank
  on fusion_rankings_v1(run_id, rank asc);

-- =========================================================
-- External Intelligence (Phase A5) — schema-only foundation (dormant)
-- =========================================================

create table if not exists external_evidence_references_v1 (
  evidence_reference_id text primary key,
  current_content_hash text not null,
  lifecycle_status text,
  correction_status text not null default 'none' check (correction_status in ('none','corrected','retracted','superseded')),
  source_id text not null,
  source_config_version text not null,
  legal_policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_external_evidence_references_v1_updated_at on external_evidence_references_v1;
create trigger trg_external_evidence_references_v1_updated_at
before update on external_evidence_references_v1
for each row execute function set_updated_at();

create index if not exists external_evidence_references_v1__source_id_idx
  on external_evidence_references_v1(source_id);
create index if not exists external_evidence_references_v1__lifecycle_status_idx
  on external_evidence_references_v1(lifecycle_status);

create table if not exists external_claims_v1 (
  claim_id text primary key,
  current_content_hash text not null,
  lifecycle_status text,
  correction_status text not null default 'none' check (correction_status in ('none','corrected','retracted','superseded')),
  interpretation_policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_external_claims_v1_updated_at on external_claims_v1;
create trigger trg_external_claims_v1_updated_at
before update on external_claims_v1
for each row execute function set_updated_at();

create index if not exists external_claims_v1__lifecycle_status_idx
  on external_claims_v1(lifecycle_status);
create index if not exists external_claims_v1__updated_at_idx
  on external_claims_v1(updated_at);

create table if not exists external_signals_v1 (
  signal_id text primary key,
  current_content_hash text not null,
  lifecycle_status text,
  correction_status text not null default 'none' check (correction_status in ('none','corrected','retracted','superseded')),
  disposition text,
  confidence_summary_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_external_signals_v1_updated_at on external_signals_v1;
create trigger trg_external_signals_v1_updated_at
before update on external_signals_v1
for each row execute function set_updated_at();

create index if not exists external_signals_v1__lifecycle_status_idx
  on external_signals_v1(lifecycle_status);
create index if not exists external_signals_v1__disposition_idx
  on external_signals_v1(disposition);

create table if not exists external_evidence_reference_versions_v1 (
  evidence_reference_id text not null references external_evidence_references_v1(evidence_reference_id) on delete restrict,
  content_hash text not null,
  schema_version text not null,
  source_id text not null,
  source_config_version text not null,
  legal_policy_version text not null,
  policy_refs_json jsonb not null default '[]'::jsonb,
  effective_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes_content_hashes jsonb not null default '[]'::jsonb,
  superseded_by_content_hash text,
  payload_json jsonb,
  retention_policy text not null default 'retain' check (retention_policy in ('retain','link_only','tombstone')),
  retention_expires_at timestamptz,
  legal_hold boolean not null default false,
  access_revoked_at timestamptz,
  content_redacted_at timestamptz,
  redaction_reason text,
  payload_available boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (evidence_reference_id, content_hash),
  unique (evidence_reference_id, content_hash),
  constraint external_evidence_reference_versions_v1__payload_consistency_check
    check (
      (payload_available = true and payload_json is not null)
      or
      (payload_available = false and payload_json is null)
    )
);

create index if not exists external_evidence_reference_versions_v1__content_hash_idx
  on external_evidence_reference_versions_v1(content_hash);
create index if not exists external_evidence_reference_versions_v1__source_id_idx
  on external_evidence_reference_versions_v1(source_id);
create index if not exists external_evidence_reference_versions_v1__created_at_idx
  on external_evidence_reference_versions_v1(created_at);

create table if not exists external_claim_versions_v1 (
  claim_id text not null references external_claims_v1(claim_id) on delete restrict,
  content_hash text not null,
  schema_version text not null,
  claim_fingerprint text not null,
  interpretation_policy_version text not null,
  interpretation_policy_hash text not null,
  evidence_reference_version_ref_json jsonb not null,
  policy_refs_json jsonb not null default '[]'::jsonb,
  effective_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes_content_hashes jsonb not null default '[]'::jsonb,
  superseded_by_content_hash text,
  payload_json jsonb,
  retention_policy text not null default 'retain' check (retention_policy in ('retain','link_only','tombstone')),
  retention_expires_at timestamptz,
  legal_hold boolean not null default false,
  access_revoked_at timestamptz,
  content_redacted_at timestamptz,
  redaction_reason text,
  payload_available boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (claim_id, content_hash),
  unique (claim_id, content_hash),
  constraint external_claim_versions_v1__payload_consistency_check
    check (
      (payload_available = true and payload_json is not null)
      or
      (payload_available = false and payload_json is null)
    )
);

create unique index if not exists external_claim_versions_v1__fingerprint_policy_uniq
  on external_claim_versions_v1(claim_fingerprint, interpretation_policy_hash)
  where payload_available = true;
create index if not exists external_claim_versions_v1__content_hash_idx
  on external_claim_versions_v1(content_hash);
create index if not exists external_claim_versions_v1__fingerprint_idx
  on external_claim_versions_v1(claim_fingerprint);
create index if not exists external_claim_versions_v1__created_at_idx
  on external_claim_versions_v1(created_at);

create table if not exists external_signal_versions_v1 (
  signal_id text not null references external_signals_v1(signal_id) on delete restrict,
  content_hash text not null,
  schema_version text not null,
  signal_fingerprint text not null,
  interpretation_policy_version text not null,
  interpretation_policy_hash text not null,
  confidence_policy_version text not null,
  disposition_policy_version text not null,
  entity_resolution_version text not null,
  source_registry_version text not null,
  legal_policy_version text not null,
  policy_refs_json jsonb not null default '[]'::jsonb,
  claim_version_refs_json jsonb not null default '[]'::jsonb,
  evidence_reference_version_refs_json jsonb not null default '[]'::jsonb,
  effective_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes_content_hashes jsonb not null default '[]'::jsonb,
  superseded_by_content_hash text,
  payload_json jsonb,
  retention_policy text not null default 'retain' check (retention_policy in ('retain','link_only','tombstone')),
  retention_expires_at timestamptz,
  legal_hold boolean not null default false,
  access_revoked_at timestamptz,
  content_redacted_at timestamptz,
  redaction_reason text,
  payload_available boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (signal_id, content_hash),
  unique (signal_id, content_hash),
  constraint external_signal_versions_v1__payload_consistency_check
    check (
      (payload_available = true and payload_json is not null)
      or
      (payload_available = false and payload_json is null)
    )
);

create unique index if not exists external_signal_versions_v1__fingerprint_policy_er_uniq
  on external_signal_versions_v1(signal_fingerprint, interpretation_policy_hash, entity_resolution_version)
  where payload_available = true;
create index if not exists external_signal_versions_v1__content_hash_idx
  on external_signal_versions_v1(content_hash);
create index if not exists external_signal_versions_v1__fingerprint_idx
  on external_signal_versions_v1(signal_fingerprint);
create index if not exists external_signal_versions_v1__created_at_idx
  on external_signal_versions_v1(created_at);

alter table external_evidence_references_v1
  drop constraint if exists external_evidence_references_v1__current_version_fk;
alter table external_evidence_references_v1
  add constraint external_evidence_references_v1__current_version_fk
  foreign key (evidence_reference_id, current_content_hash)
  references external_evidence_reference_versions_v1(evidence_reference_id, content_hash)
  on delete restrict
  deferrable initially deferred;

alter table external_claims_v1
  drop constraint if exists external_claims_v1__current_version_fk;
alter table external_claims_v1
  add constraint external_claims_v1__current_version_fk
  foreign key (claim_id, current_content_hash)
  references external_claim_versions_v1(claim_id, content_hash)
  on delete restrict
  deferrable initially deferred;

alter table external_signals_v1
  drop constraint if exists external_signals_v1__current_version_fk;
alter table external_signals_v1
  add constraint external_signals_v1__current_version_fk
  foreign key (signal_id, current_content_hash)
  references external_signal_versions_v1(signal_id, content_hash)
  on delete restrict
  deferrable initially deferred;

create table if not exists external_provenance_edges_v1 (
  edge_id text primary key,
  from_object_type text not null,
  from_object_id text not null,
  from_content_hash text not null,
  to_object_type text not null,
  to_object_id text not null,
  to_content_hash text not null,
  relation text not null,
  policy_version text not null,
  policy_hash text not null,
  from_ref_json jsonb not null,
  to_ref_json jsonb not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (
    from_object_type,
    from_object_id,
    from_content_hash,
    to_object_type,
    to_object_id,
    to_content_hash,
    relation,
    policy_hash
  ),
  constraint external_provenance_edges_v1__no_self_cycle_check
    check (not (
      from_object_type = to_object_type
      and from_object_id = to_object_id
      and from_content_hash = to_content_hash
      and relation = 'supersedes'
    ))
);

create index if not exists external_provenance_edges_v1__from_idx
  on external_provenance_edges_v1(from_object_type, from_object_id, from_content_hash);
create index if not exists external_provenance_edges_v1__to_idx
  on external_provenance_edges_v1(to_object_type, to_object_id, to_content_hash);
create index if not exists external_provenance_edges_v1__relation_idx
  on external_provenance_edges_v1(relation);

create table if not exists external_lifecycle_transitions_v1 (
  transition_id text primary key,
  object_type text not null,
  object_id text not null,
  content_hash text not null,
  object_ref_json jsonb not null,
  from_status text not null,
  to_status text not null,
  effective_at timestamptz not null,
  reason_codes jsonb not null default '[]'::jsonb,
  policy_version text not null,
  policy_hash text not null,
  created_at timestamptz not null default now(),
  unique (object_type, object_id, content_hash, from_status, to_status, effective_at, policy_hash)
);

create index if not exists external_lifecycle_transitions_v1__object_idx
  on external_lifecycle_transitions_v1(object_type, object_id, content_hash);
create index if not exists external_lifecycle_transitions_v1__effective_at_idx
  on external_lifecycle_transitions_v1(effective_at);

create table if not exists external_corrections_v1 (
  correction_id text primary key,
  object_type text not null,
  object_id text not null,
  content_hash text not null,
  object_ref_json jsonb not null,
  correction_type text not null check (correction_type in ('correction','retraction','supersession')),
  supersedes_ref_json jsonb,
  superseded_by_ref_json jsonb,
  reason text not null,
  policy_version text not null,
  policy_hash text not null,
  created_at timestamptz not null default now(),
  unique (object_type, object_id, content_hash, correction_type, policy_hash)
);

create index if not exists external_corrections_v1__object_idx
  on external_corrections_v1(object_type, object_id, content_hash);
create index if not exists external_corrections_v1__type_idx
  on external_corrections_v1(correction_type);

create table if not exists external_source_contributions_v1 (
  contribution_id text primary key,
  target_object_type text not null,
  target_object_id text not null,
  target_content_hash text not null,
  target_ref_json jsonb not null,
  source_id text not null,
  source_set_id text,
  evidence_reference_object_id text not null,
  evidence_reference_content_hash text not null,
  evidence_reference_version_ref_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (
    target_object_type,
    target_object_id,
    target_content_hash,
    source_id,
    evidence_reference_object_id,
    evidence_reference_content_hash
  )
);

create index if not exists external_source_contributions_v1__target_idx
  on external_source_contributions_v1(target_object_type, target_object_id, target_content_hash);
create index if not exists external_source_contributions_v1__source_id_idx
  on external_source_contributions_v1(source_id);

create table if not exists external_processing_runs_v1 (
  run_id text primary key,
  retry_of_run_id text references external_processing_runs_v1(run_id) on delete restrict,
  input_set_fingerprint text not null,
  source_registry_hash text not null,
  source_sets_hash text not null,
  policy_bundle_hash text not null,
  engine_version text not null,
  policy_refs_json jsonb not null default '[]'::jsonb,
  status text not null default 'started' check (status in ('started','completed','no_output','blocked','failed','persistence_incomplete')),
  reason_codes jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  input_refs_json jsonb not null default '[]'::jsonb,
  output_refs_json jsonb not null default '[]'::jsonb,
  expected_output_count integer not null default 0,
  persisted_output_count integer not null default 0,
  required_provenance_edges_json jsonb not null default '[]'::jsonb,
  persistence_complete boolean not null default false,
  validation_complete boolean not null default false,
  validation_result text not null default 'ok' check (validation_result in ('ok','failed')),
  error_summary text,
  unique (input_set_fingerprint, source_registry_hash, policy_bundle_hash, engine_version),
  constraint external_processing_runs_v1__counts_check
    check (
      expected_output_count >= 0
      and persisted_output_count >= 0
      and persisted_output_count <= expected_output_count
    ),
  constraint external_processing_runs_v1__completed_requires_completeness_check
    check (
      status <> 'completed'
      or (
        persistence_complete = true
        and validation_complete = true
        and persisted_output_count = expected_output_count
      )
    )
);

create index if not exists external_processing_runs_v1__status_idx
  on external_processing_runs_v1(status);
create index if not exists external_processing_runs_v1__idempotency_lookup_idx
  on external_processing_runs_v1(input_set_fingerprint, source_registry_hash, policy_bundle_hash, engine_version);
create index if not exists external_processing_runs_v1__started_at_idx
  on external_processing_runs_v1(started_at);

-- =========================================================
-- External Intelligence (Phase A6.1) — transactional persistence RPCs
-- =========================================================

create extension if not exists pgcrypto;

create or replace function persist_external_evidence_reference_v1(
  in_evidence_reference_id text,
  in_content_hash text,
  in_schema_version text,
  in_source_id text,
  in_source_config_version text,
  in_legal_policy_version text,
  in_policy_refs_json jsonb,
  in_effective_at timestamptz,
  in_valid_from timestamptz,
  in_valid_until timestamptz,
  in_supersedes_content_hashes jsonb,
  in_payload_json jsonb,
  in_retention_policy text,
  in_retention_expires_at timestamptz,
  in_legal_hold boolean,
  in_access_revoked_at timestamptz,
  in_content_redacted_at timestamptz,
  in_redaction_reason text,
  in_payload_available boolean
)
returns table (
  evidence_reference_id text,
  content_hash text,
  created_new_version boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  existing record;
  inserted_version boolean := false;
  replay boolean := false;
begin
  if in_evidence_reference_id is null or length(in_evidence_reference_id) = 0 then
    raise exception 'evidence_reference_id required';
  end if;
  if in_content_hash is null or length(in_content_hash) = 0 then
    raise exception 'content_hash required';
  end if;

  select * into existing
  from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id = in_evidence_reference_id
    and ev.content_hash = in_content_hash;

  if found then
    if not (
      existing.payload_available is not distinct from in_payload_available
      and existing.payload_json is not distinct from in_payload_json
      and existing.schema_version is not distinct from in_schema_version
      and existing.source_id is not distinct from in_source_id
      and existing.source_config_version is not distinct from in_source_config_version
      and existing.legal_policy_version is not distinct from in_legal_policy_version
      and existing.policy_refs_json is not distinct from in_policy_refs_json
      and existing.effective_at is not distinct from in_effective_at
      and existing.valid_from is not distinct from in_valid_from
      and existing.valid_until is not distinct from in_valid_until
      and existing.supersedes_content_hashes is not distinct from in_supersedes_content_hashes
      and existing.retention_policy is not distinct from in_retention_policy
      and existing.retention_expires_at is not distinct from in_retention_expires_at
      and existing.legal_hold is not distinct from in_legal_hold
      and existing.access_revoked_at is not distinct from in_access_revoked_at
      and existing.content_redacted_at is not distinct from in_content_redacted_at
      and existing.redaction_reason is not distinct from in_redaction_reason
    ) then
      raise exception 'IntegrityConflict: evidence_reference_id=% content_hash=% already exists with different payload/legal state', in_evidence_reference_id, in_content_hash;
    end if;
    replay := true;
  else
    insert into external_evidence_references_v1(
      evidence_reference_id,
      current_content_hash,
      lifecycle_status,
      correction_status,
      source_id,
      source_config_version,
      legal_policy_version
    ) values (
      in_evidence_reference_id,
      in_content_hash,
      'new',
      'none',
      in_source_id,
      in_source_config_version,
      in_legal_policy_version
    ) on conflict on constraint external_evidence_references_v1_pkey do nothing;

    insert into external_evidence_reference_versions_v1(
      evidence_reference_id,
      content_hash,
      schema_version,
      source_id,
      source_config_version,
      legal_policy_version,
      policy_refs_json,
      effective_at,
      valid_from,
      valid_until,
      supersedes_content_hashes,
      payload_json,
      retention_policy,
      retention_expires_at,
      legal_hold,
      access_revoked_at,
      content_redacted_at,
      redaction_reason,
      payload_available
    ) values (
      in_evidence_reference_id,
      in_content_hash,
      in_schema_version,
      in_source_id,
      in_source_config_version,
      in_legal_policy_version,
      in_policy_refs_json,
      in_effective_at,
      in_valid_from,
      in_valid_until,
      in_supersedes_content_hashes,
      in_payload_json,
      in_retention_policy,
      in_retention_expires_at,
      in_legal_hold,
      in_access_revoked_at,
      in_content_redacted_at,
      in_redaction_reason,
      in_payload_available
    );
    inserted_version := true;
  end if;

  update external_evidence_references_v1
    set current_content_hash = in_content_hash
  where evidence_reference_id = in_evidence_reference_id;

  evidence_reference_id := in_evidence_reference_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

create or replace function redact_external_evidence_payload_v1(
  in_evidence_reference_id text,
  in_content_hash text,
  in_redaction_reason text
)
returns table (evidence_reference_id text, content_hash text, redacted boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v record;
begin
  if session_user is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if in_redaction_reason is null or length(in_redaction_reason)=0 then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;
  select * into v from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id=in_evidence_reference_id and ev.content_hash=in_content_hash;
  if not found then raise exception using errcode='P0001', message='linked_version_not_found'; end if;
  if v.legal_hold then raise exception using errcode='P0001', message='legal_hold_block'; end if;
  update public.external_evidence_reference_versions_v1 ev
    set payload_json=null,
        payload_available=false,
        content_redacted_at=coalesce(content_redacted_at, timezone('utc', now())),
        redaction_reason=in_redaction_reason
  where ev.evidence_reference_id=in_evidence_reference_id and ev.content_hash=in_content_hash;
  evidence_reference_id := in_evidence_reference_id;
  content_hash := in_content_hash;
  redacted := true;
  return next;
end;
$fn$;

create or replace function redact_external_claim_payload_v1(
  in_claim_id text,
  in_content_hash text,
  in_redaction_reason text
)
returns table (claim_id text, content_hash text, redacted boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v record;
begin
  if session_user is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if in_redaction_reason is null or length(in_redaction_reason)=0 then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;
  select * into v from public.external_claim_versions_v1
  where claim_id=in_claim_id and content_hash=in_content_hash;
  if not found then raise exception using errcode='P0001', message='linked_version_not_found'; end if;
  if v.legal_hold then raise exception using errcode='P0001', message='legal_hold_block'; end if;
  update public.external_claim_versions_v1
    set payload_json=null,
        payload_available=false,
        content_redacted_at=coalesce(content_redacted_at, timezone('utc', now())),
        redaction_reason=in_redaction_reason
  where claim_id=in_claim_id and content_hash=in_content_hash;
  claim_id := in_claim_id;
  content_hash := in_content_hash;
  redacted := true;
  return next;
end;
$fn$;

create or replace function redact_external_signal_payload_v1(
  in_signal_id text,
  in_content_hash text,
  in_redaction_reason text
)
returns table (signal_id text, content_hash text, redacted boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v record;
begin
  if session_user is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if in_redaction_reason is null or length(in_redaction_reason)=0 then
    raise exception using errcode='P0001', message='invalid_argument';
  end if;
  select * into v from public.external_signal_versions_v1
  where signal_id=in_signal_id and content_hash=in_content_hash;
  if not found then raise exception using errcode='P0001', message='linked_version_not_found'; end if;
  if v.legal_hold then raise exception using errcode='P0001', message='legal_hold_block'; end if;
  update public.external_signal_versions_v1
    set payload_json=null,
        payload_available=false,
        content_redacted_at=coalesce(content_redacted_at, timezone('utc', now())),
        redaction_reason=in_redaction_reason
  where signal_id=in_signal_id and content_hash=in_content_hash;
  signal_id := in_signal_id;
  content_hash := in_content_hash;
  redacted := true;
  return next;
end;
$fn$;

create or replace function persist_external_claim_v1(
  in_claim_id text,
  in_content_hash text,
  in_schema_version text,
  in_claim_fingerprint text,
  in_interpretation_policy_version text,
  in_interpretation_policy_hash text,
  in_evidence_reference_id text,
  in_evidence_content_hash text,
  in_evidence_version_ref_json jsonb,
  in_policy_refs_json jsonb,
  in_effective_at timestamptz,
  in_valid_from timestamptz,
  in_valid_until timestamptz,
  in_supersedes_content_hashes jsonb,
  in_payload_json jsonb,
  in_retention_policy text,
  in_retention_expires_at timestamptz,
  in_legal_hold boolean,
  in_access_revoked_at timestamptz,
  in_content_redacted_at timestamptz,
  in_redaction_reason text,
  in_payload_available boolean,
  in_edge_relation text,
  in_edge_policy_version text,
  in_edge_policy_hash text
)
returns table (
  claim_id text,
  content_hash text,
  created_new_version boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  existing record;
  inserted_version boolean := false;
  replay boolean := false;
  edge_id text;
begin
  perform 1 from public.external_evidence_reference_versions_v1 ev
  where ev.evidence_reference_id = in_evidence_reference_id
    and ev.content_hash = in_evidence_content_hash;
  if not found then
    raise exception 'MissingLinkedVersion: evidence_reference_id=% content_hash=%', in_evidence_reference_id, in_evidence_content_hash;
  end if;

  if (in_evidence_version_ref_json->>'object_type') is distinct from 'evidence_reference'
     or (in_evidence_version_ref_json->>'object_id') is distinct from in_evidence_reference_id
     or (in_evidence_version_ref_json->>'content_hash') is distinct from in_evidence_content_hash then
    raise exception using errcode = 'P0001', message = 'version_ref_mismatch';
  end if;

  select * into existing
  from public.external_claim_versions_v1 cv
  where cv.claim_id = in_claim_id
    and cv.content_hash = in_content_hash;

  if found then
    if not (
      existing.payload_available is not distinct from in_payload_available
      and existing.payload_json is not distinct from in_payload_json
      and existing.schema_version is not distinct from in_schema_version
      and existing.claim_fingerprint is not distinct from in_claim_fingerprint
      and existing.interpretation_policy_version is not distinct from in_interpretation_policy_version
      and existing.interpretation_policy_hash is not distinct from in_interpretation_policy_hash
      and existing.evidence_reference_version_ref_json is not distinct from in_evidence_version_ref_json
      and existing.policy_refs_json is not distinct from in_policy_refs_json
      and existing.effective_at is not distinct from in_effective_at
      and existing.valid_from is not distinct from in_valid_from
      and existing.valid_until is not distinct from in_valid_until
      and existing.supersedes_content_hashes is not distinct from in_supersedes_content_hashes
      and existing.retention_policy is not distinct from in_retention_policy
      and existing.retention_expires_at is not distinct from in_retention_expires_at
      and existing.legal_hold is not distinct from in_legal_hold
      and existing.access_revoked_at is not distinct from in_access_revoked_at
      and existing.content_redacted_at is not distinct from in_content_redacted_at
      and existing.redaction_reason is not distinct from in_redaction_reason
    ) then
      raise exception 'IntegrityConflict: claim_id=% content_hash=% already exists with different payload/legal state', in_claim_id, in_content_hash;
    end if;
    replay := true;
  else
    insert into external_claims_v1(
      claim_id,
      current_content_hash,
      lifecycle_status,
      correction_status,
      interpretation_policy_version
    ) values (
      in_claim_id,
      in_content_hash,
      'new',
      'none',
      in_interpretation_policy_version
    ) on conflict on constraint external_claims_v1_pkey do nothing;

    insert into external_claim_versions_v1(
      claim_id,
      content_hash,
      schema_version,
      claim_fingerprint,
      interpretation_policy_version,
      interpretation_policy_hash,
      evidence_reference_version_ref_json,
      policy_refs_json,
      effective_at,
      valid_from,
      valid_until,
      supersedes_content_hashes,
      payload_json,
      retention_policy,
      retention_expires_at,
      legal_hold,
      access_revoked_at,
      content_redacted_at,
      redaction_reason,
      payload_available
    ) values (
      in_claim_id,
      in_content_hash,
      in_schema_version,
      in_claim_fingerprint,
      in_interpretation_policy_version,
      in_interpretation_policy_hash,
      in_evidence_version_ref_json,
      in_policy_refs_json,
      in_effective_at,
      in_valid_from,
      in_valid_until,
      in_supersedes_content_hashes,
      in_payload_json,
      in_retention_policy,
      in_retention_expires_at,
      in_legal_hold,
      in_access_revoked_at,
      in_content_redacted_at,
      in_redaction_reason,
      in_payload_available
    );
    inserted_version := true;
  end if;

  update public.external_claims_v1 cs
    set current_content_hash = in_content_hash
  where cs.claim_id = in_claim_id;

  edge_id := encode(digest(jsonb_build_object(
    'from_object_type','claim',
    'from_object_id',in_claim_id,
    'from_content_hash',in_content_hash,
    'to_object_type','evidence_reference',
    'to_object_id',in_evidence_reference_id,
    'to_content_hash',in_evidence_content_hash,
    'relation',in_edge_relation,
    'policy_hash',in_edge_policy_hash
  )::text, 'sha256'), 'hex');

  insert into external_provenance_edges_v1(
    edge_id,
    from_object_type,from_object_id,from_content_hash,
    to_object_type,to_object_id,to_content_hash,
    relation,
    policy_version,
    policy_hash,
    from_ref_json,
    to_ref_json,
    metadata_json
  ) values (
    edge_id,
    'claim',in_claim_id,in_content_hash,
    'evidence_reference',in_evidence_reference_id,in_evidence_content_hash,
    in_edge_relation,
    in_edge_policy_version,
    in_edge_policy_hash,
    jsonb_build_object('object_type','claim','object_id',in_claim_id,'content_hash',in_content_hash,'schema_version',in_schema_version,'policy_version',in_interpretation_policy_version,'version_id',null,'created_at',now()),
    in_evidence_version_ref_json,
    '{}'::jsonb
  ) on conflict (
    from_object_type,from_object_id,from_content_hash,
    to_object_type,to_object_id,to_content_hash,
    relation,
    policy_hash
  ) do nothing;

  claim_id := in_claim_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

create or replace function persist_external_signal_write_set_v1(
  in_signal_id text,
  in_content_hash text,
  in_schema_version text,
  in_signal_fingerprint text,
  in_interpretation_policy_version text,
  in_interpretation_policy_hash text,
  in_confidence_policy_version text,
  in_disposition_policy_version text,
  in_entity_resolution_version text,
  in_source_registry_version text,
  in_legal_policy_version text,
  in_policy_refs_json jsonb,
  in_claim_version_refs_json jsonb,
  in_evidence_reference_version_refs_json jsonb,
  in_effective_at timestamptz,
  in_valid_from timestamptz,
  in_valid_until timestamptz,
  in_supersedes_content_hashes jsonb,
  in_payload_json jsonb,
  in_retention_policy text,
  in_retention_expires_at timestamptz,
  in_legal_hold boolean,
  in_access_revoked_at timestamptz,
  in_content_redacted_at timestamptz,
  in_redaction_reason text,
  in_payload_available boolean,
  in_disposition text,
  in_confidence_summary_json jsonb,
  in_required_provenance_edges_json jsonb,
  in_required_source_contributions_json jsonb,
  in_run_id text,
  in_expected_output_count integer,
  in_output_refs_json jsonb
)
returns table (
  signal_id text,
  content_hash text,
  created_new_version boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  existing record;
  inserted_version boolean := false;
  replay boolean := false;
  v jsonb;
  obj_id text;
  obj_hash text;
  edge jsonb;
  edge_id text;
  contrib jsonb;
begin
  for v in select * from jsonb_array_elements(in_claim_version_refs_json)
  loop
    obj_id := v->>'object_id';
    obj_hash := v->>'content_hash';
    perform 1 from public.external_claim_versions_v1 cv where cv.claim_id = obj_id and cv.content_hash = obj_hash;
    if not found then
      raise exception 'MissingLinkedVersion: claim_id=% content_hash=%', obj_id, obj_hash;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(in_evidence_reference_version_refs_json)
  loop
    obj_id := v->>'object_id';
    obj_hash := v->>'content_hash';
    perform 1
    from public.external_evidence_reference_versions_v1 ev
    where ev.evidence_reference_id = obj_id
      and ev.content_hash = obj_hash;
    if not found then
      raise exception 'MissingLinkedVersion: evidence_reference_id=% content_hash=%', obj_id, obj_hash;
    end if;
  end loop;

  select * into existing
  from public.external_signal_versions_v1 sv
  where sv.signal_id = in_signal_id
    and sv.content_hash = in_content_hash;

  if found then
    replay := true;
  else
    insert into external_signals_v1(
      signal_id,
      current_content_hash,
      lifecycle_status,
      correction_status,
      disposition,
      confidence_summary_json
    ) values (
      in_signal_id,
      in_content_hash,
      'new',
      'none',
      in_disposition,
      in_confidence_summary_json
    ) on conflict on constraint external_signals_v1_pkey do nothing;

    insert into external_signal_versions_v1(
      signal_id,
      content_hash,
      schema_version,
      signal_fingerprint,
      interpretation_policy_version,
      interpretation_policy_hash,
      confidence_policy_version,
      disposition_policy_version,
      entity_resolution_version,
      source_registry_version,
      legal_policy_version,
      policy_refs_json,
      claim_version_refs_json,
      evidence_reference_version_refs_json,
      effective_at,
      valid_from,
      valid_until,
      supersedes_content_hashes,
      payload_json,
      retention_policy,
      retention_expires_at,
      legal_hold,
      access_revoked_at,
      content_redacted_at,
      redaction_reason,
      payload_available
    ) values (
      in_signal_id,
      in_content_hash,
      in_schema_version,
      in_signal_fingerprint,
      in_interpretation_policy_version,
      in_interpretation_policy_hash,
      in_confidence_policy_version,
      in_disposition_policy_version,
      in_entity_resolution_version,
      in_source_registry_version,
      in_legal_policy_version,
      in_policy_refs_json,
      in_claim_version_refs_json,
      in_evidence_reference_version_refs_json,
      in_effective_at,
      in_valid_from,
      in_valid_until,
      in_supersedes_content_hashes,
      in_payload_json,
      in_retention_policy,
      in_retention_expires_at,
      in_legal_hold,
      in_access_revoked_at,
      in_content_redacted_at,
      in_redaction_reason,
      in_payload_available
    );
    inserted_version := true;
  end if;

  update public.external_signals_v1 ss
    set current_content_hash = in_content_hash,
        disposition = in_disposition,
        confidence_summary_json = in_confidence_summary_json
  where ss.signal_id = in_signal_id;

  for edge in select * from jsonb_array_elements(in_required_provenance_edges_json)
  loop
    edge_id := encode(digest(edge::text, 'sha256'), 'hex');
    insert into external_provenance_edges_v1(
      edge_id,
      from_object_type,from_object_id,from_content_hash,
      to_object_type,to_object_id,to_content_hash,
      relation,
      policy_version,
      policy_hash,
      from_ref_json,
      to_ref_json,
      metadata_json
    ) values (
      edge_id,
      edge->>'from_object_type', edge->>'from_object_id', edge->>'from_content_hash',
      edge->>'to_object_type', edge->>'to_object_id', edge->>'to_content_hash',
      edge->>'relation',
      edge->>'policy_version',
      edge->>'policy_hash',
      edge->'from_ref_json',
      edge->'to_ref_json',
      coalesce(edge->'metadata_json','{}'::jsonb)
    ) on conflict (
      from_object_type,from_object_id,from_content_hash,
      to_object_type,to_object_id,to_content_hash,
      relation,
      policy_hash
    ) do nothing;
  end loop;

  for contrib in select * from jsonb_array_elements(in_required_source_contributions_json)
  loop
    insert into external_source_contributions_v1(
      contribution_id,
      target_object_type,target_object_id,target_content_hash,target_ref_json,
      source_id,source_set_id,
      evidence_reference_object_id,evidence_reference_content_hash,evidence_reference_version_ref_json
    ) values (
      contrib->>'contribution_id',
      contrib->>'target_object_type', contrib->>'target_object_id', contrib->>'target_content_hash', contrib->'target_ref_json',
      contrib->>'source_id', contrib->>'source_set_id',
      contrib->>'evidence_reference_object_id', contrib->>'evidence_reference_content_hash', contrib->'evidence_reference_version_ref_json'
    ) on conflict (
      target_object_type,target_object_id,target_content_hash,source_id,evidence_reference_object_id,evidence_reference_content_hash
    ) do nothing;
  end loop;

  if in_run_id is not null and length(in_run_id) > 0 then
    update external_processing_runs_v1
      set output_refs_json = in_output_refs_json,
          expected_output_count = in_expected_output_count,
          persisted_output_count = jsonb_array_length(in_output_refs_json)
    where run_id = in_run_id;
  end if;

  signal_id := in_signal_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

-- =========================================================
-- External Intelligence (Phase A6.1) — transactional persistence RPCs (final definitions)
-- =========================================================

-- These definitions mirror supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql.

create or replace function persist_external_evidence_reference_v1(
  in_evidence_reference_id text,
  in_content_hash text,
  in_schema_version text,
  in_source_id text,
  in_source_config_version text,
  in_legal_policy_version text,
  in_policy_refs_json jsonb,
  in_effective_at timestamptz,
  in_valid_from timestamptz,
  in_valid_until timestamptz,
  in_supersedes_content_hashes jsonb,
  in_payload_json jsonb,
  in_retention_policy text,
  in_retention_expires_at timestamptz,
  in_legal_hold boolean,
  in_access_revoked_at timestamptz,
  in_content_redacted_at timestamptz,
  in_redaction_reason text,
  in_payload_available boolean
)
returns table (
  evidence_reference_id text,
  content_hash text,
  created_new_version boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  existing record;
  version_exists boolean;
  inserted_version boolean := false;
  replay boolean := false;
begin
  if session_user is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select * into existing
  from public.external_evidence_reference_versions_v1
  where evidence_reference_id = in_evidence_reference_id
    and content_hash = in_content_hash;

  version_exists := found;

  if version_exists then
    if not (
      existing.payload_available is not distinct from in_payload_available
      and existing.payload_json is not distinct from in_payload_json
      and existing.schema_version is not distinct from in_schema_version
      and existing.source_id is not distinct from in_source_id
      and existing.source_config_version is not distinct from in_source_config_version
      and existing.legal_policy_version is not distinct from in_legal_policy_version
      and existing.policy_refs_json is not distinct from in_policy_refs_json
      and existing.effective_at is not distinct from in_effective_at
      and existing.valid_from is not distinct from in_valid_from
      and existing.valid_until is not distinct from in_valid_until
      and existing.supersedes_content_hashes is not distinct from in_supersedes_content_hashes
      and existing.retention_policy is not distinct from in_retention_policy
      and existing.retention_expires_at is not distinct from in_retention_expires_at
      and existing.legal_hold is not distinct from in_legal_hold
      and existing.access_revoked_at is not distinct from in_access_revoked_at
      and existing.content_redacted_at is not distinct from in_content_redacted_at
      and existing.redaction_reason is not distinct from in_redaction_reason
    ) then
      raise exception using errcode = 'P0001', message = 'integrity_conflict';
    end if;
    replay := true;
  else
    insert into public.external_evidence_references_v1(
      evidence_reference_id,
      current_content_hash,
      lifecycle_status,
      correction_status,
      source_id,
      source_config_version,
      legal_policy_version
    ) values (
      in_evidence_reference_id,
      in_content_hash,
      'new',
      'none',
      in_source_id,
      in_source_config_version,
      in_legal_policy_version
    ) on conflict (evidence_reference_id) do nothing;

    insert into public.external_evidence_reference_versions_v1(
      evidence_reference_id,
      content_hash,
      schema_version,
      source_id,
      source_config_version,
      legal_policy_version,
      policy_refs_json,
      effective_at,
      valid_from,
      valid_until,
      supersedes_content_hashes,
      payload_json,
      retention_policy,
      retention_expires_at,
      legal_hold,
      access_revoked_at,
      content_redacted_at,
      redaction_reason,
      payload_available
    ) values (
      in_evidence_reference_id,
      in_content_hash,
      in_schema_version,
      in_source_id,
      in_source_config_version,
      in_legal_policy_version,
      in_policy_refs_json,
      in_effective_at,
      in_valid_from,
      in_valid_until,
      in_supersedes_content_hashes,
      in_payload_json,
      in_retention_policy,
      in_retention_expires_at,
      in_legal_hold,
      in_access_revoked_at,
      in_content_redacted_at,
      in_redaction_reason,
      in_payload_available
    );

    inserted_version := true;
  end if;

  update public.external_evidence_references_v1 es
    set current_content_hash = in_content_hash
  where es.evidence_reference_id = in_evidence_reference_id;

  evidence_reference_id := in_evidence_reference_id;
  content_hash := in_content_hash;
  created_new_version := inserted_version;
  idempotent_replay := replay;
  return next;
end;
$fn$;

create or replace function complete_external_processing_run_v1(in_run_id text)
returns table (run_id text, resulting_status text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v jsonb;
  obj_id text;
  obj_hash text;
  edge jsonb;
  missing_edges integer := 0;
begin
  if session_user is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into r
  from public.external_processing_runs_v1 pr
  where pr.run_id = in_run_id;
  if not found then raise exception using errcode='P0001', message='linked_version_not_found'; end if;
  if r.persisted_output_count is distinct from r.expected_output_count then
    raise exception using errcode='P0001', message='run_completion_blocked';
  end if;
  if r.persistence_complete is distinct from true or r.validation_complete is distinct from true or r.validation_result is distinct from 'ok' then
    raise exception using errcode='P0001', message='run_completion_blocked';
  end if;
  for v in select * from jsonb_array_elements(coalesce(r.output_refs_json,'[]'::jsonb))
  loop
    obj_id := v->>'object_id';
    obj_hash := v->>'content_hash';
    if (v->>'object_type')='evidence_reference' then
      perform 1 from public.external_evidence_reference_versions_v1 where evidence_reference_id=obj_id and content_hash=obj_hash;
    elsif (v->>'object_type')='claim' then
      perform 1 from public.external_claim_versions_v1 where claim_id=obj_id and content_hash=obj_hash;
    elsif (v->>'object_type')='signal' then
      perform 1 from public.external_signal_versions_v1 where signal_id=obj_id and content_hash=obj_hash;
    else
      raise exception using errcode='P0001', message='object_type_mismatch';
    end if;
    if not found then raise exception using errcode='P0001', message='linked_version_not_found'; end if;
  end loop;
  for edge in select * from jsonb_array_elements(coalesce(r.required_provenance_edges_json,'[]'::jsonb))
  loop
    perform 1 from public.external_provenance_edges_v1
    where from_object_type=edge->>'from_object_type'
      and from_object_id=edge->>'from_object_id'
      and from_content_hash=edge->>'from_content_hash'
      and to_object_type=edge->>'to_object_type'
      and to_object_id=edge->>'to_object_id'
      and to_content_hash=edge->>'to_content_hash'
      and relation=edge->>'relation'
      and policy_hash=edge->>'policy_hash';
    if not found then missing_edges := missing_edges + 1; end if;
  end loop;
  if missing_edges > 0 then
    raise exception using errcode='P0001', message='incomplete_write_set';
  end if;

  if r.status = 'completed' then
    run_id := in_run_id;
    resulting_status := 'completed';
    return next;
    return;
  end if;

  update public.external_processing_runs_v1 pr
    set status='completed',
        completed_at=timezone('utc', now())
  where pr.run_id=in_run_id;

  run_id := in_run_id;
  resulting_status := 'completed';
  return next;
end;
$fn$;

-- =========================================================
-- Phase B2: Orchestration + Milestone alert infrastructure
-- =========================================================

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
