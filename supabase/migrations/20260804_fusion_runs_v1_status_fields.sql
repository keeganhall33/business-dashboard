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

alter table fusion_runs_v1
  drop constraint if exists chk_fusion_runs_v1_run_status,
  add constraint chk_fusion_runs_v1_run_status
    check (run_status is null or run_status in (
      'completed_with_decision',
      'completed_hold',
      'completed_monitor',
      'insufficient_candidates',
      'no_fresh_candidates',
      'blocked_by_data_quality',
      'failed'
    ));

alter table fusion_runs_v1
  drop constraint if exists chk_fusion_runs_v1_execution_mode,
  add constraint chk_fusion_runs_v1_execution_mode
    check (execution_mode is null or execution_mode in ('comparative','single_candidate','no_candidate'));

create index if not exists idx_fusion_runs_v1_status_generated
  on fusion_runs_v1(run_status, generated_at desc);
