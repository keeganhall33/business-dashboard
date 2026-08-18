-- Align the daily operating cadence so current intelligence exists before agents make decisions.
-- Existing order had the daily-agent-cycle at 06:05 PT while scoreboard/intelligence/Fusion ran after 07:00,
-- causing the morning agents to consume stale decision context.

update public.scheduled_jobs
set cron_expression = '35 7 * * *',
    timezone = 'America/Los_Angeles',
    updated_at = now()
where job_key = 'daily-agent-cycle';

-- CEO digest should summarize the newly completed intelligence + agent cycle.
update public.scheduled_jobs
set cron_expression = '15 8 * * *',
    timezone = 'America/Los_Angeles',
    updated_at = now()
where job_key = 'ceo-digest';

-- Monday weekly command is an Avery-only second pass after the normal daily specialist cycle.
update public.scheduled_jobs
set cron_expression = '0 8 * * 1',
    timezone = 'America/Los_Angeles',
    updated_at = now()
where job_key = 'weekly-command-cycle';

-- Expected core morning order after this migration:
-- 07:05 scoreboard-refresh
-- 07:10 intelligence-traffic-quality
-- 07:25 fusion-daily-decision-v1
-- 07:35 daily-agent-cycle (Avery -> Sloan -> Lyra -> Noah)
-- 08:00 weekly-command-cycle on Monday (Avery executive second pass)
-- 08:15 ceo-digest
