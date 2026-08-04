import test from "node:test";
import assert from "node:assert/strict";

import { ConfidenceAxisSchema } from "@/lib/external-intelligence/contracts/confidence-axes";

test("ConfidenceAxis allows unknown distinct from zero", () => {
  const axis = ConfidenceAxisSchema.parse({
    level: "unknown",
    bounded_score: null,
    reasons: [],
    blockers: [],
    supporting_reference_ids: [],
    contradicting_reference_ids: [],
    missing_evidence_ids: []
  });
  assert.equal(axis.level, "unknown");
  assert.equal(axis.bounded_score, null);
});
