-- Canonical ecommerce truth layer introduced after the 2026-08-28 Meta funnel audit.
-- Preserve raw telemetry, flag suspicious ATC aggregates, and surface source freshness.

create or replace view exec_dashboard.vw_ga4_event_quality_v1
with (security_invoker = true) as
select
  e.*,
  case
    when e.event_name = 'add_to_cart'
      and e.device_category = 'desktop'
      and coalesce(e.traffic_source, '') in ('(direct) / (none)', '(not set)')
      and (e.page_path = '/cart/' or e.page_path like '/product-category/%')
      and coalesce(e.engaged_sessions, 0)::numeric / nullif(coalesce(e.sessions, 0), 0) < 0.25
    then 'suspect_automation'
    else 'validated'
  end as quality_status,
  case
    when e.event_name = 'add_to_cart'
      and e.device_category = 'desktop'
      and coalesce(e.traffic_source, '') in ('(direct) / (none)', '(not set)')
      and (e.page_path = '/cart/' or e.page_path like '/product-category/%')
      and coalesce(e.engaged_sessions, 0)::numeric / nullif(coalesce(e.sessions, 0), 0) < 0.25
    then 'desktop direct/not-set add_to_cart on cart/category page with <25% engaged-session ratio'
    else null
  end as quality_reason
from exec_dashboard.raw_ga4_events e;

create or replace view exec_dashboard.vw_ga4_funnel_daily_quality_v1
with (security_invoker = true) as
select
  event_date,
  sum(event_count) filter (where event_name = 'add_to_cart')::bigint as raw_add_to_cart,
  sum(event_count) filter (where event_name = 'add_to_cart' and quality_status = 'validated')::bigint as validated_add_to_cart,
  sum(event_count) filter (where event_name = 'add_to_cart' and quality_status = 'suspect_automation')::bigint as excluded_suspect_add_to_cart,
  sum(event_count) filter (where event_name in ('begin_checkout','WooFunnels_Checkout'))::bigint as raw_checkout_signals,
  sum(event_count) filter (where event_name = 'begin_checkout')::bigint as begin_checkout,
  sum(event_count) filter (where event_name = 'purchase')::bigint as purchases,
  sum(sessions) filter (where event_name = 'session_start')::bigint as sessions,
  sum(engaged_sessions) filter (where event_name = 'session_start')::bigint as engaged_sessions
from exec_dashboard.vw_ga4_event_quality_v1
group by event_date;

create or replace view exec_dashboard.vw_telemetry_freshness_v1
with (security_invoker = true) as
with latest as (
  select 'ga4'::text as source, max(event_date) as latest_business_date from exec_dashboard.raw_ga4_events
  union all
  select 'funnelkit', max(collected_at) from exec_dashboard.raw_funnelkit_steps
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

create or replace function exec_dashboard.get_ga4_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path to 'public','exec_dashboard'
as $function$
with bounds as (
  select max(event_date) as source_as_of from exec_dashboard.raw_ga4_events
), source as (
  select * from exec_dashboard.vw_ga4_event_quality_v1
  where event_date between start_date and end_date
), ts as (
  select
    event_date as bucket,
    coalesce(sum(sessions) filter (where event_name='session_start'),0)::numeric as sessions,
    coalesce(sum(engaged_sessions) filter (where event_name='session_start'),0)::numeric as engaged_sessions,
    coalesce(sum(event_count) filter (where event_name='add_to_cart'),0)::numeric as raw_add_to_cart,
    coalesce(sum(event_count) filter (where event_name='add_to_cart' and quality_status='validated'),0)::numeric as validated_add_to_cart,
    coalesce(sum(event_count) filter (where event_name='begin_checkout'),0)::numeric as begin_checkout,
    coalesce(sum(event_count) filter (where event_name='purchase'),0)::numeric as purchases,
    coalesce(sum(revenue) filter (where event_name='purchase'),0)::numeric as revenue
  from source group by event_date order by event_date
), agg as (
  select
    coalesce(sum(sessions) filter (where event_name='session_start'),0)::numeric as sessions,
    coalesce(sum(engaged_sessions) filter (where event_name='session_start'),0)::numeric as engaged_sessions,
    coalesce(sum(event_count),0)::numeric as events,
    coalesce(sum(event_count) filter (where event_name='add_to_cart'),0)::numeric as raw_add_to_cart,
    coalesce(sum(event_count) filter (where event_name='add_to_cart' and quality_status='validated'),0)::numeric as validated_add_to_cart,
    coalesce(sum(event_count) filter (where event_name='add_to_cart' and quality_status='suspect_automation'),0)::numeric as excluded_add_to_cart,
    coalesce(sum(event_count) filter (where event_name='begin_checkout'),0)::numeric as begin_checkout,
    coalesce(sum(event_count) filter (where event_name='purchase'),0)::numeric as purchases,
    coalesce(avg(user_engagement_duration_ms) filter (where event_name='user_engagement'),0)::numeric as avg_engagement_ms,
    coalesce(sum(revenue) filter (where event_name='purchase'),0)::numeric as revenue
  from source
), q as (
  select
    b.source_as_of,
    case
      when b.source_as_of is null then 'unavailable'
      when b.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 1) then 'fresh'
      when b.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3) then 'degraded'
      else 'stale'
    end as freshness,
    case
      when b.source_as_of is null then 'unknown'
      when end_date > b.source_as_of then 'partial'
      else 'complete'
    end as completeness
  from bounds b
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'sessions', a.sessions,
    'engagedSessions', a.engaged_sessions,
    'eventCount', a.events,
    'avgEngagementSeconds', case when a.avg_engagement_ms>0 then a.avg_engagement_ms/1000 else null end,
    'revenue', a.revenue,
    'rawAddToCart', a.raw_add_to_cart,
    'validatedAddToCart', a.validated_add_to_cart,
    'excludedSuspectAddToCart', a.excluded_add_to_cart,
    'beginCheckout', a.begin_checkout,
    'purchases', a.purchases,
    'addToCartToCheckoutRate', case when a.validated_add_to_cart>0 then (a.begin_checkout/a.validated_add_to_cart)*100 else null end,
    'sourceAsOf', q.source_as_of,
    'freshness', q.freshness,
    'completeness', q.completeness,
    'dataUsableForCurrentDecisions', (q.freshness in ('fresh','degraded') and q.completeness='complete'),
    'metricDefinitionVersion','ga4_validated_funnel_v2'
  ),
  'timeseries', coalesce((select jsonb_agg(jsonb_build_object(
    'date',to_char(bucket,'YYYY-MM-DD'),'sessions',sessions,'engagedSessions',engaged_sessions,
    'rawAddToCart',raw_add_to_cart,'validatedAddToCart',validated_add_to_cart,
    'beginCheckout',begin_checkout,'purchases',purchases,'revenue',revenue
  )) from ts),'[]'::jsonb)
) from agg a cross join q;
$function$;

create or replace function exec_dashboard.get_funnelkit_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path to 'public','exec_dashboard'
as $function$
with bounds as (
  select max(collected_at) as source_as_of from exec_dashboard.raw_funnelkit_steps
), source as (
  select * from exec_dashboard.raw_funnelkit_steps where collected_at between start_date and end_date
), ts as (
  select
    collected_at as bucket,
    coalesce(sum(entries) filter (where step_index=1),0)::numeric as checkout_entries,
    coalesce(sum(entries) filter (where step_index=9),0)::numeric as thank_you_entries,
    coalesce(sum(completions) filter (where step_index=1),0)::numeric as checkout_step_completions
  from source group by collected_at order by collected_at
), agg as (
  select
    coalesce(sum(entries) filter (where step_index=1),0)::numeric as checkout_entries,
    coalesce(sum(entries) filter (where step_index=9),0)::numeric as thank_you_entries,
    coalesce(sum(completions) filter (where step_index=1),0)::numeric as checkout_step_completions,
    coalesce(sum(upsell_offers),0)::numeric as offers,
    coalesce(sum(upsell_accepts),0)::numeric as accepts
  from source
), q as (
  select b.source_as_of,
    case when b.source_as_of is null then 'unavailable'
      when b.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 1) then 'fresh'
      when b.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3) then 'degraded'
      else 'stale' end as freshness,
    case when b.source_as_of is null then 'unknown' when end_date>b.source_as_of then 'partial' else 'complete' end as completeness
  from bounds b
)
select jsonb_build_object(
  'summary',jsonb_build_object(
    'entries',a.checkout_entries,
    'completions',a.thank_you_entries,
    'checkoutStepCompletions',a.checkout_step_completions,
    'conversionRate',case when a.checkout_entries>0 then (a.thank_you_entries/a.checkout_entries)*100 else null end,
    'upsellOffers',a.offers,'upsellAccepts',a.accepts,
    'upsellTakeRate',case when a.offers>0 then (a.accepts/a.offers)*100 else null end,
    'sourceAsOf',q.source_as_of,'freshness',q.freshness,'completeness',q.completeness,
    'dataUsableForCurrentDecisions',(q.freshness in ('fresh','degraded') and q.completeness='complete'),
    'metricDefinitionVersion','funnelkit_checkout_to_thankyou_v2'
  ),
  'timeseries',coalesce((select jsonb_agg(jsonb_build_object(
    'date',to_char(bucket,'YYYY-MM-DD'),'entries',checkout_entries,'completions',thank_you_entries,
    'checkoutStepCompletions',checkout_step_completions,
    'conversionRate',case when checkout_entries>0 then (thank_you_entries/checkout_entries)*100 else null end
  )) from ts),'[]'::jsonb)
) from agg a cross join q;
$function$;
