-- Treat the canonical Woo warehouse as complete when successful ingestion runs
-- collectively prove every completed Pacific day in the requested range.
--
-- The previous function required one run to cover the entire range. Daily
-- incremental runs therefore caused valid database totals to be reported as
-- unknown even when their combined coverage was continuous.

create or replace function public.get_woo_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select least(
      end_date,
      (now() at time zone 'America/Los_Angeles')::date - 1
    ) as completed_end
  ),
  successful_runs as (
    select *
    from woo_ingestion_runs_v1
    where status = 'success'
      and definition_version = 'woo_paid_net_v1'
      and proven_coverage_start is not null
      and proven_coverage_end is not null
  ),
  requested_days as (
    select generate_series(start_date, (select completed_end from requested), interval '1 day')::date as day
    where start_date <= (select completed_end from requested)
  ),
  coverage as (
    select
      (select min(proven_coverage_start) from successful_runs) as coverage_start,
      (select max(proven_coverage_end) from successful_runs) as coverage_end,
      (select max(coalesce(source_as_of_gmt, completed_at)) from successful_runs) as as_of,
      not exists (
        select 1
        from requested_days d
        where not exists (
          select 1
          from successful_runs r
          where d.day between r.proven_coverage_start and r.proven_coverage_end
        )
      ) as completed_days_covered
  ),
  orders as (
    select *
    from woo_order_telemetry_v1
    where paid_pacific_date between start_date and end_date
      and is_deleted = false
      and status in ('completed', 'processing')
  ),
  ts as (
    select
      paid_pacific_date as bucket,
      coalesce(sum(net_revenue_cents), 0)::numeric / 100 as revenue,
      count(*)::numeric as orders
    from orders
    group by paid_pacific_date
    order by bucket
  ),
  agg as (
    select
      count(*)::numeric as orders,
      coalesce(sum(gross_total_cents), 0)::numeric / 100 as gross_revenue,
      coalesce(sum(refunded_cents), 0)::numeric / 100 as refunded,
      coalesce(sum(net_revenue_cents), 0)::numeric / 100 as revenue,
      coalesce(sum(discount_cents), 0)::numeric / 100 as discounts,
      coalesce(sum(shipping_cents), 0)::numeric / 100 as shipping,
      coalesce(sum(tax_cents), 0)::numeric / 100 as taxes
    from orders
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'orders', orders,
      'revenue', revenue,
      'avgOrderValue', case when orders > 0 then revenue / orders else null end,
      'discountTotal', discounts,
      'shippingTotal', shipping,
      'taxTotal', taxes,
      'items', orders,
      'grossRevenue', gross_revenue,
      'refundedTotal', refunded,
      'netRevenue', revenue,
      'definitionVersion', 'woo_paid_net_v2',
      'source', 'canonical_woo_order_telemetry',
      'completeness', case
        when not (select completed_days_covered from coverage) then 'unknown'
        when (select as_of from coverage) is null then 'unknown'
        when (select as_of from coverage) < (now() - interval '48 hours') then 'unknown'
        else 'complete'
      end,
      'asOf', (select as_of from coverage),
      'coverageStart', (select coverage_start from coverage),
      'coverageEnd', (select coverage_end from coverage),
      'comparisonAvailable', (select completed_days_covered from coverage)
    ),
    'timeseries', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'revenue', revenue,
        'orders', orders
      ) order by bucket) from ts),
      '[]'::jsonb
    )
  )
  from agg;
$$;

revoke all on function public.get_woo_metrics(date, date) from public;
revoke all on function public.get_woo_metrics(date, date) from anon;
revoke all on function public.get_woo_metrics(date, date) from authenticated;
grant execute on function public.get_woo_metrics(date, date) to service_role;
