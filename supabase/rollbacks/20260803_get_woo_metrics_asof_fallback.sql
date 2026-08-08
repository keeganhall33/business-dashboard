-- Rollback: restore get_woo_metrics().summary.asOf to provider-only timestamp.

create or replace function get_woo_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest_run as (
    select *
    from woo_ingestion_runs_v1
    where status = 'success'
      and definition_version = 'woo_paid_net_v1'
      and proven_coverage_start is not null
      and start_date >= proven_coverage_start
      and end_date <= proven_coverage_end
    order by completed_at desc
    limit 1
  ),
  orders as (
    select *
    from woo_order_telemetry_v1
    where paid_pacific_date between start_date and end_date
      and is_deleted = false
      and status in ('completed','processing')
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
  ),
  coverage as (
    select
      (select proven_coverage_start from latest_run) as coverage_start,
      (select proven_coverage_end from latest_run) as coverage_end,
      (select source_as_of_gmt from latest_run) as as_of
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'orders', orders,
      'revenue', revenue,
      'avgOrderValue', case when (select as_of from coverage) is not null and orders > 0 then revenue / orders else null end,
      'discountTotal', discounts,
      'shippingTotal', shipping,
      'taxTotal', taxes,
      'items', orders,
      'grossRevenue', gross_revenue,
      'refundedTotal', refunded,
      'netRevenue', revenue,
      'definitionVersion', 'woo_paid_net_v1',
      'source', 'selected_range_telemetry',
      'completeness', case
        when (select as_of from coverage) is null then 'unknown'
        when (select as_of from coverage) < (now() - interval '48 hours') then 'unknown'
        else 'complete'
      end,
      'asOf', (select as_of from coverage),
      'coverageStart', (select coverage_start from coverage),
      'coverageEnd', (select coverage_end from coverage),
      'comparisonAvailable', false
    ),
    'timeseries', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'revenue', revenue,
        'orders', orders
      )) from ts), '[]'::jsonb)
  )
  from agg;
$$;
