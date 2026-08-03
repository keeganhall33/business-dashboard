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

create table if not exists intelligence_opportunities_v1 (
  opportunity_id text primary key,
  finding_id text not null references intelligence_findings_v1(finding_id) on delete cascade,
  hypothesis_ids text[] not null default array[]::text[],
  type text not null,
  title text not null,
  why_now text not null,
  risk_if_ignored text not null,
  missing_evidence jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  evidence_for jsonb not null,
  evidence_against jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists intelligence_recommendations_v1 (
  recommendation_id text primary key,
  opportunity_id text not null references intelligence_opportunities_v1(opportunity_id) on delete cascade,
  finding_id text not null references intelligence_findings_v1(finding_id) on delete cascade,
  hypothesis_id text not null references intelligence_hypotheses_v1(hypothesis_id) on delete cascade,
  title text not null,
  action text not null,
  rationale text not null,
  success_metrics jsonb not null,
  evaluation_window jsonb not null,
  stop_condition text,
  what_changes_my_mind jsonb not null default '[]'::jsonb,
  confidence jsonb not null,
  created_at timestamptz not null default now()
);

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
