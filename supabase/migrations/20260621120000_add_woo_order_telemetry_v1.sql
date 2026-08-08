-- Woo telemetry ingestion (public schema)
-- Canonical semantics: woo_paid_net_v1

create table if not exists woo_order_telemetry_v1 (
  woo_order_id bigint primary key,
  status text not null,
  currency text not null,
  date_created_gmt timestamptz null,
  date_paid_gmt timestamptz null,
  date_modified_gmt timestamptz null,
  paid_pacific_date date null,

  gross_total_cents integer null,
  refunded_cents integer null,
  net_revenue_cents integer null,
  discount_cents integer null,
  tax_cents integer null,
  shipping_cents integer null,

  source_modified_gmt timestamptz null,
  ingested_at timestamptz not null default now(),
  source_checksum text null,

  is_deleted boolean not null default false
);

create index if not exists woo_order_telemetry_v1_paid_pacific_date_idx
  on woo_order_telemetry_v1(paid_pacific_date);

create index if not exists woo_order_telemetry_v1_date_modified_gmt_idx
  on woo_order_telemetry_v1(date_modified_gmt);

create table if not exists woo_ingestion_runs_v1 (
  run_id uuid primary key,
  definition_version text not null,
  started_at timestamptz not null,
  completed_at timestamptz null,
  status text not null, -- success|error

  requested_start_date date null,
  requested_end_date date null,

  proven_coverage_start date null,
  proven_coverage_end date null,

  pages_requested integer null,
  pages_completed integer null,

  rows_fetched integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_unchanged integer not null default 0,
  rows_failed integer not null default 0,

  retry_count integer not null default 0,
  error_summary text null,

  source_as_of_gmt timestamptz null
);

create index if not exists woo_ingestion_runs_v1_completed_at_idx
  on woo_ingestion_runs_v1(completed_at);
