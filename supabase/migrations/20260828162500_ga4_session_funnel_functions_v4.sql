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
  select event_date as bucket,
    coalesce(sum(sessions) filter (where event_name='session_start'),0)::numeric as sessions,
    coalesce(sum(engaged_sessions) filter (where event_name='session_start'),0)::numeric as engaged_sessions,
    coalesce(sum(event_count) filter (where event_name='add_to_cart'),0)::numeric as raw_add_to_cart_events,
    coalesce(sum(sessions) filter (where event_name='add_to_cart' and quality_status <> 'suspect_automation'),0)::numeric as validated_add_to_cart_sessions,
    coalesce(sum(event_count) filter (where event_name='begin_checkout'),0)::numeric as raw_begin_checkout_events,
    coalesce(sum(sessions) filter (where event_name='begin_checkout'),0)::numeric as validated_begin_checkout_sessions,
    coalesce(sum(event_count) filter (where event_name='purchase'),0)::numeric as raw_purchase_events,
    coalesce(sum(sessions) filter (where event_name='purchase'),0)::numeric as purchase_sessions,
    coalesce(sum(revenue) filter (where event_name='purchase'),0)::numeric as revenue
  from source group by event_date order by event_date
), agg as (
  select coalesce(sum(sessions) filter (where event_name='session_start'),0)::numeric as sessions,
    coalesce(sum(engaged_sessions) filter (where event_name='session_start'),0)::numeric as engaged_sessions,
    coalesce(sum(event_count),0)::numeric as events,
    coalesce(sum(event_count) filter (where event_name='add_to_cart'),0)::numeric as raw_add_to_cart_events,
    coalesce(sum(sessions) filter (where event_name='add_to_cart' and quality_status <> 'suspect_automation'),0)::numeric as validated_add_to_cart_sessions,
    coalesce(sum(event_count) filter (where event_name='add_to_cart' and quality_status='suspect_automation'),0)::numeric as excluded_add_to_cart_events,
    coalesce(sum(event_count) filter (where event_name='begin_checkout'),0)::numeric as raw_begin_checkout_events,
    coalesce(sum(sessions) filter (where event_name='begin_checkout'),0)::numeric as validated_begin_checkout_sessions,
    coalesce(sum(event_count) filter (where event_name='purchase'),0)::numeric as raw_purchase_events,
    coalesce(sum(sessions) filter (where event_name='purchase'),0)::numeric as purchase_sessions,
    coalesce(avg(user_engagement_duration_ms) filter (where event_name='user_engagement'),0)::numeric as avg_engagement_ms,
    coalesce(sum(revenue) filter (where event_name='purchase'),0)::numeric as revenue
  from source
), q as (
  select b.source_as_of,
    case when b.source_as_of is null then 'unavailable'
      when b.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 1) then 'fresh'
      when b.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3) then 'degraded'
      else 'stale' end as freshness,
    case when b.source_as_of is null then 'unknown' when end_date > b.source_as_of then 'partial' else 'complete' end as completeness
  from bounds b
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'sessions',a.sessions,'engagedSessions',a.engaged_sessions,'eventCount',a.events,
    'avgEngagementSeconds',case when a.avg_engagement_ms>0 then a.avg_engagement_ms/1000 else null end,
    'revenue',a.revenue,'rawAddToCart',a.raw_add_to_cart_events,'rawAddToCartEvents',a.raw_add_to_cart_events,
    'validatedAddToCart',a.validated_add_to_cart_sessions,'validatedAddToCartSessions',a.validated_add_to_cart_sessions,
    'excludedSuspectAddToCart',a.excluded_add_to_cart_events,
    'rawBeginCheckoutEvents',a.raw_begin_checkout_events,'beginCheckout',a.validated_begin_checkout_sessions,
    'validatedBeginCheckoutSessions',a.validated_begin_checkout_sessions,
    'rawPurchaseEvents',a.raw_purchase_events,'purchases',a.purchase_sessions,'purchaseSessions',a.purchase_sessions,
    'addToCartToCheckoutRate',case when a.validated_add_to_cart_sessions>0 then (a.validated_begin_checkout_sessions/a.validated_add_to_cart_sessions)*100 else null end,
    'checkoutToPurchaseRate',case when a.validated_begin_checkout_sessions>0 then (a.purchase_sessions/a.validated_begin_checkout_sessions)*100 else null end,
    'sourceAsOf',q.source_as_of,'freshness',q.freshness,'completeness',q.completeness,
    'dataUsableForCurrentDecisions',(q.freshness in ('fresh','degraded') and q.completeness='complete'),
    'metricDefinitionVersion','ga4_validated_session_funnel_v4'
  ),
  'timeseries',coalesce((select jsonb_agg(jsonb_build_object(
    'date',to_char(bucket,'YYYY-MM-DD'),'sessions',sessions,'engagedSessions',engaged_sessions,
    'rawAddToCartEvents',raw_add_to_cart_events,'validatedAddToCartSessions',validated_add_to_cart_sessions,
    'rawBeginCheckoutEvents',raw_begin_checkout_events,'validatedBeginCheckoutSessions',validated_begin_checkout_sessions,
    'rawPurchaseEvents',raw_purchase_events,'purchaseSessions',purchase_sessions,'revenue',revenue
  ) order by bucket) from ts),'[]'::jsonb)
) from agg a cross join q;
$function$;

create or replace function exec_dashboard.get_funnelkit_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path to 'public','exec_dashboard'
as $function$
with fk_bounds as (select max(collected_at) as source_as_of from exec_dashboard.raw_funnelkit_steps),
ga_bounds as (select max(event_date) as source_as_of from exec_dashboard.raw_ga4_events),
freshness as (
  select fk.source_as_of as fk_as_of,ga.source_as_of as ga_as_of,
    (fk.source_as_of is not null and fk.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3)) as fk_usable,
    (ga.source_as_of is not null and ga.source_as_of >= ((now() at time zone 'America/Los_Angeles')::date - 3)) as ga_usable
  from fk_bounds fk cross join ga_bounds ga
), fk_source as (select * from exec_dashboard.raw_funnelkit_steps where collected_at between start_date and end_date),
fk_agg as (
  select coalesce(sum(entries) filter (where step_index=1),0)::numeric as entries,
    coalesce(sum(entries) filter (where step_index=9),0)::numeric as completions,
    coalesce(sum(completions) filter (where step_index=1),0)::numeric as checkout_step_completions,
    coalesce(sum(upsell_offers),0)::numeric as offers,coalesce(sum(upsell_accepts),0)::numeric as accepts from fk_source
), ga_agg as (
  select coalesce(sum(sessions) filter (where event_name='begin_checkout'),0)::numeric as entries,
    coalesce(sum(sessions) filter (where event_name='purchase'),0)::numeric as completions
  from exec_dashboard.vw_ga4_event_quality_v1 where event_date between start_date and end_date
), chosen as (
  select case when f.fk_usable then 'funnelkit_native' when f.ga_usable then 'ga4_session_fallback' else 'funnelkit_native_stale' end as source_name,
    case when f.fk_usable then a.entries when f.ga_usable then g.entries else a.entries end as entries,
    case when f.fk_usable then a.completions when f.ga_usable then g.completions else a.completions end as completions,
    case when f.fk_usable then a.checkout_step_completions else null end as checkout_step_completions,
    case when f.fk_usable then a.offers else null end as offers,case when f.fk_usable then a.accepts else null end as accepts,
    case when f.fk_usable then f.fk_as_of when f.ga_usable then f.ga_as_of else f.fk_as_of end as source_as_of,
    (not f.fk_usable and f.ga_usable) as fallback,(f.fk_usable or f.ga_usable) as usable
  from freshness f cross join fk_agg a cross join ga_agg g
)
select jsonb_build_object('summary',jsonb_build_object(
  'entries',c.entries,'completions',c.completions,'checkoutStepCompletions',c.checkout_step_completions,
  'conversionRate',case when c.entries>0 then (c.completions/c.entries)*100 else null end,
  'upsellOffers',c.offers,'upsellAccepts',c.accepts,'upsellTakeRate',case when coalesce(c.offers,0)>0 then (c.accepts/c.offers)*100 else null end,
  'source',c.source_name,'fallback',c.fallback,'sourceAsOf',c.source_as_of,
  'freshness',case when c.usable then 'fresh' else 'stale' end,
  'completeness',case when c.source_as_of is null then 'unknown' when end_date>c.source_as_of then 'partial' else 'complete' end,
  'dataUsableForCurrentDecisions',(c.usable and end_date<=c.source_as_of),
  'metricDefinitionVersion','funnelkit_or_ga4_session_fallback_v4'
),'timeseries','[]'::jsonb) from chosen c;
$function$;
