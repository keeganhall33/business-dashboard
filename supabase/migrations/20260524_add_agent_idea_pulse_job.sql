-- Add the agent-idea-pulse scheduler job so all existing environments pick it up
insert into scheduled_jobs (job_key, job_name, cron_expression, timezone, route_path, is_active)
values (
  'agent-idea-pulse',
  'Agent Idea Pulse',
  '0 9 * * *',
  'America/Los_Angeles',
  '/api/scheduler/agent-idea-pulse',
  true
)
on conflict (job_key) do update
set
  job_name = excluded.job_name,
  cron_expression = excluded.cron_expression,
  timezone = excluded.timezone,
  route_path = excluded.route_path,
  is_active = excluded.is_active;
