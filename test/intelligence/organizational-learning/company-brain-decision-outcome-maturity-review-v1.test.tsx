import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryRecordV1,
  type DecisionMemoryTruthStateV1
} from "@/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  reviewCompanyBrainDecisionOutcomeMaturityV1,
  type CompanyBrainDecisionOutcomeMaturityReviewInputV1
} from "@/lib/intelligence/organizational-learning/company-brain-decision-outcome-maturity-review-v1";

const decidedAt = "2026-09-01T12:00:00.000Z";
const evaluationWindowEndsAt = "2026-09-30T23:59:59.000Z";
const observedAt = "2026-10-01T12:00:00.000Z";
const sourceSnapshotAt = "2026-10-01T12:05:00.000Z";
const evaluatedAt = "2026-10-01T12:10:00.000Z";
const oneHour = 60 * 60 * 1000;

function bound<T>(value: T, evidenceRef: string, state: DecisionMemoryTruthStateV1 = "KNOWN") {
  return { state, value, evidenceRefs: [evidenceRef] };
}

function decision(windowEndsAt: string | null = evaluationWindowEndsAt): DecisionMemoryRecordV1 {
  return compileDecisionMemoryV1({
    decisionId: "decision:measurement",
    decisionClass: "STRATEGY",
    decidedAt,
    actorRef: "actor:keegan",
    context: bound("A bounded strategic decision with a declared measurement plan.", "evidence:context"),
    selectedAlternativeId: "proceed",
    alternatives: [
      {
        alternativeId: "proceed",
        label: "Proceed",
        description: bound("Proceed with the bounded action.", "evidence:alternative:proceed")
      },
      {
        alternativeId: "wait",
        label: "Wait",
        description: bound("Wait for more evidence.", "evidence:alternative:wait")
      }
    ],
    rationale: bound("Use the declared measurement plan before learning from the result.", "evidence:rationale"),
    assumptions: [
      {
        assumptionId: "assumption:measurement",
        statement: bound("The declared metric remains available.", "evidence:assumption"),
        material: true,
        revisitTrigger: "Metric coverage changes."
      }
    ],
    confidence: bound("MEDIUM" as const, "evidence:confidence"),
    expectedOutcomes: [
      {
        outcomeId: "outcome:declared",
        metricRef: "metric:declared",
        description: bound("Observe the declared metric after the full window.", "evidence:expected-description"),
        expectedRange: bound({ min: 10, max: 20, unit: "units" }, "evidence:expected-range"),
        evaluationWindowEndsAt: windowEndsAt
      }
    ],
    successCriteria: [bound("Evaluate only after the full declared window.", "evidence:success")],
    failureCriteria: [bound("Do not learn from an incomplete window.", "evidence:failure")],
    revisitTriggers: ["Measurement evidence changes"],
    validUntil: null,
    approval: {
      authorityClass: "INTERNAL_REVIEW",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: "TAKEN",
    actionEvidenceRefs: ["evidence:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:decision"]
  });
}

function attachOutcome(
  record: DecisionMemoryRecordV1,
  overrides: {
    observedAt?: string;
    metricRef?: string | null;
    unit?: string;
    assessment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "INCONCLUSIVE";
    assessmentState?: DecisionMemoryTruthStateV1;
  } = {}
): DecisionMemoryRecordV1 {
  return attachDecisionOutcomeObservationV1(record, {
    observedAt: overrides.observedAt ?? observedAt,
    outcomes: [
      {
        outcomeId: "outcome:declared",
        metricRef: overrides.metricRef === undefined ? "metric:declared" : overrides.metricRef,
        description: bound("Observed the declared metric.", "evidence:observed-description"),
        observedRange: bound(
          { min: 12, max: 12, unit: overrides.unit ?? "units" },
          "evidence:observed-range"
        )
      }
    ],
    assessment: bound(
      overrides.assessment ?? "POSITIVE",
      "evidence:assessment",
      overrides.assessmentState ?? "KNOWN"
    ),
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: [],
    confounders: [],
    assumptionAssessments: [
      {
        assumptionId: "assumption:measurement",
        assessment: "SUPPORTED",
        evidenceRefs: ["evidence:assumption-outcome"]
      }
    ],
    lessonCandidate: {
      statement: "Review this observation only after the predeclared window matures.",
      evidenceRefs: ["evidence:lesson"]
    },
    sourceRefs: ["source:outcome"]
  });
}

function input(
  record: DecisionMemoryRecordV1,
  overrides: Partial<CompanyBrainDecisionOutcomeMaturityReviewInputV1> = {}
): CompanyBrainDecisionOutcomeMaturityReviewInputV1 {
  return {
    record,
    evaluatedAt,
    sourceSnapshotAt,
    maximumSourceAgeMs: oneHour,
    sourceRefs: ["snapshot:decision-memory"],
    ...overrides
  };
}

test("marks a fully matured exact-bound outcome ready for governed review without inventing causality or confidence", () => {
  const value = reviewCompanyBrainDecisionOutcomeMaturityV1(input(attachOutcome(decision())));

  assert.equal(value.state, "READY_FOR_GOVERNED_OUTCOME_REVIEW");
  assert.deepEqual(value.reasonCodes, []);
  assert.equal(value.measurementPlan.length, 1);
  assert.equal(value.measurementPlan[0]?.windowState, "MATURED");
  assert.equal(value.measurementPlan[0]?.observed, true);
  assert.equal(value.measurementPlan[0]?.observationAfterWindow, true);
  assert.equal(value.measurementPlan[0]?.unitBinding, "MATCH");
  assert.equal(value.recordedAssessment?.value, "POSITIVE");
  assert.equal(value.recordedAttributionClass, "CORRELATIONAL");
  assert.equal(value.causality, "NOT_ESTABLISHED");
  assert.equal(value.confidenceAdjustment, "NOT_AUTHORIZED");
  assert.equal(value.monetaryValue, null);
  assert.equal(value.inferredOutcome, null);
  assert.equal(value.authority.learningPromotionAuthorized, false);
  assert.equal(value.authority.externalActionAuthorized, false);
});

test("waits when a directional observation arrives before the predeclared measurement window closes", () => {
  const early = attachOutcome(decision(), {
    observedAt: "2026-09-15T12:00:00.000Z",
    assessment: "POSITIVE"
  });
  const value = reviewCompanyBrainDecisionOutcomeMaturityV1(
    input(early, {
      evaluatedAt: "2026-09-16T12:00:00.000Z",
      sourceSnapshotAt: "2026-09-16T11:55:00.000Z"
    })
  );

  assert.equal(value.state, "WAIT_FOR_MEASUREMENT");
  assert.ok(value.reasonCodes.includes("EVALUATION_WINDOW_OPEN"));
  assert.ok(value.reasonCodes.includes("OUTCOME_OBSERVATION_BEFORE_EVALUATION_WINDOW"));
  assert.ok(value.reasonCodes.includes("DIRECTIONAL_ASSESSMENT_WITH_OPEN_WINDOW"));
  assert.equal(value.measurementPlan[0]?.windowState, "OPEN");
  assert.equal(value.measurementPlan[0]?.observationAfterWindow, false);
  assert.equal(value.nextInternalStep, "WAIT_FOR_PREDECLARED_MEASUREMENT_WINDOW_OR_EVIDENCE");
});

test("waits rather than manufacturing maturity when the evaluation window is not established", () => {
  const value = reviewCompanyBrainDecisionOutcomeMaturityV1(input(attachOutcome(decision(null))));

  assert.equal(value.state, "WAIT_FOR_MEASUREMENT");
  assert.ok(value.reasonCodes.includes("WINDOW_UNESTABLISHED"));
  assert.equal(value.measurementPlan[0]?.windowState, "UNESTABLISHED");
  assert.equal(value.causality, "NOT_ESTABLISHED");
});

test("waits for the declared observation after a matured window when no outcome has been recorded", () => {
  const value = reviewCompanyBrainDecisionOutcomeMaturityV1(input(decision()));

  assert.equal(value.state, "WAIT_FOR_MEASUREMENT");
  assert.ok(value.reasonCodes.includes("OUTCOME_OBSERVATION_MISSING"));
  assert.ok(value.reasonCodes.includes("MISSING_OBSERVED_OUTCOME"));
  assert.equal(value.measurementPlan[0]?.windowState, "MATURED");
  assert.equal(value.measurementPlan[0]?.observed, false);
  assert.equal(value.recordedAssessment, null);
});

test("fails closed when the observed metric or unit no longer matches the predeclared measurement binding", () => {
  const mismatched = attachOutcome(decision(), {
    metricRef: "metric:different",
    unit: "different-units"
  });
  const value = reviewCompanyBrainDecisionOutcomeMaturityV1(input(mismatched));

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.ok(value.reasonCodes.includes("METRIC_REF_MISMATCH"));
  assert.ok(value.reasonCodes.includes("UNIT_MISMATCH"));
  assert.equal(value.measurementPlan[0]?.unitBinding, "MISMATCH");
  assert.equal(value.nextInternalStep, "VERIFY_CANONICAL_DECISION_OR_OUTCOME_SOURCE");
});

test("fails closed on stale snapshots and widened source authority", () => {
  const unsafe = {
    ...attachOutcome(decision()),
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: true,
      externalActionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false
    }
  } as unknown as DecisionMemoryRecordV1;
  const value = reviewCompanyBrainDecisionOutcomeMaturityV1(
    input(unsafe, {
      sourceSnapshotAt: "2026-09-20T12:00:00.000Z",
      maximumSourceAgeMs: oneHour
    })
  );

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.ok(value.reasonCodes.includes("SOURCE_SNAPSHOT_STALE"));
  assert.ok(value.reasonCodes.includes("SOURCE_AUTHORITY_INVARIANT_FAILED"));
  assert.ok(value.reasonCodes.includes("OUTCOME_OBSERVATION_AFTER_SOURCE_SNAPSHOT"));
});

test("accepts a mature evidence-backed inconclusive assessment as reviewable without converting it into a directional lesson", () => {
  const value = reviewCompanyBrainDecisionOutcomeMaturityV1(
    input(attachOutcome(decision(), { assessment: "INCONCLUSIVE" }))
  );

  assert.equal(value.state, "READY_FOR_GOVERNED_OUTCOME_REVIEW");
  assert.equal(value.recordedAssessment?.value, "INCONCLUSIVE");
  assert.equal(value.causality, "NOT_ESTABLISHED");
  assert.equal(value.confidenceAdjustment, "NOT_AUTHORIZED");
  assert.equal(value.authority.policyPromotionAuthorized, false);
});
