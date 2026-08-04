-- Register fusion-daily-decision-v1 scheduled job (daily 07:25 PT)
-- Idempotent: safe to re-run.

insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'fusion-daily-decision-v1',
  'Fusion: Daily Decision (v1)',
  '25 7 * * *',
  'America/Los_Angeles',
  '/api/scheduler/tick',
  true
)
on conflict (job_key) do update
set
  job_name = excluded.job_name,
  cron_expression = excluded.cron_expression,
  timezone = excluded.timezone,
  route_path = excluded.route_path,
  is_active = excluded.is_active;

