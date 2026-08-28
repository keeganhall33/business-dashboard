create or replace view exec_dashboard.vw_telemetry_freshness_v1
with (security_invoker = true) as
with latest as (
  select 'ga4'::text as source, max(event_date) as latest_business_date from exec_dashboard.raw_ga4_events
  union all
  select 'funnelkit', max(collected_at) from exec_dashboard.raw_funnelkit_steps
  union all
  select 'meta', max(metric_date) from public.meta_account_daily
  union all
  select 'woo', max((source_as_of_gmt at time zone 'America/Los_Angeles')::date)
    from public.woo_ingestion_runs_v1 where status='success'
), business_clock as (
  select (now() at time zone 'America/Los_Angeles')::date as today_pacific
)
select
  l.source,
  l.latest_business_date,
  b.today_pacific,
  case when l.latest_business_date is null then null else b.today_pacific - l.latest_business_date end as age_days,
  case
    when l.latest_business_date is null then 'unavailable'
    when l.latest_business_date >= b.today_pacific - 1 then 'fresh'
    when l.latest_business_date >= b.today_pacific - 3 then 'degraded'
    else 'stale'
  end as freshness_status
from latest l cross join business_clock b;
