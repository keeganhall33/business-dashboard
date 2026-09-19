import assert from "node:assert/strict";
import test from "node:test";

import type {
  SocialHistoryComparabilityReviewV1,
  SocialHistoryMetricComparabilityV1,
  SocialHistoryWindowComparabilityV1
} from "../../src/lib/social-intelligence/social-history-comparability-v1";
import {
  compileSocialMaterialMovementReviewV1,
  type SocialMaterialMovementPolicyV1
} from "../../src/lib/social-intelligence/social-material-movement-review-v1";

const evaluatedAt = "2026-09-19T14:00:00.000Z";
const policy: SocialMaterialMovementPolicyV1 = {
  maxUpstreamAgeHours: 12,
  windows: ["7D"],
  metricRules: [{
    metric: "REACH",
    minimumAbsolutePercentageDelta: 25,
    minimumPriorValue: 50
  }]
};

function metric(overrides: Partial<SocialHistoryMetricComparabilityV1> = {}): SocialHistoryMetricComparabilityV1 {
  return {
    key: "REACH",
    state: "READY",
    currentValue: 150,
    priorValue: 100,
    absoluteDelta: 50,
    percentageDelta: 50,
    evidenceRefs: ["metric:reach:current", "metric:reach:prior"],
    decisionGrade: true,
    ...overrides
  };
}

function window(
  metricOverride: Partial<SocialHistoryMetricComparabilityV1> = {},
  overrides: Partial<SocialHistoryWindowComparabilityV1> = {}
): SocialHistoryWindowComparabilityV1 {
  const row = metric(metricOverride);
  return {
    window: "7D",
    state: "READY",
    currentPeriodId: "instagram:7d:current",
    priorPeriodId: "instagram:7d:prior",
    currentStartAt: "2026-09-12T00:00:00.000Z",
    currentEndAt: "2026-09-19T00:00:00.000Z",
    priorStartAt: "2026-09-05T00:00:00.000Z",
    priorEndAt: "2026-09-12T00:00:00.000Z",
    contiguous: true,
    namedWindowDurationsValid: true,
    decisionGradeMetrics: ["REACH"],
    metrics: [row],
    issues: [],
    evidenceRefs: [...row.evidenceRefs],
    ...overrides
  };
}

function historyReview(
  metricOverride: Partial<SocialHistoryMetricComparabilityV1> = {},
  overrides: Partial<SocialHistoryComparabilityReviewV1> = {},
  windowOverrides: Partial<SocialHistoryWindowComparabilityV1> = {}
): SocialHistoryComparabilityReviewV1 {
  const sevenDay = window(metricOverride, windowOverrides);
  return {
    contractVersion: "SocialHistoryComparabilityReviewV1",
    snapshotId: "snapshot:instagram:2026-09-19T13:00:00.000Z",
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    evaluatedAt: "2026-09-19T13:00:00.000Z",
    sourceDecisionGrade: true,
    connectorProofBound: true,
    sourceIssues: [],
    windows: [sevenDay],
    decisionGradeWindows: ["7D"],
    comparisonTruthPreserved: true,
    crossPlatformAggregationPerformed: false,
    causalAttributionClaimed: false,
    externalAccessPerformed: false,
    writesPerformed: false,
    ...overrides
  };
}

function compile(review = historyReview(), customPolicy: SocialMaterialMovementPolicyV1 = policy) {
  return compileSocialMaterialMovementReviewV1({
    evaluatedAt,
    historyReview: review,
    policy: customPolicy
  });
}

test("surfaces a threshold-crossing first-party movement only as an internal review candidate", () => {
  const result = compile();

  assert.equal(result.status, "READY");
  assert.equal(result.movements.length, 1);
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0]!;
  assert.equal(candidate.platform, "INSTAGRAM");
  assert.equal(candidate.accountId, "keegan-hall");
  assert.equal(candidate.window, "7D");
  assert.equal(candidate.metric, "REACH");
  assert.equal(candidate.currentValue, 150);
  assert.equal(candidate.priorValue, 100);
  assert.equal(candidate.absoluteDelta, 50);
  assert.equal(candidate.percentageDelta, 50);
  assert.equal(candidate.direction, "INCREASE");
  assert.equal(candidate.classification, "MATERIAL_MOVEMENT_REVIEW_CANDIDATE");
  assert.equal(candidate.alertReviewCandidate, true);
  assert.equal(candidate.statisticalAnomalyClaim, false);
  assert.equal(candidate.causalClaim, false);
  assert.equal(candidate.attributionClaim, false);
  assert.equal(candidate.competitorPerformanceClaim, false);
  assert.equal(candidate.endorsementClaim, false);
  assert.equal(candidate.relationshipClaim, false);
  assert.equal(candidate.confidence, null);
  assert.equal(candidate.monetaryValue, null);
  assert.equal(result.crossPlatformAggregationPerformed, false);
  assert.equal(result.crossMetricRankingPerformed, false);
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.recommendationAuthority, "NONE");
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
});

test("keeps below-threshold movement observable without manufacturing an alert", () => {
  const result = compile(historyReview({
    currentValue: 115,
    priorValue: 100,
    absoluteDelta: 15,
    percentageDelta: 15
  }));

  assert.equal(result.status, "READY");
  assert.equal(result.movements[0]?.classification, "BELOW_CALLER_THRESHOLD");
  assert.equal(result.movements[0]?.alertReviewCandidate, false);
  assert.deepEqual(result.candidates, []);
});

test("preserves negative movement direction without assigning a cause", () => {
  const result = compile(historyReview({
    currentValue: 65,
    priorValue: 100,
    absoluteDelta: -35,
    percentageDelta: -35
  }));

  assert.equal(result.status, "READY");
  assert.equal(result.candidates[0]?.direction, "DECREASE");
  assert.equal(result.candidates[0]?.classification, "MATERIAL_MOVEMENT_REVIEW_CANDIDATE");
  assert.equal(result.candidates[0]?.causalClaim, false);
  assert.equal(result.candidates[0]?.attributionClaim, false);
});

test("leaves a zero prior baseline unresolved instead of inventing an infinite percentage change", () => {
  const result = compile(historyReview({
    currentValue: 50,
    priorValue: 0,
    absoluteDelta: 50,
    percentageDelta: null
  }));

  assert.equal(result.status, "READY");
  assert.equal(result.movements[0]?.classification, "UNRESOLVED_ZERO_PRIOR_BASELINE");
  assert.equal(result.movements[0]?.percentageDelta, null);
  assert.equal(result.movements[0]?.alertReviewCandidate, false);
  assert.deepEqual(result.candidates, []);
});

test("respects caller-owned minimum baseline before surfacing a material movement", () => {
  const result = compile(historyReview({
    currentValue: 20,
    priorValue: 10,
    absoluteDelta: 10,
    percentageDelta: 100
  }));

  assert.equal(result.status, "READY");
  assert.equal(result.movements[0]?.classification, "BELOW_CALLER_MINIMUM_PRIOR_BASELINE");
  assert.equal(result.movements[0]?.alertReviewCandidate, false);
});

test("fails closed when upstream history is stale, partial, or truth authority widens", () => {
  const stale = compile(historyReview({}, { evaluatedAt: "2026-09-17T13:00:00.000Z" }));
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.deepEqual(stale.reasons, ["UPSTREAM_TOO_OLD"]);
  assert.deepEqual(stale.movements, []);

  const partial = compile(historyReview({}, { sourceDecisionGrade: false }));
  assert.equal(partial.status, "VERIFY_REQUIRED");
  assert.deepEqual(partial.reasons, ["UPSTREAM_NOT_DECISION_GRADE"]);

  const widened = compile(historyReview({}, { crossPlatformAggregationPerformed: true } as unknown as Partial<SocialHistoryComparabilityReviewV1>));
  assert.equal(widened.status, "VERIFY_REQUIRED");
  assert.deepEqual(widened.reasons, ["UPSTREAM_TRUTH_WIDENED"]);
});

test("fails closed on range, evidence, or delta binding drift", () => {
  const rangeDrift = compile(historyReview({}, {}, { contiguous: false }));
  assert.equal(rangeDrift.status, "VERIFY_REQUIRED");
  assert.deepEqual(rangeDrift.reasons, ["REQUESTED_WINDOW_NOT_DECISION_GRADE"]);

  const evidenceDrift = compile(historyReview({}, {}, { evidenceRefs: ["different:evidence"] }));
  assert.equal(evidenceDrift.status, "VERIFY_REQUIRED");
  assert.deepEqual(evidenceDrift.reasons, ["EVIDENCE_BINDING_MISMATCH"]);

  const deltaDrift = compile(historyReview({ absoluteDelta: 999 }));
  assert.equal(deltaDrift.status, "VERIFY_REQUIRED");
  assert.deepEqual(deltaDrift.reasons, ["DELTA_BINDING_MISMATCH"]);
});

test("does not combine requested windows or metrics that are not decision grade", () => {
  const missingWindowPolicy: SocialMaterialMovementPolicyV1 = {
    ...policy,
    windows: ["30D"]
  };
  const missingWindow = compile(historyReview(), missingWindowPolicy);
  assert.equal(missingWindow.status, "VERIFY_REQUIRED");
  assert.deepEqual(missingWindow.reasons, ["REQUESTED_WINDOW_NOT_DECISION_GRADE"]);

  const metricNotReady = compile(historyReview({ state: "UNKNOWN", decisionGrade: false }));
  assert.equal(metricNotReady.status, "VERIFY_REQUIRED");
  assert.deepEqual(metricNotReady.reasons, ["REQUESTED_METRIC_NOT_DECISION_GRADE"]);
});

test("is deterministic, preserves caller input, and deep freezes output", () => {
  const input = {
    evaluatedAt,
    historyReview: historyReview(),
    policy
  };
  const before = structuredClone(input);
  const first = compileSocialMaterialMovementReviewV1(input);
  const second = compileSocialMaterialMovementReviewV1(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.movements));
  assert.ok(Object.isFrozen(first.movements[0]));
  assert.ok(Object.isFrozen(first.movements[0]?.evidenceRefs));
  assert.throws(() => {
    (first.movements as unknown as unknown[]).push({});
  });
});
