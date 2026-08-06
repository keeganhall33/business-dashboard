begin;

-- Rollback Phase B4.3 Supabase pg_cron trigger foundation.
-- Unschedules only the canonical production scheduler tick job.

do $$
declare
  v_job_id integer;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'production-scheduler-tick-v1'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

drop function if exists public.run_production_scheduler_tick_v1();

commit;
