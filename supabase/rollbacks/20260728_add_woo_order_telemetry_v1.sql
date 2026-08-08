-- Rollback for 20260728_add_woo_order_telemetry_v1.sql

-- Note: dropping tables is destructive for staging telemetry, but safe as a rollback
-- strategy in staging. Do not run on production unless explicitly approved.

drop index if exists woo_ingestion_runs_v1_completed_at_idx;
drop table if exists woo_ingestion_runs_v1;

drop index if exists woo_order_telemetry_v1_date_modified_gmt_idx;
drop index if exists woo_order_telemetry_v1_paid_pacific_date_idx;
drop table if exists woo_order_telemetry_v1;
