-- Revenue intelligence v4: exact FunnelKit coverage truth.
--
-- Raw step rows cannot prove that a requested day was successfully collected because
-- a legitimate zero-activity day has no rows.  Keep a separate successful-day ledger
-- and require exact requested-range proof before FunnelKit can drive decisions.

create table if not exists exec_dashboard.funnelkit_day_coverage_v1 (
  coverage_date date primary key,
  source text not null default 'funnelkit_data_api_v2',
  run_ref text not null,
  row_count integer not null check (row_count >= 0),
  details jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

alter table exec_dashboard.funnelkit_day_coverage_v1 enable row level security;
revoke all on table exec_dashboard.funnelkit_day_coverage_v1 from public, anon, authenticated;
grant select, insert, update, delete on table exec_dashboard.funnelkit_day_coverage_v1 to service_role;

create or replace function public.mark_funnelkit_coverage_day_v1(
  p_coverage_date date,
  p_run_ref text,
  p_row_count integer,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','exec_dashboard'
as $function$
declare
  actual_row_count integer;
  today_pacific date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if p_coverage_date is null then
    raise exception 'coverage_date is required';
  end if;
  if p_coverage_date >= today_pacific then
    raise exception 'coverage_date must be a completed Pacific business day';
  end if;
  if p_run_ref is null or btrim(p_run_ref) = '' then
    raise exception 'run_ref is required';
  end if;
  if p_row_count is null or p_row_count < 0 then
    raise exception 'row_count must be a non-negative integer';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'details must be a JSON object';
  end if;

  select count(*)::integer
    into actual_row_count
  from exec_dashboard.raw_funnelkit_steps
  where collected_at = p_coverage_date;

  if actual_row_count <> p_row_count then
    raise exception 'FunnelKit coverage row-count mismatch for %: persisted %, reported %',
      p_coverage_date, actual_row_count, p_row_count;
  end if;

  insert into exec_dashboard.funnelkit_day_coverage_v1 (
    coverage_date, source, run_ref, row_count, details, ingested_at
  ) values (
    p_coverage_date,
    'funnelkit_data_api_v2',
    p_run_ref,
    p_row_count,
    p_details,
    now()
  )
  on conflict (coverage_date) do update set
    source = excluded.source,
    run_ref = excluded.run_ref,
    row_count = excluded.row_count,
    details = excluded.details,
    ingested_at = excluded.ingested_at;

  return jsonb_build_object(
    'coverageDate', p_coverage_date,
    'rowCount', p_row_count,
    'source', 'funnelkit_data_api_v2',
    'coverageRecorded', true
  );
end;
$function$;

revoke all on function public.mark_funnelkit_coverage_day_v1(date,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.mark_funnelkit_coverage_day_v1(date,text,integer,jsonb) to service_role;

-- The collector uses this to resume.  A day only becomes latest after the raw write
-- succeeded and its row count was independently reconciled above.
create or replace function public.get_funnelkit_latest_date_v2()
returns date
language sql
stable
security definer
set search_path to 'public','exec_dashboard'
as $function$
  select max(coverage_date) from exec_dashboard.funnelkit_day_coverage_v1;
$function$;

revoke all on function public.get_funnelkit_latest_date_v2() from public, anon, authenticated;
grant execute on function public.get_funnelkit_latest_date_v2() to service_role;

-- Do not call FunnelKit fresh merely because a raw row has a recent timestamp.
-- Zero-row completed days are represented by the coverage ledger too.
create or replace view exec_dashboard.vw_telemetry_freshness_v1
with (security_invoker = true) as
with latest as (
  select 'ga4'::text as source, max(event_date) as latest_business_date from exec_dashboard.raw_ga4_events
  union all
  select 'funnelkit', max(coverage_date) from exec_dashboard.funnelkit_day_coverage_v1
  union all
  select 'meta', max(metric_date) from public.meta_account_daily
  union all
  select 'woo', max(paid_pacific_date) from public.woo_order_telemetry_v1 where coalesce(is_deleted,false)=false
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

-- Preserve the existing GA4 fallback, but only use either source when the exact
-- requested date range is present.  FunnelKit uses explicit successful-day proof;
-- GA4 is conservatively required to have at least one raw event row on every day.
create or replace function exec_dashboard.get_funnelkit_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path to 'public','exec_dashboard'
as $function$
with params as (
  select
    start_date as range_start,
    end_date as range_end,
    (start_date is not null and end_date is not null and start_date <= end_date) as valid_range,
    case when start_date is not null and end_date is not null and start_date <= end_date
      then (end_date - start_date + 1)::integer else 0 end as expected_days
), fk_bounds as (
  select max(coverage_date) as source_as_of from exec_dashboard.funnelkit_day_coverage_v1
), fk_coverage as (
  select
    count(*)::integer as covered_days,
    min(coverage_date) as coverage_start,
    max(coverage_date) as coverage_end
  from exec_dashboard.funnelkit_day_coverage_v1
  where coverage_date between start_date and end_date
), ga_bounds as (
  select max(event_date) as source_as_of from exec_dashboard.raw_ga4_events
), ga_coverage as (
  select
    count(distinct event_date)::integer as covered_days,
    min(event_date) as coverage_start,
    max(event_date) as coverage_end
  from exec_dashboard.raw_ga4_events
  where event_date between start_date and end_date
), coverage as (
  select
    p.*,
    fk.source_as_of as fk_as_of,
    fkc.covered_days as fk_covered_days,
    fkc.coverage_start as fk_coverage_start,
    fkc.coverage_end as fk_coverage_end,
    ga.source_as_of as ga_as_of,
    gac.covered_days as ga_covered_days,
    gac.coverage_start as ga_coverage_start,
    gac.coverage_end as ga_coverage_end,
    (p.valid_range and fkc.covered_days = p.expected_days
      and fkc.coverage_start = p.range_start and fkc.coverage_end = p.range_end) as fk_exact,
    (p.valid_range and gac.covered_days = p.expected_days
      and gac.coverage_start = p.range_start and gac.coverage_end = p.range_end) as ga_exact
  from params p
  cross join fk_bounds fk
  cross join fk_coverage fkc
  cross join ga_bounds ga
  cross join ga_coverage gac
), readiness as (
  select
    c.*,
    case
      when c.fk_as_of is null then 'unavailable'
      when c.fk_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 1) then 'fresh'
      when c.fk_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3) then 'degraded'
      else 'stale'
    end as fk_freshness,
    case
      when c.ga_as_of is null then 'unavailable'
      when c.ga_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 1) then 'fresh'
      when c.ga_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3) then 'degraded'
      else 'stale'
    end as ga_freshness
  from coverage c
), fk_source as (
  select * from exec_dashboard.raw_funnelkit_steps where collected_at between start_date and end_date
), fk_ts as (
  select collected_at as bucket,
    coalesce(sum(entries) filter (where step_index=1),0)::numeric as entries,
    coalesce(sum(entries) filter (where step_index=9),0)::numeric as completions,
    coalesce(sum(completions) filter (where step_index=1),0)::numeric as checkout_step_completions
  from fk_source group by collected_at
), fk_agg as (
  select
    coalesce(sum(entries) filter (where step_index=1),0)::numeric as entries,
    coalesce(sum(entries) filter (where step_index=9),0)::numeric as completions,
    coalesce(sum(completions) filter (where step_index=1),0)::numeric as checkout_step_completions,
    coalesce(sum(upsell_offers),0)::numeric as offers,
    coalesce(sum(upsell_accepts),0)::numeric as accepts
  from fk_source
), ga_source as (
  select * from exec_dashboard.vw_ga4_event_quality_v1 where event_date between start_date and end_date
), ga_ts as (
  select event_date as bucket,
    coalesce(sum(event_count) filter (where event_name='begin_checkout'),0)::numeric as entries,
    coalesce(sum(event_count) filter (where event_name='purchase'),0)::numeric as completions
  from ga_source group by event_date
), ga_agg as (
  select
    coalesce(sum(event_count) filter (where event_name='begin_checkout'),0)::numeric as entries,
    coalesce(sum(event_count) filter (where event_name='purchase'),0)::numeric as completions
  from ga_source
), chosen as (
  select
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then 'funnelkit_native'
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then 'ga4_ecommerce_fallback'
      when r.fk_exact then 'funnelkit_native_stale'
      else 'unavailable'
    end as source_name,
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then a.entries
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then g.entries
      when r.fk_exact then a.entries
      else null
    end as entries,
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then a.completions
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then g.completions
      when r.fk_exact then a.completions
      else null
    end as completions,
    case when r.fk_exact then a.checkout_step_completions else null end as checkout_step_completions,
    case when r.fk_exact then a.offers else null end as offers,
    case when r.fk_exact then a.accepts else null end as accepts,
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then r.fk_as_of
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then r.ga_as_of
      when r.fk_exact then r.fk_as_of
      else r.fk_as_of
    end as source_as_of,
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then r.fk_freshness
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then r.ga_freshness
      when r.fk_exact then r.fk_freshness
      else 'unavailable'
    end as freshness,
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then r.fk_coverage_start
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then r.ga_coverage_start
      else r.fk_coverage_start
    end as coverage_start,
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then r.fk_coverage_end
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then r.ga_coverage_end
      else r.fk_coverage_end
    end as coverage_end,
    case
      when r.fk_exact and r.fk_freshness in ('fresh','degraded') then r.fk_covered_days
      when r.ga_exact and r.ga_freshness in ('fresh','degraded') then r.ga_covered_days
      else r.fk_covered_days
    end as covered_days,
    r.expected_days,
    (r.fk_exact and r.fk_freshness not in ('fresh','degraded')) as native_stale,
    (not (r.fk_exact and r.fk_freshness in ('fresh','degraded'))
      and r.ga_exact and r.ga_freshness in ('fresh','degraded')) as fallback,
    (r.fk_exact and r.fk_freshness in ('fresh','degraded'))
      or (r.ga_exact and r.ga_freshness in ('fresh','degraded')) as usable,
    r.fk_exact,
    r.ga_exact
  from readiness r cross join fk_agg a cross join ga_agg g
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'entries', c.entries,
    'completions', c.completions,
    'checkoutStepCompletions', c.checkout_step_completions,
    'conversionRate', case when c.entries>0 then (c.completions/c.entries)*100 else null end,
    'upsellOffers', c.offers,
    'upsellAccepts', c.accepts,
    'upsellTakeRate', case when coalesce(c.offers,0)>0 then (c.accepts/c.offers)*100 else null end,
    'source', c.source_name,
    'fallback', c.fallback,
    'sourceAsOf', c.source_as_of,
    'freshness', c.freshness,
    'completeness', case
      when c.source_name='unavailable' and c.covered_days=0 then 'unknown'
      when c.source_name='unavailable' then 'partial'
      else 'complete'
    end,
    'coverageStart', c.coverage_start,
    'coverageEnd', c.coverage_end,
    'coveredDays', c.covered_days,
    'expectedCoverageDays', c.expected_days,
    'completeThrough', case when c.source_name <> 'unavailable' then end_date else null end,
    'coverageProofVersion', 'exact_daily_presence_v1',
    'dataUsableForCurrentDecisions', c.usable,
    'attributionEstablished', false,
    'causalityEstablished', false,
    'metricDefinitionVersion', 'funnelkit_or_ga4_checkout_fallback_v4'
  ),
  'timeseries', case
    when c.source_name in ('funnelkit_native','funnelkit_native_stale') then coalesce((select jsonb_agg(jsonb_build_object(
      'date',to_char(bucket,'YYYY-MM-DD'),'entries',entries,'completions',completions,
      'checkoutStepCompletions',checkout_step_completions,
      'conversionRate',case when entries>0 then (completions/entries)*100 else null end
    ) order by bucket) from fk_ts),'[]'::jsonb)
    when c.source_name='ga4_ecommerce_fallback' then coalesce((select jsonb_agg(jsonb_build_object(
      'date',to_char(bucket,'YYYY-MM-DD'),'entries',entries,'completions',completions,
      'checkoutStepCompletions',null,
      'conversionRate',case when entries>0 then (completions/entries)*100 else null end
    ) order by bucket) from ga_ts),'[]'::jsonb)
    else '[]'::jsonb
  end
) from chosen c;
$function$;
