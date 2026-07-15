-- 2026-07-15: Telemetry health event storage + monitor job

create table if not exists telemetry_health_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('woo','ga4','funnelkit','meta')),
  observed_at timestamptz not null default now(),
  requested_start_date date not null,
  requested_end_date date not null,
  health_status text not null,
  freshness_status text not null,
  coverage_status text not null,
  warning_codes text[] not null default '{}',
  fallback boolean not null default false,
  latency_ms integer,
  deployment_version text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_telemetry_health_source_obs on telemetry_health_events(source, observed_at desc);
create index if not exists idx_telemetry_health_observed_at on telemetry_health_events(observed_at desc);

insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'telemetry-health-monitor',
  'Telemetry health monitor',
  '*/30 * * * *',
  'America/Los_Angeles',
  '/api/scheduler/telemetry-health-monitor',
  true
)
on conflict (job_key) do update
set cron_expression = excluded.cron_expression,
    timezone = excluded.timezone,
    route_path = excluded.route_path,
    is_active = excluded.is_active;
