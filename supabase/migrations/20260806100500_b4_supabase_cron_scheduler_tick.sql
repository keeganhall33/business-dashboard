begin;

-- Phase B4.3: Supabase pg_cron trigger foundation.
-- Creates one canonical cron job that wakes the existing scheduler tick endpoint every 5 minutes.
--
-- NOTE: This migration does NOT enable any B4 internal orchestration jobs and does NOT create any
-- scheduled_jobs heartbeat rows.
--
-- Secret handling:
-- - The bearer secret MUST be stored in Supabase Vault separately (out-of-band), under a named
--   vault secret (see runbook).
-- - This migration does not embed secrets.

-- Required extensions (only if permitted in the target project).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Canonical trigger identity.
-- Keep this stable so replays can be idempotent and rollback can target only this job.
create or replace function public.run_production_scheduler_tick_v1()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := 'https://mission.keeganhall.com/api/scheduler/tick';
  v_secret text;
  v_headers jsonb;
begin
  -- Retrieve bearer secret from Supabase Vault at execution time.
  -- The secret name MUST match the stored vault secret name.
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'SCHEDULER_SECRET'
  limit 1;

  if v_secret is null or length(v_secret) = 0 then
    raise exception 'missing_scheduler_secret';
  end if;

  v_headers := jsonb_build_object(
    'Authorization', 'Bearer ' || v_secret,
    'Content-Type', 'application/json'
  );

  -- Fire-and-forget POST. Failures are recorded by pg_net request logs.
  perform net.http_post(
    url := v_url,
    headers := v_headers,
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.run_production_scheduler_tick_v1() from public;
revoke all on function public.run_production_scheduler_tick_v1() from anon;
revoke all on function public.run_production_scheduler_tick_v1() from authenticated;
grant execute on function public.run_production_scheduler_tick_v1() to service_role;

-- Create exactly one cron job (every 5 minutes).
-- Use jobname uniqueness to avoid duplicates.
select cron.schedule(
  job_name := 'production-scheduler-tick-v1',
  schedule := '*/5 * * * *',
  command := $$select public.run_production_scheduler_tick_v1();$$
);

commit;
