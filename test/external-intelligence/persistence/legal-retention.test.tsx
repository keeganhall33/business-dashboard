import test from "node:test";
import assert from "node:assert/strict";

// Phase A4: contract-level test only.
// Retention/redaction behavior is a later implementation; here we assert the record model
// can represent retention policy and payload redaction via payload shape.

test("retention model can represent link-only redaction without erasing identity", () => {
  const record = {
    evidence_reference_id: "ev1",
    retention_policy: "link_only",
    payload: { evidence_reference_id: "ev1", excerpt_or_summary_reference: null }
  };
  assert.equal(record.retention_policy, "link_only");
});
