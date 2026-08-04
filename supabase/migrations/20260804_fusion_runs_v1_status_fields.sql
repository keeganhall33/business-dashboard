-- Fusion runs v1: add queryable run status fields

alter table fusion_runs_v1
  add column if not exists run_status text,
  add column if not exists reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists candidate_total_count integer not null default 0,
  add column if not exists candidate_fresh_count integer not null default 0,
  add column if not exists candidate_stale_count integer not null default 0,
  add column if not exists candidate_gated_count integer not null default 0,
  add column if not exists candidate_eligible_count integer not null default 0,
  add column if not exists independent_cluster_count integer not null default 0,
  add column if not exists next_review_at timestamptz,
  add column if not exists execution_mode text;

create index if not exists idx_fusion_runs_v1_status_generated
  on fusion_runs_v1(run_status, generated_at desc);

