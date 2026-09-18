import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutDiagnosticsPanelV1 } from "../../../src/components/intelligence-ux/checkout-diagnostics/CheckoutDiagnosticsPanelV1";
import {
  buildCheckoutDiagnosticsViewModelV1,
  CHECKOUT_STAGE_ORDER,
  type CheckoutDiagnosticsInputV1,
  type CheckoutStageKey,
} from "../../../src/lib/checkout-diagnostics/view-model-v1";

const currentCounts: Record<CheckoutStageKey, number> = {
  CHECKOUT_LOADED: 100,
  CUSTOMER_INFO_STARTED: 90,
  CUSTOMER_INFO_COMPLETED: 80,
  SHIPPING_METHODS_LOADED: 70,
  SHIPPING_METHOD_SELECTED: 65,
  SHIPPING_TOTAL_SHOWN: 60,
  PAYMENT_SECTION_VISIBLE: 58,
  PAYMENT_METHODS_LOADED: 55,
  PAYMENT_METHOD_SELECTED: 50,
  PLACE_ORDER_CLICKED: 45,
  ORDER_CREATED: 42,
  PURCHASE: 40,
};

const priorCounts: Record<CheckoutStageKey, number> = {
  CHECKOUT_LOADED: 80,
  CUSTOMER_INFO_STARTED: 72,
  CUSTOMER_INFO_COMPLETED: 68,
  SHIPPING_METHODS_LOADED: 64,
  SHIPPING_METHOD_SELECTED: 60,
  SHIPPING_TOTAL_SHOWN: 58,
  PAYMENT_SECTION_VISIBLE: 56,
  PAYMENT_METHODS_LOADED: 54,
  PAYMENT_METHOD_SELECTED: 50,
  PLACE_ORDER_CLICKED: 48,
  ORDER_CREATED: 46,
  PURCHASE: 44,
};

function readyInput(overrides: Partial<CheckoutDiagnosticsInputV1> = {}): CheckoutDiagnosticsInputV1 {
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
      p95Ms: 3300,
      mobileChromeSampleSize: 10,
      mobileChromeMedianMs: 1500,
      mobileChromeP95Ms: 3600,
      buckets: [
        { label: "<2s", count: 14 },
        { label: "2-4s", count: 4 },
        { label: "4s+", count: 2 },
      ],
    },
    segments: [
      { device: "Mobile", source: "Paid social", checkoutLoaded: 60, purchases: 20 },
      { device: "Desktop", source: "Direct", checkoutLoaded: 40, purchases: 20 },
    ],
    sourceTruth: { META: "COMPLETE", GA4: "COMPLETE", FUNNELKIT: "COMPLETE", WOO: "COMPLETE" },
    freshness: { asOf: "2026-09-08T08:00:00Z", completeThrough: "2026-09-07" },
    ...overrides,
  };
}

test("inactive instrumentation renders the explicit waiting state instead of fake zero conversion", () => {
  const model = buildCheckoutDiagnosticsViewModelV1({
    instrumentation: "INACTIVE",
    range: readyInput().range,
  });
  const html = renderToStaticMarkup(<CheckoutDiagnosticsPanelV1 model={model} />);

  assert.equal(model.state, "WAITING_FOR_INSTRUMENTATION");
  assert.equal(model.decisionGrade, false);
  assert.match(html, /Waiting for checkout instrumentation/);
  assert.doesNotMatch(html, />0\.0%/);
});

test("missing stage evidence stays partial and does not become zero", () => {
  const partialCurrent = { ...currentCounts } as Partial<Record<CheckoutStageKey, number>>;
  delete partialCurrent.SHIPPING_METHODS_LOADED;
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({ current: { stages: partialCurrent } }));
  const shippingRow = model.stageRows.find((row) => row.key === "SHIPPING_METHODS_LOADED");

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.equal(shippingRow?.currentCount, null);
  assert.equal(shippingRow?.currentStepConversion, null);
  assert.equal(model.recommendation?.kind, "DATA_QUALITY");
});

test("active complete instrumentation calculates adjacent conversion and matched-period change", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput());
  const started = model.stageRows.find((row) => row.key === "CUSTOMER_INFO_STARTED");

  assert.equal(model.state, "READY");
  assert.equal(model.decisionGrade, true);
  assert.deepEqual(model.integrityIssues, []);
  assert.equal(started?.currentStepConversion, 0.9);
  assert.equal(started?.priorStepConversion, 0.9);
  assert.ok(Math.abs((started?.conversionDeltaPoints ?? 999)) < 0.000001);
  assert.equal(model.segments[0].device, "Mobile");
});

test("current funnel stage inversion fails closed instead of creating decision-grade conversion evidence", () => {
  const inconsistentCurrent = {
    ...currentCounts,
    SHIPPING_METHOD_SELECTED: currentCounts.SHIPPING_METHODS_LOADED + 5,
  };
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    current: { stages: inconsistentCurrent },
  }));

  assert.equal(model.state, "CONFLICTED");
  assert.equal(model.decisionGrade, false);
  assert.equal(model.recommendation, null);
  assert.ok(model.integrityIssues.some((issue) => issue.code === "CURRENT_STAGE_INVERSION"));
});

test("prior funnel stage inversion fails closed before matched-period comparison", () => {
  const inconsistentPrior = {
    ...priorCounts,
    PURCHASE: priorCounts.ORDER_CREATED + 3,
  };
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    prior: { stages: inconsistentPrior },
  }));

  assert.equal(model.state, "CONFLICTED");
  assert.equal(model.decisionGrade, false);
  assert.equal(model.recommendation, null);
  assert.ok(model.integrityIssues.some((issue) => issue.code === "PRIOR_STAGE_INVERSION"));
});

test("segment purchases cannot exceed segment checkout loads", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    segments: [
      { device: "Mobile", source: "Paid social", checkoutLoaded: 20, purchases: 21 },
    ],
  }));

  assert.equal(model.state, "CONFLICTED");
  assert.equal(model.decisionGrade, false);
  assert.equal(model.recommendation, null);
  assert.ok(model.integrityIssues.some((issue) => issue.code === "SEGMENT_PURCHASE_EXCEEDS_CHECKOUT"));
});

test("mismatched comparison-window lengths fail closed", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    range: {
      current: { startDate: "2026-09-01", endDate: "2026-09-07" },
      prior: { startDate: "2026-08-24", endDate: "2026-08-31" },
    },
  }));

  assert.equal(model.state, "CONFLICTED");
  assert.equal(model.decisionGrade, false);
  assert.ok(model.integrityIssues.some((issue) => issue.code === "RANGE_LENGTH_MISMATCH"));
});

test("gapped comparison windows fail closed even when durations match", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    range: {
      current: { startDate: "2026-09-01", endDate: "2026-09-07" },
      prior: { startDate: "2026-08-24", endDate: "2026-08-30" },
    },
  }));

  assert.equal(model.state, "CONFLICTED");
  assert.equal(model.decisionGrade, false);
  assert.ok(model.integrityIssues.some((issue) => issue.code === "RANGE_NOT_ADJACENT"));
});

test("coverage incomplete through the selected current range stays partial", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    freshness: { asOf: "2026-09-08T08:00:00Z", completeThrough: "2026-09-06" },
  }));

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.equal(model.recommendation?.kind, "DATA_QUALITY");
  assert.ok(model.integrityIssues.some((issue) => issue.code === "COVERAGE_INCOMPLETE"));
});

test("invalid freshness metadata stays partial rather than silently current", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    freshness: { asOf: "not-an-instant", completeThrough: "2026-09-07" },
  }));

  assert.equal(model.state, "PARTIAL");
  assert.equal(model.decisionGrade, false);
  assert.ok(model.integrityIssues.some((issue) => issue.code === "INVALID_FRESHNESS"));
});

test("latency alert remains suppressed below the minimum sample threshold", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    shippingLatency: {
      sampleSize: 9,
      waitsAtLeastFourSeconds: 9,
      medianMs: 5000,
      p95Ms: 7000,
      mobileChromeSampleSize: 9,
      mobileChromeMedianMs: 5000,
      mobileChromeP95Ms: 7000,
    },
  }));

  assert.equal(model.shippingLatency?.materialAlert, false);
  assert.notEqual(model.recommendation?.summary, "Investigate shipping-method loading latency before changing checkout behavior.");
});

test("latency alert activates at sample >=10 when 4+ second waits reach 30 percent", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    shippingLatency: {
      sampleSize: 10,
      waitsAtLeastFourSeconds: 3,
      medianMs: 3100,
      p95Ms: 6100,
      mobileChromeSampleSize: 10,
      mobileChromeMedianMs: 3400,
      mobileChromeP95Ms: 6300,
    },
  }));

  assert.equal(model.shippingLatency?.materialAlert, true);
  assert.equal(model.recommendation?.kind, "FRICTION_INVESTIGATION");
  assert.match(model.recommendation?.rationale ?? "", /not proof of causality/i);
});

test("checkout AJAX errors meet the material alert only with the required sample floor", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    errors: { validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 2 },
    shippingLatency: {
      sampleSize: 10,
      waitsAtLeastFourSeconds: 0,
      medianMs: 900,
      p95Ms: 1700,
      mobileChromeSampleSize: 6,
      mobileChromeMedianMs: 1000,
      mobileChromeP95Ms: 1800,
    },
  }));

  assert.equal(model.shippingLatency?.materialAlert, true);
  assert.equal(model.recommendation?.kind, "FRICTION_INVESTIGATION");
});

test("conflicted evidence fails closed and suppresses action recommendations", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput({
    sourceTruth: { META: "COMPLETE", GA4: "CONFLICTED", FUNNELKIT: "COMPLETE", WOO: "COMPLETE" },
  }));

  assert.equal(model.state, "CONFLICTED");
  assert.equal(model.decisionGrade, false);
  assert.equal(model.recommendation, null);
});

test("panel exposes attribution and approval boundaries without PII fields", () => {
  const model = buildCheckoutDiagnosticsViewModelV1(readyInput());
  const html = renderToStaticMarkup(<CheckoutDiagnosticsPanelV1 model={model} />);

  assert.match(html, /not causal attribution/i);
  assert.match(html, /approval required for consequential changes/i);
  assert.match(html, /no external mutation authorized/i);
  assert.doesNotMatch(html, /email|phone|address|message id/i);
  assert.deepEqual(CHECKOUT_STAGE_ORDER, [
    "CHECKOUT_LOADED",
    "CUSTOMER_INFO_STARTED",
    "CUSTOMER_INFO_COMPLETED",
    "SHIPPING_METHODS_LOADED",
    "SHIPPING_METHOD_SELECTED",
    "SHIPPING_TOTAL_SHOWN",
    "PAYMENT_SECTION_VISIBLE",
    "PAYMENT_METHODS_LOADED",
    "PAYMENT_METHOD_SELECTED",
    "PLACE_ORDER_CLICKED",
    "ORDER_CREATED",
    "PURCHASE",
  ]);
});
