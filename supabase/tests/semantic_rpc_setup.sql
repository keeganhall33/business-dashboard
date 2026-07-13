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

-- Legacy RPC stubs copied from supabase/schema.sql
CREATE OR REPLACE FUNCTION exec_dashboard.get_woo_metrics(start_date date, end_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, exec_dashboard
AS $$
  WITH orders AS (
    SELECT *
    FROM exec_dashboard.raw_woocommerce_orders
    WHERE created_at::date BETWEEN start_date AND end_date
      AND COALESCE(status, '') NOT IN ('trash','refunded','cancelled','failed')
  ),
  ts AS (
    SELECT created_at::date AS bucket,
           COALESCE(SUM(total), 0)::numeric AS revenue,
           COUNT(*)::numeric AS orders
    FROM orders
    GROUP BY created_at::date
    ORDER BY bucket
  ),
  agg AS (
    SELECT COUNT(*)::numeric AS orders,
           COALESCE(SUM(total), 0)::numeric AS revenue,
           COALESCE(SUM(total_items), 0)::numeric AS items
    FROM orders
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'orders', orders,
      'revenue', revenue,
      'avgOrderValue', CASE WHEN orders > 0 THEN revenue / orders ELSE NULL END,
      'items', items
    ),
    'timeseries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'revenue', revenue,
        'orders', orders
      )) FROM ts), '[]'::jsonb)
  ) FROM agg;
$$;

CREATE OR REPLACE FUNCTION public.get_woo_metrics(start_date date, end_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, exec_dashboard
AS $$
  WITH orders AS (
    SELECT *
    FROM exec_dashboard.raw_woocommerce_orders
    WHERE created_at::date BETWEEN start_date AND end_date
      AND COALESCE(status, '') NOT IN ('trash','refunded','cancelled','failed')
  ),
  ts AS (
    SELECT created_at::date AS bucket,
           COALESCE(SUM(total), 0)::numeric AS revenue,
           COUNT(*)::numeric AS orders
    FROM orders
    GROUP BY created_at::date
    ORDER BY bucket
  ),
  agg AS (
    SELECT COUNT(*)::numeric AS orders,
           COALESCE(SUM(total), 0)::numeric AS revenue,
           COALESCE(SUM(total_items), 0)::numeric AS items
    FROM orders
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'orders', orders,
      'revenue', revenue,
      'avgOrderValue', CASE WHEN orders > 0 THEN revenue / orders ELSE NULL END,
      'items', items
    ),
    'timeseries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', to_char(bucket, 'YYYY-MM-DD'),
        'revenue', revenue,
        'orders', orders
      )) FROM ts), '[]'::jsonb)
  ) FROM agg;
$$;

\i :semantic_migration_file

COMMIT;
