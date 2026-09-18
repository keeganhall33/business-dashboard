import assert from "node:assert/strict";
import test from "node:test";

import {
  compileFreshRevenueOutcomeLearningCandidateV1,
  type RevenueOutcomeFreshnessPolicyV1,
} from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-freshness-gate-v1";
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
    observedAt: "2026-08-31T08:00:00.000Z",
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

function policy(
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

test("admits only freshly retrieved complete outcome evidence to governed learning review", () => {
  const result = compileFreshRevenueOutcomeLearningCandidateV1(input(), policy());

  assert.equal(result.status, "ELIGIBLE_FOR_REVIEW");
  assert.deepEqual(result.reasonCodes, ["LEARNING_REVIEW_READY"]);
  assert.equal(result.acceptedCandidate?.status, "ELIGIBLE_FOR_REVIEW");
  assert.equal(result.acceptedCandidate?.measurementStatus, "MEASURED");
  assert.deepEqual(result.sourceChecks.map((item) => [item.source, item.status]), [
    ["WOO", "FRESH"],
    ["GA4", "FRESH"],
    ["META", "FRESH"],
  ]);
  assert.equal(result.attribution.causal, "NOT_ESTABLISHED");
  assert.equal(result.attribution.channel, "NOT_ESTABLISHED");
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
});

test("blocks an old observation even when its upstream truth state still says CURRENT", () => {
  const value = input();
  value.outcome[0] = observation("WOO", "orders", 112, "outcome", {
    observedAt: "2026-08-30T00:00:00.000Z",
  });

  const result = compileFreshRevenueOutcomeLearningCandidateV1(value, policy());

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("STALE_SOURCE_OBSERVATION"));
  assert.equal(result.acceptedCandidate, null);
  assert.equal(result.sourceChecks.find((item) => item.source === "WOO")?.status, "BLOCKED");
  assert.equal(result.authority.reallocationAllowed, false);
});

test("requires an explicit positive freshness policy for every observed source", () => {
  const result = compileFreshRevenueOutcomeLearningCandidateV1(input(), policy({
    maxObservationAgeMsBySource: {
      WOO: 6 * 60 * 60 * 1000,
      GA4: 6 * 60 * 60 * 1000,
    },
  }));

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("MISSING_SOURCE_FRESHNESS_POLICY"));
  assert.equal(result.sourceChecks.find((item) => item.source === "META")?.maxAgeMs, null);
  assert.equal(result.acceptedCandidate, null);
});

test("fails closed when CURRENT evidence does not prove complete coverage through its range end", () => {
  const value = input();
  value.outcome[1] = observation("GA4", "sessions", 1_080, "outcome", {
    completeThrough: "2026-08-28",
  });

  const result = compileFreshRevenueOutcomeLearningCandidateV1(value, policy());

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("INCOMPLETE_SOURCE_RANGE"));
  assert.equal(result.acceptedCandidate, null);
  assert.equal(result.sourceChecks.find((item) => item.source === "GA4")?.status, "BLOCKED");
});

test("blocks completeness claims observed before the claimed complete day closed", () => {
  const value = input();
  value.outcome[2] = observation("META", "spend", 40_000, "outcome", {
    unit: "CENTS",
    observedAt: "2026-08-29T20:00:00.000Z",
  });

  const result = compileFreshRevenueOutcomeLearningCandidateV1(value, policy({
    maxObservationAgeMsBySource: {
      WOO: 72 * 60 * 60 * 1000,
      GA4: 72 * 60 * 60 * 1000,
      META: 72 * 60 * 60 * 1000,
    },
  }));

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("OBSERVATION_PRECEDES_COMPLETE_DAY"));
  assert.equal(result.acceptedCandidate, null);
});

test("keeps stale or non-current confounder evidence out of learning review", () => {
  const result = compileFreshRevenueOutcomeLearningCandidateV1(input({
    confounders: [{
      label: "Concurrent promotion changed during the outcome window",
      truthState: "STALE",
      observedAt: "2026-08-30T00:00:00.000Z",
      evidenceRefs: ["campaign:audit:promo-change"],
    }],
  }), policy());

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("CONFOUNDER_NOT_CURRENT"));
  assert.ok(result.reasonCodes.includes("STALE_CONFOUNDER"));
  assert.equal(result.acceptedCandidate, null);
  assert.equal(result.authority.causalClaimAllowed, false);
});

test("preserves upstream temporal integrity failures instead of laundering them through freshness", () => {
  const value = input();
  value.outcome[1] = observation("GA4", "sessions", 1_080, "outcome", {
    range: { startDate: "2026-08-17", endDate: "2026-08-29" },
    completeThrough: "2026-08-29",
  });

  const result = compileFreshRevenueOutcomeLearningCandidateV1(value, policy());

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["UPSTREAM_LEARNING_BLOCKED"]);
  assert.equal(result.acceptedCandidate, null);
  assert.match(result.limitations.join(" "), /cannot be promoted/i);
});

test("is deterministic, deeply immutable, and leaves caller input unchanged", () => {
  const value = input();
  const freshness = policy();
  const beforeInput = structuredClone(value);
  const beforePolicy = structuredClone(freshness);
  const first = compileFreshRevenueOutcomeLearningCandidateV1(value, freshness);
  const second = compileFreshRevenueOutcomeLearningCandidateV1(value, freshness);

  assert.deepEqual(first, second);
  assert.deepEqual(value, beforeInput);
  assert.deepEqual(freshness, beforePolicy);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.sourceChecks), true);
  assert.equal(Object.isFrozen(first.sourceChecks[0]), true);
  assert.equal(Object.isFrozen(first.authority), true);
  assert.equal(Object.isFrozen(first.limitations), true);
  assert.equal(Object.isFrozen(first.acceptedCandidate), true);
});
