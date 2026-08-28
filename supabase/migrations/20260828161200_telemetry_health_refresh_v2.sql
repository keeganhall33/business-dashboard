create or replace function public.refresh_telemetry_health_v2()
returns integer
language plpgsql
security definer
set search_path to 'public','exec_dashboard'
as $function$
declare
  v_count integer := 0;
begin
  insert into public.telemetry_health_events(
    source, observed_at, requested_start_date, requested_end_date,
    health_status, freshness_status, coverage_status, warning_codes, fallback, metadata
  )
  select
    source,
    now(),
    ((now() at time zone 'America/Los_Angeles')::date - 7),
    ((now() at time zone 'America/Los_Angeles')::date - 1),
    case when freshness_status='fresh' then 'healthy' when freshness_status='degraded' then 'warning' else 'critical' end,
    freshness_status,
    case when freshness_status='fresh' then 'complete' else 'partial' end,
    case when freshness_status='fresh' then '{}'::text[] else array['source_stale','cross_source_comparison_blocked']::text[] end,
    false,
    jsonb_build_object(
      'latestBusinessDate', latest_business_date,
      'ageDays', age_days,
      'source', 'vw_telemetry_freshness_v1',
      'metricTruthVersion', '2026-08-28-v2'
    )
  from exec_dashboard.vw_telemetry_freshness_v1;
  get diagnostics v_count = row_count;

  update public.scheduled_jobs
     set last_run_at = now(),
         next_run_at = now() + interval '1 hour',
         updated_at = now()
   where job_key = 'telemetry-health-monitor';

  return v_count;
end;
$function$;

revoke all on function public.refresh_telemetry_health_v2() from public;
revoke all on function public.refresh_telemetry_health_v2() from anon;
revoke all on function public.refresh_telemetry_health_v2() from authenticated;
grant execute on function public.refresh_telemetry_health_v2() to service_role;

select cron.unschedule(jobid) from cron.job where jobname='telemetry-health-refresh-v2';
select cron.schedule('telemetry-health-refresh-v2','7 * * * *','select public.refresh_telemetry_health_v2();');
