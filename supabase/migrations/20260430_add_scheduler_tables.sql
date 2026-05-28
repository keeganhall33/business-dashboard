-- Scheduler + enforcement foundation tables (Phase 1 Ops Automation)
-- Idempotent: safe to re-run.

-- Ensure updated_at helper exists.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
-- Scheduled jobs registry
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
-- Job run log for scheduler endpoints.
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
create index if not exists idx_job_run_log_status
  on job_run_log(status);
-- System alerts (scheduler + enforcement signals)
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
-- Key/value state for dashboard + automation coordination
create table if not exists system_state (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
