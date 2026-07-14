\set ON_ERROR_STOP on

\if :{?semantic_migration_file}
  \echo 'Using migration file: ' :semantic_migration_file
\else
  \echo 'ERROR: semantic_migration_file variable is required' >&2
  \quit 1
\endif

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE postgres SUPERUSER LOGIN;
CREATE ROLE anon LOGIN;
CREATE ROLE authenticated LOGIN;
CREATE ROLE service_role LOGIN;

BEGIN;

DROP SCHEMA IF EXISTS exec_dashboard CASCADE;
CREATE SCHEMA exec_dashboard;

CREATE TABLE exec_dashboard.raw_woocommerce_orders (
  order_id    bigint       PRIMARY KEY,
  created_at  timestamptz  NOT NULL,
  updated_at  timestamptz,
  status      text,
  currency    text,
  total       numeric,
  total_items integer
);

INSERT INTO exec_dashboard.raw_woocommerce_orders
  (order_id, created_at, updated_at, status, currency, total, total_items)
VALUES
  (103250, '2026-06-01 03:31:51+00', '2026-06-01 03:31:51+00', 'completed', 'USD', 84.21, 1),
  (103260, '2026-06-10 05:44:16+00', '2026-06-10 05:44:16+00', 'completed', 'USD', 173.31, 1),
  (103261, '2026-06-11 10:14:10+00', '2026-06-11 10:14:10+00', 'completed', 'USD', 84.73, 1),
  (103263, '2026-06-12 11:26:38+00', '2026-06-12 11:26:38+00', 'completed', 'USD', 84.73, 1),
  (103265, '2026-06-13 20:09:51+00', '2026-06-13 20:09:51+00', 'completed', 'USD', 84.73, 1),
  (103269, '2026-06-22 01:53:49+00', '2026-06-22 01:53:49+00', 'completed', 'USD', 308.92, 1),
  (103272, '2026-06-23 20:22:00+00', '2026-06-23 20:22:00+00', 'completed', 'USD', 76.71, 1),
  (103271, '2026-06-23 22:02:41+00', '2026-06-23 22:02:41+00', 'cancelled', 'USD', 100.00, 1),
  (103282, '2026-06-23 23:54:39+00', '2026-06-23 23:54:39+00', 'completed', 'USD', 253.35, 1),
  (103283, '2026-06-24 17:54:13+00', '2026-06-24 17:54:13+00', 'completed', 'USD', 211.71, 1),
  (103301, '2026-06-24 21:38:52+00', '2026-06-24 21:38:52+00', 'completed', 'USD', 84.73, 1),
  (103304, '2026-06-26 13:49:07+00', '2026-06-26 13:49:07+00', 'completed', 'USD', 155.93, 1),
  (103305, '2026-06-27 01:35:50+00', '2026-06-27 01:35:50+00', 'completed', 'USD', 162.20, 1),
  (103306, '2026-07-08 02:55:21+00', '2026-07-08 02:55:21+00', 'completed', 'USD', 175.07, 1),
  (103307, '2026-07-09 00:11:33+00', '2026-07-09 00:11:33+00', 'completed', 'USD', 83.92, 1),
  (103308, '2026-07-09 00:31:52+00', '2026-07-09 00:31:52+00', 'completed', 'USD', 159.98, 1),
  (103309, '2026-07-09 02:11:25+00', '2026-07-09 02:11:25+00', 'completed', 'USD', 89.23, 1),
  (103413, '2026-07-09 12:55:41+00', '2026-07-09 12:55:41+00', 'completed', 'USD', 83.92, 1),
  (103414, '2026-07-09 19:11:12+00', '2026-07-09 19:11:12+00', 'completed', 'USD', 174.91, 1),
  (200010, '2026-03-08 09:30:00+00', '2026-03-08 09:30:00+00', 'completed', 'USD', 123.45, 2),
  (200011, '2026-11-01 09:30:00+00', '2026-11-01 09:30:00+00', 'completed', 'USD', 234.56, 3),
  (200100, '2026-07-15 16:45:00+00', '2026-07-15 16:45:00+00', 'completed', 'USD', 150.00, 1),
  (200101, '2026-07-15 18:10:00+00', '2026-07-15 18:10:00+00', 'completed', 'cad', 200.00, 1),
  (200200, '2026-07-20 12:00:00+00', '2026-07-20 12:00:00+00', 'completed', NULL, 90.00, 1),
  (200201, '2026-07-20 13:00:00+00', '2026-07-20 13:00:00+00', 'completed', '   ', 110.00, 1),
  (200202, '2026-07-20 14:00:00+00', '2026-07-20 14:00:00+00', 'completed', 'UNSPECIFIED', 130.00, 1),
  (200250, '2026-07-25 12:00:00+00', '2026-07-25 12:00:00+00', 'completed', NULL, 77.00, 1),
  (200251, '2026-07-25 13:30:00+00', '2026-07-25 13:30:00+00', 'completed', '', 33.00, 1),
  (200300, '2026-07-21 10:00:00+00', '2026-07-21 10:00:00+00', 'completed', 'USD', NULL, 1),
  (200301, '2026-07-21 12:00:00+00', '2026-07-21 12:00:00+00', 'completed', 'USD', 0.00, 0),
  (200302, '2026-07-21 13:00:00+00', '2026-07-21 13:00:00+00', 'completed', 'USD', 75.00, NULL),
  (200400, '2026-07-22 08:00:00+00', '2026-07-22 08:00:00+00', 'refunded', 'USD', 400.00, 1),
  (200401, '2026-07-22 09:00:00+00', '2026-07-22 09:00:00+00', 'failed', 'USD', 410.00, 1),
  (200500, '2025-12-31 23:30:00+00', now(), 'completed', 'USD', 210.00, 2);

\i :semantic_migration_file

DO $$
DECLARE
  result jsonb;
  summary jsonb;
  metadata jsonb;
  daily jsonb;
  txn_now timestamptz := now();
  pt_today date := timezone('America/Los_Angeles', now())::date;
  tomorrow date := pt_today + 1;
  day_after date := pt_today + 2;
  future_range_start date := pt_today + 5;
  latest_completed date := pt_today - 1;
  fresh_day date := DATE '2025-12-31';
BEGIN
  -- Catalog/privilege assertions
  PERFORM 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'get_woo_metrics_semantic'
    AND n.nspname = 'exec_dashboard';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Function not created';
  END IF;

  IF pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='exec_dashboard.get_woo_metrics_semantic(date,date)'::regprocedure)) <> 'postgres' THEN
    RAISE EXCEPTION 'Owner mismatch';
  END IF;

  IF NOT has_function_privilege('service_role', 'exec_dashboard.get_woo_metrics_semantic(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role missing EXECUTE';
  END IF;
  IF has_function_privilege('anon', 'exec_dashboard.get_woo_metrics_semantic(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon unexpectedly has EXECUTE';
  END IF;
  IF has_function_privilege('authenticated', 'exec_dashboard.get_woo_metrics_semantic(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has EXECUTE';
  END IF;
  IF has_function_privilege('public', 'exec_dashboard.get_woo_metrics_semantic(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC unexpectedly has EXECUTE';
  END IF;

  -- Range A
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-03','2026-07-09') INTO result;
  summary := result->'metric_data'->'summary';
  IF (summary->>'order_count_single_currency')::int <> 6 THEN
    RAISE EXCEPTION 'Range A order count mismatch';
  END IF;
  IF (summary->>'order_total_single_currency')::numeric <> 767.03 THEN
    RAISE EXCEPTION 'Range A total mismatch';
  END IF;
  metadata := result->'metadata';
  IF metadata->>'latest_completed_requested_business_date' <> '2026-07-09' THEN
    RAISE EXCEPTION 'Range A latest completed mismatch';
  END IF;

  -- Range B zero-order semantics
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-13','2026-07-13') INTO result;
  summary := result->'metric_data'->'summary';
  daily := result->'metric_data'->'daily';
  IF jsonb_array_length(summary->'currency_totals') <> 0 THEN
    RAISE EXCEPTION 'Range B currency totals not empty';
  END IF;
  IF summary->>'order_total_single_currency' IS NOT NULL THEN
    RAISE EXCEPTION 'Range B USD total present';
  END IF;
  IF jsonb_array_length(daily) <> 1 THEN
    RAISE EXCEPTION 'Range B daily length mismatch';
  END IF;
  IF (daily->0->>'has_orders')::boolean THEN
    RAISE EXCEPTION 'Range B has_orders true';
  END IF;

  -- Range C
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-06-01','2026-06-30') INTO result;
  summary := result->'metric_data'->'summary';
  IF (summary->>'order_count_single_currency')::int <> 11 THEN
    RAISE EXCEPTION 'Range C order count mismatch';
  END IF;
  IF (summary->>'order_total_single_currency')::numeric <> 1681.05 THEN
    RAISE EXCEPTION 'Range C total mismatch';
  END IF;

  -- Range D
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-08','2026-07-09') INTO result;
  summary := result->'metric_data'->'summary';
  IF (summary->>'order_count_single_currency')::int <> 5 THEN
    RAISE EXCEPTION 'Range D order count mismatch';
  END IF;
  IF (summary->>'order_total_single_currency')::numeric <> 591.96 THEN
    RAISE EXCEPTION 'Range D total mismatch';
  END IF;

  -- Range E zero orders covering a window
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-06-28','2026-07-05') INTO result;
  summary := result->'metric_data'->'summary';
  IF jsonb_array_length(summary->'currency_totals') <> 0 THEN
    RAISE EXCEPTION 'Range E currency totals not empty';
  END IF;
  IF (result->'metadata'->'coverage'->>'requested_day_count')::int <> 8 THEN
    RAISE EXCEPTION 'Range E requested day count mismatch';
  END IF;
  IF (result->'metric_data'->'daily'->0->>'effective_business_date') <> '2026-06-28' THEN
    RAISE EXCEPTION 'Range E daily start mismatch';
  END IF;

  -- Range F single day with two orders
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-06-26','2026-06-26') INTO result;
  summary := result->'metric_data'->'summary';
  IF (summary->>'order_count_single_currency')::int <> 2 THEN
    RAISE EXCEPTION 'Range F order count mismatch';
  END IF;
  IF (summary->>'order_total_single_currency')::numeric <> 318.13 THEN
    RAISE EXCEPTION 'Range F total mismatch';
  END IF;

  -- Fresh data recency check
  SELECT exec_dashboard.get_woo_metrics_semantic(fresh_day, fresh_day) INTO result;
  metadata := result->'metadata';
  IF metadata->>'matching_data_recency_status' IS DISTINCT FROM 'fresh' THEN
    RAISE EXCEPTION 'Fresh range recency mismatch';
  END IF;
  IF metadata->>'latest_matching_order_timestamp' IS DISTINCT FROM to_char(txn_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') THEN
    RAISE EXCEPTION 'Fresh range timestamp mismatch';
  END IF;

  -- USD + CAD mixed currency
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-15','2026-07-15') INTO result;
  summary := result->'metric_data'->'summary';
  IF jsonb_array_length(summary->'currency_totals') <> 2 THEN
    RAISE EXCEPTION 'Mixed currency count mismatch';
  END IF;
  IF summary->>'order_total_single_currency' IS NOT NULL THEN
    RAISE EXCEPTION 'Mixed currency helper should be NULL';
  END IF;
  IF (summary->'currency_totals'->0->>'currency') <> 'CAD' THEN
    RAISE EXCEPTION 'Mixed currency order unexpected';
  END IF;
  IF (summary->'currency_totals'->0->>'order_total')::numeric <> 200 THEN
    RAISE EXCEPTION 'CAD total mismatch';
  END IF;
  IF (summary->'currency_totals'->1->>'currency') <> 'USD' THEN
    RAISE EXCEPTION 'Mixed USD entry missing';
  END IF;

  -- USD plus unspecified currencies
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-20','2026-07-20') INTO result;
  summary := result->'metric_data'->'summary';
  IF NOT (summary->>'has_unspecified_currency')::boolean THEN
    RAISE EXCEPTION 'Unspecified flag missing';
  END IF;
  IF (summary->>'unspecified_currency_orders')::numeric <> 3 THEN
    RAISE EXCEPTION 'Unspecified order count mismatch';
  END IF;
  IF summary->>'order_total_single_currency' IS NOT NULL THEN
    RAISE EXCEPTION 'Helper should be null when unspecified present';
  END IF;

  -- Unspecified-only day
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-25','2026-07-25') INTO result;
  summary := result->'metric_data'->'summary';
  IF (summary->>'has_unspecified_currency')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Unspecified-only flag missing';
  END IF;
  IF jsonb_array_length(summary->'currency_totals') <> 1 THEN
    RAISE EXCEPTION 'Unspecified-only currency totals mismatch';
  END IF;
  IF (summary->'currency_totals'->0->>'currency') <> 'UNSPECIFIED' THEN
    RAISE EXCEPTION 'Unspecified-only currency label mismatch';
  END IF;

  -- Null totals counting
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-21','2026-07-21') INTO result;
  summary := result->'metric_data'->'summary';
  IF (summary->>'order_count_single_currency')::int <> 3 THEN
    RAISE EXCEPTION 'Null-total order count mismatch';
  END IF;
  IF (summary->>'order_total_single_currency')::numeric <> 75 THEN
    RAISE EXCEPTION 'Null-total sum mismatch';
  END IF;
  IF (summary->>'avg_order_value_single_currency')::numeric <> 37.5 THEN
    RAISE EXCEPTION 'Null-total AOV mismatch';
  END IF;

  -- Cancelled/refunded/failed excluded
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-22','2026-07-22') INTO result;
  summary := result->'metric_data'->'summary';
  IF (summary->>'order_count_single_currency') IS NOT NULL THEN
    RAISE EXCEPTION 'Cancelled/refunded range should have NULL helpers';
  END IF;
  IF jsonb_array_length(summary->'currency_totals') <> 0 THEN
    RAISE EXCEPTION 'Cancelled/refunded currency totals should be empty';
  END IF;

  -- Today-only range metadata
  SELECT exec_dashboard.get_woo_metrics_semantic(pt_today, pt_today) INTO result;
  metadata := result->'metadata';
  IF (metadata->>'includes_partial_day')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Today range missing partial-day flag';
  END IF;
  IF metadata->>'latest_completed_requested_business_date' IS NOT NULL THEN
    RAISE EXCEPTION 'Today range latest completed should be NULL';
  END IF;
  IF metadata->>'matching_data_recency_status' IS DISTINCT FROM 'no_data' THEN
    RAISE EXCEPTION 'Today range recency should be no_data';
  END IF;

  -- Range spanning today and tomorrow
  SELECT exec_dashboard.get_woo_metrics_semantic(pt_today, tomorrow) INTO result;
  metadata := result->'metadata';
  IF (metadata->>'includes_future_dates')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Span range missing includes_future flag';
  END IF;
  IF (metadata->>'future_day_count')::int <> 1 THEN
    RAISE EXCEPTION 'Span range future day count mismatch';
  END IF;

  -- Future-only range
  SELECT exec_dashboard.get_woo_metrics_semantic(day_after, day_after) INTO result;
  metadata := result->'metadata';
  IF (metadata->>'includes_future_dates')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Future-only missing includes_future';
  END IF;
  IF (metadata->>'future_day_count')::int <> 1 THEN
    RAISE EXCEPTION 'Future-only future day count mismatch';
  END IF;
  IF metadata->>'latest_completed_requested_business_date' IS NOT NULL THEN
    RAISE EXCEPTION 'Future-only latest completed should be NULL';
  END IF;

  -- Zero-order multi-day coverage generation
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-08-01','2026-08-03') INTO result;
  IF jsonb_array_length(result->'metric_data'->'daily') <> 3 THEN
    RAISE EXCEPTION 'Zero-order window daily length mismatch';
  END IF;

  -- DST spring-forward bucket
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-03-08','2026-03-08') INTO result;
  daily := result->'metric_data'->'daily';
  IF (daily->0->>'effective_business_date') <> '2026-03-08' THEN
    RAISE EXCEPTION 'DST bucket date mismatch';
  END IF;
  IF NOT (daily->0->>'has_orders')::boolean THEN
    RAISE EXCEPTION 'DST bucket missing orders';
  END IF;

  -- Metadata coverage fields
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-01','2026-07-10') INTO result;
  metadata := result->'metadata';
  IF (metadata->'coverage'->>'requested_day_count')::int <> 10 THEN
    RAISE EXCEPTION 'Coverage requested_day_count mismatch';
  END IF;
  IF (metadata->'coverage'->>'days_with_matching_orders')::int <> 3 THEN
    RAISE EXCEPTION 'Coverage days_with_matching_orders mismatch';
  END IF;

  -- NULL input must fail
  BEGIN
    PERFORM exec_dashboard.get_woo_metrics_semantic(NULL, pt_today);
    RAISE EXCEPTION 'NULL input did not fail';
  EXCEPTION WHEN SQLSTATE '22004' THEN NULL; END;

  -- Reversed dates must fail
  BEGIN
    PERFORM exec_dashboard.get_woo_metrics_semantic(tomorrow, pt_today);
    RAISE EXCEPTION 'Reversed dates did not fail';
  EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
END;
$$;

DO $wrapper_checks$
DECLARE
  wrapper_oid oid := 'public.get_woo_metrics_semantic_v1(date,date)'::regprocedure;
  wrapper_payload jsonb;
  semantic_payload jsonb;
BEGIN
  IF wrapper_oid IS NULL THEN
    RAISE EXCEPTION 'Wrapper function missing';
  END IF;

  IF pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = wrapper_oid)) <> 'postgres' THEN
    RAISE EXCEPTION 'Wrapper owner mismatch';
  END IF;

  IF NOT has_function_privilege('service_role', wrapper_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Wrapper: service_role missing EXECUTE';
  END IF;
  IF has_function_privilege('anon', wrapper_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Wrapper: anon unexpectedly has EXECUTE';
  END IF;
  IF has_function_privilege('authenticated', wrapper_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Wrapper: authenticated unexpectedly has EXECUTE';
  END IF;
  IF has_function_privilege('public', wrapper_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Wrapper: PUBLIC unexpectedly has EXECUTE';
  END IF;

  SELECT public.get_woo_metrics_semantic_v1('2026-07-03','2026-07-09') INTO wrapper_payload;
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-03','2026-07-09') INTO semantic_payload;
  IF wrapper_payload IS DISTINCT FROM semantic_payload THEN
    RAISE EXCEPTION 'Wrapper payload mismatch';
  END IF;
END;
$wrapper_checks$;

ROLLBACK;
