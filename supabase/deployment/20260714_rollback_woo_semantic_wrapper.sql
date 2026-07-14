\echo 'Rolling back public.get_woo_metrics_semantic_v1 wrapper (2026-07-14)'
\set ON_ERROR_STOP on

DO $rollback_wrapper$
BEGIN
  IF to_regprocedure('public.get_woo_metrics_semantic_v1(date,date)') IS NULL THEN
    RAISE NOTICE 'Wrapper already absent; skipping drop.';
    RETURN;
  END IF;

  EXECUTE 'DROP FUNCTION public.get_woo_metrics_semantic_v1(date, date)';

  IF to_regprocedure('public.get_woo_metrics_semantic_v1(date,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback: wrapper still present after drop attempt';
  END IF;
END
$rollback_wrapper$;
