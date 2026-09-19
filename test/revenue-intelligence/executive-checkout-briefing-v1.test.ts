import assert from "node:assert/strict";
import test from "node:test";

import { buildCheckoutDiagnosticsViewModelV1, CHECKOUT_STAGE_ORDER } from "../../src/lib/checkout-diagnostics/view-model-v1";
import { buildRevenueExecutiveBriefingV1 } from "../../src/lib/revenue-intelligence/executive-checkout-briefing-v1";

function stages(values: number[]) {
  return Object.fromEntries(CHECKOUT_STAGE_ORDER.map((key, index) => [key, values[index]]));
}

function readyModel() {
  return buildCheckoutDiagnosticsViewModelV1({
    instrumentation: "ACTIVE",
    range: {
      current: { startDate: "2026-09-08", endDate: "2026-09-14" },
      prior: { startDate: "2026-09-01", endDate: "2026-09-07" },
    },
    current: { stages: stages([100, 90, 80, 76, 70, 65, 60, 55, 50, 45, 42, 40]) },
    prior: { stages: stages([100, 92, 85, 80, 75, 70, 65, 60, 56, 52, 48, 45]) },
    errors: { validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 0 },
    shippingLatency: { sampleSize: 20, waitsAtLeastFourSeconds: 2, medianMs: 900, p95Ms: 2200 },
    segments: [{ device: "mobile", source: "paid-social", checkoutLoaded: 60, purchases: 20 }],
    sourceTruth: { META: "COMPLETE", GA4: "COMPLETE", FUNNELKIT: "COMPLETE", WOO: "COMPLETE" },
    freshness: { asOf: "2026-09-15T08:00:00.000Z", completeThrough: "2026-09-14" },
  });
}

test("blocks executive diagnosis when any canonical source is not complete", () => {
  const model = readyModel();
  model.sourceTruth.META = "PARTIAL";
  model.decisionGrade = false;
  model.state = "PARTIAL";

  const briefing = buildRevenueExecutiveBriefingV1(model);

  assert.equal(briefing.state, "BLOCKED");
  assert.equal(briefing.decisionGrade, false);
  assert.equal(briefing.observedFriction, null);
  assert.match(briefing.evidenceNotes.join(" "), /META evidence is partial/i);
  assert.equal(briefing.measuredOutcomeStatus, "NOT_ESTABLISHED");
  assert.equal(briefing.externalMutationAllowed, false);
});

test("surfaces bounded observed friction only from decision-grade evidence", () => {
  const model = buildCheckoutDiagnosticsViewModelV1({
    instrumentation: "ACTIVE",
    range: {
      current: { startDate: "2026-09-08", endDate: "2026-09-14" },
      prior: { startDate: "2026-09-01", endDate: "2026-09-07" },
    },
    current: { stages: stages([100, 90, 80, 76, 70, 65, 60, 55, 50, 45, 42, 40]) },
    prior: { stages: stages([100, 92, 85, 80, 75, 70, 65, 60, 56, 52, 48, 45]) },
    errors: { validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 2 },
    shippingLatency: { sampleSize: 20, waitsAtLeastFourSeconds: 8, medianMs: 1800, p95Ms: 5200 },
    segments: [{ device: "mobile", source: "paid-social", checkoutLoaded: 60, purchases: 20 }],
    sourceTruth: { META: "COMPLETE", GA4: "COMPLETE", FUNNELKIT: "COMPLETE", WOO: "COMPLETE" },
    freshness: { asOf: "2026-09-15T08:00:00.000Z", completeThrough: "2026-09-14" },
  });

  const briefing = buildRevenueExecutiveBriefingV1(model);

  assert.equal(briefing.state, "INVESTIGATE");
  assert.equal(briefing.decisionGrade, true);
  assert.match(briefing.observedFriction ?? "", /shipping-method latency/i);
  assert.equal(briefing.recommendation?.kind, "FRICTION_INVESTIGATION");
  assert.match(briefing.attributionBoundary, /does not establish channel attribution, causality/i);
  assert.equal(briefing.measuredOutcomeStatus, "NOT_ESTABLISHED");
  assert.equal(briefing.requiresApproval, true);
  assert.equal(briefing.externalMutationAllowed, false);
});

test("does not manufacture an action when complete evidence stays below material thresholds", () => {
  const briefing = buildRevenueExecutiveBriefingV1(readyModel());

  assert.equal(briefing.state, "MONITOR");
  assert.equal(briefing.decisionGrade, true);
  assert.equal(briefing.observedFriction, null);
  assert.equal(briefing.recommendation, null);
  assert.equal(briefing.measuredOutcomeStatus, "NOT_ESTABLISHED");
});
