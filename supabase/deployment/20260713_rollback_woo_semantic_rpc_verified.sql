-- Verified rollback: capture evidence, drop the semantic RPC, re-verify legacy functions.
\set ON_ERROR_STOP on

DO $rollback$
DECLARE
  semantic_definition text;
  legacy_exec text;
  legacy_public text;
  legacy_usage boolean := FALSE;
BEGIN
  IF to_regprocedure('exec_dashboard.get_woo_metrics_semantic(date,date)') IS NULL THEN
    RAISE NOTICE 'Rollback skipped: exec_dashboard.get_woo_metrics_semantic(date,date) not found';
    RETURN;
  END IF;

  SELECT has_schema_privilege('service_role','exec_dashboard','USAGE') INTO legacy_usage;
  SELECT pg_get_functiondef('exec_dashboard.get_woo_metrics_semantic(date,date)'::regprocedure)
    INTO semantic_definition;
  RAISE NOTICE 'semantic_definition:%', semantic_definition;

  EXECUTE 'DROP FUNCTION exec_dashboard.get_woo_metrics_semantic(date, date)';

  IF to_regprocedure('exec_dashboard.get_woo_metrics_semantic(date,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback failed: function still exists';
  END IF;

  EXECUTE 'REVOKE USAGE ON SCHEMA exec_dashboard FROM service_role';
  IF legacy_usage THEN
    EXECUTE 'GRANT USAGE ON SCHEMA exec_dashboard TO service_role';
  END IF;

  SELECT pg_get_functiondef('exec_dashboard.get_woo_metrics(date,date)'::regprocedure)
    INTO legacy_exec;
  IF encode(digest(legacy_exec::bytea, 'sha256'), 'hex') <> 'f8df94b2e39f1750c6c6620f1bef235c5f94909e77b17c5d6459067b3a54a459' THEN
    RAISE EXCEPTION 'Rollback: exec_dashboard.get_woo_metrics hash mismatch';
  END IF;

  SELECT pg_get_functiondef('public.get_woo_metrics(date,date)'::regprocedure)
    INTO legacy_public;
  IF encode(digest(legacy_public::bytea, 'sha256'), 'hex') <> '114423532467e6abea3e1167d7d7068df6fc8292951c1935712174f35f1c23e0' THEN
    RAISE EXCEPTION 'Rollback: public.get_woo_metrics hash mismatch';
  END IF;

  RAISE NOTICE 'Rollback completed successfully.';
END
$rollback$;
