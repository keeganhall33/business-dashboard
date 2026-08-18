-- Retire quota-driven idea autonomy.
--
-- agent_ideas remains the human-managed idea board product surface. The retired
-- daily quota view supported autonomous "one idea per agent per day" enforcement,
-- which is no longer part of the active Career OS + Fusion + Avery architecture.

drop view if exists public.agent_daily_idea_quota;

update public.scheduled_jobs
set
  job_name = 'Agent KPI Pulse',
  updated_at = now()
where job_key = 'agent-idea-pulse'
  and job_name = 'Agent Idea Pulse';
