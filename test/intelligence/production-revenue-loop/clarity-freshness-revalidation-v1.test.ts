import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClarityBehaviorViewModelV1,
  type ClarityBehaviorInputV1,
  type ClarityBehaviorViewModelV1,
} from "../../../src/lib/clarity-behavior/view-model-v1";
import { buildRevenueBehavioralCorroborationV1 } from "../../../src/lib/intelligence/production-revenue-loop/behavioral-corroboration-v1";
import {
  revalidateClarityFreshnessV1,
  type ClarityFreshnessRevalidationInputV1,
} from "../../../src/lib/intelligence/production-revenue-loop/clarity-freshness-revalidation-v1";
import type { RevenueDecisionPacketInputV1 } from "../../../src/lib/intelligence/production-revenue-loop/decision-packet-v1";

const currentRange = { startDate: "2026-08-09", endDate: "2026-09-07" };
const priorRange = { startDate: "2026-07-10", endDate: "2026-08-08" };

function clarityInput(
  overrides: Partial<ClarityBehaviorInputV1> = {},
): ClarityBehaviorInputV1 {
  return {
    sourceTruth: "COMPLETE",
    requestedRange: { current: currentRange, prior: priorRange },
    observedRange: { current: currentRange, prior: priorRange },
    current: {
      sessions: 1_000,
      uniqueUsers: 800,
      pagesPerSession: 3,
      scrollDepthPercent: 65,
      activeTimeSeconds: 50,
      rageClickSessions: 20,
      deadClickSessions: 160,
      excessiveScrollSessions: 10,
      quickBackSessions: 150,
      purchaseSessions: 5,
    },
    prior: {
      sessions: 1_000,
      uniqueUsers: 810,
      pagesPerSession: 3.1,
      scrollDepthPercent: 60,
      activeTimeSeconds: 70,
      rageClickSessions: 18,
      deadClickSessions: 60,
      excessiveScrollSessions: 9,
      quickBackSessions: 130,
      purchaseSessions: 4,
    },
    freshness: {
      extractedAt: "2026-09-08T08:00:00Z",
      completeThrough: "2026-09-07",
      now: "2026-09-08T09:00:00Z",
      maxAgeHours: 24,
    },
    ...overrides,
  };
}

function readyClarity(
  overrides: Partial<ClarityBehaviorInputV1> = {},
): ClarityBehaviorViewModelV1 {
  const view = buildClarityBehaviorViewModelV1(clarityInput(overrides));
  assert.equal(view.state, "READY");
  assert.equal(view.decisionGrade, true);
  return view;
}

function freshnessInput(
  clarity: ClarityBehaviorViewModelV1 | null,
  overrides: Partial<Omit<ClarityFreshnessRevalidationInputV1, "clarity">> = {},
): ClarityFreshnessRevalidationInputV1 {
  return {
    clarity,
    evaluatedAt: "2026-09-08T12:00:00Z",
    maxAgeHours: 24,
    ...overrides,
  };
}

function revenueInput(): RevenueDecisionPacketInputV1 {
  return {
    generatedAt: "2026-09-08T12:00:00Z",
    currentRange,
    comparisonRange: priorRange,
    observations: [
      {
        source: "WOO",
        truthState: "CURRENT",
        observedAt: "2026-09-08T09:00:00Z",
        current: {
          revenueCents: 80_000,
          orders: 60,
          averageOrderValueCents: 1_333,
          sessions: null,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        previous: {
          revenueCents: 100_000,
          orders: 100,
          averageOrderValueCents: 1_000,
          sessions: null,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        evidenceRefs: ["evidence:woo:current-prior"],
      },
      {
        source: "GA4",
        truthState: "CURRENT",
        observedAt: "2026-09-08T09:05:00Z",
        current: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: 950,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        previous: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: 1_000,
          spendCents: null,
          attributedPurchaseValueCents: null,
        },
        evidenceRefs: ["evidence:ga4:current-prior"],
      },
      {
        source: "META",
        truthState: "CURRENT",
        observedAt: "2026-09-08T09:10:00Z",
        current: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: null,
          spendCents: 25_000,
          attributedPurchaseValueCents: 40_000,
        },
        previous: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: null,
          spendCents: 25_000,
          attributedPurchaseValueCents: 45_000,
        },
        evidenceRefs: ["evidence:meta:current-prior"],
      },
    ],
  };
}

test("accepts still-fresh READY Clarity evidence without widening authority", () => {
  const clarity = readyClarity();
  const result = revalidateClarityFreshnessV1(freshnessInput(clarity));

  assert.equal(result.status, "READY");
  assert.equal(result.reasonCode, "CLARITY_EVIDENCE_ACCEPTED");
  assert.equal(result.ageHours, 4);
  assert.equal(result.acceptedClarity, clarity);
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.expectedLift, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.externalMutationAllowed, false);
  assert.equal(result.metaWriteAllowed, false);
  assert.equal(result.approvalBypassAllowed, false);
});

test("removes Clarity evidence once it is stale at revenue decision time", () => {
  const clarity = readyClarity();
  const result = revalidateClarityFreshnessV1(
    freshnessInput(clarity, { evaluatedAt: "2026-09-10T12:00:00Z", maxAgeHours: 24 }),
  );

  assert.equal(result.status, "STALE");
  assert.equal(result.reasonCode, "STALE_EXTRACTION");
  assert.equal(result.ageHours, 52);
  assert.equal(result.acceptedClarity, null);
});

test("stale Clarity is removed before canonical revenue behavioral corroboration", () => {
  const clarity = readyClarity();
  const fresh = revalidateClarityFreshnessV1(freshnessInput(clarity));
  const freshCorroboration = buildRevenueBehavioralCorroborationV1({
    revenueInput: revenueInput(),
    clarity: fresh.acceptedClarity,
    checkout: null,
  });
  assert.equal(freshCorroboration.state, "SUPPORTED_FOR_INVESTIGATION");
  assert.equal(freshCorroboration.causalClaim, false);

  const stale = revalidateClarityFreshnessV1(
    freshnessInput(clarity, { evaluatedAt: "2026-09-10T12:00:00Z", maxAgeHours: 24 }),
  );
  const staleCorroboration = buildRevenueBehavioralCorroborationV1({
    revenueInput: revenueInput(),
    clarity: stale.acceptedClarity,
    checkout: null,
  });
  assert.equal(staleCorroboration.state, "INSUFFICIENT_EVIDENCE");
  assert.equal(staleCorroboration.reasonCode, "BEHAVIORAL_EVIDENCE_NOT_DECISION_GRADE");
  assert.equal(staleCorroboration.causalClaim, false);
  assert.equal(staleCorroboration.nextStep.externalMutationAllowed, false);
  assert.equal(staleCorroboration.nextStep.metaWriteAllowed, false);
});

test("fails closed on future extraction relative to the later decision instant", () => {
  const clarity = readyClarity({
    freshness: {
      extractedAt: "2026-09-09T08:00:00Z",
      completeThrough: "2026-09-07",
      now: "2026-09-09T09:00:00Z",
      maxAgeHours: 24,
    },
  });
  const result = revalidateClarityFreshnessV1(freshnessInput(clarity));

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "FUTURE_EXTRACTION");
  assert.equal(result.acceptedClarity, null);
});

test("rejects completeness later than the extraction date", () => {
  const clarity = readyClarity({
    freshness: {
      extractedAt: "2026-09-07T23:00:00Z",
      completeThrough: "2026-09-08",
      now: "2026-09-08T12:00:00Z",
      maxAgeHours: 24,
    },
  });
  const result = revalidateClarityFreshnessV1(freshnessInput(clarity));

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "COVERAGE_AFTER_EXTRACTION");
  assert.equal(result.acceptedClarity, null);
});

test("fails closed on invalid caller freshness policy", () => {
  const result = revalidateClarityFreshnessV1(
    freshnessInput(readyClarity(), { evaluatedAt: "not-a-time", maxAgeHours: 0 }),
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "INVALID_FRESHNESS_POLICY");
  assert.equal(result.acceptedClarity, null);
});

test("preserves upstream conflicted and non-decision-grade states", () => {
  const ready = readyClarity();
  const conflicted: ClarityBehaviorViewModelV1 = {
    ...ready,
    state: "CONFLICTED",
    stateLabel: "Clarity behavioral evidence is conflicted",
    decisionGrade: false,
  };
  const partial: ClarityBehaviorViewModelV1 = {
    ...ready,
    state: "PARTIAL",
    stateLabel: "Clarity behavioral evidence is partial",
    decisionGrade: false,
  };

  assert.equal(
    revalidateClarityFreshnessV1(freshnessInput(conflicted)).reasonCode,
    "UPSTREAM_CONFLICT",
  );
  assert.equal(
    revalidateClarityFreshnessV1(freshnessInput(partial)).reasonCode,
    "CLARITY_NOT_DECISION_GRADE",
  );
});

test("does not mutate the canonical Clarity view", () => {
  const clarity = readyClarity();
  const before = JSON.stringify(clarity);

  revalidateClarityFreshnessV1(freshnessInput(clarity));

  assert.equal(JSON.stringify(clarity), before);
});
