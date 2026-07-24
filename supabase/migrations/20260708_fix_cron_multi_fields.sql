-- Split cron expressions that the lightweight parser cannot handle (comma-separated
-- fields or */ notation). Keeps original job_keys for the primary schedule and adds
-- companion jobs for the extra cadence. Idempotent.

-- 1) Proof Enforcement Reminders: run at minute 0 each hour (existing job),
--    and add a half-hour companion job at minute 30. Preserve timezone/route/is_active.
update scheduled_jobs
set cron_expression = '0 * * * *'
where job_key = 'proof-enforcement';

insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'proof-enforcement-half',
  'Proof Enforcement Reminders (Half-Hour)',
  '30 * * * *',
  'America/Los_Angeles',
  '/api/scheduler/proof-enforcement',
  false
)
on conflict (job_key) do update
set
  job_name = excluded.job_name,
  cron_expression = excluded.cron_expression,
  timezone = excluded.timezone,
  route_path = excluded.route_path,
  is_active = excluded.is_active;

-- 2) War Room Digest: original Tue run stays on the base job; add a Friday job.
update scheduled_jobs
set cron_expression = '0 9 * * 2'
where job_key = 'war-room-digest';

insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'war-room-digest-fri',
  'War Room Digest (Fri)',
  '0 9 * * 5',
  'America/Los_Angeles',
  '/api/scheduler/war-room',
  false
)
on conflict (job_key) do update
set
  job_name = excluded.job_name,
  cron_expression = excluded.cron_expression,
  timezone = excluded.timezone,
  route_path = excluded.route_path,
  is_active = excluded.is_active;

-- 3) Weekly Command Summary: original Tuesday run stays on the base job; add Saturday run.
update scheduled_jobs
set cron_expression = '0 8 * * 2'
where job_key = 'weekly-summary';

insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'weekly-summary-sat',
  'Weekly Command Summary (Sat)',
  '0 8 * * 6',
  'America/Los_Angeles',
  '/api/scheduler/weekly-summary',
  true
)
on conflict (job_key) do update
set
  job_name = excluded.job_name,
  cron_expression = excluded.cron_expression,
  timezone = excluded.timezone,
  route_path = excluded.route_path,
  is_active = excluded.is_active;
