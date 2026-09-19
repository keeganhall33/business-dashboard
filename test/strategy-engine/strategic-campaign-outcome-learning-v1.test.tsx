import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewStrategicCampaignOutcomeLearningV1,
  type CampaignOutcomeMeasurementPlanV1,
  type CampaignOutcomeObservationV1,
  type StrategicCampaignOutcomeLearningInputV1
} from "@/lib/strategy-engine/strategic-campaign-outcome-learning-v1";
import type { StrategicCampaignSteeringResultV1 } from "@/lib/strategy-engine/strategic-campaign-steering-v1";

const REVIEWED_AT = "2026-09-19T10:00:00.000Z";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STEERING_EVIDENCE = "evidence:campaign-checkpoint";

function steering(
  overrides: Partial<StrategicCampaignSteeringResultV1> = {}
): StrategicCampaignSteeringResultV1 {
  return {
    contractVersion: "StrategicCampaignSteeringV1",
    campaignId: "campaign:growth",
    objective: "Test one bounded growth campaign",
    state: "ACTIVE",
    asOf: "2026-09-18T12:00:00.000Z",
    status: "READY",
    action: "REVIEW_EXPERIMENT",
    reasonCodes: ["EXPERIMENT_REVIEW_REQUIRED"],
    evidenceRefs: [STEERING_EVIDENCE],
    causality: "NOT_ESTABLISHED",
    confidence: null,
    monetaryValue: null,
    outcome: null,
    authority: {
      reviewPreparation: true,
      campaignMutation: false,
      budgetMutation: false,
      allocationMutation: false,
      experimentMutation: false,
      persistence: false,
      providerWrite: false,
      externalExecution: false,
      approvalBypass: false
    },
    ...overrides
  };
}

function plan(
  overrides: Partial<CampaignOutcomeMeasurementPlanV1> = {}
): CampaignOutcomeMeasurementPlanV1 {
  return {
    planId: "plan:qualified-demand",
    campaignId: "campaign:growth",
    metricRef: "metric:qualified-demand",
    unit: "qualified-signals",
    evaluationWindow: {
      startAt: "2026-09-10T00:00:00.000Z",
      endAt: "2026-09-18T00:00:00.000Z"
    },
    evidenceState: "KNOWN",
    evidenceRefs: ["evidence:measurement-plan"],
    ...overrides
  };
}

function observation(
  overrides: Partial<CampaignOutcomeObservationV1> = {}
): CampaignOutcomeObservationV1 {
  return {
    observationId: "observation:qualified-demand:1",
    campaignId: "campaign:growth",
    planId: "plan:qualified-demand",
    metricRef: "metric:qualified-demand",
    unit: "qualified-signals",
    evaluationWindow: {
      startAt: "2026-09-10T00:00:00.000Z",
      endAt: "2026-09-18T00:00:00.000Z"
    },
    observedAt: "2026-09-18T12:30:00.000Z",
    evidenceState: "KNOWN",
    assessment: "NEGATIVE",
    attributionClass: "CORRELATIONAL",
    evidenceRefs: ["evidence:observed-outcome"],
    steeringEvidenceRefs: [STEERING_EVIDENCE],
    attributionEvidenceRefs: ["evidence:attribution-limit"],
    confounderEvidenceRefs: ["evidence:known-confounder"],
    ...overrides
  };
}

function input(
  overrides: Partial<StrategicCampaignOutcomeLearningInputV1> = {}
): StrategicCampaignOutcomeLearningInputV1 {
  return {
    steering: steering(),
    measurementPlan: plan(),
    observation: observation(),
    reviewedAt: REVIEWED_AT,
    maximumObservationAgeMs: MAX_AGE_MS,
    ...overrides
  };
}

test("prepares negative campaign outcome for internal reassessment without mutation authority", () => {
  const result = reviewStrategicCampaignOutcomeLearningV1(input());

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.assessment, "NEGATIVE");
  assert.equal(result.attributionClass, "CORRELATIONAL");
  assert.equal(result.causalInterpretation, "NOT_INFERRED");
  assert.equal(
    result.nextInternalStep,
    "REVIEW_CAMPAIGN_ASSUMPTIONS_AND_ALLOCATION_WITHOUT_MUTATION"
  );
  assert.equal(result.authority.learningReviewPreparation, true);
  assert.equal(result.authority.campaignMutationAuthorized, false);
  assert.equal(result.authority.allocationMutationAuthorized, false);
  assert.equal(result.authority.budgetMutationAuthorized, false);
  assert.equal(result.authority.externalExecutionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.outcomeValue, null);
  assert.ok(result.reasonCodes.includes("NEGATIVE_OUTCOME_REVIEW"));
});

test("positive observed assessment remains review-only and never becomes automatic scaling", () => {
  const result = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ assessment: "POSITIVE" })
  }));

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.nextInternalStep, "REVIEW_CONTINUATION_WITHOUT_AUTOMATIC_SCALING");
  assert.equal(result.authority.allocationMutationAuthorized, false);
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.externalExecutionAuthorized, false);
});

test("partial outcome evidence waits instead of manufacturing an assessment", () => {
  const result = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ evidenceState: "PARTIAL", assessment: null })
  }));

  assert.equal(result.status, "WAIT_FOR_EVIDENCE");
  assert.equal(result.assessment, null);
  assert.equal(result.nextInternalStep, "COLLECT_MORE_OUTCOME_EVIDENCE");
  assert.equal(result.authority.learningReviewPreparation, false);
  assert.ok(result.reasonCodes.includes("OBSERVATION_NOT_KNOWN"));
});

test("exact metric, unit, plan and evaluation-window identity are required", () => {
  const mismatches: CampaignOutcomeObservationV1[] = [
    observation({ planId: "plan:other" }),
    observation({ metricRef: "metric:other" }),
    observation({ unit: "orders" }),
    observation({
      evaluationWindow: {
        startAt: "2026-09-11T00:00:00.000Z",
        endAt: "2026-09-18T00:00:00.000Z"
      }
    })
  ];

  for (const candidate of mismatches) {
    const result = reviewStrategicCampaignOutcomeLearningV1(input({ observation: candidate }));
    assert.equal(result.status, "VERIFY");
    assert.ok(result.reasonCodes.includes("MEASUREMENT_IDENTITY_MISMATCH"));
  }
});

test("evaluation window must be mature before outcome learning can advance", () => {
  const futurePlan = plan({
    evaluationWindow: {
      startAt: "2026-09-18T00:00:00.000Z",
      endAt: "2026-09-20T00:00:00.000Z"
    }
  });
  const result = reviewStrategicCampaignOutcomeLearningV1(input({
    measurementPlan: futurePlan,
    observation: observation({
      evaluationWindow: futurePlan.evaluationWindow,
      observedAt: "2026-09-19T09:00:00.000Z"
    })
  }));

  assert.equal(result.status, "WAIT_FOR_EVIDENCE");
  assert.ok(result.reasonCodes.includes("EVALUATION_WINDOW_NOT_MATURE"));
});

test("stale or future observations fail closed", () => {
  const stale = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ observedAt: "2026-09-18T00:01:00.000Z" }),
    maximumObservationAgeMs: 60 * 60 * 1000
  }));
  assert.equal(stale.status, "VERIFY");
  assert.ok(stale.reasonCodes.includes("STALE_EVIDENCE"));

  const future = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ observedAt: "2026-09-19T11:00:00.000Z" })
  }));
  assert.equal(future.status, "VERIFY");
  assert.ok(future.reasonCodes.includes("FUTURE_EVIDENCE"));
});

test("blocked or waiting upstream steering cannot become ready campaign learning", () => {
  const blocked = reviewStrategicCampaignOutcomeLearningV1(input({
    steering: steering({ status: "BLOCKED", action: "WAIT_FOR_EVIDENCE" })
  }));
  assert.equal(blocked.status, "VERIFY");
  assert.ok(blocked.reasonCodes.includes("SOURCE_STEERING_BLOCKED"));

  const waiting = reviewStrategicCampaignOutcomeLearningV1(input({
    steering: steering({ status: "WAITING", action: "WAIT_FOR_EVIDENCE" })
  }));
  assert.equal(waiting.status, "WAIT_FOR_EVIDENCE");
  assert.ok(waiting.reasonCodes.includes("SOURCE_STEERING_WAITING"));
});

test("outcome observation must share explicit steering evidence", () => {
  const result = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ steeringEvidenceRefs: ["evidence:unrelated"] })
  }));

  assert.equal(result.status, "VERIFY");
  assert.ok(result.reasonCodes.includes("STEERING_EVIDENCE_NOT_SHARED"));
});

test("non-unknown attribution requires evidence and causal support requires explicit design evidence", () => {
  const missingAttribution = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ attributionEvidenceRefs: [] })
  }));
  assert.equal(missingAttribution.status, "VERIFY");
  assert.ok(missingAttribution.reasonCodes.includes("ATTRIBUTION_EVIDENCE_MISSING"));

  const missingDesign = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({
      attributionClass: "CAUSAL_SUPPORTED",
      attributionEvidenceRefs: ["evidence:causal-analysis"],
      causalDesignRef: null
    })
  }));
  assert.equal(missingDesign.status, "VERIFY");
  assert.ok(missingDesign.reasonCodes.includes("CAUSAL_DESIGN_EVIDENCE_MISSING"));
});

test("explicit upstream causal-support classification is preserved but not re-inferred", () => {
  const causalDesignRef = "evidence:randomized-design";
  const result = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({
      attributionClass: "CAUSAL_SUPPORTED",
      attributionEvidenceRefs: [causalDesignRef],
      causalDesignRef
    })
  }));

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.attributionClass, "CAUSAL_SUPPORTED");
  assert.equal(result.causalInterpretation, "NOT_INFERRED");
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryValue, null);
});

test("unsafe provenance is excluded and blocks review", () => {
  const result = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ evidenceRefs: ["token=do-not-store"] })
  }));

  assert.equal(result.status, "VERIFY");
  assert.ok(result.reasonCodes.includes("UNSAFE_PROVENANCE"));
  assert.equal(result.evidenceRefs.includes("token=do-not-store"), false);
});

test("neutral assessment creates no reallocation signal", () => {
  const result = reviewStrategicCampaignOutcomeLearningV1(input({
    observation: observation({ assessment: "NEUTRAL" })
  }));

  assert.equal(result.status, "NO_ACTION");
  assert.equal(result.nextInternalStep, null);
  assert.equal(result.authority.learningReviewPreparation, false);
  assert.ok(result.reasonCodes.includes("NEUTRAL_OUTCOME_NO_REALLOCATION_SIGNAL"));
});

test("review does not mutate caller input and freezes its output", () => {
  const candidate = input();
  const before = JSON.parse(JSON.stringify(candidate));
  const result = reviewStrategicCampaignOutcomeLearningV1(candidate);

  assert.deepEqual(candidate, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.authority), true);
  assert.equal(Object.isFrozen(result.evidenceRefs), true);
});
