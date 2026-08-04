import test from "node:test";
import assert from "node:assert/strict";

import { createInternalHypothesisVersionRef } from "@/lib/external-intelligence/adapters/intelligence-v1/hypothesis.adapter";

test("Internal Hypothesis envelope yields deterministic version hash ignoring created_at", () => {
  const hyp = {
    hypothesis_id: "h1",
    finding_id: "f1",
    engine_version: "e1",
    statement: "st",
    mechanism: "m",
    predictions: [],
    disambiguation_test: { test_id: "t", description: "d", success_metric_id: "m1", evaluation_window_days: 7 },
    evidence_for: [],
    evidence_against: [],
    missing_evidence: [],
    confidence: { level: "possible", score: null, reasons: [], blockers: [] },
    created_at: "2026-08-04T00:00:00Z"
  };

  const a = createInternalHypothesisVersionRef({ hypothesis: hyp as any });
  const b = createInternalHypothesisVersionRef({ hypothesis: { ...hyp, created_at: "2099-01-01T00:00:00Z" } as any });

  assert.equal(a.hypothesis_version_ref.content_hash, b.hypothesis_version_ref.content_hash);
  assert.equal(a.hypothesis_version_ref.object_type, "hypothesis");
});
