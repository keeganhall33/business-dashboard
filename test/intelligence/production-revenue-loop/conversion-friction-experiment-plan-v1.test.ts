import assert from "node:assert/strict";
import test from "node:test";

import {
  CONVERSION_FRICTION_READINESS_VERSION,
  type ConversionFrictionReadinessV1,
} from "../../../src/lib/intelligence/production-revenue-loop/conversion-friction-readiness-v1";
import {
  bindConversionFrictionOutcomeInputV1,
  prepareConversionFrictionExperimentPlanV1,
  type ConversionFrictionExperimentPlanInputV1,
} from "../../../src/lib/intelligence/production-revenue-loop/conversion-friction-experiment-plan-v1";
import type {
  RevenueOutcomeObservationV1,
  RevenueOutcomeSourceV1,
} from "../../../src/lib/intelligence/production-revenue-loop/revenue-outcome-evaluation-v1";

function readiness(
  overrides: Partial<ConversionFrictionReadinessV1> = {},
): ConversionFrictionReadinessV1 {
  return {
    version: CONVERSION_FRICTION_READINESS_VERSION,
    status: "READY_TO_PREPARE_TEST",
    reasonCode: "BEHAVIORAL_SUPPORT_AND_MEASUREMENT_AGREE",
    recommendationId: "revenue-action:conversion-1234",
    revenueDriver: "CONVERSION",
    evidenceBasis: {
      clarityUsed: true,
      checkoutUsed: true,
      supportingFacts: [
        "Clarity: dead-click rate crossed the observed threshold.",
        "Checkout: 35.0% adjacent-stage drop-off from checkout to purchase.",
      ],
    },
    checkoutMeasurement: {
      required: true,
      status: "READY",
      reasonCode: "COUNTS_WITHIN_CALLER_SUPPLIED_TOLERANCE",
      evidenceRefs: ["funnelkit:checkout:window", "woo:checkout:window"],
      comparisonCount: 3,
    },
    limitations: [],
    nextStep: {
      kind: "PREPARE_BOUNDED_CONVERSION_TEST",
      approvalClass: "KEEGAN_APPROVAL_REQUIRED",
      description: "Prepare only; do not execute without approval.",
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

function planInput(
  overrides: Partial<ConversionFrictionExperimentPlanInputV1> = {},
): ConversionFrictionExperimentPlanInputV1 {
  return {
    readiness: readiness(),
    declaredAt: "2026-09-18T15:00:00.000Z",
    successRule: {
      source: "WOO",
      metric: "orders",
      unit: "COUNT",
      comparator: "AT_LEAST_RELATIVE_CHANGE",
      threshold: 0.05,
      evidenceRef: "decision:conversion-rule:orders-5pct",
    },
    planEvidenceRefs: [
      "decision:conversion-rule:orders-5pct",
      "decision:friction-hypothesis:checkout-clarity",
    ],
    ...overrides,
  };
}

function observation(
  source: RevenueOutcomeSourceV1,
  side: "baseline" | "outcome",
): RevenueOutcomeObservationV1 {
  const range = side === "baseline"
    ? { startDate: "2026-09-01", endDate: "2026-09-14" }
    : { startDate: "2026-09-16", endDate: "2026-09-29" };
  return {
    source,
    metric: source === "META" ? "spend" : source === "GA4" ? "sessions" : source === "CLARITY" ? "dead_click_rate" : source === "FUNNELKIT" ? "checkout_completion" : "orders",
    unit: source === "META" ? "CENTS" : source === "CLARITY" ? "RATIO" : "COUNT",
    value: side === "baseline" ? 100 : 105,
    truthState: "CURRENT",
    range,
    completeThrough: range.endDate,
    observedAt: side === "baseline" ? "2026-09-15T12:00:00.000Z" : "2026-09-30T12:00:00.000Z",
    evidenceRefs: [`${source.toLowerCase()}:${side}:evidence`],
  };
}

const requiredSources: RevenueOutcomeSourceV1[] = [
  "WOO",
  "GA4",
  "META",
  "CLARITY",
  "FUNNELKIT",
];

test("preregisters a bounded conversion plan without inventing lift, value, causality, or execution authority", () => {
  const result = prepareConversionFrictionExperimentPlanV1(planInput());

  assert.equal(result.status, "READY_FOR_APPROVAL");
  assert.equal(result.reasonCode, "PREDECLARED_PLAN_READY_FOR_APPROVAL");
  assert.match(result.planId ?? "", /^conversion-plan:[0-9a-f]{8}$/);
  assert.deepEqual(result.requiredOutcomeSources, requiredSources);
  assert.equal(result.approval.required, true);
  assert.equal(result.approval.grantedByThisPlan, false);
  assert.deepEqual(result.metaPolicy, {
    role: "CONTEXT_GUARDRAIL_ONLY",
    outcomeObservationRequired: true,
    spendChangeAllowedByThisPlan: false,
    writeAllowed: false,
    attributionAllowed: false,
  });
  assert.equal(result.expectedLift, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.causalClaim, false);
});

test("fails closed when canonical pretest readiness is not established", () => {
  const blockedReadiness = readiness({
    status: "INSUFFICIENT_EVIDENCE",
    reasonCode: "BEHAVIORAL_EVIDENCE_INSUFFICIENT",
    nextStep: {
      kind: "RECONCILE_EVIDENCE",
      approvalClass: "AUTO_CONTINUE",
      description: "Reconcile evidence.",
      externalMutationAllowed: false,
      metaWriteAllowed: false,
    },
  });
  const result = prepareConversionFrictionExperimentPlanV1(planInput({
    readiness: blockedReadiness,
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "PRETEST_READINESS_NOT_ESTABLISHED");
  assert.equal(result.planId, null);
  assert.equal(result.successRule, null);
});

test("does not let Meta-attributed performance define conversion-test success", () => {
  const result = prepareConversionFrictionExperimentPlanV1(planInput({
    successRule: {
      source: "META",
      metric: "purchase_value",
      unit: "CENTS",
      comparator: "AT_LEAST_RELATIVE_CHANGE",
      threshold: 0.05,
      evidenceRef: "decision:conversion-rule:meta-roas",
    },
    planEvidenceRefs: ["decision:conversion-rule:meta-roas"],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "META_SUCCESS_RULE_FORBIDDEN");
  assert.equal(result.metaPolicy.writeAllowed, false);
  assert.equal(result.metaPolicy.attributionAllowed, false);
});

test("requires the success-rule evidence reference to be locked into preregistration", () => {
  const result = prepareConversionFrictionExperimentPlanV1(planInput({
    planEvidenceRefs: ["decision:friction-hypothesis:checkout-clarity"],
  }));

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "SUCCESS_RULE_EVIDENCE_NOT_PREDECLARED");
});

test("binds only an evidenced approval and copies the exact preregistered rule into canonical outcome evaluation", () => {
  const plan = prepareConversionFrictionExperimentPlanV1(planInput());
  const baseline = requiredSources.map((source) => observation(source, "baseline"));
  const outcome = requiredSources.map((source) => observation(source, "outcome"));

  const binding = bindConversionFrictionOutcomeInputV1({
    plan,
    approval: {
      state: "KEEGAN_APPROVED",
      approvedAt: "2026-09-18T16:00:00.000Z",
      evidenceRef: "approval:keegan:conversion-plan",
    },
    implementationRef: "implementation:checkout-test:1",
    implementedAt: "2026-09-18T17:00:00.000Z",
    evaluatedAt: "2026-09-30T18:00:00.000Z",
    implementationEvidenceRefs: ["implementation:audit:checkout-test:1"],
    baseline,
    outcome,
  });

  assert.equal(binding.status, "READY_FOR_CANONICAL_EVALUATION");
  assert.equal(binding.reasonCode, "PREDECLARED_PLAN_BOUND_TO_OUTCOME");
  assert.ok(binding.input);
  assert.equal(binding.input.decisionRef, plan.recommendationId);
  assert.deepEqual(binding.input.successRule, plan.successRule);
  assert.ok(binding.input.implementationEvidenceRefs.includes("approval:keegan:conversion-plan"));
  assert.deepEqual(binding.missingSources, []);
  assert.equal(binding.authority.metaWriteAllowed, false);
  assert.equal(binding.authority.approvalBypassAllowed, false);
});

test("blocks post-hoc criteria and missing approval evidence", () => {
  const plan = prepareConversionFrictionExperimentPlanV1(planInput());
  const baseline = requiredSources.map((source) => observation(source, "baseline"));
  const outcome = requiredSources.map((source) => observation(source, "outcome"));

  const noApproval = bindConversionFrictionOutcomeInputV1({
    plan,
    approval: { state: "NOT_APPROVED", approvedAt: null, evidenceRef: null },
    implementationRef: "implementation:checkout-test:1",
    implementedAt: "2026-09-18T17:00:00.000Z",
    evaluatedAt: "2026-09-30T18:00:00.000Z",
    implementationEvidenceRefs: ["implementation:audit:checkout-test:1"],
    baseline,
    outcome,
  });
  assert.equal(noApproval.status, "BLOCKED");
  assert.equal(noApproval.reasonCode, "APPROVAL_NOT_EVIDENCED");

  const postHoc = bindConversionFrictionOutcomeInputV1({
    plan,
    approval: {
      state: "KEEGAN_APPROVED",
      approvedAt: "2026-09-18T14:00:00.000Z",
      evidenceRef: "approval:keegan:conversion-plan",
    },
    implementationRef: "implementation:checkout-test:1",
    implementedAt: "2026-09-18T14:30:00.000Z",
    evaluatedAt: "2026-09-30T18:00:00.000Z",
    implementationEvidenceRefs: ["implementation:audit:checkout-test:1"],
    baseline,
    outcome,
  });
  assert.equal(postHoc.status, "BLOCKED");
  assert.equal(postHoc.reasonCode, "POST_HOC_CRITERION_BLOCKED");
});

test("requires Woo, GA4, Meta, and every hypothesis mechanism in both baseline and outcome evidence", () => {
  const plan = prepareConversionFrictionExperimentPlanV1(planInput());
  const baseline = requiredSources.map((source) => observation(source, "baseline"));
  const outcome = requiredSources
    .filter((source) => source !== "META" && source !== "FUNNELKIT")
    .map((source) => observation(source, "outcome"));

  const binding = bindConversionFrictionOutcomeInputV1({
    plan,
    approval: {
      state: "KEEGAN_APPROVED",
      approvedAt: "2026-09-18T16:00:00.000Z",
      evidenceRef: "approval:keegan:conversion-plan",
    },
    implementationRef: "implementation:checkout-test:1",
    implementedAt: "2026-09-18T17:00:00.000Z",
    evaluatedAt: "2026-09-30T18:00:00.000Z",
    implementationEvidenceRefs: ["implementation:audit:checkout-test:1"],
    baseline,
    outcome,
  });

  assert.equal(binding.status, "BLOCKED");
  assert.equal(binding.reasonCode, "REQUIRED_OUTCOME_SOURCE_MISSING");
  assert.deepEqual(binding.missingSources, ["FUNNELKIT", "META"]);
});

test("is deterministic, immutable, and leaves caller input untouched", () => {
  const value = planInput();
  const before = structuredClone(value);
  const first = prepareConversionFrictionExperimentPlanV1(value);
  const second = prepareConversionFrictionExperimentPlanV1(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.successRule), true);
  assert.equal(Object.isFrozen(first.requiredOutcomeSources), true);
  assert.equal(Object.isFrozen(first.metaPolicy), true);
});
