import "@/lib/server-only";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import type {
  ClaimRecord,
  ClaimVersionRecord,
  EvidenceReferenceRecord,
  EvidenceReferenceVersionRecord,
  ExternalSignalRecord,
  ExternalSignalVersionRecord,
  ProcessingRunRecord,
  ProvenanceEdgeRecord,
  LifecycleTransitionRecord,
  CorrectionRecord,
  SourceContributionRecord
} from "@/lib/external-intelligence/persistence/records";

/**
 * Row mappers are intentionally shallow and conservative.
 *
 * They:
 * - coerce known fields
 * - deepFreeze outputs
 *
 * Validation of payload_json happens at the contract boundary before persistence.
 */

export function mapEvidenceStableRow(row: Record<string, unknown>): EvidenceReferenceRecord {
  return deepFreeze({
    object_id: String(row.object_id ?? row.evidence_reference_id),
    evidence_reference_id: String(row.evidence_reference_id),
    current_content_hash: String(row.current_content_hash),
    lifecycle_status: row.lifecycle_status == null ? null : String(row.lifecycle_status),
    correction_status: String(row.correction_status) as EvidenceReferenceRecord["correction_status"],
    source_id: String(row.source_id),
    source_config_version: String(row.source_config_version),
    legal_policy_version: String(row.legal_policy_version),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  });
}

export function mapEvidenceVersionRow(row: Record<string, unknown>): EvidenceReferenceVersionRecord {
  return deepFreeze({
    object_id: String(row.object_id ?? row.evidence_reference_id),
    evidence_reference_id: String(row.evidence_reference_id),
    content_hash: String(row.content_hash),
    schema_version: String(row.schema_version),
    policy_refs: (row.policy_refs ?? row.policy_refs_json ?? []) as EvidenceReferenceVersionRecord["policy_refs"],
    created_at: String(row.created_at),
    effective_at: row.effective_at == null ? null : String(row.effective_at),
    valid_from: row.valid_from == null ? null : String(row.valid_from),
    valid_until: row.valid_until == null ? null : String(row.valid_until),
    supersedes_content_hashes: (row.supersedes_content_hashes ?? []) as string[],
    superseded_by_content_hash: row.superseded_by_content_hash == null ? null : String(row.superseded_by_content_hash),

    payload_available: Boolean(row.payload_available),
    payload_json: (row.payload_json ?? null) as EvidenceReferenceVersionRecord["payload_json"],

    retention_policy: String(row.retention_policy) as EvidenceReferenceVersionRecord["retention_policy"],
    retention_expires_at: row.retention_expires_at == null ? null : String(row.retention_expires_at),
    legal_hold: Boolean(row.legal_hold),
    access_revoked_at: row.access_revoked_at == null ? null : String(row.access_revoked_at),
    content_redacted_at: row.content_redacted_at == null ? null : String(row.content_redacted_at),
    redaction_reason: row.redaction_reason == null ? null : String(row.redaction_reason),

    source_id: String(row.source_id),
    source_config_version: String(row.source_config_version),
    legal_policy_version: String(row.legal_policy_version)
  });
}

export function mapClaimStableRow(row: Record<string, unknown>): ClaimRecord {
  return deepFreeze({
    object_id: String(row.object_id ?? row.claim_id),
    claim_id: String(row.claim_id),
    current_content_hash: String(row.current_content_hash),
    lifecycle_status: row.lifecycle_status == null ? null : String(row.lifecycle_status),
    correction_status: String(row.correction_status) as ClaimRecord["correction_status"],
    interpretation_policy_version: String(row.interpretation_policy_version),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  });
}

export function mapClaimVersionRow(row: Record<string, unknown>): ClaimVersionRecord {
  return deepFreeze({
    object_id: String(row.object_id ?? row.claim_id),
    claim_id: String(row.claim_id),
    content_hash: String(row.content_hash),
    schema_version: String(row.schema_version),
    policy_refs: (row.policy_refs ?? row.policy_refs_json ?? []) as ClaimVersionRecord["policy_refs"],
    created_at: String(row.created_at),
    effective_at: row.effective_at == null ? null : String(row.effective_at),
    valid_from: row.valid_from == null ? null : String(row.valid_from),
    valid_until: row.valid_until == null ? null : String(row.valid_until),
    supersedes_content_hashes: (row.supersedes_content_hashes ?? []) as string[],
    superseded_by_content_hash: row.superseded_by_content_hash == null ? null : String(row.superseded_by_content_hash),

    payload_available: Boolean(row.payload_available),
    payload_json: (row.payload_json ?? null) as ClaimVersionRecord["payload_json"],

    retention_policy: String(row.retention_policy) as ClaimVersionRecord["retention_policy"],
    retention_expires_at: row.retention_expires_at == null ? null : String(row.retention_expires_at),
    legal_hold: Boolean(row.legal_hold),
    access_revoked_at: row.access_revoked_at == null ? null : String(row.access_revoked_at),
    content_redacted_at: row.content_redacted_at == null ? null : String(row.content_redacted_at),
    redaction_reason: row.redaction_reason == null ? null : String(row.redaction_reason),

    evidence_reference_version_ref: row.evidence_reference_version_ref as ClaimVersionRecord["evidence_reference_version_ref"],
    claim_fingerprint: String(row.claim_fingerprint),
    interpretation_policy_version: String(row.interpretation_policy_version)
  });
}

export function mapSignalStableRow(row: Record<string, unknown>): ExternalSignalRecord {
  return deepFreeze({
    object_id: String(row.object_id ?? row.signal_id),
    signal_id: String(row.signal_id),
    current_content_hash: String(row.current_content_hash),
    lifecycle_status: row.lifecycle_status == null ? null : String(row.lifecycle_status),
    correction_status: String(row.correction_status) as ExternalSignalRecord["correction_status"],
    disposition: row.disposition == null ? null : String(row.disposition),
    confidence_summary: (row.confidence_summary_json ?? null) as ExternalSignalRecord["confidence_summary"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  });
}

export function mapSignalVersionRow(row: Record<string, unknown>): ExternalSignalVersionRecord {
  return deepFreeze({
    object_id: String(row.object_id ?? row.signal_id),
    signal_id: String(row.signal_id),
    content_hash: String(row.content_hash),
    schema_version: String(row.schema_version),
    policy_refs: (row.policy_refs ?? row.policy_refs_json ?? []) as ExternalSignalVersionRecord["policy_refs"],
    created_at: String(row.created_at),
    effective_at: row.effective_at == null ? null : String(row.effective_at),
    valid_from: row.valid_from == null ? null : String(row.valid_from),
    valid_until: row.valid_until == null ? null : String(row.valid_until),
    supersedes_content_hashes: (row.supersedes_content_hashes ?? []) as string[],
    superseded_by_content_hash: row.superseded_by_content_hash == null ? null : String(row.superseded_by_content_hash),

    payload_available: Boolean(row.payload_available),
    payload_json: (row.payload_json ?? null) as ExternalSignalVersionRecord["payload_json"],

    retention_policy: String(row.retention_policy) as ExternalSignalVersionRecord["retention_policy"],
    retention_expires_at: row.retention_expires_at == null ? null : String(row.retention_expires_at),
    legal_hold: Boolean(row.legal_hold),
    access_revoked_at: row.access_revoked_at == null ? null : String(row.access_revoked_at),
    content_redacted_at: row.content_redacted_at == null ? null : String(row.content_redacted_at),
    redaction_reason: row.redaction_reason == null ? null : String(row.redaction_reason),

    signal_fingerprint: String(row.signal_fingerprint),
    claim_version_refs: (row.claim_version_refs ?? row.claim_version_refs_json ?? []) as ExternalSignalVersionRecord["claim_version_refs"],
    evidence_reference_version_refs: (row.evidence_reference_version_refs ?? row.evidence_reference_version_refs_json ?? []) as ExternalSignalVersionRecord["evidence_reference_version_refs"],
    interpretation_policy_version: String(row.interpretation_policy_version),
    confidence_policy_version: String(row.confidence_policy_version),
    disposition_policy_version: String(row.disposition_policy_version),
    entity_resolution_version: String(row.entity_resolution_version),
    source_registry_version: String(row.source_registry_version),
    legal_policy_version: String(row.legal_policy_version)
  });
}

export function mapProcessingRunRow(row: Record<string, unknown>): ProcessingRunRecord {
  return deepFreeze(row as unknown as ProcessingRunRecord);
}

export function mapProvenanceEdgeRow(row: Record<string, unknown>): ProvenanceEdgeRecord {
  return deepFreeze(row as unknown as ProvenanceEdgeRecord);
}

export function mapLifecycleTransitionRow(row: Record<string, unknown>): LifecycleTransitionRecord {
  return deepFreeze(row as unknown as LifecycleTransitionRecord);
}

export function mapCorrectionRow(row: Record<string, unknown>): CorrectionRecord {
  return deepFreeze(row as unknown as CorrectionRecord);
}

export function mapSourceContributionRow(row: Record<string, unknown>): SourceContributionRecord {
  return deepFreeze(row as unknown as SourceContributionRecord);
}
