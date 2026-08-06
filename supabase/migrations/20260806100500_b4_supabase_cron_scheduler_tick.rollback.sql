begin;

-- Rollback Phase B4.3 Supabase pg_cron trigger foundation.
-- Unschedules only the canonical production scheduler tick job.

do $$
declare
  v_job record;
begin
  -- Idempotent: unschedule all matching canonical jobs if present.
  for v_job in (
    select jobid from cron.job where jobname = 'production-scheduler-tick-v1'
  ) loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

drop function if exists public.run_production_scheduler_tick_v1();

commit;
