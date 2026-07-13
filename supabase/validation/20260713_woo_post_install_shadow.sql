-- Post-install shadow validation for exec_dashboard.get_woo_metrics_semantic
-- Compares semantic RPC vs direct PT raw calculations + legacy RPCs for ranges A–F.
\set ON_ERROR_STOP on

BEGIN;

SELECT now() AS validation_timestamp;

WITH constants AS (
  SELECT now() AS fixed_now,
         timezone('America/Los_Angeles', now())::date AS pt_today,
         timezone('America/Los_Angeles', now())::date - 1 AS last_completed_pt
),
ranges(label, start_date, end_date) AS (
  VALUES
    ('A', DATE '2026-07-03', DATE '2026-07-09'),
    ('B', DATE '2026-07-13', DATE '2026-07-13'),
    ('C', DATE '2026-06-01', DATE '2026-06-30'),
    ('D', DATE '2026-07-08', DATE '2026-07-09'),
    ('E', DATE '2026-06-28', DATE '2026-07-05'),
    ('F', DATE '2026-06-26', DATE '2026-06-26')
),
params AS (
  SELECT r.label,
         r.start_date,
         r.end_date,
         (r.end_date - r.start_date + 1) AS requested_days,
         c.pt_today,
         c.last_completed_pt,
         c.fixed_now AS generated_at_ts
  FROM ranges r
  CROSS JOIN constants c
),
raw_orders_pt AS (
  SELECT p.label,
         o.*,
         (o.created_at AT TIME ZONE 'America/Los_Angeles')::date AS pt_date,
         (o.created_at AT TIME ZONE 'America/Los_Angeles')       AS pt_timestamp
  FROM params p
  LEFT JOIN exec_dashboard.raw_woocommerce_orders o
    ON COALESCE(o.status,'') NOT IN ('trash','refunded','cancelled','failed')
   AND (o.created_at AT TIME ZONE 'America/Los_Angeles')::date BETWEEN p.start_date AND p.end_date
),
raw_id_stats AS (
  SELECT label,
         ARRAY_REMOVE(ARRAY_AGG(order_id ORDER BY order_id), NULL) AS order_ids,
         COUNT(order_id) AS order_count,
         SUM(total)::numeric AS order_total
  FROM raw_orders_pt
  GROUP BY label
),
expected_json AS (
  SELECT p.label,
         (
           WITH dates AS (
             SELECT generate_series(p.start_date, p.end_date, interval '1 day')::date AS bucket_date
           ),
           filtered_orders AS (
             SELECT order_id,
                    created_at,
                    COALESCE(updated_at, created_at) AS source_ts,
                    COALESCE(NULLIF(UPPER(BTRIM(currency)), ''), 'UNSPECIFIED') AS currency_code,
                    total,
                    total_items,
                    (created_at AT TIME ZONE 'America/Los_Angeles')::date AS bucket_date
             FROM exec_dashboard.raw_woocommerce_orders
             WHERE COALESCE(status,'') NOT IN ('trash','refunded','cancelled','failed')
               AND (created_at AT TIME ZONE 'America/Los_Angeles')::date BETWEEN p.start_date AND p.end_date
           ),
           daily_currency AS (
             SELECT bucket_date,
                    currency_code,
                    COUNT(*)::numeric AS order_count,
                    COUNT(total)::numeric AS orders_with_known_total,
                    SUM(COALESCE(total,0))::numeric AS order_total_sum,
                    SUM(total_items)::numeric AS total_items
             FROM filtered_orders
             GROUP BY bucket_date, currency_code
           ),
           daily_currency_json AS (
             SELECT bucket_date,
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
             SELECT d.bucket_date,
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
               'effective_business_date', to_char(bucket_date,'YYYY-MM-DD'),
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
             SELECT currency_code,
                    COUNT(*)::numeric AS order_count,
                    COUNT(total)::numeric AS orders_with_known_total,
                    SUM(COALESCE(total,0))::numeric AS order_total_sum,
                    SUM(total_items)::numeric AS total_items
             FROM filtered_orders
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
             SELECT COALESCE(non_unspecified_currency_count, 0) AS non_unspecified_currency_count,
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
             SELECT COUNT(DISTINCT bucket_date) AS days_with_orders,
                    MIN(bucket_date) AS first_order_day,
                    MAX(bucket_date) AS last_order_day,
                    MAX(source_ts) AS latest_matching_order_ts
             FROM filtered_orders
           )
           SELECT jsonb_build_object(
             'metric_data', jsonb_build_object(
               'summary', jsonb_build_object(
                 'currency_totals', order_summary.currency_totals,
                 'unspecified_currency_orders', order_summary.unspecified_order_count,
                 'has_unspecified_currency', order_summary.has_unspecified_currency,
                 'order_total_single_currency', CASE WHEN order_summary.non_unspecified_currency_count = 1 AND order_summary.unspecified_order_count = 0 THEN order_summary.specified_total_sum ELSE NULL END,
                 'avg_order_value_single_currency', CASE WHEN order_summary.non_unspecified_currency_count = 1 AND order_summary.unspecified_order_count = 0 AND order_summary.specified_orders_with_known_total > 0 THEN order_summary.specified_total_sum / order_summary.specified_orders_with_known_total ELSE NULL END,
                 'order_count_single_currency', CASE WHEN order_summary.non_unspecified_currency_count = 1 AND order_summary.unspecified_order_count = 0 THEN order_summary.specified_order_count ELSE NULL END,
                 'days_with_matching_orders', stats.days_with_orders,
                 'first_matching_order_date', CASE WHEN stats.first_order_day IS NULL THEN NULL ELSE to_char(stats.first_order_day, 'YYYY-MM-DD') END,
                 'last_matching_order_date', CASE WHEN stats.last_order_day IS NULL THEN NULL ELSE to_char(stats.last_order_day, 'YYYY-MM-DD') END
               ),
               'daily', COALESCE(daily_payload.daily_json, '[]'::jsonb)
             ),
             'metadata', jsonb_build_object(
               'semantic_version', 'woo_semantic_v1',
               'generated_at', to_char(p.generated_at_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'requested_start_date', to_char(p.start_date, 'YYYY-MM-DD'),
               'requested_end_date', to_char(p.end_date, 'YYYY-MM-DD'),
               'latest_completed_requested_business_date', CASE WHEN p.start_date <= p.last_completed_pt THEN to_char(LEAST(p.end_date, p.last_completed_pt), 'YYYY-MM-DD') ELSE NULL END,
               'latest_matching_order_timestamp', CASE WHEN stats.latest_matching_order_ts IS NULL THEN NULL ELSE to_char(stats.latest_matching_order_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
               'freshness_threshold_hours', 12,
               'matching_data_recency_status', CASE
                  WHEN stats.latest_matching_order_ts IS NULL THEN 'no_data'
                  WHEN (p.generated_at_ts - stats.latest_matching_order_ts) <= interval '12 hours' THEN 'fresh'
                  ELSE 'stale'
               END,
               'includes_partial_day', (p.start_date <= p.pt_today AND p.end_date >= p.pt_today),
               'includes_future_dates', (p.end_date > p.pt_today),
               'future_day_count', CASE
                  WHEN p.end_date <= p.pt_today THEN 0
                  ELSE (p.end_date - GREATEST(p.pt_today + 1, p.start_date)) + 1
               END,
               'coverage', jsonb_build_object(
                 'coverage_verifiable', FALSE,
                 'coverage_note', 'Raw WooCommerce data only; zero-order days may represent either legitimate zero demand or missing ingestion.',
                 'requested_day_count', p.requested_days,
                 'days_with_matching_orders', COALESCE(stats.days_with_orders, 0)
               )
             )
           )
         ) AS expected_json
  FROM params p
),
semantic_outputs AS (
  SELECT r.label,
         exec_dashboard.get_woo_metrics_semantic(r.start_date, r.end_date) AS semantic_json,
         exec_dashboard.get_woo_metrics(r.start_date, r.end_date) AS exec_json,
         public.get_woo_metrics(r.start_date, r.end_date) AS public_json
  FROM ranges r
)
SELECT e.label,
       expected_json,
       semantic_json,
       (expected_json -> 'metric_data' -> 'summary') = (semantic_json -> 'metric_data' -> 'summary') AS summary_match,
       (expected_json -> 'metric_data' -> 'daily')   = (semantic_json -> 'metric_data' -> 'daily')   AS daily_match,
       (expected_json -> 'metadata')                 = (semantic_json -> 'metadata')                 AS metadata_match
FROM expected_json e
JOIN semantic_outputs s ON s.label = e.label
ORDER BY e.label;

-- Raw PT order IDs & simple totals for independent reconciliation
SELECT label, order_ids, order_count, order_total
FROM raw_id_stats
ORDER BY label;

-- Legacy outputs for reference
SELECT label, exec_json, public_json
FROM semantic_outputs
ORDER BY label;

COMMIT;
