import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionAttributionClassV1,
  type DecisionMemoryInputV1,
  type DecisionMemoryRecordV1,
  type DecisionMemoryTruthStateV1,
  type DecisionOutcomeObservationInputV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  DecisionOutcomeCalibrationError,
  reviewDecisionOutcomeCalibrationV1
} from "../../../src/lib/intelligence/organizational-learning/decision-outcome-calibration-review-v1";

const generatedAt = "2026-09-20T00:00:00.000Z";
const evaluationEndsAt = "2026-09-10T00:00:00.000Z";
const observedAt = "2026-09-11T00:00:00.000Z";

function decisionInput(
  id: string,
  overrides: Partial<DecisionMemoryInputV1> = {}
): DecisionMemoryInputV1 {
  return {
    decisionId: id,
    decisionClass: "EXPERIMENT",
    decidedAt: "2026-09-01T00:00:00.000Z",
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: "Review one bounded experiment decision.",
      evidenceRefs: [`evidence:${id}:context`]
    },
    selectedAlternativeId: "alt-run",
    alternatives: [
      {
        alternativeId: "alt-run",
        label: "Run bounded experiment",
        description: {
          state: "KNOWN",
          value: "Run the already-approved bounded experiment.",
          evidenceRefs: [`evidence:${id}:alternative`]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Use a predeclared measurement window before learning from the result.",
      evidenceRefs: [`evidence:${id}:rationale`]
    },
    assumptions: [],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: [`evidence:${id}:confidence`]
    },
    expectedOutcomes: [
      {
        outcomeId: "qualified-leads",
        metricRef: "metric:qualified-leads",
        description: {
          state: "KNOWN",
          value: "Observe qualified leads after the evaluation window.",
          evidenceRefs: [`evidence:${id}:expected-description`]
        },
        expectedRange: {
          state: "KNOWN",
          value: { min: 90, max: 110, unit: "COUNT" },
          evidenceRefs: [`evidence:${id}:expected-range`]
        },
        evaluationWindowEndsAt: evaluationEndsAt
      }
    ],
    successCriteria: [
      {
        state: "KNOWN",
        value: "Evaluate the declared metric after the declared window.",
        evidenceRefs: [`evidence:${id}:success`]
      }
    ],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: null,
    approval: {
      authorityClass: "EXPERIMENT_REVIEW",
      approvalState: "APPROVED",
      approvedByRef: "actor:keegan",
      approvedAt: "2026-09-01T00:00:00.000Z",
      evidenceRefs: [`evidence:${id}:approval`]
    },
    actionState: "TAKEN",
    actionEvidenceRefs: [`evidence:${id}:action`],
    supersedesDecisionId: null,
    sourceRefs: [`source:${id}:decision`],
    ...overrides
  };
}

function observedRecord(
  id: string,
  options: {
    min?: number;
    max?: number;
    unit?: string;
    metricRef?: string | null;
    observedAt?: string;
    rangeState?: DecisionMemoryTruthStateV1;
    attributionClass?: DecisionAttributionClassV1;
  } = {}
): DecisionMemoryRecordV1 {
  const base = compileDecisionMemoryV1(decisionInput(id));
  const input: DecisionOutcomeObservationInputV1 = {
    observedAt: options.observedAt ?? observedAt,
    outcomes: [
      {
        outcomeId: "qualified-leads",
        metricRef: options.metricRef === undefined ? "metric:qualified-leads" : options.metricRef,
        description: {
          state: "KNOWN",
          value: "Observed qualified leads for the declared outcome.",
          evidenceRefs: [`evidence:${id}:observed-description`]
        },
        observedRange: {
          state: options.rangeState ?? "KNOWN",
          value: { min: options.min ?? 100, max: options.max ?? 105, unit: options.unit ?? "COUNT" },
          evidenceRefs: [`evidence:${id}:observed-range`]
        }
      }
    ],
    assessment: {
      state: "KNOWN",
      value: "POSITIVE",
      evidenceRefs: [`evidence:${id}:assessment`]
    },
    attributionClass: options.attributionClass ?? "CORRELATIONAL",
    attributionEvidenceRefs: [`evidence:${id}:attribution`],
    confounders: [
      {
        confounderId: `confounder:${id}:seasonality`,
        description: "Seasonality may have affected the measured result.",
        evidenceRefs: [`evidence:${id}:confounder`]
      }
    ],
    assumptionAssessments: [],
    lessonCandidate: null,
    sourceRefs: [`source:${id}:outcome`]
  };
  return attachDecisionOutcomeObservationV1(base, input);
}

function review(records: readonly DecisionMemoryRecordV1[], minimumDistinctDecisions = 2) {
  return reviewDecisionOutcomeCalibrationV1({
    targets: records.map((record) => ({ record, outcomeId: "qualified-leads" })),
    generatedAt,
    minimumDistinctDecisions
  });
}

test("compares exact expected and observed ranges without granting causal or mutation authority", () => {
  const result = review([observedRecord("decision-a")]);

  assert.equal(result.status, "READY");
  assert.deepEqual(result.summary, {
    targetsReviewed: 1,
    belowExpectedRange: 0,
    overlappingExpectedRange: 1,
    aboveExpectedRange: 0
  });
  assert.equal(result.comparisons[0]?.comparison, "OVERLAPS_EXPECTED_RANGE");
  assert.equal(result.comparisons[0]?.attributionClass, "CORRELATIONAL");
  assert.equal(result.comparisons[0]?.causalLearningAllowed, false);
  assert.deepEqual(result.comparisons[0]?.confounderIds, ["confounder:decision-a:seasonality"]);
  assert.deepEqual(result.recurringSignals, []);
  assert.deepEqual(result.authority, {
    mutateDecisionMemory: false,
    mutateConfidence: false,
    inferCausality: false,
    inferMonetaryValue: false,
    changeAllocation: false,
    changePrice: false,
    changeSpend: false,
    promotePolicy: false,
    externalAction: false,
    approvalBypass: false
  });
});

test("surfaces repeated observed miss direction only across distinct decisions with exact metric identity", () => {
  const first = observedRecord("decision-a", { min: 120, max: 125 });
  const second = observedRecord("decision-b", { min: 130, max: 140 });
  const result = review([second, first], 2);

  assert.equal(result.status, "READY");
  assert.equal(result.summary?.aboveExpectedRange, 2);
  assert.equal(result.recurringSignals.length, 1);
  assert.deepEqual(result.recurringSignals[0], {
    decisionClass: "EXPERIMENT",
    metricRef: "metric:qualified-leads",
    unit: "COUNT",
    distinctDecisionCount: 2,
    signal: "REPEATED_ABOVE_RANGE",
    decisionIds: ["decision-a", "decision-b"],
    causalClaimAllowed: false,
    confidenceInferred: false,
    policyPromotionAuthorized: false
  });
});

test("preserves mixed direction rather than forcing a positive or negative recurring lesson", () => {
  const above = observedRecord("decision-a", { min: 120, max: 125 });
  const below = observedRecord("decision-b", { min: 50, max: 60 });
  const result = review([above, below], 2);

  assert.equal(result.status, "READY");
  assert.equal(result.recurringSignals[0]?.signal, "MIXED_DIRECTION");
  assert.equal(result.recurringSignals[0]?.causalClaimAllowed, false);
  assert.equal(result.recurringSignals[0]?.confidenceInferred, false);
});

test("waits when an action or outcome is not yet ready and suppresses aggregate calibration", () => {
  const planned = compileDecisionMemoryV1(
    decisionInput("decision-planned", {
      actionState: "PLANNED",
      actionEvidenceRefs: []
    })
  );
  const result = review([planned]);

  assert.equal(result.status, "WAITING_FOR_OUTCOMES");
  assert.equal(result.summary, null);
  assert.deepEqual(result.recurringSignals, []);
  assert.equal(result.comparisons.length, 0);
  assert.equal(result.blocked[0]?.disposition, "WAIT");
  assert.ok(result.blocked[0]?.reasons.includes("ACTION_NOT_EXECUTED"));
  assert.ok(result.blocked[0]?.reasons.includes("OUTCOME_OBSERVATION_MISSING"));
});

test("waits until the declared evaluation window has matured", () => {
  const early = observedRecord("decision-early", {
    observedAt: "2026-09-09T00:00:00.000Z"
  });
  const result = review([early]);

  assert.equal(result.status, "WAITING_FOR_OUTCOMES");
  assert.equal(result.summary, null);
  assert.ok(result.blocked[0]?.reasons.includes("EVALUATION_WINDOW_NOT_MATURE"));
});

test("fails closed on unsupported ranges, metric mismatch, unit mismatch, or future outcome evidence", () => {
  const inferred = observedRecord("decision-inferred", { rangeState: "INFERRED" });
  const metricMismatch = observedRecord("decision-metric", { metricRef: "metric:orders" });
  const unitMismatch = observedRecord("decision-unit", { unit: "PERCENT" });
  const future = observedRecord("decision-future", { observedAt: "2026-09-21T00:00:00.000Z" });

  const inferredResult = review([inferred]);
  assert.equal(inferredResult.status, "VERIFY_SOURCE");
  assert.equal(inferredResult.summary, null);
  assert.ok(inferredResult.blocked[0]?.reasons.includes("OBSERVED_RANGE_INFERRED"));

  const metricResult = review([metricMismatch]);
  assert.equal(metricResult.status, "VERIFY_SOURCE");
  assert.ok(metricResult.blocked[0]?.reasons.includes("METRIC_IDENTITY_MISMATCH"));

  const unitResult = review([unitMismatch]);
  assert.equal(unitResult.status, "VERIFY_SOURCE");
  assert.ok(unitResult.blocked[0]?.reasons.includes("UNIT_MISMATCH"));

  const futureResult = review([future]);
  assert.equal(futureResult.status, "VERIFY_SOURCE");
  assert.ok(futureResult.blocked[0]?.reasons.includes("OUTCOME_OBSERVATION_FROM_FUTURE"));
});

test("never upgrades a source causal label into calibration authority", () => {
  const record = observedRecord("decision-causal", { attributionClass: "CAUSAL" });
  const result = review([record]);

  assert.equal(result.status, "READY");
  assert.equal(result.comparisons[0]?.attributionClass, "CAUSAL");
  assert.equal(result.comparisons[0]?.causalLearningAllowed, false);
  assert.equal(result.authority.inferCausality, false);
  assert.equal(result.authority.mutateConfidence, false);
  assert.equal(result.authority.promotePolicy, false);
});

test("is deterministic, immutable, and rejects duplicate calibration targets", () => {
  const record = observedRecord("decision-a");
  const before = structuredClone(record);
  const first = review([record]);
  const second = review([record]);

  assert.equal(first.reviewId, second.reviewId);
  assert.deepEqual(record, before);

  assert.throws(
    () =>
      reviewDecisionOutcomeCalibrationV1({
        targets: [
          { record, outcomeId: "qualified-leads" },
          { record, outcomeId: "qualified-leads" }
        ],
        generatedAt,
        minimumDistinctDecisions: 2
      }),
    (error: unknown) =>
      error instanceof DecisionOutcomeCalibrationError && error.code === "DUPLICATE_TARGET"
  );
});
