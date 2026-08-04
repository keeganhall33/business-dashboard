-- Fusion Engine v1 persistence tables (deterministic decision runs)
-- Idempotent: safe to re-run.

create table if not exists fusion_runs_v1 (
  run_id text primary key,
  generated_at timestamptz not null,

  input_set_fingerprint text not null,
  fusion_policy_version text not null,
  fusion_score_version text not null,

  constitution_hash text not null,
  roadmap_hash text not null,
  strategic_constraints_hash text not null,
  strategic_constraints_version text not null,

  external_context_snapshot jsonb not null default '{}'::jsonb,
  competitor_context_snapshot jsonb not null default '{}'::jsonb,
  strategic_constraints_snapshot jsonb not null default '{}'::jsonb,

  selected_candidate_id text not null,
  review_by timestamptz,

  daily_decision_package jsonb not null,
  decision_package_hash text not null,

  created_at timestamptz not null default now(),

  unique(input_set_fingerprint, fusion_policy_version, fusion_score_version, strategic_constraints_hash)
);

create index if not exists idx_fusion_runs_v1_generated_at
  on fusion_runs_v1(generated_at desc);

create table if not exists fusion_candidates_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references fusion_runs_v1(run_id) on delete cascade,
  candidate_id text not null,
  candidate_fingerprint text,
  normalized_candidate jsonb not null,
  gated_out boolean not null default false,
  gate_reasons jsonb not null default '[]'::jsonb,
  cluster_id text,
  created_at timestamptz not null default now(),
  unique(run_id, candidate_id)
);

create index if not exists idx_fusion_candidates_v1_run
  on fusion_candidates_v1(run_id);

create table if not exists fusion_rankings_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references fusion_runs_v1(run_id) on delete cascade,
  candidate_id text not null,
  rank integer not null,
  score_before_penalties numeric not null,
  final_score numeric not null,
  feature_values jsonb not null default '{}'::jsonb,
  penalties jsonb not null default '{}'::jsonb,
  gates jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '{}'::jsonb,
  dedupe_cluster_id text,
  created_at timestamptz not null default now(),
  unique(run_id, candidate_id)
);

create index if not exists idx_fusion_rankings_v1_run_rank
  on fusion_rankings_v1(run_id, rank asc);

