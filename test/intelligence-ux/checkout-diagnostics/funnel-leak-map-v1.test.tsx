import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckoutFunnelLeakMapV1,
  MATERIAL_CHECKOUT_DROPOFF_RATE,
  type CheckoutFunnelLeakMapInputV1,
} from "../../../src/lib/checkout-diagnostics/funnel-leak-map-v1";
import {
  buildCheckoutDiagnosticsViewModelV1,
  CHECKOUT_STAGE_ORDER,
  type CheckoutDiagnosticsInputV1,
  type CheckoutDiagnosticsViewModelV1,
  type CheckoutStageKey,
} from "../../../src/lib/checkout-diagnostics/view-model-v1";

const currentCounts: Record<CheckoutStageKey, number> = {
  CHECKOUT_LOADED: 100,
  CUSTOMER_INFO_STARTED: 90,
  CUSTOMER_INFO_COMPLETED: 80,
  SHIPPING_METHODS_LOADED: 70,
  SHIPPING_METHOD_SELECTED: 45,
  SHIPPING_TOTAL_SHOWN: 43,
  PAYMENT_SECTION_VISIBLE: 42,
  PAYMENT_METHODS_LOADED: 40,
  PAYMENT_METHOD_SELECTED: 38,
  PLACE_ORDER_CLICKED: 30,
  ORDER_CREATED: 28,
  PURCHASE: 27,
};

const priorCounts: Record<CheckoutStageKey, number> = {
  CHECKOUT_LOADED: 100,
  CUSTOMER_INFO_STARTED: 92,
  CUSTOMER_INFO_COMPLETED: 85,
  SHIPPING_METHODS_LOADED: 80,
  SHIPPING_METHOD_SELECTED: 75,
  SHIPPING_TOTAL_SHOWN: 72,
  PAYMENT_SECTION_VISIBLE: 70,
  PAYMENT_METHODS_LOADED: 68,
  PAYMENT_METHOD_SELECTED: 65,
  PLACE_ORDER_CLICKED: 60,
  ORDER_CREATED: 58,
  PURCHASE: 55,
};

function diagnosticsInput(overrides: Partial<CheckoutDiagnosticsInputV1> = {}): CheckoutDiagnosticsInputV1 {
  return {
    instrumentation: "ACTIVE",
    range: {
      current: { startDate: "2026-09-01", endDate: "2026-09-07" },
      prior: { startDate: "2026-08-25", endDate: "2026-08-31" },
    },
    current: { stages: currentCounts },
    prior: { stages: priorCounts },
    errors: { validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 0 },
    shippingLatency: {
      sampleSize: 20,
      waitsAtLeastFourSeconds: 2,
      medianMs: 1200,
      p95Ms: 3200,
      mobileChromeSampleSize: 10,
      mobileChromeMedianMs: 1400,
      mobileChromeP95Ms: 3500,
      buckets: [
        { label: "<2s", count: 14 },
        { label: "2-4s", count: 4 },
        { label: "4s+", count: 2 },
      ],
    },
    segments: [
      { device: "Mobile", source: "Paid social", checkoutLoaded: 60, purchases: 14 },
      { device: "Desktop", source: "Direct", checkoutLoaded: 40, purchases: 13 },
    ],
    sourceTruth: { META: "COMPLETE", GA4: "COMPLETE", FUNNELKIT: "COMPLETE", WOO: "COMPLETE" },
    freshness: { asOf: "2026-09-08T08:00:00Z", completeThrough: "2026-09-07" },
    ...overrides,
  };
}

function evidenceRefs(): Record<CheckoutStageKey, readonly string[]> {
  return Object.fromEntries(
    CHECKOUT_STAGE_ORDER.map((stage) => [stage, [`checkout-stage:${stage.toLowerCase()}:2026-09-07`]]),
  ) as Record<CheckoutStageKey, readonly string[]>;
}

function readyInput(overrides: Partial<CheckoutFunnelLeakMapInputV1> = {}): CheckoutFunnelLeakMapInputV1 {
  return {
    diagnostics: buildCheckoutDiagnosticsViewModelV1(diagnosticsInput()),
    evidenceRefsByStage: evidenceRefs(),
    evaluatedAt: "2026-09-08T09:00:00Z",
    maxAgeHours: 24,
    ...overrides,
  };
}

test("ranks the observed shipping-stage checkout leak without synthesizing revenue or causality", () => {
  const result = buildCheckoutFunnelLeakMapV1(readyInput());

  assert.equal(result.state, "READY");
  assert.equal(result.reasonCode, "FUNNEL_LEAK_MAP_READY");
  assert.equal(result.entries.length, CHECKOUT_STAGE_ORDER.length - 1);

  const top = result.entries[0];
  assert.equal(top.from, "SHIPPING_METHODS_LOADED");
  assert.equal(top.to, "SHIPPING_METHOD_SELECTED");
  assert.equal(top.currentLostCount, 25);
  assert.ok(top.currentDropoffRate >= MATERIAL_CHECKOUT_DROPOFF_RATE);
  assert.deepEqual(top.signals, ["MATERIAL_CURRENT_DROPOFF", "REGRESSED_VS_PRIOR"]);
  assert.equal(top.nextStep, "INVESTIGATE_STAGE_FRICTION");
  assert.ok(top.observedFacts.some((fact) => /drop-off/i.test(fact)));
  assert.ok(top.observedFacts.some((fact) => /matched prior period/i.test(fact)));

  assert.equal(result.attribution, "NOT_ESTABLISHED");
  assert.equal(result.monetaryImpact, null);
  assert.equal(result.confidence, null);
  assert.equal(result.authority.causalClaimAllowed, false);
  assert.equal(result.authority.revenueAttributionAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
});

test("partial four-source truth cannot become a ready leak map", () => {
  const diagnostics = buildCheckoutDiagnosticsViewModelV1(diagnosticsInput({
    sourceTruth: { META: "PARTIAL", GA4: "COMPLETE", FUNNELKIT: "COMPLETE", WOO: "COMPLETE" },
  }));
  const result = buildCheckoutFunnelLeakMapV1(readyInput({ diagnostics }));

  assert.equal(diagnostics.decisionGrade, false);
  assert.equal(result.state, "WITHHELD");
  assert.equal(result.reasonCode, "DIAGNOSTICS_NOT_READY");
  assert.deepEqual(result.entries, []);
});

test("a forged READY model with incomplete source truth still fails closed", () => {
  const diagnostics = buildCheckoutDiagnosticsViewModelV1(diagnosticsInput());
  const forged = {
    ...diagnostics,
    sourceTruth: { ...diagnostics.sourceTruth, META: "PARTIAL" as const },
  } satisfies CheckoutDiagnosticsViewModelV1;

  const result = buildCheckoutFunnelLeakMapV1(readyInput({ diagnostics: forged }));
  assert.equal(result.state, "WITHHELD");
  assert.equal(result.reasonCode, "SOURCE_TRUTH_INCOMPLETE");
});

test("stale and future evidence are rejected against caller-owned evaluation time", () => {
  const stale = buildCheckoutFunnelLeakMapV1(readyInput({
    evaluatedAt: "2026-09-10T09:00:00Z",
    maxAgeHours: 24,
  }));
  assert.equal(stale.state, "WITHHELD");
  assert.equal(stale.reasonCode, "STALE_EVIDENCE");

  const diagnostics = buildCheckoutDiagnosticsViewModelV1(diagnosticsInput({
    freshness: { asOf: "2026-09-08T10:00:00Z", completeThrough: "2026-09-07" },
  }));
  const future = buildCheckoutFunnelLeakMapV1(readyInput({
    diagnostics,
    evaluatedAt: "2026-09-08T09:00:00Z",
  }));
  assert.equal(future.state, "WITHHELD");
  assert.equal(future.reasonCode, "FUTURE_EVIDENCE");
});

test("missing or credential-like stage provenance is withheld instead of silently trusted", () => {
  const missingRefs = evidenceRefs();
  delete (missingRefs as Partial<Record<CheckoutStageKey, readonly string[]>>).PAYMENT_SECTION_VISIBLE;
  const missing = buildCheckoutFunnelLeakMapV1(readyInput({ evidenceRefsByStage: missingRefs }));
  assert.equal(missing.state, "WITHHELD");
  assert.equal(missing.reasonCode, "EVIDENCE_PROVENANCE_MISSING");

  const unsafeRefs = evidenceRefs();
  unsafeRefs.PURCHASE = ["access_token=do-not-store-this"];
  const unsafe = buildCheckoutFunnelLeakMapV1(readyInput({ evidenceRefsByStage: unsafeRefs }));
  assert.equal(unsafe.state, "WITHHELD");
  assert.equal(unsafe.reasonCode, "EVIDENCE_PROVENANCE_MISSING");
});

test("tampered stage evidence and date ranges fail closed before ranking", () => {
  const diagnostics = buildCheckoutDiagnosticsViewModelV1(diagnosticsInput());
  const tamperedRows = diagnostics.stageRows.map((row) => row.key === "PURCHASE"
    ? { ...row, currentCount: null }
    : row);
  const tampered = { ...diagnostics, stageRows: tamperedRows } satisfies CheckoutDiagnosticsViewModelV1;
  const stageResult = buildCheckoutFunnelLeakMapV1(readyInput({ diagnostics: tampered }));
  assert.equal(stageResult.state, "WITHHELD");
  assert.equal(stageResult.reasonCode, "STAGE_EVIDENCE_INCOMPLETE");

  const rangeTampered = {
    ...diagnostics,
    priorRange: { startDate: "2026-08-24", endDate: "2026-08-30" },
  } satisfies CheckoutDiagnosticsViewModelV1;
  const rangeResult = buildCheckoutFunnelLeakMapV1(readyInput({ diagnostics: rangeTampered }));
  assert.equal(rangeResult.state, "WITHHELD");
  assert.equal(rangeResult.reasonCode, "RANGE_MISMATCH");
});

test("result is immutable and keeps stage provenance attached to each ranked transition", () => {
  const refs = evidenceRefs();
  const result = buildCheckoutFunnelLeakMapV1(readyInput({ evidenceRefsByStage: refs }));

  assert.equal(result.state, "READY");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.entries), true);
  assert.equal(Object.isFrozen(result.entries[0]), true);
  assert.ok(result.entries[0].evidenceRefs.length >= 2);
  assert.ok(result.evidenceRefs.length >= CHECKOUT_STAGE_ORDER.length);
});
