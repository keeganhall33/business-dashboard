-- Add the industry-news-pulse scheduler job (twice daily)
insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'industry-news-pulse',
  'Industry News Pulse',
  '0 7,16 * * *',
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
