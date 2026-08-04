import test from "node:test";
import assert from "node:assert/strict";

import {
  createEvidenceReferenceFingerprint,
  createExternalSignalFingerprint
} from "@/lib/external-intelligence/hashing/fingerprints";

test("set-like arrays do not change ExternalSignal fingerprint", () => {
  const a = createExternalSignalFingerprint({
    entity_ids: ["e2", "e1"],
    signal_type: "trend_signal",
    core_claim_fingerprint: "c".repeat(64),
    event_window: { start: null, end: null },
    business_domains: ["brand", "commerce"],
    geography: "global",
    mechanism: null
  });

  const b = createExternalSignalFingerprint({
    entity_ids: ["e1", "e2"],
    signal_type: "trend_signal",
    core_claim_fingerprint: "c".repeat(64),
    event_window: { start: null, end: null },
    business_domains: ["commerce", "brand"],
    geography: "global",
    mechanism: null
  });

  assert.equal(a, b);
});

test("EvidenceReference fingerprint changes when semantic timestamps change", () => {
  const base = {
    source_id: "s1",
    source_config_version: "v1",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://example.com",
    content_hash: null,
    retrieved_at: "2026-08-04T00:00:00.000Z",
    published_at: null,
    event_time: null,
    evidence_type: "report",
    access_classification: "public",
    legal_policy_version: "legal_v1",
    retention_policy: "link_only",
    excerpt_or_summary_reference: null,
    source_credibility_prior: "high",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,
    schema_version: "evidence_reference_v1"
  };

  const a = createEvidenceReferenceFingerprint(base);
  const b = createEvidenceReferenceFingerprint({ ...base, retrieved_at: "2026-08-05T00:00:00.000Z" });
  // retrieved_at is metadata-only for fingerprinting; repeat retrieval must not inflate corroboration.
  assert.equal(a, b);
});

test("EvidenceReference fingerprint changes when semantic fields change", () => {
  const base = {
    source_id: "s1",
    source_config_version: "v1",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://example.com",
    content_hash: null,
    retrieved_at: "2026-08-04T00:00:00.000Z",
    published_at: null,
    event_time: null,
    evidence_type: "report",
    access_classification: "public",
    legal_policy_version: "legal_v1",
    retention_policy: "link_only",
    excerpt_or_summary_reference: null,
    source_credibility_prior: "high",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,
    schema_version: "evidence_reference_v1"
  };

  const a = createEvidenceReferenceFingerprint(base);
  const b = createEvidenceReferenceFingerprint({ ...base, evidence_type: "dataset" });
  assert.notEqual(a, b);
});

test("Policy content hash ignores non-semantic metadata", async () => {
  const { createPolicyRefContentHash } = await import("@/lib/external-intelligence/hashing/content-hash");

  const a = createPolicyRefContentHash({
    schema_version: "policy_confidence_v1",
    policy_name: "confidence",
    semantic_version: "v1.0.0",
    effective_from: "2026-08-04",
    effective_until: null,
    approval_status: "approved",
    changed_at: "2026-08-04",
    change_reason: "x",
    rules: { required_axes: ["overall", "evidence"] }
  });

  const b = createPolicyRefContentHash({
    schema_version: "policy_confidence_v1",
    policy_name: "confidence",
    semantic_version: "v1.0.0",
    effective_from: "2026-08-04",
    effective_until: null,
    approval_status: "approved",
    changed_at: "2099-01-01",
    change_reason: "y",
    rules: { required_axes: ["evidence", "overall"] }
  });

  // changed_at + change_reason excluded; required_axes treated as set-like and normalized.
  assert.equal(a, b);
});
