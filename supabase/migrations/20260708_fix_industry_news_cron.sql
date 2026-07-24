-- Fix industry-news-pulse cron compatibility with lightweight parser
-- Keep 5am run and add a separate 5pm job (idempotent updates).

update scheduled_jobs
set cron_expression = '0 5 * * *'
where job_key = 'industry-news-pulse';

insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'industry-news-pulse-pm',
  'Industry News Pulse (PM)',
  '0 17 * * *',
  'America/Los_Angeles',
  '/api/scheduler/industry-news-pulse',
  true
)
on conflict (job_key) do update
set
  job_name = excluded.job_name,
  cron_expression = excluded.cron_expression,
  timezone = excluded.timezone,
  route_path = excluded.route_path,
  is_active = excluded.is_active;
