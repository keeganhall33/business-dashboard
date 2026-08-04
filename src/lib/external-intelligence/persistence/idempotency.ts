import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

export function idempotencyKey(value: unknown): string {
  return canonicalJsonSha256Hex(value);
}

function stableVersionRefKey(ref: VersionRef) {
  // Idempotency must not depend on non-semantic metadata like created_at.
  return {
    object_type: ref.object_type,
    object_id: ref.object_id,
    content_hash: ref.content_hash,
    schema_version: ref.schema_version,
    policy_version: ref.policy_version
  };
}

export function evidenceReferenceIdempotencyKey(input: {
  evidence_reference_id: string;
  content_hash: string | null;
  source_id: string;
  source_config_version: string;
}): string {
  return idempotencyKey(input);
}

export function claimIdempotencyKey(input: {
  claim_id: string;
  claim_fingerprint: string;
  evidence_reference_version_ref: VersionRef;
  interpretation_policy_version: string;
}): string {
  return idempotencyKey({
    claim_id: input.claim_id,
    claim_fingerprint: input.claim_fingerprint,
    evidence_reference_version_ref: stableVersionRefKey(input.evidence_reference_version_ref),
    interpretation_policy_version: input.interpretation_policy_version
  });
}

export function signalIdempotencyKey(input: {
  signal_id: string;
  signal_fingerprint: string;
  claim_version_refs: VersionRef[];
  interpretation_policy_version: string;
  entity_resolution_version: string;
}): string {
  return idempotencyKey({
    signal_id: input.signal_id,
    signal_fingerprint: input.signal_fingerprint,
    claim_version_refs: input.claim_version_refs.map(stableVersionRefKey),
    interpretation_policy_version: input.interpretation_policy_version,
    entity_resolution_version: input.entity_resolution_version
  });
}

export function provenanceEdgeIdempotencyKey(input: {
  from_ref: VersionRef;
  to_ref: VersionRef;
  relation: string;
  policy_version: string;
}): string {
  return idempotencyKey({
    from_ref: stableVersionRefKey(input.from_ref),
    to_ref: stableVersionRefKey(input.to_ref),
    relation: input.relation,
    policy_version: input.policy_version
  });
}

export function lifecycleTransitionIdempotencyKey(input: {
  object_ref: VersionRef;
  from_status: string;
  to_status: string;
  effective_at: string;
  policy_version: string;
  reason_codes: string[];
}): string {
  return idempotencyKey({
    object_ref: stableVersionRefKey(input.object_ref),
    from_status: input.from_status,
    to_status: input.to_status,
    effective_at: input.effective_at,
    policy_version: input.policy_version,
    reason_codes: [...input.reason_codes].sort()
  });
}

export function correctionIdempotencyKey(input: {
  object_ref: VersionRef;
  correction_type: "correction" | "retraction" | "supersession";
  supersedes_ref: VersionRef | null;
  policy_version: string;
  reason: string;
}): string {
  return idempotencyKey({
    object_ref: stableVersionRefKey(input.object_ref),
    correction_type: input.correction_type,
    supersedes_ref: input.supersedes_ref ? stableVersionRefKey(input.supersedes_ref) : null,
    policy_version: input.policy_version,
    reason: input.reason
  });
}

export function sourceContributionIdempotencyKey(input: {
  target_ref: VersionRef;
  source_id: string;
  source_set_id: string | null;
  evidence_reference_version_ref: VersionRef;
}): string {
  return idempotencyKey({
    target_ref: stableVersionRefKey(input.target_ref),
    source_id: input.source_id,
    source_set_id: input.source_set_id,
    evidence_reference_version_ref: stableVersionRefKey(input.evidence_reference_version_ref)
  });
}

export function processingRunIdempotencyKey(input: {
  input_set_fingerprint: string;
  source_registry_hash: string;
  policy_bundle_hash: string;
  engine_version: string;
}): string {
  return idempotencyKey({
    input_set_fingerprint: input.input_set_fingerprint,
    source_registry_hash: input.source_registry_hash,
    policy_bundle_hash: input.policy_bundle_hash,
    engine_version: input.engine_version
  });
}
