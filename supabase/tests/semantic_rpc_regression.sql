BEGIN;

DROP SCHEMA IF EXISTS exec_dashboard CASCADE;
CREATE SCHEMA exec_dashboard;

CREATE TABLE exec_dashboard.raw_woocommerce_orders (
  order_id     bigint PRIMARY KEY,
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL,
  status       text        NOT NULL,
  currency     text        NOT NULL,
  total        numeric     NOT NULL,
  total_items  integer     NOT NULL
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
  (103414, '2026-07-09 19:11:12+00', '2026-07-09 19:11:12+00', 'completed', 'USD', 174.91, 1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres SUPERUSER LOGIN;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role LOGIN;
  END IF;
END;
$$;

\i supabase/migrations/20260713_add_woo_semantic_rpc.sql

DO $$
DECLARE
  result jsonb;
BEGIN
  -- Range A
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-03','2026-07-09') INTO result;
  IF (result->'metric_data'->'summary'->>'order_count_single_currency')::int <> 6 THEN
    RAISE EXCEPTION 'Range A order count mismatch';
  END IF;
  IF (result->'metric_data'->'summary'->>'order_total_single_currency')::numeric <> 767.03 THEN
    RAISE EXCEPTION 'Range A total mismatch';
  END IF;

  -- Range B zero-order semantics
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-13','2026-07-13') INTO result;
  IF jsonb_array_length(result->'metric_data'->'summary'->'currency_totals') <> 0 THEN
    RAISE EXCEPTION 'Range B currency totals not empty';
  END IF;
  IF result->'metric_data'->'summary'->>'order_total_single_currency' IS NOT NULL THEN
    RAISE EXCEPTION 'Range B USD total present';
  END IF;

  -- Range C
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-06-01','2026-06-30') INTO result;
  IF (result->'metric_data'->'summary'->>'order_count_single_currency')::int <> 11 THEN
    RAISE EXCEPTION 'Range C order count mismatch';
  END IF;
  IF (result->'metric_data'->'summary'->>'order_total_single_currency')::numeric <> 1681.05 THEN
    RAISE EXCEPTION 'Range C total mismatch';
  END IF;

  -- Range D
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-08','2026-07-09') INTO result;
  IF (result->'metric_data'->'summary'->>'order_count_single_currency')::int <> 5 THEN
    RAISE EXCEPTION 'Range D order count mismatch';
  END IF;
  IF (result->'metric_data'->'summary'->>'order_total_single_currency')::numeric <> 591.96 THEN
    RAISE EXCEPTION 'Range D total mismatch';
  END IF;

  -- Range E
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-06-28','2026-07-05') INTO result;
  IF jsonb_array_length(result->'metric_data'->'summary'->'currency_totals') <> 0 THEN
    RAISE EXCEPTION 'Range E currency totals not empty';
  END IF;

  -- Range F
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-06-26','2026-06-26') INTO result;
  IF (result->'metric_data'->'summary'->>'order_count_single_currency')::int <> 2 THEN
    RAISE EXCEPTION 'Range F order count mismatch';
  END IF;
  IF (result->'metric_data'->'summary'->>'order_total_single_currency')::numeric <> 318.13 THEN
    RAISE EXCEPTION 'Range F total mismatch';
  END IF;

  -- NULL input must fail
  BEGIN
    PERFORM exec_dashboard.get_woo_metrics_semantic(NULL, '2026-07-09');
    RAISE EXCEPTION 'NULL input did not fail';
  EXCEPTION WHEN SQLSTATE '22004' THEN NULL; END;

  -- Reversed dates must fail
  BEGIN
    PERFORM exec_dashboard.get_woo_metrics_semantic('2026-07-10','2026-07-01');
    RAISE EXCEPTION 'Reversed dates did not fail';
  EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
END;
$$;

ROLLBACK;
