import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import type { ExternalSignal } from "@/lib/external-intelligence/contracts/external-signal";

/**
 * Phase A4: storage-record contracts (no DB implementation).
 *
 * Rule: immutable versions are stored as one row per (object_id, content_hash).
 * Stable tables are optional, but recommended for quick "current" resolution.
 */

export type StableObjectRecord = {
  object_id: string;
  current_content_hash: string; // points to immutable version row
  lifecycle_status: string | null;
  updated_at: string; // ISO
};

export type ImmutableVersionRecord<TPayload> = {
  object_id: string;
  content_hash: string;
  schema_version: string;

  // Policy pinning
  policy_refs: PolicyRef[];

  created_at: string; // ISO
  effective_at: string | null; // ISO; nullable when unknown
  valid_from: string | null;
  valid_until: string | null;

  // Supersession
  supersedes_content_hashes: string[];
  superseded_by_content_hash: string | null;

  // Canonical payload bytes (JSON-serializable)
  payload: TPayload;
};

export type EvidenceReferenceRecord = StableObjectRecord & {
  evidence_reference_id: string;
  source_id: string;
  source_config_version: string;
  legal_policy_version: string;
  retention_policy: string;
};

export type EvidenceReferenceVersionRecord = ImmutableVersionRecord<EvidenceReference> & {
  evidence_reference_id: string;
};

export type ClaimRecord = StableObjectRecord & {
  claim_id: string;
  evidence_reference_id: string;
  interpretation_policy_version: string;
};

export type ClaimVersionRecord = ImmutableVersionRecord<Claim> & {
  claim_id: string;
  evidence_reference_version_ref: VersionRef;
  claim_fingerprint: string;
};

export type ExternalSignalRecord = StableObjectRecord & {
  signal_id: string;
  signal_fingerprint: string;
};

export type ExternalSignalVersionRecord = ImmutableVersionRecord<ExternalSignal> & {
  signal_id: string;
  signal_fingerprint: string;

  // Required pinned inputs
  claim_version_refs: VersionRef[];
  evidence_reference_version_refs: VersionRef[];

  // Policy versions that must be preserved for reconstruction
  interpretation_policy_version: string;
  confidence_policy_version: string;
  disposition_policy_version: string;
  entity_resolution_version: string;
  source_registry_version: string;
  legal_policy_version: string;
};

export type LinkRecord = {
  from_ref: VersionRef;
  to_ref: VersionRef;
  relation: string;
  policy_version: string;
  created_at: string;
};

export type ProvenanceEdgeRecord = LinkRecord;

export type LifecycleTransitionRecord = {
  object_ref: VersionRef;
  from_status: string;
  to_status: string;
  reason_codes: string[];
  policy_version: string;
  effective_at: string;
  created_at: string;
};

export type CorrectionRecord = {
  object_ref: VersionRef;
  correction_type: "correction" | "retraction" | "supersession";
  supersedes_ref: VersionRef | null;
  superseded_by_ref: VersionRef | null;
  reason: string;
  policy_version: string;
  created_at: string;
};

export type SourceContributionRecord = {
  target_ref: VersionRef;
  source_id: string;
  source_set_id: string | null;
  evidence_reference_version_ref: VersionRef;
  created_at: string;
};

export type ProcessingRunStatus =
  | "started"
  | "completed"
  | "no_output"
  | "blocked"
  | "failed"
  | "persistence_incomplete";

export type ProcessingRunRecord = {
  run_id: string;
  input_set_fingerprint: string;
  source_registry_hash: string;
  source_sets_hash: string;
  policy_bundle_hash: string;
  policy_refs: PolicyRef[];
  engine_version: string;

  started_at: string;
  completed_at: string | null;
  status: ProcessingRunStatus;
  reason_codes: string[];

  input_refs: VersionRef[];
  output_refs: VersionRef[];

  counts: Record<string, number>;
  validation_result: "ok" | "failed";
  persistence_completeness: "complete" | "incomplete";
  error_summary: string | null;
  retry_of_run_id: string | null;
};

/**
 * Phase A4 migration design (proposal only; do not write migrations in A4).
 */
export const PROPOSED_PHASE_A5_MIGRATIONS = {
  forward: "supabase/migrations/YYYYMMDD_external_intelligence_phase_a5.sql",
  rollback: "supabase/migrations/YYYYMMDD_external_intelligence_phase_a5.rollback.sql"
} as const;

export const PROPOSED_EXTERNAL_INTELLIGENCE_TABLES = [
  "external_evidence_references_v1",
  "external_evidence_reference_versions_v1",
  "external_claims_v1",
  "external_claim_versions_v1",
  "external_signals_v1",
  "external_signal_versions_v1",
  "external_provenance_edges_v1",
  "external_lifecycle_transitions_v1",
  "external_corrections_v1",
  "external_source_contributions_v1",
  "external_processing_runs_v1"
] as const;
