import test from "node:test";
import assert from "node:assert/strict";

import { createInternalHypothesisVersionRef } from "@/lib/external-intelligence/adapters/intelligence-v1/hypothesis.adapter";
import type { Hypothesis } from "@/lib/intelligence-v1/contracts";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

test("Internal Hypothesis envelope yields deterministic version hash ignoring created_at", () => {
  const hyp: Hypothesis = {
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

  const linkedFindingVersionRef: VersionRef = {
    object_type: "internal_finding",
    object_id: "f1",
    version_id: null,
    content_hash: "b".repeat(64),
    schema_version: "intelligence_v1_finding",
    policy_version: "v1.0.0",
    created_at: new Date(0).toISOString()
  };

  const a = createInternalHypothesisVersionRef({ hypothesis: hyp, linkedFindingVersionRef });
  const b = createInternalHypothesisVersionRef({
    hypothesis: { ...hyp, created_at: "2099-01-01T00:00:00Z" } as unknown as Hypothesis,
    linkedFindingVersionRef
  });

  assert.equal(a.hypothesis_version_ref.content_hash, b.hypothesis_version_ref.content_hash);
  assert.equal(a.hypothesis_version_ref.object_type, "internal_hypothesis");
});

test("Hypothesis adapter fails closed on missing or mismatched linked finding ref", () => {
  const hyp: Hypothesis = {
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

  const wrongType: VersionRef = {
    object_type: "internal_hypothesis",
    object_id: "f1",
    version_id: null,
    content_hash: "b".repeat(64),
    schema_version: "intelligence_v1_finding",
    policy_version: "v1.0.0",
    created_at: new Date(0).toISOString()
  };

  const wrongId: VersionRef = { ...wrongType, object_type: "internal_finding", object_id: "different" };

  // missing ref
  // @ts-expect-error intentional
  expectThrow(() => createInternalHypothesisVersionRef({ hypothesis: hyp }));
  // wrong type
  expectThrow(() => createInternalHypothesisVersionRef({ hypothesis: hyp, linkedFindingVersionRef: wrongType }));
  // mismatched id
  expectThrow(() => createInternalHypothesisVersionRef({ hypothesis: hyp, linkedFindingVersionRef: wrongId }));
});

function expectThrow(fn: () => unknown) {
  try {
    fn();
    throw new Error("expected throw");
  } catch {
    // ok
  }
}

test("linked finding content_hash participates in hypothesis identity", () => {
  const hyp: Hypothesis = {
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

  const f1: VersionRef = {
    object_type: "internal_finding",
    object_id: "f1",
    version_id: null,
    content_hash: "b".repeat(64),
    schema_version: "intelligence_v1_finding",
    policy_version: "v1.0.0",
    created_at: new Date(0).toISOString()
  };
  const f2: VersionRef = { ...f1, content_hash: "c".repeat(64) };

  const a = createInternalHypothesisVersionRef({ hypothesis: hyp, linkedFindingVersionRef: f1 });
  const b = createInternalHypothesisVersionRef({ hypothesis: hyp, linkedFindingVersionRef: f2 });
  assert.notEqual(a.hypothesis_version_ref.content_hash, b.hypothesis_version_ref.content_hash);
});
