-- PURPOSE: Range-bucket WooCommerce metrics for the executive dashboard (revenue, orders, AOV, time series).
-- DEPENDS ON: exec_dashboard.raw_woocommerce_orders (created_at, status, totals, currency, etc.)
-- EFFECT: Executing this file changes the database by CREATE OR REPLACE FUNCTION get_woo_metrics(start_date, end_date).
-- REVIEW: This is preserved reference SQL; review before applying in production or turning into a migration.

create or replace function get_woo_metrics(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public, exec_dashboard
as $$
  with coverage as (
    select
      min(created_at)::date as min_date,
      max(created_at)::date as max_date
    from exec_dashboard.raw_woocommerce_orders
  ),
  bounds as (
    select
      start_date as requested_start,
      end_date as requested_end,
      case
        when coverage.min_date is null then start_date
        else least(greatest(start_date, coverage.min_date), end_date)
      end as effective_start,
      coverage.min_date,
      coverage.max_date
    from coverage
  ),
  filtered_orders as (
    select o.*
    from exec_dashboard.raw_woocommerce_orders o
    cross join bounds b
    where o.created_at::date between b.effective_start and b.requested_end
      and coalesce(o.status, '') not in ('trash','refunded','cancelled','failed')
  ),
  bucket_plan as (
    select
      *,
      case
        when (requested_end - requested_start + 1) <= 45 then 'day'
        when (requested_end - requested_start + 1) <= 200 then 'week'
        else 'month'
      end as bucket_size,
      case
        when (requested_end - requested_start + 1) <= 45 then effective_start
        when (requested_end - requested_start + 1) <= 200 then date_trunc('week', effective_start)::date
        else date_trunc('month', effective_start)::date
      end as series_start,
      case
        when (requested_end - requested_start + 1) <= 45 then requested_end
        when (requested_end - requested_start + 1) <= 200 then date_trunc('week', requested_end)::date
        else date_trunc('month', requested_end)::date
      end as series_end,
      case
        when (requested_end - requested_start + 1) <= 45 then interval '1 day'
        when (requested_end - requested_start + 1) <= 200 then interval '1 week'
        else interval '1 month'
      end as step_interval
    from bounds
  ),
  order_stats as (
    select
      count(*)::numeric as orders,
      coalesce(sum(total), 0)::numeric as revenue,
      coalesce(sum(discount_total), 0)::numeric as discounts,
      coalesce(sum(shipping_total), 0)::numeric as shipping,
      coalesce(sum(tax_total), 0)::numeric as taxes,
      coalesce(sum(total_items), 0)::numeric as items,
      max(coalesce(updated_at, created_at)) as last_refreshed_at
    from filtered_orders
  ),
  series as (
    select generate_series(series_start, series_end, step_interval)::date as bucket
    from bucket_plan
  ),
  ts as (
    select
      s.bucket,
      coalesce(sum(o.total), 0)::numeric as revenue,
      coalesce(count(o.order_id), 0)::numeric as orders
    from series s
    cross join bucket_plan bp
    left join filtered_orders o on (
      case
        when bp.bucket_size = 'day' then o.created_at::date
        when bp.bucket_size = 'week' then date_trunc('week', o.created_at)::date
        else date_trunc('month', o.created_at)::date
      end
    ) = s.bucket
    group by s.bucket
    order by s.bucket
  ),
  products as (
    select
      oi.product_id,
      coalesce(nullif(oi.product_name, ''), 'Unknown') as product_name,
      sum(coalesce(oi.quantity, 0))::numeric as units,
      sum(coalesce(oi.total, 0))::numeric as revenue
    from exec_dashboard.raw_woocommerce_order_items oi
    join filtered_orders o on o.order_id = oi.order_id
    group by 1,2
  ),
  recent_orders as (
    select
      order_id,
      order_number,
      coalesce(updated_at, created_at) as order_timestamp,
      total,
      currency,
      status
    from filtered_orders
    order by created_at desc
    limit 10
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'orders', order_stats.orders,
      'revenue', order_stats.revenue,
      'avgOrderValue', case when order_stats.orders > 0 then order_stats.revenue / order_stats.orders else null end,
      'discountTotal', order_stats.discounts,
      'shippingTotal', order_stats.shipping,
      'taxTotal', order_stats.taxes,
      'items', order_stats.items,
      'hasData', order_stats.orders > 0
    ),
    'timeseries', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'revenue', revenue,
        'orders', orders
      ) order by bucket) from ts), '[]'::jsonb),
    'products', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'productId', product_id,
        'name', product_name,
        'units', units,
        'revenue', revenue
      ) order by revenue desc nulls last, product_name asc)
      from products), '[]'::jsonb),
    'recentOrders', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'orderId', order_id,
        'orderNumber', order_number,
        'status', status,
        'total', total,
        'currency', currency,
        'createdAt', to_char(order_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )) from recent_orders), '[]'::jsonb),
    'range', jsonb_build_object(
      'rangeStart', to_char(bounds.requested_start, 'YYYY-MM-DD'),
      'rangeEnd', to_char(bounds.requested_end, 'YYYY-MM-DD'),
      'rangeDays', (bounds.requested_end - bounds.requested_start + 1),
      'effectiveStart', to_char(bounds.effective_start, 'YYYY-MM-DD'),
      'dataStartDate', to_char(bounds.min_date, 'YYYY-MM-DD'),
      'dataEndDate', to_char(bounds.max_date, 'YYYY-MM-DD'),
      'source', 'exec_dashboard.raw_woocommerce_orders',
      'bucketSize', bucket_plan.bucket_size,
      'isSelectedRange', case when bounds.min_date is null then false when bounds.min_date <= bounds.requested_start then true else false end,
      'isFallback', case when bounds.min_date is null then true when bounds.min_date > bounds.requested_start then true when order_stats.orders = 0 then true else false end,
      'fallbackReason', case
        when bounds.min_date is null then 'no_orders_loaded'
        when bounds.min_date > bounds.requested_end then 'no_orders_available_for_range'
        when bounds.min_date > bounds.requested_start then 'data_available_from_' || to_char(bounds.min_date, 'YYYY-MM-DD')
        when order_stats.orders = 0 then 'no_orders_in_range'
        else null
      end,
      'lastRefreshedAt', case when order_stats.last_refreshed_at is not null then to_char(order_stats.last_refreshed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') else null end
    )
  )
  from order_stats
  cross join bounds
  cross join bucket_plan;
$$;
