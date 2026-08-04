import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";

function mkEvidencePayload(id: string, content_hash: string): EvidenceReference {
  const now = new Date().toISOString();
  return {
    evidence_reference_id: id,
    source_id: "source1",
    source_config_version: "v1.0.0",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://example.com",
    content_hash,
    retrieved_at: now,
    published_at: null,
    event_time: null,
    evidence_type: "report",
    access_classification: "public",
    legal_policy_version: "legal/v1.0.0",
    retention_policy: "link_only",
    excerpt_or_summary_reference: null,
    source_credibility_prior: "medium",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,
    provenance_metadata: {},
    credibility: { level: "unknown", bounded_score: null, reasons: [] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],
    schema_version: "v1"
  };
}

// Minimal smoke: same hash must not map to different payload.

test("in-memory store rejects same content_hash with different payload", async () => {
  const store = new InMemoryExternalIntelligenceStore();
  const now = new Date().toISOString();

  await store.evidence.upsertVersion({
    evidence_reference_id: "ev1",
    object_id: "ev1",
    content_hash: "a".repeat(64),
    schema_version: "evidence_reference_v1",
    policy_refs: [],
    created_at: now,
    effective_at: null,
    valid_from: null,
    valid_until: null,
    supersedes_content_hashes: [],
    superseded_by_content_hash: null,

    payload_available: true,
    payload_json: mkEvidencePayload("ev1", "a".repeat(64)),
    retention_policy: "retain",
    retention_expires_at: null,
    legal_hold: false,
    access_revoked_at: null,
    content_redacted_at: null,
    redaction_reason: null,
    source_id: "source1",
    source_config_version: "v1.0.0",
    legal_policy_version: "legal/v1.0.0"
  });

  await assert.rejects(() =>
    store.evidence.upsertVersion({
      evidence_reference_id: "ev1",
      object_id: "ev1",
      content_hash: "a".repeat(64),
      schema_version: "evidence_reference_v1",
      policy_refs: [],
      created_at: now,
      effective_at: null,
      valid_from: null,
      valid_until: null,
      supersedes_content_hashes: [],
      superseded_by_content_hash: null,

      payload_available: true,
      payload_json: { ...mkEvidencePayload("ev1", "a".repeat(64)), source_url_or_reference: "https://example.com/changed" },
      retention_policy: "retain",
      retention_expires_at: null,
      legal_hold: false,
      access_revoked_at: null,
      content_redacted_at: null,
      redaction_reason: null,
      source_id: "source1",
      source_config_version: "v1.0.0",
      legal_policy_version: "legal/v1.0.0"
    })
  );
});
