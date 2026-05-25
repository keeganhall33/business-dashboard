-- Phase 4: Scheduler tables + seeds
-- Source of truth: business-dashboard/SCHEDULER_SPEC.md (canonical block)

-- =========================================================
-- 16. SCHEDULED JOBS
-- =========================================================
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

-- requires set_updated_at() to exist in your DB (present in the main schema)
-- If not present, either create it or remove these triggers.

drop trigger if exists trg_scheduled_jobs_updated_at on scheduled_jobs;
create trigger trg_scheduled_jobs_updated_at
before update on scheduled_jobs
for each row execute function set_updated_at();

-- =========================================================
-- 17. JOB RUN LOG
-- =========================================================
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

-- =========================================================
-- 18. SYSTEM ALERTS
-- =========================================================
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

-- requires set_updated_at() to exist in your DB (present in the main schema)

drop trigger if exists trg_system_alerts_updated_at on system_alerts;
create trigger trg_system_alerts_updated_at
before update on system_alerts
for each row execute function set_updated_at();

-- =========================================================
-- 19. SYSTEM STATE
-- =========================================================
create table if not exists system_state (
 key text primary key,
 value_json jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

-- =========================================================
-- 20. SEED SCHEDULED JOBS
-- =========================================================
insert into scheduled_jobs (
 job_key, job_name, cron_expression, timezone, route_path, is_active
) values
 ('daily-agent-cycle','Daily Agent Cycle','5 6 * * *','America/Los_Angeles','/api/scheduler/daily-agent-cycle',true),
 ('daily-health-check','Daily Health Check','15 6 * * *','America/Los_Angeles','/api/scheduler/daily-health-check',true),
 ('agent-idea-pulse','Agent Idea Pulse','0 9 * * *','America/Los_Angeles','/api/scheduler/agent-idea-pulse',true),
 ('proof-enforcement','Proof Enforcement','0 17 * * *','America/Los_Angeles','/api/scheduler/proof-enforcement',true),
 ('deliverable-harvest','Deliverable Harvest','15 17 * * *','America/Los_Angeles','/api/scheduler/deliverable-harvest',true),
 ('ceo-digest','CEO Digest','45 17 * * *','America/Los_Angeles','/api/scheduler/ceo-digest',true),
 ('weekly-command-cycle','Weekly Command Cycle','0 7 * * 1','America/Los_Angeles','/api/scheduler/weekly-command-cycle',true),
 ('weekly-summary','Weekly Summary','0 8 * * 1','America/Los_Angeles','/api/scheduler/weekly-summary',true),
 ('midweek-opportunity-pulse','Midweek Opportunity Pulse','30 11 * * 3','America/Los_Angeles','/api/scheduler/midweek-opportunity-pulse',true),
 ('evening-closeout','Evening Closeout','30 19 * * *','America/Los_Angeles','/api/scheduler/evening-closeout',true)
on conflict (job_key) do nothing;

-- =========================================================
-- 21. SYSTEM STATE SEEDS
-- =========================================================
insert into system_state (key, value_json)
values
 ('operating_mode', jsonb_build_object('mode','normal','reason',null,'activatedAt',null)),
 ('weekly_summary', jsonb_build_object()),
 ('latest_directive', jsonb_build_object()),
 ('dashboard_snapshot_meta', jsonb_build_object('lastRefreshedAt',null))
on conflict (key) do nothing;
