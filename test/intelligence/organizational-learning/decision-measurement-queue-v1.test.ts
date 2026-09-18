import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryInputV1,
  type DecisionMemoryRecordV1,
  type DecisionOutcomeObservationInputV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  compileDecisionMeasurementQueueV1,
  DecisionMeasurementQueueError
} from "../../../src/lib/intelligence/organizational-learning/decision-measurement-queue-v1";

const GENERATED_AT = "2026-09-18T15:00:00.000Z";
const CONVERSION_WINDOW = "2026-09-18T12:00:00.000Z";
const DEMAND_WINDOW = "2026-09-20T12:00:00.000Z";

function expectedOutcome(outcomeId: string, metricRef: string, evaluationWindowEndsAt: string | null) {
  return {
    outcomeId,
    metricRef,
    description: {
      state: "KNOWN" as const,
      value: `Observe ${metricRef} after the recorded evaluation window.`,
      evidenceRefs: [`ev:expected-description:${outcomeId}`]
    },
    expectedRange: {
      state: "KNOWN" as const,
      value: { min: 0, max: 10, unit: "PERCENT" },
      evidenceRefs: [`ev:expected-range:${outcomeId}`]
    },
    evaluationWindowEndsAt
  };
}

function decisionInput(options: {
  decisionId?: string;
  actionState?: DecisionMemoryInputV1["actionState"];
  expectedOutcomes?: DecisionMemoryInputV1["expectedOutcomes"];
  confidence?: DecisionMemoryInputV1["confidence"];
} = {}): DecisionMemoryInputV1 {
  const actionState = options.actionState ?? "TAKEN";
  return {
    decisionId: options.decisionId ?? "decision:campaign:collector-launch",
    decisionClass: "CAMPAIGN",
    decidedAt: "2026-09-10T16:00:00.000Z",
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: "Evaluate a bounded collector launch with explicit measurement windows.",
      evidenceRefs: ["ev:context"]
    },
    selectedAlternativeId: "alt:bounded-launch",
    alternatives: [
      {
        alternativeId: "alt:bounded-launch",
        label: "Bounded launch",
        description: {
          state: "KNOWN",
          value: "Use the approved bounded launch structure.",
          evidenceRefs: ["ev:alternative"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Preserve a measurable decision trail without assuming the result.",
      evidenceRefs: ["ev:rationale"]
    },
    assumptions: [
      {
        assumptionId: "assumption:measurement-coverage",
        statement: {
          state: "KNOWN",
          value: "The selected measurement sources remain available through the evaluation window.",
          evidenceRefs: ["ev:assumption"]
        },
        material: true,
        revisitTrigger: "Measurement coverage changes."
      }
    ],
    confidence:
      options.confidence ??
      ({
        state: "KNOWN",
        value: "MEDIUM",
        evidenceRefs: ["ev:confidence"]
      } as const),
    expectedOutcomes:
      options.expectedOutcomes ??
      [
        expectedOutcome("outcome:conversion", "metric:conversion", CONVERSION_WINDOW),
        expectedOutcome("outcome:qualified-demand", "metric:qualified-demand", DEMAND_WINDOW)
      ],
    successCriteria: [
      {
        state: "KNOWN",
        value: "Evaluate only after the recorded window with explicit evidence.",
        evidenceRefs: ["ev:success"]
      }
    ],
    failureCriteria: [
      {
        state: "KNOWN",
        value: "Do not infer failure from missing measurement evidence.",
        evidenceRefs: ["ev:failure"]
      }
    ],
    revisitTriggers: ["New decision-grade outcome evidence arrives."],
    validUntil: null,
    approval: {
      authorityClass: "KEEGAN",
      approvalState: "APPROVED",
      approvedByRef: "actor:keegan",
      approvedAt: "2026-09-10T15:55:00.000Z",
      evidenceRefs: ["ev:approval"]
    },
    actionState,
    actionEvidenceRefs:
      actionState === "TAKEN" || actionState === "REVERSED" ? ["ev:action"] : [],
    supersedesDecisionId: null,
    sourceRefs: ["source:decision-memory"]
  };
}

function record(options: Parameters<typeof decisionInput>[0] = {}): DecisionMemoryRecordV1 {
  return compileDecisionMemoryV1(decisionInput(options));
}

function observedOutcome(outcomeId: string, metricRef: string) {
  return {
    outcomeId,
    metricRef,
    description: {
      state: "KNOWN" as const,
      value: `Observed ${metricRef} evidence for the recorded measurement window.`,
      evidenceRefs: [`ev:observed-description:${outcomeId}`]
    },
    observedRange: {
      state: "KNOWN" as const,
      value: { min: 2, max: 4, unit: "PERCENT" },
      evidenceRefs: [`ev:observed-range:${outcomeId}`]
    }
  };
}

function attachObservation(
  base: DecisionMemoryRecordV1,
  options: {
    observedAt?: string;
    outcomeIds?: readonly string[];
  } = {}
): DecisionMemoryRecordV1 {
  const outcomeIds = options.outcomeIds ?? ["outcome:conversion"];
  const observation: DecisionOutcomeObservationInputV1 = {
    observedAt: options.observedAt ?? "2026-09-18T14:00:00.000Z",
    outcomes: outcomeIds.map((outcomeId) =>
      observedOutcome(
        outcomeId,
        outcomeId === "outcome:qualified-demand" ? "metric:qualified-demand" : "metric:conversion"
      )
    ),
    assessment: {
      state: "KNOWN",
      value: "INCONCLUSIVE",
      evidenceRefs: ["ev:assessment"]
    },
    attributionClass: "UNKNOWN",
    attributionEvidenceRefs: [],
    confounders: [],
    assumptionAssessments: [],
    lessonCandidate: null,
    sourceRefs: ["source:measurement"]
  };
  return attachDecisionOutcomeObservationV1(base, observation);
}

test("marks an unobserved outcome DUE after its recorded window without interpreting the missing evidence", () => {
  const result = compileDecisionMeasurementQueueV1({
    records: [record()],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 6 * 60 * 60 * 1000
  });

  assert.equal(result.items[0]?.state, "DUE");
  assert.deepEqual(result.items[0]?.reasonCodes, ["MEASUREMENT_DUE"]);
  assert.deepEqual(result.items[0]?.pendingOutcomeIds, [
    "outcome:conversion",
    "outcome:qualified-demand"
  ]);
  assert.equal(result.items[0]?.nextMeasurementAt, CONVERSION_WINDOW);
  assert.equal(result.items[0]?.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.items[0]?.outcomeStatusInterpretation, "MEASUREMENT_COVERAGE_ONLY");
  assert.equal(result.summary.due, 1);
  assert.equal(result.authority.measurementExecutionAllowed, false);
  assert.equal(result.authority.reallocationAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("escalates only the missing measurement attention state to OVERDUE after caller-owned grace", () => {
  const result = compileDecisionMeasurementQueueV1({
    records: [record()],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 2 * 60 * 60 * 1000
  });

  assert.equal(result.items[0]?.state, "OVERDUE");
  assert.deepEqual(result.items[0]?.overdueOutcomeIds, ["outcome:conversion"]);
  assert.equal(result.summary.overdue, 1);
});

test("keeps only genuinely unobserved mature outcomes pending after a partial observation", () => {
  const partiallyObserved = attachObservation(record(), {
    observedAt: "2026-09-18T14:00:00.000Z",
    outcomeIds: ["outcome:conversion"]
  });
  const result = compileDecisionMeasurementQueueV1({
    records: [partiallyObserved],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 6 * 60 * 60 * 1000
  });

  assert.equal(result.items[0]?.state, "WAITING_WINDOW");
  assert.deepEqual(result.items[0]?.observedOutcomeIds, ["outcome:conversion"]);
  assert.deepEqual(result.items[0]?.pendingOutcomeIds, ["outcome:qualified-demand"]);
  assert.equal(result.items[0]?.nextMeasurementAt, DEMAND_WINDOW);
  assert.ok(result.items[0]?.sourceRefs.includes("source:measurement"));
});

test("does not count a pre-window observation as final measurement coverage", () => {
  const earlyObservation = attachObservation(record(), {
    observedAt: "2026-09-18T10:00:00.000Z",
    outcomeIds: ["outcome:conversion"]
  });
  const result = compileDecisionMeasurementQueueV1({
    records: [earlyObservation],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 6 * 60 * 60 * 1000
  });

  assert.equal(result.items[0]?.state, "DUE");
  assert.deepEqual(result.items[0]?.observedOutcomeIds, []);
  assert.ok(result.items[0]?.pendingOutcomeIds.includes("outcome:conversion"));
});

test("marks measurement coverage COMPLETE only when every expected outcome is observed after its window", () => {
  const fullyObserved = attachObservation(record(), {
    observedAt: "2026-09-21T14:00:00.000Z",
    outcomeIds: ["outcome:conversion", "outcome:qualified-demand"]
  });
  const result = compileDecisionMeasurementQueueV1({
    records: [fullyObserved],
    generatedAt: "2026-09-21T15:00:00.000Z",
    overdueGraceMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.items[0]?.state, "COMPLETE");
  assert.deepEqual(result.items[0]?.pendingOutcomeIds, []);
  assert.equal(result.items[0]?.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.authority.policyPromotionAllowed, false);
  assert.equal(result.authority.portfolioMutationAllowed, false);
});

test("waits for an observed action instead of manufacturing a measurement obligation", () => {
  const result = compileDecisionMeasurementQueueV1({
    records: [record({ actionState: "PLANNED" })],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 0
  });

  assert.equal(result.items[0]?.state, "WAITING_ACTION");
  assert.deepEqual(result.items[0]?.reasonCodes, ["ACTION_NOT_OBSERVED"]);
});

test("fails closed on decision-memory integrity flags", () => {
  const unsupported = record({
    confidence: { state: "UNKNOWN", value: "UNKNOWN", evidenceRefs: [] }
  });
  assert.ok(unsupported.integrityFlags.includes("CONFIDENCE_UNSUPPORTED"));

  const result = compileDecisionMeasurementQueueV1({
    records: [unsupported],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 0
  });

  assert.equal(result.items[0]?.state, "VERIFY_RECORD");
  assert.deepEqual(result.items[0]?.reasonCodes, ["DECISION_INTEGRITY_FLAGS"]);
});

test("fails closed when the expected measurement window is missing", () => {
  const invalidPlan = record({
    expectedOutcomes: [
      expectedOutcome("outcome:conversion", "metric:conversion", null)
    ]
  });
  const result = compileDecisionMeasurementQueueV1({
    records: [invalidPlan],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 0
  });

  assert.equal(result.items[0]?.state, "VERIFY_RECORD");
  assert.deepEqual(result.items[0]?.reasonCodes, ["INVALID_OUTCOME_PLAN"]);
});

test("fails closed on future outcome observations", () => {
  const futureObservation = attachObservation(record(), {
    observedAt: "2026-09-19T14:00:00.000Z",
    outcomeIds: ["outcome:conversion"]
  });
  const result = compileDecisionMeasurementQueueV1({
    records: [futureObservation],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 0
  });

  assert.equal(result.items[0]?.state, "VERIFY_RECORD");
  assert.deepEqual(result.items[0]?.reasonCodes, ["INVALID_OBSERVATION_CHRONOLOGY"]);
});

test("fails closed when an observation claims an outcome outside the recorded measurement plan", () => {
  const mismatched = attachObservation(record(), {
    observedAt: "2026-09-18T14:00:00.000Z",
    outcomeIds: ["outcome:not-planned"]
  });
  const result = compileDecisionMeasurementQueueV1({
    records: [mismatched],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 0
  });

  assert.equal(result.items[0]?.state, "VERIFY_RECORD");
  assert.deepEqual(result.items[0]?.reasonCodes, ["OBSERVED_OUTCOME_ID_MISMATCH"]);
});

test("represents a taken decision with no expected outcomes as no measurement plan, not success", () => {
  const result = compileDecisionMeasurementQueueV1({
    records: [record({ expectedOutcomes: [] })],
    generatedAt: GENERATED_AT,
    overdueGraceMs: 0
  });

  assert.equal(result.items[0]?.state, "NO_MEASUREMENT_PLAN");
  assert.deepEqual(result.items[0]?.reasonCodes, ["NO_EXPECTED_OUTCOMES"]);
  assert.equal(result.summary.complete, 0);
});

test("rejects duplicate decision identities instead of multiplying measurement attention", () => {
  const duplicate = record();
  assert.throws(
    () =>
      compileDecisionMeasurementQueueV1({
        records: [duplicate, duplicate],
        generatedAt: GENERATED_AT,
        overdueGraceMs: 0
      }),
    (error: unknown) =>
      error instanceof DecisionMeasurementQueueError &&
      error.code === "DUPLICATE_OR_MISSING_DECISION_ID"
  );
});

test("orders the queue deterministically by attention state and keeps inputs immutable", () => {
  const due = record({ decisionId: "decision:due" });
  const waiting = record({ decisionId: "decision:waiting", actionState: "PLANNED" });
  const complete = attachObservation(record({ decisionId: "decision:complete" }), {
    observedAt: "2026-09-21T14:00:00.000Z",
    outcomeIds: ["outcome:conversion", "outcome:qualified-demand"]
  });
  const input = [complete, waiting, due] as const;
  const before = JSON.stringify(input);

  const result = compileDecisionMeasurementQueueV1({
    records: input,
    generatedAt: "2026-09-21T15:00:00.000Z",
    overdueGraceMs: 7 * 24 * 60 * 60 * 1000
  });

  assert.deepEqual(
    result.items.map((item) => [item.decisionId, item.state]),
    [
      ["decision:due", "DUE"],
      ["decision:waiting", "WAITING_ACTION"],
      ["decision:complete", "COMPLETE"]
    ]
  );
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
});
