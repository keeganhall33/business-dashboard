-- Verified rollback: capture evidence, drop the semantic RPC, re-verify legacy functions.
\set ON_ERROR_STOP on
BEGIN;

DO $precheck$
BEGIN
  IF to_regprocedure('exec_dashboard.get_woo_metrics_semantic(date,date)') IS NULL THEN
    RAISE EXCEPTION 'Rollback aborted: exec_dashboard.get_woo_metrics_semantic(date,date) not found';
  END IF;
END
$precheck$;

-- Capture definition for audit (SELECT can be logged externally)
SELECT pg_get_functiondef('exec_dashboard.get_woo_metrics_semantic(date,date)'::regprocedure) AS semantic_definition;

DROP FUNCTION exec_dashboard.get_woo_metrics_semantic(date, date);

-- Verify removal
DO $check_removed$
BEGIN
  IF to_regprocedure('exec_dashboard.get_woo_metrics_semantic(date,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback failed: function still exists';
  END IF;
END
$check_removed$;

-- Ensure legacy functions still match baseline
DO $legacy$
DECLARE
  legacy_exec text;
  legacy_public text;
BEGIN
  SELECT pg_get_functiondef('exec_dashboard.get_woo_metrics(date,date)'::regprocedure) INTO legacy_exec;
  IF encode(digest(legacy_exec::bytea, 'sha256'), 'hex') <> '38eee86208e71b0d31a94459ec76e156508c68229b2409280c8d6f62e70a6b76' THEN
    RAISE EXCEPTION 'Rollback: exec_dashboard.get_woo_metrics hash mismatch';
  END IF;

  SELECT pg_get_functiondef('public.get_woo_metrics(date,date)'::regprocedure) INTO legacy_public;
  IF encode(digest(legacy_public::bytea, 'sha256'), 'hex') <> '5240b593063638795b1a02b66d4fe05ce5b22ef2d6b40c74b8034c3ce8b3f50e' THEN
    RAISE EXCEPTION 'Rollback: public.get_woo_metrics hash mismatch';
  END IF;
END
$legacy$;

COMMIT;
