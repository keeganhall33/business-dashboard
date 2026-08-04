import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].slice().sort((a, b) => a.localeCompare(b));
}

/**
 * EvidenceReference fingerprint (deterministic)
 * Excludes non-semantic provenance_metadata to avoid contaminating identity.
 */
export function createEvidenceReferenceFingerprint(input: {
  source_id: string;
  source_config_version: string;
  source_set_id: string | null;
  source_artifact_identifier: string | null;
  source_url_or_reference: string;
  content_hash: string | null;
  // NOTE: Artifact identity vs retrieval occurrence
  // - Artifact identity: content_hash (when available) and the semantic fields below.
  // - Retrieval occurrence: retrieved_at is metadata-only and intentionally excluded.
  // This prevents repeated retrieval of identical content from inflating corroboration.
  retrieved_at: string;
  published_at: string | null;
  event_time: string | null;
  evidence_type: string;
  access_classification: string;
  legal_policy_version: string;
  retention_policy: string;
  excerpt_or_summary_reference: string | null;
  source_credibility_prior: string;
  correction_status: string;
  retraction_status: string;
  supersedes_evidence_reference_id: string | null;
  schema_version: string;
}): string {
  const { retrieved_at, ...semantic } = input;
  void retrieved_at;

  return sha256CanonicalJson(semantic);
}

/**
 * Claim fingerprint inputs follow the merged architecture:
 * subject entity id (if resolved), predicate, object identity, times, observed/inferred, verification, window,
 * and policy/schema versions.
 */
export function createClaimFingerprint(input: {
  evidence_reference_id: string;
  subject_entity_id: string | null;
  predicate: string;
  object: { kind: "entity"; entity_id: string } | { kind: "literal"; value: unknown; unit: string | null };
  event_time: string | null;
  announcement_time: string | null;
  observed_vs_inferred: string;
  verification_state: string;
  relevance_window: { start: string | null; end: string | null };
  schema_version: string;
  interpretation_policy_version: string;
}): string {
  return sha256CanonicalJson(input);
}

/**
 * ExternalSignal fingerprint inputs follow the merged architecture:
 * normalized entities, signal type, core claim identity, event window, domains, mechanism, geography.
 *
 * Set-like arrays are normalized (sorted) before hashing.
 */
export function createExternalSignalFingerprint(input: {
  entity_ids: string[];
  signal_type: string;
  core_claim_fingerprint: string;
  event_window: { start: string | null; end: string | null };
  business_domains: string[];
  geography: string | null;
  mechanism: string | null;
}): string {
  return sha256CanonicalJson({
    entity_ids: sortedUnique(input.entity_ids),
    signal_type: input.signal_type,
    core_claim_fingerprint: input.core_claim_fingerprint,
    event_window: input.event_window,
    business_domains: sortedUnique(input.business_domains),
    geography: input.geography,
    mechanism: input.mechanism
  });
}
