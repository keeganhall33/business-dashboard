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

-- =========================================================
-- 4. RPC STUBS (Optional; prevents API failures if telemetry integrations aren’t installed yet)
-- =========================================================
create or replace function get_woo_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public, exec_dashboard
as $$
  with orders as (
    select *
    from exec_dashboard.raw_woocommerce_orders
    where created_at::date between start_date and end_date
      and coalesce(status, '') not in ('trash','refunded','cancelled','failed')
  ),
  ts as (
    select
      created_at::date as bucket,
      coalesce(sum(total), 0)::numeric as revenue,
      count(*)::numeric as orders
    from orders
    group by created_at::date
    order by bucket
  ),
  agg as (
    select
      count(*)::numeric as orders,
      coalesce(sum(total), 0)::numeric as revenue,
      coalesce(sum(discount_total), 0)::numeric as discounts,
      coalesce(sum(shipping_total), 0)::numeric as shipping,
      coalesce(sum(tax_total), 0)::numeric as taxes,
      coalesce(sum(total_items), 0)::numeric as items
    from orders
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'orders', orders,
      'revenue', revenue,
      'avgOrderValue', case when orders > 0 then revenue / orders else null end,
      'discountTotal', discounts,
      'shippingTotal', shipping,
      'taxTotal', taxes,
      'items', items
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
 ('scoreboard-refresh','Scoreboard Refresh','5 7 * * *','America/Los_Angeles','/api/scheduler/scoreboard-refresh',true)
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
