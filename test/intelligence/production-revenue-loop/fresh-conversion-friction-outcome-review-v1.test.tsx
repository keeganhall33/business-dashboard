import assert from "node:assert/strict";
import test from "node:test";

import {
  compileFreshConversionFrictionOutcomeReviewV1,
} from "../../../src/lib/intelligence/production-revenue-loop/fresh-conversion-friction-outcome-review-v1";
import type { ConversionFrictionReadinessV1 } from "../../../src/lib/intelligence/production-revenue-loop/conversion-friction-readiness-v1";
import type {
  RevenueOutcomeEvaluationInputV1,
  RevenueOutcomeObservationV1,
} from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-evaluation-v1";
import type { RevenueOutcomeFreshnessPolicyV1 } from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-freshness-gate-v1";

const baselineRange = { startDate: "2026-08-01", endDate: "2026-08-14" } as const;
const outcomeRange = { startDate: "2026-08-16", endDate: "2026-08-29" } as const;

function observation(
  source: RevenueOutcomeObservationV1["source"],
  metric: string,
  unit: string,
  value: number,
  side: "baseline" | "outcome",
  overrides: Partial<RevenueOutcomeObservationV1> = {},
): RevenueOutcomeObservationV1 {
  const range = side === "baseline" ? baselineRange : outcomeRange;
  return {
    source,
    metric,
    unit,
    value,
    truthState: "CURRENT",
    range: { ...range },
    completeThrough: range.endDate,
    observedAt: "2026-08-31T08:00:00.000Z",
    evidenceRefs: [`${source.toLowerCase()}:${metric}:${side}`],
    ...overrides,
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

function outcomeInput(
  overrides: Partial<RevenueOutcomeEvaluationInputV1> = {},
): RevenueOutcomeEvaluationInputV1 {
  return {
    decisionRef: "revenue-action:abc12345",
    implementationRef: "action-execution:abc12345",
    implementedAt: "2026-08-15T18:00:00.000Z",
    evaluatedAt: "2026-08-31T12:00:00.000Z",
    implementationEvidenceRefs: ["action:audit:implemented"],
    baseline: [
      observation("WOO", "orders", "COUNT", 100, "baseline"),
      observation("GA4", "sessions", "COUNT", 1_000, "baseline"),
      observation("META", "spend", "CENTS", 40_000, "baseline"),
      observation("CLARITY", "dead_clicks", "COUNT", 80, "baseline"),
      observation("FUNNELKIT", "checkout_completions", "COUNT", 90, "baseline"),
    ],
    outcome: [
      observation("WOO", "orders", "COUNT", 112, "outcome"),
      observation("GA4", "sessions", "COUNT", 1_020, "outcome"),
      observation("META", "spend", "CENTS", 40_000, "outcome"),
      observation("CLARITY", "dead_clicks", "COUNT", 54, "outcome"),
      observation("FUNNELKIT", "checkout_completions", "COUNT", 106, "outcome"),
    ],
    successRule: {
      source: "WOO",
      metric: "orders",
      unit: "COUNT",
      comparator: "AT_LEAST_ABSOLUTE_CHANGE",
      threshold: 5,
      evidenceRef: "decision:criterion:orders-plus-five",
    },
    ...overrides,
  };
}

function freshnessPolicy(
  overrides: Partial<RevenueOutcomeFreshnessPolicyV1> = {},
): RevenueOutcomeFreshnessPolicyV1 {
  return {
    maxObservationAgeMsBySource: {
      WOO: 6 * 60 * 60 * 1000,
      GA4: 6 * 60 * 60 * 1000,
      META: 6 * 60 * 60 * 1000,
      CLARITY: 6 * 60 * 60 * 1000,
      FUNNELKIT: 6 * 60 * 60 * 1000,
    },
    maxConfounderAgeMs: 6 * 60 * 60 * 1000,
    ...overrides,
  };
}

test("admits a conversion-friction outcome only after every observed source is freshly revalidated", () => {
  const result = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcomeInput: outcomeInput(),
    freshnessPolicy: freshnessPolicy(),
  });

  assert.equal(result.status, "READY_FOR_GOVERNED_REVIEW");
  assert.equal(result.reasonCode, "FRESH_CONVERSION_OUTCOME_READY");
  assert.equal(result.freshness.status, "ELIGIBLE_FOR_REVIEW");
  assert.deepEqual(result.freshness.reasonCodes, ["LEARNING_REVIEW_READY"]);
  assert.deepEqual(result.freshness.sourceChecks.map((item) => [item.source, item.status]), [
    ["WOO", "FRESH"],
    ["GA4", "FRESH"],
    ["META", "FRESH"],
    ["CLARITY", "FRESH"],
    ["FUNNELKIT", "FRESH"],
  ]);
  assert.equal(result.review?.status, "READY_FOR_GOVERNED_REVIEW");
  assert.ok(result.review?.observedChanges.some((item) => item.source === "WOO" && item.metric === "orders"));
  assert.ok(result.review?.observedChanges.some((item) => item.source === "CLARITY"));
  assert.ok(result.review?.observedChanges.some((item) => item.source === "FUNNELKIT"));
  assert.deepEqual(result.attribution, {
    causal: "NOT_ESTABLISHED",
    channel: "NOT_ESTABLISHED",
    mechanism: "NOT_ESTABLISHED",
  });
  assert.ok(Object.values(result.authority).every((allowed) => allowed === false));
});

test("blocks a stale CURRENT behavioral observation before conversion outcome review", () => {
  const value = outcomeInput();
  value.outcome = value.outcome.map((item) =>
    item.source === "CLARITY"
      ? { ...item, observedAt: "2026-08-30T00:00:00.000Z" }
      : item,
  );

  const result = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcomeInput: value,
    freshnessPolicy: freshnessPolicy(),
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "OUTCOME_FRESHNESS_BLOCKED");
  assert.ok(result.freshness.reasonCodes.includes("STALE_SOURCE_OBSERVATION"));
  assert.equal(result.freshness.sourceChecks.find((item) => item.source === "CLARITY")?.status, "BLOCKED");
  assert.equal(result.review, null);
});

test("requires an explicit freshness policy for every outcome source actually used", () => {
  const result = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcomeInput: outcomeInput(),
    freshnessPolicy: freshnessPolicy({
      maxObservationAgeMsBySource: {
        WOO: 6 * 60 * 60 * 1000,
        GA4: 6 * 60 * 60 * 1000,
        META: 6 * 60 * 60 * 1000,
        CLARITY: 6 * 60 * 60 * 1000,
      },
    }),
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "OUTCOME_FRESHNESS_BLOCKED");
  assert.ok(result.freshness.reasonCodes.includes("MISSING_SOURCE_FRESHNESS_POLICY"));
  assert.equal(result.freshness.sourceChecks.find((item) => item.source === "FUNNELKIT")?.maxAgeMs, null);
  assert.equal(result.review, null);
});

test("preserves exact recommendation binding after freshness passes", () => {
  const result = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcomeInput: outcomeInput({ decisionRef: "revenue-action:different" }),
    freshnessPolicy: freshnessPolicy(),
  });

  assert.equal(result.freshness.status, "ELIGIBLE_FOR_REVIEW");
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "CONVERSION_OUTCOME_REVIEW_BLOCKED");
  assert.equal(result.review?.reasonCode, "DECISION_BINDING_MISMATCH");
  assert.ok(Object.values(result.authority).every((allowed) => allowed === false));
});

test("requires post-period evidence for each behavioral mechanism used by the pre-test hypothesis", () => {
  const source = outcomeInput();
  const result = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcomeInput: {
      ...source,
      baseline: source.baseline.filter((item) => item.source !== "CLARITY"),
      outcome: source.outcome.filter((item) => item.source !== "CLARITY"),
    },
    freshnessPolicy: freshnessPolicy(),
  });

  assert.equal(result.freshness.status, "ELIGIBLE_FOR_REVIEW");
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "CONVERSION_OUTCOME_REVIEW_BLOCKED");
  assert.equal(result.review?.reasonCode, "REQUIRED_MECHANISM_OUTCOME_MISSING");
});

test("preserves fresh explicit confounders without promoting causal interpretation", () => {
  const result = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcomeInput: outcomeInput({
      confounders: [{
        label: "A sitewide promotion overlapped the outcome window.",
        truthState: "CURRENT",
        observedAt: "2026-08-31T09:00:00.000Z",
        evidenceRefs: ["promo:audit:1"],
      }],
    }),
    freshnessPolicy: freshnessPolicy(),
  });

  assert.equal(result.status, "READY_WITH_CONFOUNDERS");
  assert.equal(result.reasonCode, "FRESH_CONVERSION_OUTCOME_READY_WITH_CONFOUNDERS");
  assert.equal(result.review?.status, "READY_WITH_CONFOUNDERS");
  assert.equal(result.review?.attribution.causal, "NOT_ESTABLISHED");
  assert.equal(result.authority.reallocationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
});

test("fails closed when an observation does not prove complete coverage through its measured range", () => {
  const value = outcomeInput();
  value.outcome = value.outcome.map((item) =>
    item.source === "FUNNELKIT"
      ? { ...item, completeThrough: "2026-08-28" }
      : item,
  );

  const result = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: readiness(),
    outcomeInput: value,
    freshnessPolicy: freshnessPolicy(),
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "OUTCOME_FRESHNESS_BLOCKED");
  assert.ok(result.freshness.reasonCodes.includes("INCOMPLETE_SOURCE_RANGE"));
  assert.equal(result.review, null);
});

test("is deterministic, deeply immutable, and does not mutate caller-owned inputs", () => {
  const sourceReadiness = readiness();
  const sourceOutcome = outcomeInput();
  const sourcePolicy = freshnessPolicy();
  const beforeReadiness = structuredClone(sourceReadiness);
  const beforeOutcome = structuredClone(sourceOutcome);
  const beforePolicy = structuredClone(sourcePolicy);

  const first = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: sourceReadiness,
    outcomeInput: sourceOutcome,
    freshnessPolicy: sourcePolicy,
  });
  const second = compileFreshConversionFrictionOutcomeReviewV1({
    readiness: sourceReadiness,
    outcomeInput: sourceOutcome,
    freshnessPolicy: sourcePolicy,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(sourceReadiness, beforeReadiness);
  assert.deepEqual(sourceOutcome, beforeOutcome);
  assert.deepEqual(sourcePolicy, beforePolicy);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.freshness), true);
  assert.equal(Object.isFrozen(first.freshness.sourceChecks), true);
  assert.equal(Object.isFrozen(first.freshness.sourceChecks[0]), true);
  assert.equal(Object.isFrozen(first.review), true);
  assert.equal(Object.isFrozen(first.review?.observedChanges), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
