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
  v_url constant text := 'https://mission.keeganhall.com/api/scheduler/tick';
  v_secret text;
  v_secret_rows integer;
  v_headers jsonb;
  v_request_id bigint;
begin
  -- Vault contract: exactly one canonical secret row must exist.
  -- We intentionally do not include any decrypted value in errors/notices.
  select count(*) into v_secret_rows
  from vault.decrypted_secrets
  where name = 'scheduler_secret';

  if v_secret_rows <> 1 then
    raise exception using message = 'scheduler_secret_unavailable';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'scheduler_secret'
  limit 1;

  if v_secret is null or length(v_secret) = 0 then
    raise exception using message = 'scheduler_secret_unavailable';
  end if;

  v_headers := jsonb_build_object(
    'Authorization', 'Bearer ' || v_secret,
    'Content-Type', 'application/json'
  );

  -- pg_net is async: capture the queued request id.
  select net.http_post(
    url := v_url,
    headers := v_headers,
    body := '{}'::jsonb
  ) into v_request_id;

  if v_request_id is null then
    raise exception using message = 'scheduler_tick_request_not_queued';
  end if;
end;
$$;

revoke all on function public.run_production_scheduler_tick_v1() from public;
revoke all on function public.run_production_scheduler_tick_v1() from anon;
revoke all on function public.run_production_scheduler_tick_v1() from authenticated;
grant execute on function public.run_production_scheduler_tick_v1() to service_role;

-- Create exactly one cron job (every 5 minutes).
-- Use jobname uniqueness to avoid duplicates.
do $$
declare
  v_job record;
begin
  -- True idempotency: remove any existing job with the canonical name before rescheduling.
  for v_job in (
    select jobid from cron.job where jobname = 'production-scheduler-tick-v1'
  ) loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    job_name := 'production-scheduler-tick-v1',
    schedule := '*/5 * * * *',
    command := $$select public.run_production_scheduler_tick_v1();$$
  );
end;
$$;

commit;
