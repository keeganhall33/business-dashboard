\echo 'Installing public.get_woo_metrics_semantic_v1 wrapper (2026-07-14)'
\set ON_ERROR_STOP on

BEGIN;

-- Create wrapper that forwards to the exec_dashboard semantic RPC
CREATE OR REPLACE FUNCTION public.get_woo_metrics_semantic_v1(start_date date, end_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, exec_dashboard
AS $$
  SELECT exec_dashboard.get_woo_metrics_semantic(start_date, end_date);
$$;

ALTER FUNCTION public.get_woo_metrics_semantic_v1(date, date) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.get_woo_metrics_semantic_v1(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_woo_metrics_semantic_v1(date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_woo_metrics_semantic_v1(date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_woo_metrics_semantic_v1(date, date) TO service_role;

COMMIT;

DO $assert_wrapper$
DECLARE
  fn_oid oid;
  cfg text[];
  owner_name text;
  granted_service_role boolean;
  granted_anon boolean;
  granted_authenticated boolean;
  granted_public boolean;
  wrapper_payload jsonb;
  semantic_payload jsonb;
BEGIN
  fn_oid := 'public.get_woo_metrics_semantic_v1(date,date)'::regprocedure;
  IF fn_oid IS NULL THEN
    RAISE EXCEPTION 'Wrapper install: function not found';
  END IF;

  SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc WHERE oid = fn_oid;
  IF owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'Wrapper install: owner mismatch (%)', owner_name;
  END IF;

  SELECT proconfig INTO cfg FROM pg_proc WHERE oid = fn_oid;
  IF cfg IS NULL OR array_position(cfg, 'search_path=public, exec_dashboard') IS NULL THEN
    RAISE EXCEPTION 'Wrapper install: search_path not fixed (%)', cfg;
  END IF;

  SELECT has_function_privilege('service_role', fn_oid, 'EXECUTE') INTO granted_service_role;
  SELECT has_function_privilege('anon', fn_oid, 'EXECUTE') INTO granted_anon;
  SELECT has_function_privilege('authenticated', fn_oid, 'EXECUTE') INTO granted_authenticated;
  SELECT has_function_privilege('public', fn_oid, 'EXECUTE') INTO granted_public;

  IF NOT granted_service_role THEN
    RAISE EXCEPTION 'Wrapper install: service_role missing EXECUTE';
  END IF;
  IF granted_anon THEN
    RAISE EXCEPTION 'Wrapper install: anon unexpectedly has EXECUTE';
  END IF;
  IF granted_authenticated THEN
    RAISE EXCEPTION 'Wrapper install: authenticated unexpectedly has EXECUTE';
  END IF;
  IF granted_public THEN
    RAISE EXCEPTION 'Wrapper install: public unexpectedly has EXECUTE';
  END IF;

  SELECT public.get_woo_metrics_semantic_v1('2026-07-03','2026-07-09') INTO wrapper_payload;
  SELECT exec_dashboard.get_woo_metrics_semantic('2026-07-03','2026-07-09') INTO semantic_payload;
  IF wrapper_payload IS DISTINCT FROM semantic_payload THEN
    RAISE EXCEPTION 'Wrapper install: payload mismatch';
  END IF;
END
$assert_wrapper$;
