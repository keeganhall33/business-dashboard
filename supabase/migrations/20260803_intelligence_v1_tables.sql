-- Phase 2 Intelligence: v1 persisted chain tables
-- Facts → Findings → Hypotheses → Opportunities → Recommendations → Outcomes

create table if not exists intelligence_facts_v1 (
  fact_id uuid primary key default gen_random_uuid(),
  metric_id text not null,
  value numeric not null,
  unit text not null,
  business_date date not null,
  window_start timestamptz,
  window_end timestamptz,
  timezone text not null default 'America/Los_Angeles',
  window_type text not null,
  dimensions jsonb not null default '{}'::jsonb,
  source_system text not null,
  source_run_id text,
  snapshot_id text,
  retrieved_at timestamptz,
  source_as_of timestamptz,
  freshness_state text,
  coverage_state text,
  attribution_defensible text,
  confidence_state text,
  metric_definition_version text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_intelligence_facts_v1_unique
  on intelligence_facts_v1(metric_id, business_date, window_type, source_system, metric_definition_version, (md5(dimensions::text)));

create table if not exists intelligence_findings_v1 (
  finding_id text primary key,
  detector_id text not null,
  engine_version text not null,
  type text not null,
  title text not null,
  summary text not null,
  window jsonb not null,
  materiality_score numeric,
  false_positive_guards jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  facts_primary jsonb not null,
  evidence_for jsonb not null,
  evidence_against jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists intelligence_hypotheses_v1 (
  hypothesis_id text primary key,
  finding_id text not null references intelligence_findings_v1(finding_id) on delete cascade,
  engine_version text not null,
  statement text not null,
  mechanism text not null,
  predictions jsonb not null default '[]'::jsonb,
  tests jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  evidence_for jsonb not null,
  evidence_against jsonb not null,
  created_at timestamptz not null default now()
);

-- Canonical intelligence recommendation history store (read-only by default).
-- Actions will later reference these recommendation records.
create table if not exists intelligence_recommendations_v1 (
  recommendation_id text primary key,
  recommendation_fingerprint text not null,
  action_key text not null,
  detector_id text not null,
  detector_version text not null,
  recommendation_policy_version text not null,
  finding_id text not null references intelligence_findings_v1(finding_id) on delete cascade,
  hypothesis_ids text[] not null default array[]::text[],
  opportunity_id text not null,
  evidence_window jsonb not null,
  baseline_window jsonb not null,
  evaluation_window jsonb not null,
  success_metrics jsonb not null,
  success_threshold text not null,
  stop_condition text not null,
  what_changes_my_mind jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_intelligence_recommendations_v1_fingerprint
  on intelligence_recommendations_v1(recommendation_fingerprint);

-- NOTE: We intentionally do not persist separate recommendation/opportunity tables yet.
-- This vertical slice reuses the existing recommendation + action-store contracts and
-- records the full chain in system_runs/job_run_log outputs_json for audit.

create table if not exists intelligence_evidence_edges_v1 (
  edge_id uuid primary key default gen_random_uuid(),
  from_type text not null,
  from_id text not null,
  to_type text not null,
  to_id text not null,
  relation text not null,
  weight numeric not null default 1,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_intelligence_edges_from on intelligence_evidence_edges_v1(from_type, from_id);
create index if not exists idx_intelligence_edges_to on intelligence_evidence_edges_v1(to_type, to_id);
