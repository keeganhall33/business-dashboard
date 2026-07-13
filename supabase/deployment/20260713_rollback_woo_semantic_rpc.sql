-- Emergency rollback: drops only the semantic RPC.
\set ON_ERROR_STOP on
BEGIN;
DROP FUNCTION IF EXISTS exec_dashboard.get_woo_metrics_semantic(date, date);
COMMIT;
