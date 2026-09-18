import assert from "node:assert/strict";
import test from "node:test";
import type { CheckoutDiagnosticsViewModelV1 } from "../../../src/lib/checkout-diagnostics/view-model-v1";
import { buildRevenueBehavioralCorroborationV1 } from "../../../src/lib/intelligence/production-revenue-loop/behavioral-corroboration-v1";
import {
  revalidateCheckoutFreshnessV1,
  type CheckoutFreshnessRevalidationInputV1,
} from "../../../src/lib/intelligence/production-revenue-loop/checkout-freshness-revalidation-v1";
import type { RevenueDecisionPacketInputV1 } from "../../../src/lib/intelligence/production-revenue-loop/decision-packet-v1";

const currentRange = { startDate: "2026-08-09", endDate: "2026-09-07" };
const priorRange = { startDate: "2026-07-10", endDate: "2026-08-08" };

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

function freshnessInput(
  checkout: CheckoutDiagnosticsViewModelV1 | null,
  overrides: Partial<Omit<CheckoutFreshnessRevalidationInputV1, "checkout">> = {},
): CheckoutFreshnessRevalidationInputV1 {
  return {
    checkout,
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
  };
}

test("fresh decision-grade checkout evidence is accepted without granting action or attribution authority", () => {
  const checkout = readyCheckout();
  const before = JSON.stringify(checkout);
  const result = revalidateCheckoutFreshnessV1(freshnessInput(checkout));

  assert.equal(result.status, "READY");
  assert.equal(result.reasonCode, "CHECKOUT_EVIDENCE_ACCEPTED");
  assert.equal(result.ageHours, 4);
  assert.equal(result.acceptedCheckout, checkout);
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.expectedLift, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.externalMutationAllowed, false);
  assert.equal(result.metaWriteAllowed, false);
  assert.equal(result.approvalBypassAllowed, false);
  assert.equal(JSON.stringify(checkout), before);
});

test("stale checkout evidence is removed before the canonical behavioral corroboration step", () => {
  const staleCheckout = readyCheckout({ asOf: "2026-09-05T08:00:00Z" });
  const gate = revalidateCheckoutFreshnessV1(freshnessInput(staleCheckout));
  assert.equal(gate.status, "STALE");
  assert.equal(gate.reasonCode, "STALE_AS_OF");
  assert.equal(gate.acceptedCheckout, null);

  const behavioral = buildRevenueBehavioralCorroborationV1({
    revenueInput: revenueInput(),
    clarity: null,
    checkout: gate.acceptedCheckout,
  });

  assert.equal(behavioral.decision.revenueDriver, "CONVERSION");
  assert.equal(behavioral.state, "INSUFFICIENT_EVIDENCE");
  assert.equal(behavioral.reasonCode, "BEHAVIORAL_EVIDENCE_NOT_DECISION_GRADE");
  assert.equal(behavioral.nextStep.externalMutationAllowed, false);
  assert.equal(behavioral.nextStep.metaWriteAllowed, false);
});

test("fresh checkout evidence can still corroborate a conversion signal only as an investigation signal", () => {
  const gate = revalidateCheckoutFreshnessV1(freshnessInput(readyCheckout()));
  const behavioral = buildRevenueBehavioralCorroborationV1({
    revenueInput: revenueInput(),
    clarity: null,
    checkout: gate.acceptedCheckout,
  });

  assert.equal(gate.status, "READY");
  assert.equal(behavioral.state, "SUPPORTED_FOR_INVESTIGATION");
  assert.equal(behavioral.reasonCode, "CONVERSION_SIGNAL_HAS_BEHAVIORAL_SUPPORT");
  assert.ok(behavioral.supportingFacts.some((fact) => fact.startsWith("Checkout:")));
  assert.equal(behavioral.causalClaim, false);
  assert.match(behavioral.attributionStatement, /do not prove/i);
  assert.equal(behavioral.nextStep.approvalClass, "KEEGAN_APPROVAL_REQUIRED");
  assert.equal(behavioral.nextStep.externalMutationAllowed, false);
  assert.equal(behavioral.nextStep.metaWriteAllowed, false);
});

test("future observed-at evidence fails closed as conflicted", () => {
  const result = revalidateCheckoutFreshnessV1(
    freshnessInput(readyCheckout({ asOf: "2026-09-08T12:00:01Z" })),
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "FUTURE_AS_OF");
  assert.equal(result.acceptedCheckout, null);
});

test("future completeness claims fail closed rather than appearing current", () => {
  const result = revalidateCheckoutFreshnessV1(
    freshnessInput(readyCheckout({ completeThrough: "2026-09-09" })),
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "FUTURE_COVERAGE");
  assert.equal(result.acceptedCheckout, null);
});

test("completeness later than the extraction date is treated as contradictory", () => {
  const result = revalidateCheckoutFreshnessV1(
    freshnessInput(readyCheckout({
      asOf: "2026-09-07T23:00:00Z",
      completeThrough: "2026-09-08",
    })),
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "COVERAGE_AFTER_EXTRACTION");
  assert.equal(result.acceptedCheckout, null);
});

test("caller must provide a valid explicit freshness policy", () => {
  for (const maxAgeHours of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = revalidateCheckoutFreshnessV1(
      freshnessInput(readyCheckout(), { maxAgeHours }),
    );
    assert.equal(result.status, "NOT_READY");
    assert.equal(result.reasonCode, "INVALID_FRESHNESS_POLICY");
    assert.equal(result.acceptedCheckout, null);
  }

  const malformedNow = revalidateCheckoutFreshnessV1(
    freshnessInput(readyCheckout(), { evaluatedAt: "2026-09-08" }),
  );
  assert.equal(malformedNow.reasonCode, "INVALID_FRESHNESS_POLICY");
  assert.equal(malformedNow.acceptedCheckout, null);
});

test("forged READY state cannot override incomplete source truth", () => {
  const result = revalidateCheckoutFreshnessV1(
    freshnessInput(readyCheckout({
      sourceTruth: {
        META: "COMPLETE",
        GA4: "COMPLETE",
        FUNNELKIT: "PARTIAL",
        WOO: "COMPLETE",
      },
    })),
  );

  assert.equal(result.status, "NOT_READY");
  assert.equal(result.reasonCode, "SOURCE_TRUTH_NOT_COMPLETE");
  assert.equal(result.acceptedCheckout, null);
});

test("upstream conflicts retain conflict semantics instead of degrading to missing", () => {
  const result = revalidateCheckoutFreshnessV1(
    freshnessInput(readyCheckout({
      state: "CONFLICTED",
      decisionGrade: false,
      integrityIssues: [{
        code: "CURRENT_STAGE_INVERSION",
        severity: "CONFLICT",
        message: "Observed stage counts are contradictory.",
      }],
    })),
  );

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "UPSTREAM_CONFLICT");
  assert.equal(result.acceptedCheckout, null);
});
