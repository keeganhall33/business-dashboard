import test from "node:test";
import assert from "node:assert/strict";

import { EvidenceReferenceSchema } from "@/lib/external-intelligence/contracts/evidence-reference";

test("EvidenceReferenceSchema rejects unknown properties (strict)", () => {
  assert.throws(() =>
    EvidenceReferenceSchema.parse({
      evidence_reference_id: "ev_1",
      source_id: "s1",
      source_config_version: "v1",
      source_set_id: null,
      source_artifact_identifier: null,
      source_url_or_reference: "https://example.com",
      content_hash: null,
      retrieved_at: new Date().toISOString(),
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
      provenance_metadata: {},
      schema_version: "evidence_reference_v1",
      evidence_id: "should_not_exist"
    })
  );
});
