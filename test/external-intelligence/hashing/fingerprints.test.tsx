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
  assert.notEqual(a, b);
});
