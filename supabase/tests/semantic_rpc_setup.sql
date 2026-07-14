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
  order_id             bigint       NOT NULL,
  order_number         text         NOT NULL,
  status               text         NOT NULL,
  created_at           timestamptz  NOT NULL,
  updated_at           timestamptz,
  completed_at         timestamptz,
  currency             character(3) NOT NULL,
  subtotal             numeric(12,2) NOT NULL DEFAULT 0,
  discount_total       numeric(12,2) NOT NULL DEFAULT 0,
  shipping_total       numeric(12,2) NOT NULL DEFAULT 0,
  tax_total            numeric(12,2) NOT NULL DEFAULT 0,
  total                numeric(12,2) NOT NULL,
  total_items          integer      NOT NULL DEFAULT 0,
  customer_id          bigint,
  customer_email       text,
  coupon_codes         text[]       DEFAULT '{}'::text[],
  payment_method       text,
  payment_method_title text,
  meta                 jsonb        NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT raw_woocommerce_orders_pkey PRIMARY KEY (order_id)
);

CREATE INDEX idx_exec_orders_created_at ON exec_dashboard.raw_woocommerce_orders (created_at);
CREATE INDEX idx_exec_orders_status ON exec_dashboard.raw_woocommerce_orders (status);

INSERT INTO exec_dashboard.raw_woocommerce_orders (
  order_id,
  order_number,
  status,
  created_at,
  updated_at,
  completed_at,
  currency,
  subtotal,
  discount_total,
  shipping_total,
  tax_total,
  total,
  total_items,
  customer_id,
  customer_email,
  coupon_codes,
  payment_method,
  payment_method_title,
  meta
)
VALUES
  (103250, 'ORD-103250', 'completed', '2026-06-01 03:31:51+00', '2026-06-01 03:31:51+00', '2026-06-01 03:31:51+00', 'USD', 84.21, 0, 0, 0, 84.21, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103260, 'ORD-103260', 'completed', '2026-06-10 05:44:16+00', '2026-06-10 05:44:16+00', '2026-06-10 05:44:16+00', 'USD', 173.31, 0, 0, 0, 173.31, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103261, 'ORD-103261', 'completed', '2026-06-11 10:14:10+00', '2026-06-11 10:14:10+00', '2026-06-11 10:14:10+00', 'USD', 84.73, 0, 0, 0, 84.73, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103263, 'ORD-103263', 'completed', '2026-06-12 11:26:38+00', '2026-06-12 11:26:38+00', '2026-06-12 11:26:38+00', 'USD', 84.73, 0, 0, 0, 84.73, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103265, 'ORD-103265', 'completed', '2026-06-13 20:09:51+00', '2026-06-13 20:09:51+00', '2026-06-13 20:09:51+00', 'USD', 84.73, 0, 0, 0, 84.73, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103269, 'ORD-103269', 'completed', '2026-06-22 01:53:49+00', '2026-06-22 01:53:49+00', '2026-06-22 01:53:49+00', 'USD', 308.92, 0, 0, 0, 308.92, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103272, 'ORD-103272', 'completed', '2026-06-23 20:22:00+00', '2026-06-23 20:22:00+00', '2026-06-23 20:22:00+00', 'USD', 76.71, 0, 0, 0, 76.71, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103271, 'ORD-103271', 'cancelled', '2026-06-23 22:02:41+00', '2026-06-23 22:02:41+00', NULL, 'USD', 100.00, 0, 0, 0, 100.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103282, 'ORD-103282', 'completed', '2026-06-23 23:54:39+00', '2026-06-23 23:54:39+00', '2026-06-23 23:54:39+00', 'USD', 253.35, 0, 0, 0, 253.35, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103283, 'ORD-103283', 'completed', '2026-06-24 17:54:13+00', '2026-06-24 17:54:13+00', '2026-06-24 17:54:13+00', 'USD', 211.71, 0, 0, 0, 211.71, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103301, 'ORD-103301', 'completed', '2026-06-24 21:38:52+00', '2026-06-24 21:38:52+00', '2026-06-24 21:38:52+00', 'USD', 84.73, 0, 0, 0, 84.73, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103304, 'ORD-103304', 'completed', '2026-06-26 13:49:07+00', '2026-06-26 13:49:07+00', '2026-06-26 13:49:07+00', 'USD', 155.93, 0, 0, 0, 155.93, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103305, 'ORD-103305', 'completed', '2026-06-27 01:35:50+00', '2026-06-27 01:35:50+00', '2026-06-27 01:35:50+00', 'USD', 162.20, 0, 0, 0, 162.20, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103306, 'ORD-103306', 'completed', '2026-07-08 02:55:21+00', '2026-07-08 02:55:21+00', '2026-07-08 02:55:21+00', 'USD', 175.07, 0, 0, 0, 175.07, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103307, 'ORD-103307', 'completed', '2026-07-09 00:11:33+00', '2026-07-09 00:11:33+00', '2026-07-09 00:11:33+00', 'USD', 83.92, 0, 0, 0, 83.92, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103308, 'ORD-103308', 'completed', '2026-07-09 00:31:52+00', '2026-07-09 00:31:52+00', '2026-07-09 00:31:52+00', 'USD', 159.98, 0, 0, 0, 159.98, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103309, 'ORD-103309', 'completed', '2026-07-09 02:11:25+00', '2026-07-09 02:11:25+00', '2026-07-09 02:11:25+00', 'USD', 89.23, 0, 0, 0, 89.23, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103413, 'ORD-103413', 'completed', '2026-07-09 12:55:41+00', '2026-07-09 12:55:41+00', '2026-07-09 12:55:41+00', 'USD', 83.92, 0, 0, 0, 83.92, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (103414, 'ORD-103414', 'completed', '2026-07-09 19:11:12+00', '2026-07-09 19:11:12+00', '2026-07-09 19:11:12+00', 'USD', 174.91, 0, 0, 0, 174.91, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200010, 'ORD-200010', 'completed', '2026-03-08 09:30:00+00', '2026-03-08 09:30:00+00', '2026-03-08 09:30:00+00', 'USD', 123.45, 0, 0, 0, 123.45, 2, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200011, 'ORD-200011', 'completed', '2026-11-01 09:30:00+00', '2026-11-01 09:30:00+00', '2026-11-01 09:30:00+00', 'USD', 234.56, 0, 0, 0, 234.56, 3, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200100, 'ORD-200100', 'completed', '2026-07-15 16:45:00+00', '2026-07-15 16:45:00+00', '2026-07-15 16:45:00+00', 'USD', 150.00, 0, 0, 0, 150.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200101, 'ORD-200101', 'completed', '2026-07-15 18:10:00+00', '2026-07-15 18:10:00+00', '2026-07-15 18:10:00+00', 'CAD', 200.00, 0, 0, 0, 200.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200200, 'ORD-200200', 'completed', '2026-07-20 12:00:00+00', '2026-07-20 12:00:00+00', '2026-07-20 12:00:00+00', '   ', 90.00, 0, 0, 0, 90.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200201, 'ORD-200201', 'completed', '2026-07-20 13:00:00+00', '2026-07-20 13:00:00+00', '2026-07-20 13:00:00+00', '   ', 110.00, 0, 0, 0, 110.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200202, 'ORD-200202', 'completed', '2026-07-20 14:00:00+00', '2026-07-20 14:00:00+00', '2026-07-20 14:00:00+00', '   ', 130.00, 0, 0, 0, 130.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200250, 'ORD-200250', 'completed', '2026-07-25 12:00:00+00', '2026-07-25 12:00:00+00', '2026-07-25 12:00:00+00', '   ', 77.00, 0, 0, 0, 77.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200251, 'ORD-200251', 'completed', '2026-07-25 13:30:00+00', '2026-07-25 13:30:00+00', '2026-07-25 13:30:00+00', '   ', 33.00, 0, 0, 0, 33.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200300, 'ORD-200300', 'completed', '2026-07-21 10:00:00+00', '2026-07-21 10:00:00+00', '2026-07-21 10:00:00+00', 'USD', 0.00, 0, 0, 0, 0.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200301, 'ORD-200301', 'completed', '2026-07-21 12:00:00+00', '2026-07-21 12:00:00+00', '2026-07-21 12:00:00+00', 'USD', 0.00, 0, 0, 0, 0.00, 0, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200302, 'ORD-200302', 'completed', '2026-07-21 13:00:00+00', '2026-07-21 13:00:00+00', '2026-07-21 13:00:00+00', 'USD', 75.00, 0, 0, 0, 75.00, 0, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200400, 'ORD-200400', 'refunded', '2026-07-22 08:00:00+00', '2026-07-22 08:00:00+00', NULL, 'USD', 400.00, 0, 0, 0, 400.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200401, 'ORD-200401', 'failed', '2026-07-22 09:00:00+00', '2026-07-22 09:00:00+00', NULL, 'USD', 410.00, 0, 0, 0, 410.00, 1, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb),
  (200500, 'ORD-200500', 'completed', '2025-12-31 23:30:00+00', now(), now(), 'USD', 210.00, 0, 0, 0, 210.00, 2, NULL, NULL, '{}'::text[], 'card', 'Card', '{}'::jsonb);


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
