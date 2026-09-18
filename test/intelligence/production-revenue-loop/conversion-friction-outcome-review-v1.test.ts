import assert from "node:assert/strict";
import test from "node:test";

import {
  compileConversionFrictionOutcomeReviewV1,
} from "../../../src/lib/intelligence/production-revenue-loop/conversion-friction-outcome-review-v1";
import type { ConversionFrictionReadinessV1 } from "../../../src/lib/intelligence/production-revenue-loop/conversion-friction-readiness-v1";
import type { RevenueOutcomeComparisonV1 } from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-evaluation-v1";
import type { RevenueOutcomeLearningCandidateV1 } from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-learning-candidate-v1";

const baselineRange = { startDate: "2026-08-01", endDate: "2026-08-14" } as const;
const outcomeRange = { startDate: "2026-08-16", endDate: "2026-08-29" } as const;

function comparison(
  source: RevenueOutcomeComparisonV1["source"],
  metric: string,
  baselineValue: number,
  outcomeValue: number,
): RevenueOutcomeComparisonV1 {
  const absoluteChange = outcomeValue - baselineValue;
  return {
    source,
    metric,
    unit: "COUNT",
    baselineRange: { ...baselineRange },
    outcomeRange: { ...outcomeRange },
    baselineValue,
    outcomeValue,
    absoluteChange,
    relativeChangeRatio: baselineValue === 0 ? null : absoluteChange / baselineValue,
    direction: absoluteChange > 0 ? "UP" : absoluteChange < 0 ? "DOWN" : "FLAT",
    evidenceRefs: [`${source.toLowerCase()}:${metric}:matched`],
  };
}

function readiness(
  overrides: Partial<ConversionFrictionReadinessV1> = {},
): ConversionFrictionReadinessV1 {
  return {
    version: "CONVERSION_FRICTION_READINESS_V1",
    status: "READY_TO_PREPARE_TEST",
    reasonCode: "BEHAVIORAL_SUPPORT_AND_MEASUREMENT_AGREE",
    recommendationId: "revenue-action:abc12345",
    revenueDriver: "CONVERSION",
    evidenceBasis: {
      clarityUsed: true,
      checkoutUsed: true,
      supportingFacts: [
        "Clarity: dead-click rate is elevated at checkout.",
        "Checkout: 35.0% adjacent-stage drop-off from checkout to purchase.",
      ],
    },
    checkoutMeasurement: {
      required: true,
      status: "READY",
      reasonCode: "CROSS_SOURCE_COUNTS_ALIGNED",
      evidenceRefs: ["checkout:reconciled"],
      comparisonCount: 2,
    },
    limitations: [],
    nextStep: {
      kind: "PREPARE_BOUNDED_CONVERSION_TEST",
      approvalClass: "KEEGAN_APPROVAL_REQUIRED",
      description: "Prepare a bounded conversion test proposal.",
      externalMutationAllowed: false,
      metaWriteAllowed: false,
    },
    causalClaim: false,
    revenueAttributionClaim: false,
    expectedLift: null,
    monetaryValue: null,
    ...overrides,
  };
}

function outcome(
  overrides: Partial<RevenueOutcomeLearningCandidateV1> = {},
): RevenueOutcomeLearningCandidateV1 {
  const comparisons = [
    comparison("WOO", "orders", 100, 112),
    comparison("GA4", "sessions", 1_000, 1_020),
    comparison("CLARITY", "dead_clicks", 80, 54),
    comparison("FUNNELKIT", "checkout_completions", 90, 106),
  ];
  return {
    version: "REVENUE_OUTCOME_LEARNING_CANDIDATE_V1",
    candidateId: "revenue-learning-candidate:revenue-outcome:abc12345",
    status: "ELIGIBLE_FOR_REVIEW",
    reasonCode: "OBSERVATIONAL_REVIEW_READY",
    decisionRef: "revenue-action:abc12345",
    implementationRef: "action-execution:abc12345",
    evaluatedAt: "2026-08-31T12:00:00.000Z",
    windowReasonCode: "WINDOW_INTEGRITY_CONFIRMED",
    measurementStatus: "MEASURED",
    upstreamReasonCodes: ["MEASURED_MATCHED_OBSERVATIONS"],
    learningScope: "OBSERVATIONAL_REVIEW_ONLY",
    canonicalWindows: {
      baseline: { ...baselineRange },
      outcome: { ...outcomeRange },
    },
    sources: ["CLARITY", "FUNNELKIT", "GA4", "WOO"],
    comparisons,
    criterion: {
      status: "MET",
      rule: {
        source: "WOO",
        metric: "orders",
        unit: "COUNT",
        comparator: "AT_LEAST_RELATIVE_CHANGE",
        threshold: 0.1,
        evidenceRef: "decision:criterion:orders-10pct",
      },
      observedValue: 0.12,
      evidenceRef: "decision:criterion:orders-10pct",
    },
    confounders: [],
    evidenceRefs: [
      "implementation:confirmed",
      ...comparisons.flatMap((item) => item.evidenceRefs),
    ],
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
    },
    limitations: ["Observational review only."],
    authority: {
      durableLearningPromotionAllowed: false,
      reallocationAllowed: false,
      causalClaimAllowed: false,
      externalMutationAllowed: false,
      metaWriteAllowed: false,
      actionExecutionAllowed: false,
      approvalBypassAllowed: false,
    },
    ...overrides,
  };
}

test("closes the conversion loop only as governed observational review with Woo plus required mechanism evidence", () => {
  const result = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcome: outcome(),
  });

  assert.equal(result.status, "READY_FOR_GOVERNED_REVIEW");
  assert.equal(result.reasonCode, "OBSERVED_OUTCOME_READY");
  assert.equal(result.recommendationId, "revenue-action:abc12345");
  assert.equal(result.implementationRef, "action-execution:abc12345");
  assert.deepEqual(result.canonicalWindows, { baseline: baselineRange, outcome: outcomeRange });
  assert.equal(result.hypothesisBasis.clarityRequired, true);
  assert.equal(result.hypothesisBasis.checkoutRequired, true);
  assert.ok(result.observedChanges.some((item) => item.source === "WOO" && item.metric === "orders"));
  assert.ok(result.observedChanges.some((item) => item.source === "CLARITY"));
  assert.ok(result.observedChanges.some((item) => item.source === "FUNNELKIT"));
  assert.equal(result.criterion?.status, "MET");
  assert.deepEqual(result.attribution, {
    causal: "NOT_ESTABLISHED",
    channel: "NOT_ESTABLISHED",
    mechanism: "NOT_ESTABLISHED",
  });
  assert.ok(result.limitations.some((item) => /arithmetic evidence only/i.test(item)));
  assert.ok(Object.values(result.authority).every((allowed) => allowed === false));
});

test("fails closed when the measured outcome is not bound to the exact pre-test recommendation", () => {
  const result = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcome: outcome({ decisionRef: "revenue-action:different" }),
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "DECISION_BINDING_MISMATCH");
  assert.deepEqual(result.observedChanges, []);
  assert.equal(result.implementationRef, null);
});

test("requires Woo commercial outcome evidence instead of learning from behavior metrics alone", () => {
  const base = outcome();
  const comparisons = base.comparisons.filter((item) => item.source !== "WOO");
  const result = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcome: outcome({
      sources: ["CLARITY", "FUNNELKIT", "GA4"],
      comparisons,
      evidenceRefs: comparisons.flatMap((item) => item.evidenceRefs),
    }),
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "WOO_COMMERCIAL_OUTCOME_MISSING");
});

test("requires post-period evidence for every behavioral mechanism used to justify the test", () => {
  const base = outcome();
  const comparisons = base.comparisons.filter((item) => item.source !== "CLARITY");
  const result = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcome: outcome({
      sources: ["FUNNELKIT", "GA4", "WOO"],
      comparisons,
      evidenceRefs: comparisons.flatMap((item) => item.evidenceRefs),
    }),
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "REQUIRED_MECHANISM_OUTCOME_MISSING");
});

test("does not let later measurements retroactively legitimize a pre-test hypothesis that was never ready", () => {
  const result = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness({
      status: "VERIFY_TRACKING",
      reasonCode: "CHECKOUT_MEASUREMENT_DISAGREEMENT",
    }),
    outcome: outcome(),
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "PRETEST_READINESS_NOT_ESTABLISHED");
});

test("preserves explicit confounders while still allowing observational review without causal promotion", () => {
  const confounder = {
    label: "A sitewide promotion overlapped the outcome window.",
    truthState: "CURRENT" as const,
    observedAt: "2026-08-30T12:00:00.000Z",
    evidenceRefs: ["promo:audit:1"],
  };
  const result = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcome: outcome({
      reasonCode: "OBSERVATIONAL_REVIEW_READY_WITH_CONFOUNDERS",
      measurementStatus: "MEASURED_WITH_CONFOUNDERS",
      confounders: [confounder],
    }),
  });

  assert.equal(result.status, "READY_WITH_CONFOUNDERS");
  assert.equal(result.reasonCode, "OBSERVED_OUTCOME_READY_WITH_CONFOUNDERS");
  assert.deepEqual(result.confounders, [confounder]);
  assert.equal(result.attribution.causal, "NOT_ESTABLISHED");
  assert.equal(result.authority.reallocationAllowed, false);
});

test("rejects tampered authority or attribution state instead of inheriting unsafe downstream permissions", () => {
  const unsafe = outcome() as RevenueOutcomeLearningCandidateV1 & {
    authority: RevenueOutcomeLearningCandidateV1["authority"] & { metaWriteAllowed: boolean };
  };
  unsafe.authority = { ...unsafe.authority, metaWriteAllowed: true } as typeof unsafe.authority;

  const result = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcome: unsafe,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "OUTCOME_AUTHORITY_INTEGRITY_FAILURE");
  assert.equal(result.authority.metaWriteAllowed, false);
});

test("rejects canonical-window or declared-source drift and remains deterministic, immutable, and non-mutating", () => {
  const sourceReadiness = readiness();
  const sourceOutcome = outcome();
  const beforeReadiness = structuredClone(sourceReadiness);
  const beforeOutcome = structuredClone(sourceOutcome);

  const first = compileConversionFrictionOutcomeReviewV1({
    readiness: sourceReadiness,
    outcome: sourceOutcome,
  });
  const second = compileConversionFrictionOutcomeReviewV1({
    readiness: sourceReadiness,
    outcome: sourceOutcome,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(sourceReadiness, beforeReadiness);
  assert.deepEqual(sourceOutcome, beforeOutcome);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.observedChanges), true);

  const driftedComparisons = sourceOutcome.comparisons.map((item, index) =>
    index === 0
      ? { ...item, outcomeRange: { startDate: "2026-08-17", endDate: "2026-08-30" } }
      : item,
  );
  const drifted = compileConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcome: outcome({ comparisons: driftedComparisons }),
  });
  assert.equal(drifted.status, "BLOCKED");
  assert.equal(drifted.reasonCode, "CANONICAL_WINDOW_INTEGRITY_FAILURE");
});
