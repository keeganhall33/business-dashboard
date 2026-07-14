CREATE OR REPLACE FUNCTION exec_dashboard.get_woo_metrics(start_date date, end_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'exec_dashboard'
AS $function$
  with orders as (
    select *
    from exec_dashboard.raw_woocommerce_orders
    where created_at::date between start_date and end_date
      and coalesce(status, '') not in ('trash','refunded','cancelled','failed')
  ),
  ts as (
    select
      created_at::date as bucket,
      coalesce(sum(total), 0)::numeric as revenue,
      count(*)::numeric as orders
    from orders
    group by created_at::date
    order by bucket
  ),
  agg as (
    select
      count(*)::numeric as orders,
      coalesce(sum(total), 0)::numeric as revenue,
      coalesce(sum(discount_total), 0)::numeric as discounts,
      coalesce(sum(shipping_total), 0)::numeric as shipping,
      coalesce(sum(tax_total), 0)::numeric as taxes,
      coalesce(sum(total_items), 0)::numeric as items
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
      'items', items
    ),
    'timeseries', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'revenue', revenue,
        'orders', orders
      )) from ts), '[]'::jsonb)
  )
  from agg;
$function$

