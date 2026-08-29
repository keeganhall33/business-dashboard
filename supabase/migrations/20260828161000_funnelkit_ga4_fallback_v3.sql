create or replace function exec_dashboard.get_funnelkit_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path to 'public','exec_dashboard'
as $function$
with fk_bounds as (
  select max(collected_at) as source_as_of from exec_dashboard.raw_funnelkit_steps
), ga_bounds as (
  select max(event_date) as source_as_of from exec_dashboard.raw_ga4_events
), freshness as (
  select
    fk.source_as_of as fk_as_of,
    ga.source_as_of as ga_as_of,
    (fk.source_as_of is not null and fk.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3)) as fk_usable,
    (ga.source_as_of is not null and ga.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3)) as ga_usable
  from fk_bounds fk cross join ga_bounds ga
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
    case when f.fk_usable then 'funnelkit_native' when f.ga_usable then 'ga4_ecommerce_fallback' else 'funnelkit_native_stale' end as source_name,
    case when f.fk_usable then a.entries when f.ga_usable then g.entries else a.entries end as entries,
    case when f.fk_usable then a.completions when f.ga_usable then g.completions else a.completions end as completions,
    case when f.fk_usable then a.checkout_step_completions else null end as checkout_step_completions,
    case when f.fk_usable then a.offers else null end as offers,
    case when f.fk_usable then a.accepts else null end as accepts,
    case when f.fk_usable then f.fk_as_of when f.ga_usable then f.ga_as_of else f.fk_as_of end as source_as_of,
    (not f.fk_usable and f.ga_usable) as fallback,
    (f.fk_usable or f.ga_usable) as usable
  from freshness f cross join fk_agg a cross join ga_agg g
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
    'freshness', case when c.usable then 'fresh' else 'stale' end,
    'completeness', case when c.source_as_of is null then 'unknown' when end_date>c.source_as_of then 'partial' else 'complete' end,
    'dataUsableForCurrentDecisions', (c.usable and end_date<=c.source_as_of),
    'metricDefinitionVersion', 'funnelkit_or_ga4_checkout_fallback_v3'
  ),
  'timeseries', case
    when c.source_name='funnelkit_native' then coalesce((select jsonb_agg(jsonb_build_object(
      'date',to_char(bucket,'YYYY-MM-DD'),'entries',entries,'completions',completions,
      'checkoutStepCompletions',checkout_step_completions,
      'conversionRate',case when entries>0 then (completions/entries)*100 else null end
    ) order by bucket) from fk_ts),'[]'::jsonb)
    when c.source_name='ga4_ecommerce_fallback' then coalesce((select jsonb_agg(jsonb_build_object(
      'date',to_char(bucket,'YYYY-MM-DD'),'entries',entries,'completions',completions,
      'checkoutStepCompletions',null,
      'conversionRate',case when entries>0 then (completions/entries)*100 else null end
    ) order by bucket) from ga_ts),'[]'::jsonb)
    else coalesce((select jsonb_agg(jsonb_build_object(
      'date',to_char(bucket,'YYYY-MM-DD'),'entries',entries,'completions',completions,
      'checkoutStepCompletions',checkout_step_completions,
      'conversionRate',case when entries>0 then (completions/entries)*100 else null end
    ) order by bucket) from fk_ts),'[]'::jsonb)
  end
) from chosen c;
$function$;
