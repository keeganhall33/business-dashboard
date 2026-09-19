import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClarityBehaviorViewModelV1,
  type ClarityBehaviorInputV1,
  type ClarityBehaviorViewModelV1,
} from "../../../src/lib/clarity-behavior/view-model-v1";
import type { CheckoutDiagnosticsViewModelV1 } from "../../../src/lib/checkout-diagnostics/view-model-v1";
import {
  buildFreshRevenueBehavioralCorroborationV1,
  type BehavioralFreshnessCorroborationInputV1,
} from "../../../src/lib/intelligence/production-revenue-loop/behavioral-freshness-corroboration-v1";
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

function readyCheckout(
  overrides: Partial<CheckoutDiagnosticsViewModelV1> = {},
): CheckoutDiagnosticsViewModelV1 {
  return {
    state: "READY",
    stateLabel: "Checkout diagnostics ready",
    currentRange,
    priorRange,
    stageRows: [],
    largestDropoff: {
      from: "CHECKOUT_LOADED",
      to: "CUSTOMER_INFO_STARTED",
      fromLabel: "Checkout loaded",
      toLabel: "Customer info started",
      lostCount: 40,
      dropoffRate: 0.4,
    },
    errors: null,
    shippingLatency: null,
    segments: [],
    sourceTruth: {
      META: "COMPLETE",
      GA4: "COMPLETE",
      FUNNELKIT: "COMPLETE",
      WOO: "COMPLETE",
    },
    asOf: "2026-09-08T08:00:00Z",
    completeThrough: "2026-09-07",
    integrityIssues: [],
    decisionGrade: true,
    attributionNote: "Checkout behavior is observational and not causal attribution.",
    recommendation: null,
    ...overrides,
  };
}

function revenueInput(
  overrides: Partial<RevenueDecisionPacketInputV1> = {},
): RevenueDecisionPacketInputV1 {
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
          orders: 70,
          averageOrderValueCents: 1_143,
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
          sessions: 1_000,
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
          spendCents: 20_000,
          attributedPurchaseValueCents: 60_000,
        },
        previous: {
          revenueCents: null,
          orders: null,
          averageOrderValueCents: null,
          sessions: null,
          spendCents: 20_000,
          attributedPurchaseValueCents: 75_000,
        },
        evidenceRefs: ["evidence:meta:current-prior"],
      },
    ],
    ...overrides,
  };
}

function gateInput(
  overrides: Partial<BehavioralFreshnessCorroborationInputV1> = {},
): BehavioralFreshnessCorroborationInputV1 {
  return {
    revenueInput: revenueInput(),
    evaluatedAt: "2026-09-08T12:00:00Z",
    revenueFreshnessPolicy: { WOO: 6, GA4: 6, META: 6 },
    clarity: readyClarity(),
    checkout: readyCheckout(),
    clarityMaxAgeHours: 24,
    checkoutMaxAgeHours: 24,
    ...overrides,
  };
}

test("evaluates the full Woo + GA4 + Meta + Clarity + checkout bundle at one explicit decision instant", () => {
  const result = buildFreshRevenueBehavioralCorroborationV1(gateInput());

  assert.equal(result.version, "BEHAVIORAL_FRESHNESS_CORROBORATION_V2");
  assert.equal(result.status, "READY");
  assert.equal(result.reasonCode, "FRESH_BEHAVIORAL_EVIDENCE_EVALUATED");
  assert.equal(result.evaluatedAt, "2026-09-08T12:00:00Z");
  assert.equal(result.revenueFreshness.status, "READY");
  assert.equal(result.revenueFreshness.sourceFreshness.status, "READY");
  assert.equal(result.clarityFreshness.status, "READY");
  assert.equal(result.checkoutFreshness.status, "READY");
  assert.equal(result.clarityFreshness.ageHours, 4);
  assert.equal(result.checkoutFreshness.ageHours, 4);
  assert.equal(result.corroborationState, "SUPPORTED_FOR_INVESTIGATION");
  assert.equal(result.corroborationReasonCode, "CONVERSION_SIGNAL_HAS_BEHAVIORAL_SUPPORT");
  assert.equal(result.acceptedCorroboration?.state, "SUPPORTED_FOR_INVESTIGATION");
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.expectedLift, null);
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.externalMutationAllowed, false);
  assert.equal(result.metaWriteAllowed, false);
  assert.equal(result.approvalBypassAllowed, false);
});

test("withholds behavioral corroboration when revenue evidence has aged out even if Clarity and checkout are fresh", () => {
  const result = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({
      evaluatedAt: "2026-09-08T20:00:00Z",
      clarity: readyClarity({
        freshness: {
          extractedAt: "2026-09-08T19:00:00Z",
          completeThrough: "2026-09-07",
          now: "2026-09-08T19:30:00Z",
          maxAgeHours: 24,
        },
      }),
      checkout: readyCheckout({ asOf: "2026-09-08T19:00:00Z" }),
    }),
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "REVENUE_FRESHNESS_NOT_READY");
  assert.equal(result.revenueFreshness.status, "NOT_READY");
  assert.equal(result.revenueFreshness.sourceFreshness.reasonCode, "SOURCE_EVIDENCE_NOT_CURRENT");
  assert.equal(result.clarityFreshness.status, "READY");
  assert.equal(result.checkoutFreshness.status, "READY");
  assert.equal(result.acceptedCorroboration, null);
});

test("does not promote a fresh checkout signal when Clarity has become stale", () => {
  const result = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({
      evaluatedAt: "2026-09-10T12:00:00Z",
      revenueFreshnessPolicy: { WOO: 72, GA4: 72, META: 72 },
      checkout: readyCheckout({ asOf: "2026-09-10T11:00:00Z" }),
    }),
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "CLARITY_FRESHNESS_NOT_READY");
  assert.equal(result.revenueFreshness.status, "READY");
  assert.equal(result.clarityFreshness.status, "STALE");
  assert.equal(result.checkoutFreshness.status, "READY");
  assert.equal(result.corroborationState, null);
  assert.equal(result.acceptedCorroboration, null);
});

test("does not promote fresh Clarity when checkout diagnostics are stale", () => {
  const result = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({ checkout: readyCheckout({ asOf: "2026-09-05T08:00:00Z" }) }),
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "CHECKOUT_FRESHNESS_NOT_READY");
  assert.equal(result.revenueFreshness.status, "READY");
  assert.equal(result.clarityFreshness.status, "READY");
  assert.equal(result.checkoutFreshness.status, "STALE");
  assert.equal(result.acceptedCorroboration, null);
});

test("missing or invalid freshness evidence remains fail-closed instead of degrading to a partial-source recommendation", () => {
  const missing = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({ clarity: null }),
  );
  assert.equal(missing.status, "NOT_READY");
  assert.equal(missing.reasonCode, "CLARITY_FRESHNESS_NOT_READY");
  assert.equal(missing.clarityFreshness.reasonCode, "CLARITY_EVIDENCE_MISSING");
  assert.equal(missing.acceptedCorroboration, null);

  const invalidPolicy = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({
      revenueFreshnessPolicy: { WOO: 0, GA4: 6, META: 6 },
      clarityMaxAgeHours: 0,
      checkoutMaxAgeHours: Number.NaN,
    }),
  );
  assert.equal(invalidPolicy.status, "NOT_READY");
  assert.equal(invalidPolicy.reasonCode, "MULTIPLE_SOURCES_NOT_READY");
  assert.equal(
    invalidPolicy.revenueFreshness.sourceFreshness.reasonCode,
    "INVALID_FRESHNESS_POLICY",
  );
  assert.equal(invalidPolicy.clarityFreshness.reasonCode, "INVALID_FRESHNESS_POLICY");
  assert.equal(invalidPolicy.checkoutFreshness.reasonCode, "INVALID_FRESHNESS_POLICY");
  assert.equal(invalidPolicy.acceptedCorroboration, null);
});

test("future revenue packet chronology blocks the complete closed loop", () => {
  const result = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({ evaluatedAt: "2026-09-08T11:59:59Z" }),
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "CROSS_SOURCE_FRESHNESS_CONFLICTED");
  assert.equal(result.revenueFreshness.status, "CONFLICTED");
  assert.equal(
    result.revenueFreshness.sourceFreshness.reasonCode,
    "FUTURE_PACKET_GENERATION",
  );
  assert.equal(result.acceptedCorroboration, null);
});

test("conflicted behavioral source chronology blocks corroboration even when revenue evidence is fresh", () => {
  const result = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({ checkout: readyCheckout({ asOf: "2026-09-08T12:00:01Z" }) }),
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "CROSS_SOURCE_FRESHNESS_CONFLICTED");
  assert.equal(result.revenueFreshness.status, "READY");
  assert.equal(result.checkoutFreshness.reasonCode, "FUTURE_AS_OF");
  assert.equal(result.corroborationState, null);
  assert.equal(result.acceptedCorroboration, null);
});

test("fresh timestamps cannot override exact date-range mismatch", () => {
  const mismatchedRange = { startDate: "2026-08-10", endDate: "2026-09-07" };
  const result = buildFreshRevenueBehavioralCorroborationV1(
    gateInput({ checkout: readyCheckout({ currentRange: mismatchedRange }) }),
  );

  assert.equal(result.revenueFreshness.status, "READY");
  assert.equal(result.clarityFreshness.status, "READY");
  assert.equal(result.checkoutFreshness.status, "READY");
  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "CORROBORATION_NOT_READY");
  assert.equal(result.corroborationState, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.corroborationReasonCode, "BEHAVIORAL_DATE_RANGE_MISMATCH");
  assert.equal(result.acceptedCorroboration, null);
});

test("uses explicit evaluatedAt rather than packet generatedAt for every source and does not mutate inputs", () => {
  const input = gateInput({
    evaluatedAt: "2026-09-08T20:00:00Z",
    revenueFreshnessPolicy: { WOO: 24, GA4: 24, META: 24 },
    clarityMaxAgeHours: 11,
    checkoutMaxAgeHours: 13,
  });
  const before = JSON.stringify(input);

  const result = buildFreshRevenueBehavioralCorroborationV1(input);

  assert.equal(result.evaluatedAt, input.evaluatedAt);
  assert.equal(result.revenueFreshness.evaluatedAt, input.evaluatedAt);
  assert.equal(result.clarityFreshness.evaluatedAt, input.evaluatedAt);
  assert.equal(result.checkoutFreshness.evaluatedAt, input.evaluatedAt);
  assert.equal(result.revenueFreshness.status, "READY");
  assert.equal(result.clarityFreshness.status, "STALE");
  assert.equal(result.checkoutFreshness.status, "READY");
  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "CLARITY_FRESHNESS_NOT_READY");
  assert.equal(result.acceptedCorroboration, null);
  assert.equal(result.externalMutationAllowed, false);
  assert.equal(result.metaWriteAllowed, false);
  assert.equal(JSON.stringify(input), before);
});
