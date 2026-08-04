-- Phase A5: External Intelligence Database Foundation (schema-only; dormant)
-- Authoritative spec: EXTERNAL_INTELLIGENCE_MIGRATION_SPEC_V1 (Phase A4)

-- =========================================================
-- 0) Dependencies
-- =========================================================

-- This migration creates updated_at triggers that depend on set_updated_at().
-- In production, set_updated_at() exists in the canonical schema mirror, but
-- this migration must also apply cleanly to an empty disposable database.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
  ) then
    create function set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end
$$;

-- =========================================================
-- 1) Stable object tables (no stable->current FK yet; added after version tables exist)
-- =========================================================

create table if not exists external_evidence_references_v1 (
  evidence_reference_id text primary key,
  current_content_hash text not null,
  lifecycle_status text,
  correction_status text not null default 'none' check (correction_status in ('none','corrected','retracted','superseded')),
  source_id text not null,
  source_config_version text not null,
  legal_policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_external_evidence_references_v1_updated_at on external_evidence_references_v1;
create trigger trg_external_evidence_references_v1_updated_at
before update on external_evidence_references_v1
for each row execute function set_updated_at();

create index if not exists external_evidence_references_v1__source_id_idx
  on external_evidence_references_v1(source_id);
create index if not exists external_evidence_references_v1__lifecycle_status_idx
  on external_evidence_references_v1(lifecycle_status);

create table if not exists external_claims_v1 (
  claim_id text primary key,
  current_content_hash text not null,
  lifecycle_status text,
  correction_status text not null default 'none' check (correction_status in ('none','corrected','retracted','superseded')),
  interpretation_policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_external_claims_v1_updated_at on external_claims_v1;
create trigger trg_external_claims_v1_updated_at
before update on external_claims_v1
for each row execute function set_updated_at();

create index if not exists external_claims_v1__lifecycle_status_idx
  on external_claims_v1(lifecycle_status);
create index if not exists external_claims_v1__updated_at_idx
  on external_claims_v1(updated_at);

create table if not exists external_signals_v1 (
  signal_id text primary key,
  current_content_hash text not null,
  lifecycle_status text,
  correction_status text not null default 'none' check (correction_status in ('none','corrected','retracted','superseded')),
  disposition text,
  confidence_summary_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_external_signals_v1_updated_at on external_signals_v1;
create trigger trg_external_signals_v1_updated_at
before update on external_signals_v1
for each row execute function set_updated_at();

create index if not exists external_signals_v1__lifecycle_status_idx
  on external_signals_v1(lifecycle_status);
create index if not exists external_signals_v1__disposition_idx
  on external_signals_v1(disposition);

-- =========================================================
-- 2) Immutable version tables
-- =========================================================

create table if not exists external_evidence_reference_versions_v1 (
  evidence_reference_id text not null references external_evidence_references_v1(evidence_reference_id) on delete restrict,
  content_hash text not null,
  schema_version text not null,
  source_id text not null,
  source_config_version text not null,
  legal_policy_version text not null,

  policy_refs_json jsonb not null default '[]'::jsonb,

  effective_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,

  supersedes_content_hashes jsonb not null default '[]'::jsonb,
  superseded_by_content_hash text,

  payload_json jsonb,

  retention_policy text not null default 'retain' check (retention_policy in ('retain','link_only','tombstone')),
  retention_expires_at timestamptz,
  legal_hold boolean not null default false,
  access_revoked_at timestamptz,
  content_redacted_at timestamptz,
  redaction_reason text,
  payload_available boolean not null default true,

  created_at timestamptz not null default now(),

  primary key (evidence_reference_id, content_hash),
  unique (evidence_reference_id, content_hash),
  constraint external_evidence_reference_versions_v1__payload_consistency_check
    check (
      (payload_available = true and payload_json is not null)
      or
      (payload_available = false and payload_json is null)
    )
);

create index if not exists external_evidence_reference_versions_v1__content_hash_idx
  on external_evidence_reference_versions_v1(content_hash);
create index if not exists external_evidence_reference_versions_v1__source_id_idx
  on external_evidence_reference_versions_v1(source_id);
create index if not exists external_evidence_reference_versions_v1__created_at_idx
  on external_evidence_reference_versions_v1(created_at);

create table if not exists external_claim_versions_v1 (
  claim_id text not null references external_claims_v1(claim_id) on delete restrict,
  content_hash text not null,
  schema_version text not null,

  claim_fingerprint text not null,
  interpretation_policy_version text not null,
  interpretation_policy_hash text not null,

  evidence_reference_version_ref_json jsonb not null,
  policy_refs_json jsonb not null default '[]'::jsonb,

  effective_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,

  supersedes_content_hashes jsonb not null default '[]'::jsonb,
  superseded_by_content_hash text,

  payload_json jsonb,

  retention_policy text not null default 'retain' check (retention_policy in ('retain','link_only','tombstone')),
  retention_expires_at timestamptz,
  legal_hold boolean not null default false,
  access_revoked_at timestamptz,
  content_redacted_at timestamptz,
  redaction_reason text,
  payload_available boolean not null default true,

  created_at timestamptz not null default now(),

  primary key (claim_id, content_hash),
  unique (claim_id, content_hash),
  constraint external_claim_versions_v1__payload_consistency_check
    check (
      (payload_available = true and payload_json is not null)
      or
      (payload_available = false and payload_json is null)
    )
);

-- semantic uniqueness (only when payload is available)
create unique index if not exists external_claim_versions_v1__fingerprint_policy_uniq
  on external_claim_versions_v1(claim_fingerprint, interpretation_policy_hash)
  where payload_available = true;

create index if not exists external_claim_versions_v1__content_hash_idx
  on external_claim_versions_v1(content_hash);
create index if not exists external_claim_versions_v1__fingerprint_idx
  on external_claim_versions_v1(claim_fingerprint);
create index if not exists external_claim_versions_v1__created_at_idx
  on external_claim_versions_v1(created_at);

create table if not exists external_signal_versions_v1 (
  signal_id text not null references external_signals_v1(signal_id) on delete restrict,
  content_hash text not null,
  schema_version text not null,

  signal_fingerprint text not null,

  interpretation_policy_version text not null,
  interpretation_policy_hash text not null,
  confidence_policy_version text not null,
  disposition_policy_version text not null,
  entity_resolution_version text not null,
  source_registry_version text not null,
  legal_policy_version text not null,

  policy_refs_json jsonb not null default '[]'::jsonb,
  claim_version_refs_json jsonb not null default '[]'::jsonb,
  evidence_reference_version_refs_json jsonb not null default '[]'::jsonb,

  effective_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,

  supersedes_content_hashes jsonb not null default '[]'::jsonb,
  superseded_by_content_hash text,

  payload_json jsonb,

  retention_policy text not null default 'retain' check (retention_policy in ('retain','link_only','tombstone')),
  retention_expires_at timestamptz,
  legal_hold boolean not null default false,
  access_revoked_at timestamptz,
  content_redacted_at timestamptz,
  redaction_reason text,
  payload_available boolean not null default true,

  created_at timestamptz not null default now(),

  primary key (signal_id, content_hash),
  unique (signal_id, content_hash),
  constraint external_signal_versions_v1__payload_consistency_check
    check (
      (payload_available = true and payload_json is not null)
      or
      (payload_available = false and payload_json is null)
    )
);

-- semantic uniqueness (only when payload is available)
create unique index if not exists external_signal_versions_v1__fingerprint_policy_er_uniq
  on external_signal_versions_v1(signal_fingerprint, interpretation_policy_hash, entity_resolution_version)
  where payload_available = true;

create index if not exists external_signal_versions_v1__content_hash_idx
  on external_signal_versions_v1(content_hash);
create index if not exists external_signal_versions_v1__fingerprint_idx
  on external_signal_versions_v1(signal_fingerprint);
create index if not exists external_signal_versions_v1__created_at_idx
  on external_signal_versions_v1(created_at);

-- =========================================================
-- 3) Stable-current-version foreign keys (deferrable)
-- =========================================================

alter table external_evidence_references_v1
  drop constraint if exists external_evidence_references_v1__current_version_fk;
alter table external_evidence_references_v1
  add constraint external_evidence_references_v1__current_version_fk
  foreign key (evidence_reference_id, current_content_hash)
  references external_evidence_reference_versions_v1(evidence_reference_id, content_hash)
  on delete restrict
  deferrable initially deferred;

alter table external_claims_v1
  drop constraint if exists external_claims_v1__current_version_fk;
alter table external_claims_v1
  add constraint external_claims_v1__current_version_fk
  foreign key (claim_id, current_content_hash)
  references external_claim_versions_v1(claim_id, content_hash)
  on delete restrict
  deferrable initially deferred;

alter table external_signals_v1
  drop constraint if exists external_signals_v1__current_version_fk;
alter table external_signals_v1
  add constraint external_signals_v1__current_version_fk
  foreign key (signal_id, current_content_hash)
  references external_signal_versions_v1(signal_id, content_hash)
  on delete restrict
  deferrable initially deferred;

-- =========================================================
-- 4) Provenance topology + lifecycle + corrections + source contributions (polymorphic; no FKs)
-- =========================================================

create table if not exists external_provenance_edges_v1 (
  edge_id text primary key,

  from_object_type text not null,
  from_object_id text not null,
  from_content_hash text not null,

  to_object_type text not null,
  to_object_id text not null,
  to_content_hash text not null,

  relation text not null,

  policy_version text not null,
  policy_hash text not null,

  from_ref_json jsonb not null,
  to_ref_json jsonb not null,

  metadata_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  unique (
    from_object_type,
    from_object_id,
    from_content_hash,
    to_object_type,
    to_object_id,
    to_content_hash,
    relation,
    policy_hash
  ),

  constraint external_provenance_edges_v1__no_self_cycle_check
    check (not (
      from_object_type = to_object_type
      and from_object_id = to_object_id
      and from_content_hash = to_content_hash
      and relation = 'supersedes'
    ))
);

create index if not exists external_provenance_edges_v1__from_idx
  on external_provenance_edges_v1(from_object_type, from_object_id, from_content_hash);
create index if not exists external_provenance_edges_v1__to_idx
  on external_provenance_edges_v1(to_object_type, to_object_id, to_content_hash);
create index if not exists external_provenance_edges_v1__relation_idx
  on external_provenance_edges_v1(relation);

create table if not exists external_lifecycle_transitions_v1 (
  transition_id text primary key,

  object_type text not null,
  object_id text not null,
  content_hash text not null,
  object_ref_json jsonb not null,

  from_status text not null,
  to_status text not null,
  effective_at timestamptz not null,
  reason_codes jsonb not null default '[]'::jsonb,

  policy_version text not null,
  policy_hash text not null,

  created_at timestamptz not null default now(),

  unique (object_type, object_id, content_hash, from_status, to_status, effective_at, policy_hash)
);

create index if not exists external_lifecycle_transitions_v1__object_idx
  on external_lifecycle_transitions_v1(object_type, object_id, content_hash);
create index if not exists external_lifecycle_transitions_v1__effective_at_idx
  on external_lifecycle_transitions_v1(effective_at);

create table if not exists external_corrections_v1 (
  correction_id text primary key,

  object_type text not null,
  object_id text not null,
  content_hash text not null,
  object_ref_json jsonb not null,

  correction_type text not null check (correction_type in ('correction','retraction','supersession')),

  supersedes_ref_json jsonb,
  superseded_by_ref_json jsonb,

  reason text not null,

  policy_version text not null,
  policy_hash text not null,

  created_at timestamptz not null default now(),

  unique (object_type, object_id, content_hash, correction_type, policy_hash)
);

create index if not exists external_corrections_v1__object_idx
  on external_corrections_v1(object_type, object_id, content_hash);
create index if not exists external_corrections_v1__type_idx
  on external_corrections_v1(correction_type);

create table if not exists external_source_contributions_v1 (
  contribution_id text primary key,

  target_object_type text not null,
  target_object_id text not null,
  target_content_hash text not null,
  target_ref_json jsonb not null,

  source_id text not null,
  source_set_id text,

  evidence_reference_object_id text not null,
  evidence_reference_content_hash text not null,
  evidence_reference_version_ref_json jsonb not null,

  created_at timestamptz not null default now(),

  unique (
    target_object_type,
    target_object_id,
    target_content_hash,
    source_id,
    evidence_reference_object_id,
    evidence_reference_content_hash
  )
);

create index if not exists external_source_contributions_v1__target_idx
  on external_source_contributions_v1(target_object_type, target_object_id, target_content_hash);
create index if not exists external_source_contributions_v1__source_id_idx
  on external_source_contributions_v1(source_id);

-- =========================================================
-- 5) Processing runs (completeness boundary)
-- =========================================================

create table if not exists external_processing_runs_v1 (
  run_id text primary key,
  retry_of_run_id text references external_processing_runs_v1(run_id) on delete restrict,

  input_set_fingerprint text not null,
  source_registry_hash text not null,
  source_sets_hash text not null,
  policy_bundle_hash text not null,
  engine_version text not null,

  policy_refs_json jsonb not null default '[]'::jsonb,

  status text not null default 'started' check (status in ('started','completed','no_output','blocked','failed','persistence_incomplete')),
  reason_codes jsonb not null default '[]'::jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  input_refs_json jsonb not null default '[]'::jsonb,
  output_refs_json jsonb not null default '[]'::jsonb,

  expected_output_count integer not null default 0,
  persisted_output_count integer not null default 0,

  required_provenance_edges_json jsonb not null default '[]'::jsonb,

  persistence_complete boolean not null default false,
  validation_complete boolean not null default false,
  validation_result text not null default 'ok' check (validation_result in ('ok','failed')),

  error_summary text,

  unique (input_set_fingerprint, source_registry_hash, policy_bundle_hash, engine_version),

  constraint external_processing_runs_v1__counts_check
    check (
      expected_output_count >= 0
      and persisted_output_count >= 0
      and persisted_output_count <= expected_output_count
    ),

  constraint external_processing_runs_v1__completed_requires_completeness_check
    check (
      status <> 'completed'
      or (
        persistence_complete = true
        and validation_complete = true
        and persisted_output_count = expected_output_count
      )
    )
);

create index if not exists external_processing_runs_v1__status_idx
  on external_processing_runs_v1(status);
create index if not exists external_processing_runs_v1__idempotency_lookup_idx
  on external_processing_runs_v1(input_set_fingerprint, source_registry_hash, policy_bundle_hash, engine_version);
create index if not exists external_processing_runs_v1__started_at_idx
  on external_processing_runs_v1(started_at);
