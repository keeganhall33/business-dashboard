-- 2026-07-13: Add exec_dashboard.get_woo_metrics_semantic for PASS 2B.1B shadow validation.
-- This migration is additive. It does not modify existing Woo RPCs.
--
-- Semantic Woo metrics RPC
-- Purpose: Provide Pacific-Time-bucketed Woo order totals and AOV with shared metadata for shadow validation.
-- Metrics: order_total (SUM total), order_count (COUNT orders), avg_order_value (SUM total / COUNT orders with known totals).
-- Status filter: matches production dashboard logic (exclude trash/refunded/cancelled/failed).
-- Currency behavior: totals are grouped per normalized currency code; helper fields only surface when exactly one non-UNSPECIFIED currency appears.
-- Coverage metadata: observational only; zero-order days are not reported as missing ingestion data.
-- Limitations: refunds not ingested yet; zero-order days may represent either zero demand or missing ingestion; function is service_role-only for shadow validation.
CREATE OR REPLACE FUNCTION exec_dashboard.get_woo_metrics_semantic(start_date date, end_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, exec_dashboard
AS $$
DECLARE
  requested_days integer;
  pt_today date;
  last_completed_pt date;
  includes_future boolean;
  future_day_count integer;
  includes_partial_day boolean;
  freshness_threshold interval := interval '12 hours';
  result_payload jsonb;
BEGIN
  IF start_date IS NULL OR end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required'
      USING ERRCODE = '22004';
  END IF;

  IF start_date > end_date THEN
    RAISE EXCEPTION 'start_date (%) must be on or before end_date (%)', start_date, end_date
      USING ERRCODE = '22007';
  END IF;

  pt_today := timezone('America/Los_Angeles', now())::date;
  last_completed_pt := pt_today - 1;
  includes_partial_day := (start_date <= pt_today AND end_date >= pt_today);
  includes_future := end_date > pt_today;
  future_day_count := CASE
    WHEN end_date <= pt_today THEN 0
    ELSE (end_date - GREATEST(pt_today + 1, start_date)) + 1
  END;
  future_day_count := GREATEST(future_day_count, 0);
  requested_days := (end_date - start_date + 1);

  WITH params AS (
    SELECT start_date,
           end_date,
           requested_days,
           pt_today,
           last_completed_pt,
           includes_future,
           future_day_count,
           includes_partial_day,
           freshness_threshold,
           now() AS generated_at_ts
  ),
  dates AS (
    SELECT generate_series(params.start_date, params.end_date, interval '1 day')::date AS bucket_date
    FROM params
  ),
  raw_orders AS (
    SELECT
      order_id,
      created_at,
      COALESCE(updated_at, created_at) AS source_ts,
      COALESCE(NULLIF(UPPER(BTRIM(currency)), ''), 'UNSPECIFIED') AS currency_code,
      total,
      total_items,
      (created_at AT TIME ZONE 'America/Los_Angeles')::date AS bucket_date
    FROM exec_dashboard.raw_woocommerce_orders, params
    WHERE (created_at AT TIME ZONE 'America/Los_Angeles')::date BETWEEN params.start_date AND params.end_date
      AND COALESCE(status, '') NOT IN ('trash','refunded','cancelled','failed')
  ),
  daily_currency AS (
    SELECT
      bucket_date,
      currency_code,
      COUNT(*)::numeric AS order_count,
      COUNT(total)::numeric AS orders_with_known_total,
      SUM(COALESCE(total, 0))::numeric AS order_total_sum,
      SUM(total_items)::numeric AS total_items
    FROM raw_orders
    GROUP BY bucket_date, currency_code
  ),
  daily_currency_json AS (
    SELECT
      bucket_date,
      COALESCE(jsonb_agg(jsonb_build_object(
        'currency', currency_code,
        'order_count', order_count,
        'orders_with_known_total', orders_with_known_total,
        'order_total', CASE WHEN currency_code = 'UNSPECIFIED' THEN NULL ELSE CASE WHEN orders_with_known_total > 0 THEN order_total_sum ELSE NULL END END,
        'avg_order_value', CASE WHEN currency_code = 'UNSPECIFIED' THEN NULL ELSE CASE WHEN orders_with_known_total > 0 THEN order_total_sum / orders_with_known_total ELSE NULL END END,
        'total_items', total_items
      ) ORDER BY currency_code), '[]'::jsonb) AS currency_totals,
      SUM(CASE WHEN currency_code = 'UNSPECIFIED' THEN 0 ELSE 1 END) AS non_unspecified_currency_count,
      SUM(CASE WHEN currency_code = 'UNSPECIFIED' THEN order_count ELSE 0 END)::numeric AS unspecified_order_count,
      SUM(CASE WHEN currency_code = 'UNSPECIFIED' THEN total_items ELSE 0 END)::numeric AS unspecified_total_items,
      SUM(CASE WHEN currency_code <> 'UNSPECIFIED' THEN order_total_sum ELSE 0 END)::numeric AS specified_total_sum,
      SUM(CASE WHEN currency_code <> 'UNSPECIFIED' THEN orders_with_known_total ELSE 0 END)::numeric AS specified_orders_with_known_total,
      SUM(CASE WHEN currency_code <> 'UNSPECIFIED' THEN order_count ELSE 0 END)::numeric AS specified_order_count,
      SUM(order_total_sum)::numeric AS combined_total_sum,
      SUM(orders_with_known_total)::numeric AS combined_orders_with_known_total,
      SUM(order_count)::numeric AS combined_order_count,
      BOOL_OR(currency_code = 'UNSPECIFIED' AND order_count > 0) AS has_unspecified_currency
    FROM daily_currency
    GROUP BY bucket_date
  ),
  daily_stats AS (
    SELECT
      d.bucket_date,
      COALESCE(dc.currency_totals, '[]'::jsonb) AS currency_totals,
      COALESCE(dc.non_unspecified_currency_count, 0) AS non_unspecified_currency_count,
      COALESCE(dc.specified_total_sum, 0)::numeric AS specified_total_sum,
      COALESCE(dc.specified_orders_with_known_total, 0)::numeric AS specified_orders_with_known_total,
      COALESCE(dc.specified_order_count, 0)::numeric AS specified_order_count,
      COALESCE(dc.combined_total_sum, 0)::numeric AS combined_total_sum,
      COALESCE(dc.combined_orders_with_known_total, 0)::numeric AS combined_orders_with_known_total,
      COALESCE(dc.combined_order_count, 0)::numeric AS combined_order_count,
      COALESCE(dc.unspecified_order_count, 0)::numeric AS unspecified_order_count,
      COALESCE(dc.has_unspecified_currency, FALSE) AS has_unspecified_currency
    FROM dates d
    LEFT JOIN daily_currency_json dc ON dc.bucket_date = d.bucket_date
  ),
  daily_payload AS (
    SELECT jsonb_agg(jsonb_build_object(
      'effective_business_date', to_char(bucket_date, 'YYYY-MM-DD'),
      'has_orders', combined_order_count > 0,
      'currency_totals', currency_totals,
      'unspecified_currency_orders', unspecified_order_count,
      'has_unspecified_currency', has_unspecified_currency,
      'order_total_single_currency', CASE WHEN non_unspecified_currency_count = 1 AND unspecified_order_count = 0 THEN specified_total_sum ELSE NULL END,
      'avg_order_value_single_currency', CASE WHEN non_unspecified_currency_count = 1 AND unspecified_order_count = 0 AND specified_orders_with_known_total > 0 THEN specified_total_sum / specified_orders_with_known_total ELSE NULL END,
      'order_count_single_currency', CASE WHEN non_unspecified_currency_count = 1 AND unspecified_order_count = 0 THEN specified_order_count ELSE NULL END
    ) ORDER BY bucket_date) AS daily_json
    FROM daily_stats
  ),
  summary_currency AS (
    SELECT
      currency_code,
      COUNT(*)::numeric AS order_count,
      COUNT(total)::numeric AS orders_with_known_total,
      SUM(COALESCE(total, 0))::numeric AS order_total_sum,
      SUM(total_items)::numeric AS total_items
    FROM raw_orders
    GROUP BY currency_code
  ),
  summary_currency_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'currency', currency_code,
      'order_count', order_count,
      'orders_with_known_total', orders_with_known_total,
      'order_total', CASE WHEN currency_code = 'UNSPECIFIED' THEN NULL ELSE CASE WHEN orders_with_known_total > 0 THEN order_total_sum ELSE NULL END END,
      'avg_order_value', CASE WHEN currency_code = 'UNSPECIFIED' THEN NULL ELSE CASE WHEN orders_with_known_total > 0 THEN order_total_sum / orders_with_known_total ELSE NULL END END,
      'total_items', total_items
    ) ORDER BY currency_code), '[]'::jsonb) AS currency_totals,
    SUM(CASE WHEN currency_code = 'UNSPECIFIED' THEN 0 ELSE 1 END) AS non_unspecified_currency_count,
    SUM(CASE WHEN currency_code <> 'UNSPECIFIED' THEN order_total_sum ELSE 0 END)::numeric AS specified_total_sum,
    SUM(CASE WHEN currency_code <> 'UNSPECIFIED' THEN orders_with_known_total ELSE 0 END)::numeric AS specified_orders_with_known_total,
    SUM(CASE WHEN currency_code <> 'UNSPECIFIED' THEN order_count ELSE 0 END)::numeric AS specified_order_count,
    SUM(order_total_sum)::numeric AS combined_total_sum,
    SUM(orders_with_known_total)::numeric AS combined_orders_with_known_total,
    SUM(order_count)::numeric AS combined_order_count,
    SUM(CASE WHEN currency_code = 'UNSPECIFIED' THEN order_count ELSE 0 END)::numeric AS unspecified_order_count,
    BOOL_OR(currency_code = 'UNSPECIFIED' AND order_count > 0) AS has_unspecified_currency
    FROM summary_currency
  ),
  order_summary AS (
    SELECT
      COALESCE(non_unspecified_currency_count, 0) AS non_unspecified_currency_count,
      COALESCE(specified_total_sum, 0)::numeric AS specified_total_sum,
      COALESCE(specified_orders_with_known_total, 0)::numeric AS specified_orders_with_known_total,
      COALESCE(specified_order_count, 0)::numeric AS specified_order_count,
      COALESCE(combined_total_sum, 0)::numeric AS combined_total_sum,
      COALESCE(combined_orders_with_known_total, 0)::numeric AS combined_orders_with_known_total,
      COALESCE(combined_order_count, 0)::numeric AS combined_order_count,
      COALESCE(currency_totals, '[]'::jsonb) AS currency_totals,
      COALESCE(unspecified_order_count, 0)::numeric AS unspecified_order_count,
      COALESCE(has_unspecified_currency, FALSE) AS has_unspecified_currency
    FROM summary_currency_json
  ),
  stats AS (
    SELECT
      COUNT(DISTINCT bucket_date) AS days_with_orders,
      MIN(bucket_date) AS first_order_day,
      MAX(bucket_date) AS last_order_day,
      MAX(source_ts) AS latest_matching_order_ts
    FROM raw_orders
  ),
  summary_payload AS (
    SELECT jsonb_build_object(
      'currency_totals', order_summary.currency_totals,
      'unspecified_currency_orders', order_summary.unspecified_order_count,
      'has_unspecified_currency', order_summary.has_unspecified_currency,
      'order_total_single_currency', CASE WHEN order_summary.non_unspecified_currency_count = 1 AND order_summary.unspecified_order_count = 0 THEN order_summary.specified_total_sum ELSE NULL END,
      'avg_order_value_single_currency', CASE WHEN order_summary.non_unspecified_currency_count = 1 AND order_summary.unspecified_order_count = 0 AND order_summary.specified_orders_with_known_total > 0 THEN order_summary.specified_total_sum / order_summary.specified_orders_with_known_total ELSE NULL END,
      'order_count_single_currency', CASE WHEN order_summary.non_unspecified_currency_count = 1 AND order_summary.unspecified_order_count = 0 THEN order_summary.specified_order_count ELSE NULL END,
      'days_with_matching_orders', stats.days_with_orders,
      'first_matching_order_date', CASE WHEN stats.first_order_day IS NULL THEN NULL ELSE to_char(stats.first_order_day, 'YYYY-MM-DD') END,
      'last_matching_order_date', CASE WHEN stats.last_order_day IS NULL THEN NULL ELSE to_char(stats.last_order_day, 'YYYY-MM-DD') END
    ) AS summary_json
    FROM order_summary
    CROSS JOIN stats
  ),
  metadata AS (
    SELECT jsonb_build_object(
      'semantic_version', 'woo_semantic_v1',
      'generated_at', to_char(params.generated_at_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'requested_start_date', to_char(params.start_date, 'YYYY-MM-DD'),
      'requested_end_date', to_char(params.end_date, 'YYYY-MM-DD'),
      'latest_completed_requested_business_date', CASE
        WHEN params.start_date <= params.last_completed_pt THEN to_char(LEAST(params.end_date, params.last_completed_pt), 'YYYY-MM-DD')
        ELSE NULL
      END,
      'latest_matching_order_timestamp', CASE WHEN stats.latest_matching_order_ts IS NULL THEN NULL ELSE to_char(stats.latest_matching_order_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
      'freshness_threshold_hours', EXTRACT(EPOCH FROM params.freshness_threshold) / 3600,
      'matching_data_recency_status', CASE
        WHEN stats.latest_matching_order_ts IS NULL THEN 'no_data'
        WHEN (params.generated_at_ts - stats.latest_matching_order_ts) <= params.freshness_threshold THEN 'fresh'
        ELSE 'stale'
      END,
      'includes_partial_day', params.includes_partial_day,
      'includes_future_dates', params.includes_future,
      'future_day_count', params.future_day_count,
      'coverage', jsonb_build_object(
        'coverage_verifiable', FALSE,
        'coverage_note', 'Raw WooCommerce data only; zero-order days may represent either legitimate zero demand or missing ingestion.',
        'requested_day_count', params.requested_days,
        'days_with_matching_orders', COALESCE(stats.days_with_orders, 0)
      )
    ) AS metadata_json
    FROM params
    CROSS JOIN stats
  )
  SELECT jsonb_build_object(
    'metric_data', jsonb_build_object(
      'summary', summary_payload.summary_json,
      'daily', COALESCE(daily_payload.daily_json, '[]'::jsonb)
    ),
    'metadata', metadata.metadata_json
  )
  INTO result_payload
  FROM summary_payload
  CROSS JOIN daily_payload
  CROSS JOIN metadata;

  RETURN result_payload;
END;
$$;

ALTER FUNCTION exec_dashboard.get_woo_metrics_semantic(date, date) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION exec_dashboard.get_woo_metrics_semantic(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION exec_dashboard.get_woo_metrics_semantic(date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION exec_dashboard.get_woo_metrics_semantic(date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION exec_dashboard.get_woo_metrics_semantic(date, date) TO service_role;
GRANT USAGE ON SCHEMA exec_dashboard TO service_role;
