import assert from "node:assert/strict";
import test from "node:test";

import {
  compileRevenueOutcomeLearningCandidateV1,
} from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-learning-candidate-v1";
import type {
  RevenueOutcomeEvaluationInputV1,
  RevenueOutcomeObservationV1,
} from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-evaluation-v1";

function observation(
  source: RevenueOutcomeObservationV1["source"],
  metric: string,
  value: number,
  side: "baseline" | "outcome",
  overrides: Partial<RevenueOutcomeObservationV1> = {},
): RevenueOutcomeObservationV1 {
  const range = side === "baseline"
    ? { startDate: "2026-08-01", endDate: "2026-08-14" }
    : { startDate: "2026-08-16", endDate: "2026-08-29" };
  return {
    source,
    metric,
    unit: "COUNT",
    value,
    truthState: "CURRENT",
    range,
    completeThrough: range.endDate,
    observedAt: side === "baseline"
      ? "2026-08-15T12:00:00.000Z"
      : "2026-08-30T12:00:00.000Z",
    evidenceRefs: [`${source.toLowerCase()}:${metric}:${side}`],
    ...overrides,
  };
}

function input(
  overrides: Partial<RevenueOutcomeEvaluationInputV1> = {},
): RevenueOutcomeEvaluationInputV1 {
  return {
    decisionRef: "revenue-action:abc12345",
    implementationRef: "action-execution:abc12345",
    implementedAt: "2026-08-15T18:00:00.000Z",
    evaluatedAt: "2026-08-31T12:00:00.000Z",
    implementationEvidenceRefs: ["action:audit:implemented"],
    baseline: [
      observation("WOO", "orders", 100, "baseline"),
      observation("GA4", "sessions", 1_000, "baseline"),
      observation("META", "spend", 40_000, "baseline", { unit: "CENTS" }),
    ],
    outcome: [
      observation("WOO", "orders", 112, "outcome"),
      observation("GA4", "sessions", 1_080, "outcome"),
      observation("META", "spend", 40_000, "outcome", { unit: "CENTS" }),
    ],
    successRule: {
      source: "WOO",
      metric: "orders",
      unit: "COUNT",
      comparator: "AT_LEAST_ABSOLUTE_CHANGE",
      threshold: 5,
      evidenceRef: "decision:success-rule",
    },
    ...overrides,
  };
}

test("promotes an aligned measured outcome only to observational review", () => {
  const result = compileRevenueOutcomeLearningCandidateV1(input());

  assert.equal(result.status, "ELIGIBLE_FOR_REVIEW");
  assert.equal(result.reasonCode, "OBSERVATIONAL_REVIEW_READY");
  assert.equal(result.learningScope, "OBSERVATIONAL_REVIEW_ONLY");
  assert.equal(result.measurementStatus, "MEASURED");
  assert.equal(result.windowReasonCode, "WINDOW_INTEGRITY_CONFIRMED");
  assert.deepEqual(result.sources, ["GA4", "META", "WOO"]);
  assert.equal(result.comparisons.length, 3);
  assert.equal(result.criterion?.status, "MET");
  assert.equal(result.attribution.causal, "NOT_ESTABLISHED");
  assert.equal(result.attribution.channel, "NOT_ESTABLISHED");
  assert.ok(result.evidenceRefs.includes("action:audit:implemented"));
  assert.ok(result.evidenceRefs.includes("decision:success-rule"));
  assert.deepEqual(result.authority, {
    durableLearningPromotionAllowed: false,
    reallocationAllowed: false,
    causalClaimAllowed: false,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  });
  assert.equal("confidence" in result, false);
  assert.equal("monetaryValue" in result, false);
  assert.match(result.limitations.join(" "), /not proof/i);
});

test("blocks learning when multisource windows do not align and exposes no measured comparison", () => {
  const value = input();
  value.outcome[1] = observation("GA4", "sessions", 1_080, "outcome", {
    range: { startDate: "2026-08-17", endDate: "2026-08-30" },
    completeThrough: "2026-08-30",
    observedAt: "2026-08-31T06:00:00.000Z",
  });

  const result = compileRevenueOutcomeLearningCandidateV1(value);

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "WINDOW_INTEGRITY_BLOCKED");
  assert.equal(result.windowReasonCode, "OUTCOME_RANGE_MISMATCH_ACROSS_SOURCES");
  assert.equal(result.learningScope, "NONE");
  assert.equal(result.candidateId, null);
  assert.deepEqual(result.comparisons, []);
  assert.deepEqual(result.evidenceRefs, []);
  assert.equal(result.authority.reallocationAllowed, false);
});

test("keeps partial source evidence out of outcome learning", () => {
  const value = input({
    outcome: [
      observation("WOO", "orders", 112, "outcome", { truthState: "PARTIAL" }),
    ],
    baseline: [observation("WOO", "orders", 100, "baseline")],
    successRule: null,
  });

  const result = compileRevenueOutcomeLearningCandidateV1(value);

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.measurementStatus, "INSUFFICIENT_EVIDENCE");
  assert.ok(result.upstreamReasonCodes.includes("SOURCE_EVIDENCE_NOT_CURRENT"));
  assert.equal(result.learningScope, "NONE");
  assert.deepEqual(result.comparisons, []);
});

test("retains explicit confounders and permits observational review without causal or reallocation authority", () => {
  const result = compileRevenueOutcomeLearningCandidateV1(input({
    confounders: [{
      label: "Concurrent promotion changed during the outcome window",
      truthState: "CURRENT",
      observedAt: "2026-08-30T10:00:00.000Z",
      evidenceRefs: ["campaign:audit:promo-change"],
    }],
  }));

  assert.equal(result.status, "ELIGIBLE_FOR_REVIEW");
  assert.equal(result.reasonCode, "OBSERVATIONAL_REVIEW_READY_WITH_CONFOUNDERS");
  assert.equal(result.measurementStatus, "MEASURED_WITH_CONFOUNDERS");
  assert.equal(result.confounders.length, 1);
  assert.equal(result.confounders[0]?.label, "Concurrent promotion changed during the outcome window");
  assert.ok(result.evidenceRefs.includes("campaign:audit:promo-change"));
  assert.equal(result.attribution.causal, "NOT_ESTABLISHED");
  assert.equal(result.authority.reallocationAllowed, false);
  assert.equal(result.authority.durableLearningPromotionAllowed, false);
  assert.match(result.limitations.join(" "), /confounders/i);
});

test("is deterministic, deeply immutable, and leaves caller input unchanged", () => {
  const value = input();
  const before = structuredClone(value);
  const first = compileRevenueOutcomeLearningCandidateV1(value);
  const second = compileRevenueOutcomeLearningCandidateV1(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.authority), true);
  assert.equal(Object.isFrozen(first.canonicalWindows), true);
  assert.equal(Object.isFrozen(first.comparisons), true);
  assert.equal(Object.isFrozen(first.comparisons[0]), true);
  assert.equal(Object.isFrozen(first.evidenceRefs), true);
  assert.equal(Object.isFrozen(first.criterion), true);
});
