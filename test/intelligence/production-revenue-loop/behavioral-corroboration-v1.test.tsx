import assert from "node:assert/strict";
import test from "node:test";

import { buildClarityBehaviorViewModelV1 } from "@/lib/clarity-behavior/view-model-v1";
import { buildCheckoutDiagnosticsViewModelV1 } from "@/lib/checkout-diagnostics/view-model-v1";
import {
  buildRevenueBehavioralCorroborationV1,
  type RevenueBehavioralCorroborationInputV1,
} from "@/lib/intelligence/production-revenue-loop/behavioral-corroboration-v1";
import type { RevenueDecisionPacketInputV1 } from "@/lib/intelligence/production-revenue-loop/decision-packet-v1";

const CURRENT = { startDate: "2026-08-16", endDate: "2026-09-14" };
const PRIOR = { startDate: "2026-07-17", endDate: "2026-08-15" };

function metrics(overrides: Partial<{
  revenueCents: number | null;
  orders: number | null;
  averageOrderValueCents: number | null;
  sessions: number | null;
  spendCents: number | null;
  attributedPurchaseValueCents: number | null;
}> = {}) {
  return {
    revenueCents: null,
    orders: null,
    averageOrderValueCents: null,
    sessions: null,
    spendCents: null,
    attributedPurchaseValueCents: null,
    ...overrides,
  };
}

function conversionRevenueInput(): RevenueDecisionPacketInputV1 {
  return {
    generatedAt: "2026-09-15T12:00:00.000Z",
    currentRange: { ...CURRENT },
    comparisonRange: { ...PRIOR },
    observations: [
      {
        source: "WOO",
        truthState: "CURRENT",
        observedAt: "2026-09-15T10:00:00.000Z",
        current: metrics({ revenueCents: 80_000, orders: 8, averageOrderValueCents: 10_000 }),
        previous: metrics({ revenueCents: 100_000, orders: 12, averageOrderValueCents: 8_333 }),
        evidenceRefs: ["woo:current-prior"],
      },
      {
        source: "GA4",
        truthState: "CURRENT",
        observedAt: "2026-09-15T10:05:00.000Z",
        current: metrics({ sessions: 100 }),
        previous: metrics({ sessions: 100 }),
        evidenceRefs: ["ga4:current-prior"],
      },
      {
        source: "META",
        truthState: "CURRENT",
        observedAt: "2026-09-15T10:10:00.000Z",
        current: metrics({ spendCents: 20_000, attributedPurchaseValueCents: 30_000 }),
        previous: metrics({ spendCents: 20_000, attributedPurchaseValueCents: 40_000 }),
        evidenceRefs: ["meta:current-prior"],
      },
    ],
  };
}

function trafficRevenueInput(): RevenueDecisionPacketInputV1 {
  const input = conversionRevenueInput();
  const woo = input.observations.find((item) => item.source === "WOO");
  const ga4 = input.observations.find((item) => item.source === "GA4");
  assert.ok(woo);
  assert.ok(ga4);
  woo.current = metrics({ revenueCents: 80_000, orders: 8, averageOrderValueCents: 10_000 });
  woo.previous = metrics({ revenueCents: 100_000, orders: 10, averageOrderValueCents: 10_000 });
  ga4.current = metrics({ sessions: 80 });
  ga4.previous = metrics({ sessions: 100 });
  return input;
}

function clarity(options: { state?: "COMPLETE" | "PARTIAL" | "CONFLICTED"; clean?: boolean; mismatchedRange?: boolean } = {}) {
  const currentRange = options.mismatchedRange
    ? { startDate: "2026-08-17", endDate: "2026-09-15" }
    : { ...CURRENT };
  const priorRange = options.mismatchedRange
    ? { startDate: "2026-07-18", endDate: "2026-08-16" }
    : { ...PRIOR };
  const clean = options.clean === true;
  return buildClarityBehaviorViewModelV1({
    sourceTruth: options.state ?? "COMPLETE",
    requestedRange: { current: currentRange, prior: priorRange },
    observedRange: { current: { ...currentRange }, prior: { ...priorRange } },
    current: {
      sessions: 100,
      uniqueUsers: 80,
      pagesPerSession: 2.5,
      scrollDepthPercent: 65,
      activeTimeSeconds: clean ? 60 : 50,
      deadClickSessions: clean ? 3 : 15,
      quickBackSessions: clean ? 5 : 15,
      rageClickSessions: 3,
      excessiveScrollSessions: 5,
      purchaseSessions: 8,
    },
    prior: {
      sessions: 100,
      uniqueUsers: 80,
      pagesPerSession: 2.6,
      scrollDepthPercent: 65,
      activeTimeSeconds: clean ? 60 : 70,
      deadClickSessions: clean ? 3 : 5,
      quickBackSessions: clean ? 5 : 10,
      rageClickSessions: 3,
      excessiveScrollSessions: 5,
      purchaseSessions: 12,
    },
    freshness: {
      extractedAt: "2026-09-15T08:00:00.000Z",
      completeThrough: currentRange.endDate,
      now: "2026-09-15T12:00:00.000Z",
      maxAgeHours: 48,
    },
  });
}

function checkout() {
  return buildCheckoutDiagnosticsViewModelV1({
    instrumentation: "ACTIVE",
    range: { current: { ...CURRENT }, prior: { ...PRIOR } },
    current: {
      stages: {
        CHECKOUT_LOADED: 100,
        CUSTOMER_INFO_STARTED: 90,
        CUSTOMER_INFO_COMPLETED: 80,
        SHIPPING_METHODS_LOADED: 70,
        SHIPPING_METHOD_SELECTED: 60,
        SHIPPING_TOTAL_SHOWN: 55,
        PAYMENT_SECTION_VISIBLE: 50,
        PAYMENT_METHODS_LOADED: 45,
        PAYMENT_METHOD_SELECTED: 35,
        PLACE_ORDER_CLICKED: 30,
        ORDER_CREATED: 20,
        PURCHASE: 8,
      },
    },
    prior: {
      stages: {
        CHECKOUT_LOADED: 100,
        CUSTOMER_INFO_STARTED: 95,
        CUSTOMER_INFO_COMPLETED: 90,
        SHIPPING_METHODS_LOADED: 85,
        SHIPPING_METHOD_SELECTED: 80,
        SHIPPING_TOTAL_SHOWN: 75,
        PAYMENT_SECTION_VISIBLE: 70,
        PAYMENT_METHODS_LOADED: 65,
        PAYMENT_METHOD_SELECTED: 55,
        PLACE_ORDER_CLICKED: 50,
        ORDER_CREATED: 45,
        PURCHASE: 12,
      },
    },
    errors: { validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 0 },
    shippingLatency: {
      sampleSize: 20,
      waitsAtLeastFourSeconds: 2,
      medianMs: 1200,
      p95Ms: 3100,
      mobileChromeSampleSize: 8,
      mobileChromeMedianMs: 1400,
      mobileChromeP95Ms: 3300,
      buckets: [],
    },
    segments: [{ device: "Mobile", source: "Instagram", checkoutLoaded: 100, purchases: 8 }],
    sourceTruth: { META: "COMPLETE", GA4: "COMPLETE", FUNNELKIT: "COMPLETE", WOO: "COMPLETE" },
    freshness: { asOf: "2026-09-15T09:00:00.000Z", completeThrough: CURRENT.endDate },
  });
}

function input(overrides: Partial<RevenueBehavioralCorroborationInputV1> = {}): RevenueBehavioralCorroborationInputV1 {
  return {
    revenueInput: conversionRevenueInput(),
    clarity: clarity(),
    checkout: checkout(),
    ...overrides,
  };
}

test("corroborates a canonical conversion signal with exact-range behavioral friction without claiming causality", () => {
  const result = buildRevenueBehavioralCorroborationV1(input());

  assert.equal(result.state, "SUPPORTED_FOR_INVESTIGATION");
  assert.equal(result.reasonCode, "CONVERSION_SIGNAL_HAS_BEHAVIORAL_SUPPORT");
  assert.equal(result.decision.revenueDriver, "CONVERSION");
  assert.ok(result.supportingFacts.some((fact) => fact.startsWith("Checkout:")));
  assert.ok(result.supportingFacts.some((fact) => fact.startsWith("Clarity:")));
  assert.equal(result.causalClaim, false);
  assert.match(result.attributionStatement, /do not prove/);
  assert.deepEqual(result.nextStep, {
    kind: "PREPARE_CONVERSION_EXPERIMENT",
    description: "Prepare one bounded conversion experiment around the strongest observed friction signal. Keep pricing and Meta spend unchanged during the measurement window unless separately approved.",
    approvalClass: "KEEGAN_APPROVAL_REQUIRED",
    externalMutationAllowed: false,
    metaWriteAllowed: false,
  });
});

test("fails closed when behavioral windows do not exactly match the revenue decision periods", () => {
  const result = buildRevenueBehavioralCorroborationV1(input({ clarity: clarity({ mismatchedRange: true }), checkout: null }));

  assert.equal(result.state, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "BEHAVIORAL_DATE_RANGE_MISMATCH");
  assert.equal(result.supportingFacts.length, 0);
  assert.equal(result.sourceStatus[0].rangeMatch, false);
  assert.match(result.limitations.join(" "), /do not exactly match/);
});

test("excludes partial Clarity evidence while allowing independently decision-grade checkout evidence to corroborate", () => {
  const result = buildRevenueBehavioralCorroborationV1(input({ clarity: clarity({ state: "PARTIAL" }) }));

  assert.equal(result.state, "SUPPORTED_FOR_INVESTIGATION");
  assert.ok(result.supportingFacts.every((fact) => !fact.startsWith("Clarity:")));
  assert.ok(result.supportingFacts.some((fact) => fact.startsWith("Checkout:")));
  assert.equal(result.sourceStatus[0].eligible, false);
  assert.equal(result.sourceStatus[1].eligible, true);
  assert.match(result.limitations.join(" "), /CLARITY behavioral evidence is PARTIAL/);
});

test("suppresses behavioral corroboration when one supplied behavioral source is conflicted", () => {
  const result = buildRevenueBehavioralCorroborationV1(input({ clarity: clarity({ state: "CONFLICTED" }) }));

  assert.equal(result.state, "CONFLICTED");
  assert.equal(result.reasonCode, "BEHAVIORAL_EVIDENCE_CONFLICTED");
  assert.equal(result.supportingFacts.length, 0);
  assert.equal(result.nextStep.kind, "RECONCILE_EVIDENCE");
  assert.equal(result.nextStep.externalMutationAllowed, false);
  assert.equal(result.nextStep.metaWriteAllowed, false);
});

test("does not let behavioral evidence override a canonical non-conversion revenue contributor", () => {
  const result = buildRevenueBehavioralCorroborationV1(input({ revenueInput: trafficRevenueInput() }));

  assert.equal(result.state, "NOT_APPLICABLE");
  assert.equal(result.reasonCode, "REVENUE_DRIVER_NOT_CONVERSION");
  assert.equal(result.decision.revenueDriver, "TRAFFIC");
  assert.equal(result.supportingFacts.length, 0);
  assert.equal(result.nextStep.kind, "NO_BEHAVIORAL_OVERRIDE");
});

test("returns NOT_CORROBORATED when decision-grade behavior contains no material friction signal", () => {
  const result = buildRevenueBehavioralCorroborationV1(input({ clarity: clarity({ clean: true }), checkout: null }));

  assert.equal(result.state, "NOT_CORROBORATED");
  assert.equal(result.reasonCode, "NO_MATERIAL_BEHAVIORAL_FRICTION_SIGNAL");
  assert.deepEqual(result.supportingFacts, []);
  assert.equal(result.nextStep.kind, "CONTINUE_DIAGNOSIS");
  assert.match(result.nextStep.description, /Do not manufacture/);
});

test("fails closed when the canonical revenue packet itself cannot isolate a supported driver", () => {
  const revenueInput = conversionRevenueInput();
  revenueInput.observations.find((item) => item.source === "GA4")!.truthState = "STALE";
  const result = buildRevenueBehavioralCorroborationV1(input({ revenueInput }));

  assert.equal(result.state, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "REVENUE_DECISION_NOT_READY");
  assert.equal(result.supportingFacts.length, 0);
});

test("is deterministic, deeply immutable, and leaves all supplied evidence unchanged", () => {
  const supplied = input();
  const before = structuredClone(supplied);

  const first = buildRevenueBehavioralCorroborationV1(supplied);
  const second = buildRevenueBehavioralCorroborationV1(supplied);

  assert.deepEqual(first, second);
  assert.deepEqual(supplied, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decision), true);
  assert.equal(Object.isFrozen(first.sourceStatus), true);
  assert.equal(Object.isFrozen(first.supportingFacts), true);
  assert.equal(Object.isFrozen(first.nextStep), true);
  assert.equal(first.nextStep.externalMutationAllowed, false);
  assert.equal(first.nextStep.metaWriteAllowed, false);
});
