-- Scheduler cadence updates: industry news pulse + war room digest
-- Idempotent.

-- Update industry-news-pulse to run daily at 5am and 5pm PT.
insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'industry-news-pulse',
  'Industry News Pulse',
  '0 5,17 * * *',
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

-- Add war-room-digest (Tue/Fri 9am PT)
insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'war-room-digest',
  'War Room Digest',
  '0 9 * * 2,5',
  'America/Los_Angeles',
  '/api/scheduler/war-room',
  true
)
on conflict (job_key) do update
set
  job_name = excluded.job_name,
  cron_expression = excluded.cron_expression,
  timezone = excluded.timezone,
  route_path = excluded.route_path,
  is_active = excluded.is_active;
