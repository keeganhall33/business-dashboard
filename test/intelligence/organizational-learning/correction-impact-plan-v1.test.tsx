import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CORRECTION_IMPACT_TARGETS,
  planCorrectionImpactV1,
  type CorrectionImpactTargetV1
} from "@/lib/intelligence/organizational-learning/correction-impact-plan-v1";
import type { CorrectionRouteResultV1 } from "@/lib/intelligence/organizational-learning/correction-router-v1";

const observedAt = "2026-09-14T00:00:00.000Z";

function reviewedCorrection(
  overrides: Partial<Extract<CorrectionRouteResultV1, { status: "CANDIDATE" }>> = {}
): CorrectionRouteResultV1 {
  return {
    version: "CORRECTION_ROUTER_V1",
    status: "CANDIDATE",
    reasonCode: "SUPPORTED_REVIEWED_CORRECTION",
    sourceRefs: ["ionos:mailbox:1:email:1"],
    affectedScope: ["crm:company:1", "recommendation:1", "dashboard:relationship:1", "ask-jeeves:company:1"],
    canonicalPromotionRequiresReview: true,
    candidate: {
      contract_version: "LEARNING_OBJECT_V1",
      learning_id: "learning:correction:owner:1",
      version: 1,
      kind: "FACT_CORRECTION",
      lifecycle_state: "CANDIDATE",
      truth_state: "KNOWN",
      scope: "COMPANY",
      title: "Correct relationship owner",
      content: "The reviewed relationship owner is Operations.",
      confidence: 1,
      created_at: observedAt,
      updated_at: observedAt,
      evidence: [{ evidence_id: "email:1", source_lineage_id: "ionos:mailbox:1", observed_at: observedAt }],
      approval: null,
      supersession: null
    },
    ...overrides
  };
}

function target(overrides: Partial<CorrectionImpactTargetV1> = {}): CorrectionImpactTargetV1 {
  return {
    canonical_ref: "crm:company:1",
    projection: "CANONICAL_CRM",
    truth_state: "KNOWN",
    impact_mode: "CACHE_INVALIDATION",
    identity_state: "RESOLVED",
    ...overrides
  };
}

test("plans one reviewed correction across CRM, recommendation, dashboard, and Ask Jeeves", () => {
  const output = planCorrectionImpactV1(reviewedCorrection(), [
    target(),
    target({ canonical_ref: "recommendation:1", projection: "RECOMMENDATION" }),
    target({ canonical_ref: "dashboard:relationship:1", projection: "DASHBOARD", impact_mode: "SAFE_REFRESH" }),
    target({ canonical_ref: "ask-jeeves:company:1", projection: "ASK_JEEVES", impact_mode: "SAFE_REFRESH" })
  ]);
  assert.equal(output.status, "PLAN");
  assert.equal(output.impacts.length, 4);
  assert.deepEqual(output.impacts.map((impact) => impact.projection), [
    "ASK_JEEVES",
    "CANONICAL_CRM",
    "DASHBOARD",
    "RECOMMENDATION"
  ]);
  assert.equal(output.externalMutationPerformed, false);
});

test("deduplicates identical affected projection refs", () => {
  const duplicate = target({ canonical_ref: "dashboard:relationship:1", projection: "DASHBOARD" });
  const output = planCorrectionImpactV1(reviewedCorrection(), [duplicate, { ...duplicate }]);
  assert.equal(output.status, "PLAN");
  assert.equal(output.impacts.length, 1);
});

test("blocks ambiguous identity instead of touching multiple entities", () => {
  const output = planCorrectionImpactV1(reviewedCorrection(), [target({ identity_state: "AMBIGUOUS" })]);
  assert.equal(output.status, "WITHHELD");
  assert.equal(output.reasonCode, "AMBIGUOUS_IDENTITY");
  assert.deepEqual(output.impacts, []);
});

test("preserves UNKNOWN and CONFLICTED states behind review", () => {
  for (const truth_state of ["UNKNOWN", "CONFLICTED"] as const) {
    const output = planCorrectionImpactV1(reviewedCorrection(), [target({ truth_state })]);
    assert.equal(output.status, "PLAN");
    assert.equal(output.impacts[0].truthState, truth_state);
    assert.equal(output.impacts[0].action, "REVIEW_REQUIRED");
    assert.equal(output.impacts[0].reasonCode, "UNSAFE_TRUTH_REQUIRES_REVIEW");
  }
});

test("turns stale evidence into a safe refresh, never a stronger truth claim", () => {
  const output = planCorrectionImpactV1(reviewedCorrection(), [target({ truth_state: "STALE" })]);
  assert.equal(output.status, "PLAN");
  assert.equal(output.impacts[0].truthState, "STALE");
  assert.equal(output.impacts[0].action, "REFRESH");
});

test("separates review-required writes from safe refresh and invalidation", () => {
  const output = planCorrectionImpactV1(reviewedCorrection(), [
    target({ impact_mode: "WRITE_REQUIRED" }),
    target({ canonical_ref: "dashboard:relationship:1", projection: "DASHBOARD", impact_mode: "SAFE_REFRESH" }),
    target({ canonical_ref: "recommendation:1", projection: "RECOMMENDATION" })
  ]);
  assert.equal(output.status, "PLAN");
  const actions = Object.fromEntries(output.impacts.map((impact) => [impact.canonicalRef, impact.action]));
  assert.deepEqual(actions, {
    "crm:company:1": "REVIEW_REQUIRED",
    "dashboard:relationship:1": "REFRESH",
    "recommendation:1": "INVALIDATE"
  });
});

test("withholds unreviewed, missing-evidence, and out-of-scope correction inputs", () => {
  const withheld: CorrectionRouteResultV1 = {
    version: "CORRECTION_ROUTER_V1",
    status: "WITHHELD",
    reasonCode: "UNREVIEWED_CORRECTION",
    sourceRefs: [],
    affectedScope: ["crm:company:1"],
    canonicalPromotionRequiresReview: true,
    candidate: null
  };
  assert.equal(planCorrectionImpactV1(withheld, [target()]).reasonCode, "CORRECTION_NOT_REVIEWED");
  assert.equal(planCorrectionImpactV1(reviewedCorrection({ sourceRefs: [] }), [target()]).reasonCode, "MISSING_EVIDENCE");
  assert.equal(
    planCorrectionImpactV1(reviewedCorrection(), [target({ canonical_ref: "crm:company:other" })]).reasonCode,
    "INVALID_INPUT"
  );
});

test("withholds conflicting definitions for the same projection identity", () => {
  const output = planCorrectionImpactV1(reviewedCorrection(), [target(), target({ impact_mode: "WRITE_REQUIRED" })]);
  assert.equal(output.status, "WITHHELD");
  assert.equal(output.reasonCode, "CONFLICTING_TARGET_DEFINITION");
});

test("enforces bounded input", () => {
  const output = planCorrectionImpactV1(
    reviewedCorrection({ affectedScope: Array.from({ length: MAX_CORRECTION_IMPACT_TARGETS + 1 }, (_, index) => `scope:${index}`) }),
    Array.from({ length: MAX_CORRECTION_IMPACT_TARGETS + 1 }, (_, index) =>
      target({ canonical_ref: `scope:${index}`, projection: "DASHBOARD" })
    )
  );
  assert.equal(output.status, "WITHHELD");
});

test("is deterministic, immutable, and performs zero external mutation", () => {
  const inputs = [
    target({ canonical_ref: "recommendation:1", projection: "RECOMMENDATION" }),
    target({ canonical_ref: "crm:company:1", projection: "CANONICAL_CRM" })
  ];
  const before = structuredClone(inputs);
  const first = planCorrectionImpactV1(reviewedCorrection(), inputs);
  const second = planCorrectionImpactV1(reviewedCorrection(), [...inputs].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(inputs, before);
  assert.equal(first.externalMutationPerformed, false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.sourceRefs));
  assert.ok(Object.isFrozen(first.impacts));
  assert.ok(first.impacts.every(Object.isFrozen));
});
