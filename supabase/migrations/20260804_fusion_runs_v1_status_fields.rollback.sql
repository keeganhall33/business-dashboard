-- Rollback: remove fusion_runs_v1 status fields

drop index if exists idx_fusion_runs_v1_status_generated;

alter table fusion_runs_v1
  drop constraint if exists chk_fusion_runs_v1_execution_mode,
  drop constraint if exists chk_fusion_runs_v1_run_status,
  drop column if exists execution_mode,
  drop column if exists next_review_at,
  drop column if exists independent_cluster_count,
  drop column if exists candidate_eligible_count,
  drop column if exists candidate_gated_count,
  drop column if exists candidate_stale_count,
  drop column if exists candidate_fresh_count,
  drop column if exists candidate_total_count,
  drop column if exists reason_codes,
  drop column if exists run_status;
