import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryInputV1,
  type DecisionMemoryRecordV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  compileDecisionOutcomeLearningCandidateV1,
  type DecisionOutcomeLearningCandidateInputV1
} from "../../../src/lib/intelligence/organizational-learning/decision-outcome-learning-candidate-v1";

const GENERATED_AT = "2026-10-02T12:00:00.000Z";

function decisionInput(
  windows: readonly (string | null)[] = ["2026-09-30T23:59:59.000Z"]
): DecisionMemoryInputV1 {
  return {
    decisionId: "decision:maturity-gate",
    decisionClass: "STRATEGY",
    decidedAt: "2026-09-01T12:00:00.000Z",
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: "Measure a bounded strategy before learning from it.",
      evidenceRefs: ["ev:context"]
    },
    selectedAlternativeId: "alt:measure",
    alternatives: [
      {
        alternativeId: "alt:measure",
        label: "Measure",
        description: {
          state: "KNOWN",
          value: "Run the bounded strategy through its declared measurement window.",
          evidenceRefs: ["ev:alternative"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Prevent premature learning from an incomplete window.",
      evidenceRefs: ["ev:rationale"]
    },
    assumptions: [],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["ev:decision-confidence"]
    },
    expectedOutcomes: windows.map((evaluationWindowEndsAt, index) => ({
      outcomeId: `outcome:${index + 1}`,
      metricRef: `metric:${index + 1}`,
      description: {
        state: "KNOWN" as const,
        value: `Observe metric ${index + 1}.`,
        evidenceRefs: [`ev:expected-description:${index + 1}`]
      },
      expectedRange: {
        state: "KNOWN" as const,
        value: { min: 0, max: 10, unit: "PERCENT" },
        evidenceRefs: [`ev:expected-range:${index + 1}`]
      },
      evaluationWindowEndsAt
    })),
    successCriteria: [
      {
        state: "KNOWN",
        value: "Use only completed measurement windows.",
        evidenceRefs: ["ev:success"]
      }
    ],
    failureCriteria: [
      {
        state: "KNOWN",
        value: "Do not learn from an incomplete measurement window.",
        evidenceRefs: ["ev:failure"]
      }
    ],
    revisitTriggers: ["Measurement evidence changes."],
    validUntil: null,
    approval: {
      authorityClass: "INTERNAL_REVIEW",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: "TAKEN",
    actionEvidenceRefs: ["ev:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:decision"]
  };
}

function withOutcome(
  base: DecisionMemoryRecordV1,
  options: {
    observedAt?: string;
    outcomeIds?: readonly string[];
    metricRef?: string;
    unit?: string;
  } = {}
): DecisionMemoryRecordV1 {
  const outcomeIds = options.outcomeIds ?? ["outcome:1"];
  return attachDecisionOutcomeObservationV1(base, {
    observedAt: options.observedAt ?? "2026-10-01T12:00:00.000Z",
    outcomes: outcomeIds.map((outcomeId, index) => ({
      outcomeId,
      metricRef: options.metricRef ?? `metric:${index + 1}`,
      description: {
        state: "KNOWN",
        value: `Observed ${outcomeId}.`,
        evidenceRefs: [`ev:observed-description:${outcomeId}`]
      },
      observedRange: {
        state: "KNOWN",
        value: { min: 2, max: 4, unit: options.unit ?? "PERCENT" },
        evidenceRefs: [`ev:observed-range:${outcomeId}`]
      }
    })),
    assessment: {
      state: "KNOWN",
      value: "POSITIVE",
      evidenceRefs: ["ev:assessment"]
    },
    attributionClass: "UNKNOWN",
    attributionEvidenceRefs: [],
    confounders: [],
    assumptionAssessments: [],
    lessonCandidate: {
      statement: "Only reuse the strategy after its declared measurement window matures.",
      evidenceRefs: ["ev:lesson"]
    },
    sourceRefs: ["source:outcome"]
  });
}

function candidateInput(record: DecisionMemoryRecordV1): DecisionOutcomeLearningCandidateInputV1 {
  const observation = record.outcomeObservation;
  const evidenceRefs = new Set([
    ...record.actionEvidenceRefs,
    ...(observation?.lessonCandidate?.evidenceRefs ?? []),
    ...(observation?.assessment.evidenceRefs ?? []),
    ...(observation?.attributionEvidenceRefs ?? []),
    ...(observation?.assumptionAssessments.flatMap((item) => item.evidenceRefs) ?? []),
    "ev:learning-confidence"
  ]);
  return {
    record,
    generatedAt: GENERATED_AT,
    title: "Measurement-mature strategy lesson",
    scope: "COMPANY",
    confidence: {
      value: 0.6,
      evidenceRefs: ["ev:learning-confidence"]
    },
    evidenceLineage: [...evidenceRefs].map((evidenceId) => ({
      evidenceId,
      sourceLineageId: `lineage:${evidenceId}`,
      observedAt: "2026-10-01T13:00:00.000Z"
    }))
  };
}

test("blocks a learning candidate when the recorded observation predates the declared measurement window", () => {
  const record = withOutcome(compileDecisionMemoryV1(decisionInput()), {
    observedAt: "2026-09-15T12:00:00.000Z"
  });
  const result = compileDecisionOutcomeLearningCandidateV1(candidateInput(record));

  assert.equal(result.state, "WAIT_FOR_MEASUREMENT");
  assert.ok(result.reasonCodes.includes("MEASUREMENT_WINDOW_OPEN"));
  assert.equal(result.learningCandidate, null);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.authority.learningPromotionAllowed, false);
});

test("allows the existing governed candidate path only after the exact declared window has matured", () => {
  const record = withOutcome(compileDecisionMemoryV1(decisionInput()));
  const result = compileDecisionOutcomeLearningCandidateV1(candidateInput(record));

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.deepEqual(result.reasonCodes, ["READY_GOVERNED_CANDIDATE"]);
  assert.equal(result.learningCandidate?.truth_state, "INFERRED");
  assert.equal(result.authority.policyPromotionAllowed, false);
});

test("waits when one of multiple predeclared outcomes has not yet been observed", () => {
  const record = withOutcome(
    compileDecisionMemoryV1(
      decisionInput(["2026-09-29T23:59:59.000Z", "2026-09-30T23:59:59.000Z"])
    ),
    { outcomeIds: ["outcome:1"] }
  );
  const result = compileDecisionOutcomeLearningCandidateV1(candidateInput(record));

  assert.equal(result.state, "WAIT_FOR_MEASUREMENT");
  assert.ok(result.reasonCodes.includes("MEASUREMENT_OUTCOME_MISSING"));
  assert.equal(result.learningCandidate, null);
});

test("waits instead of inventing maturity when no evaluation window was predeclared", () => {
  const record = withOutcome(compileDecisionMemoryV1(decisionInput([null])));
  const result = compileDecisionOutcomeLearningCandidateV1(candidateInput(record));

  assert.equal(result.state, "WAIT_FOR_MEASUREMENT");
  assert.ok(result.reasonCodes.includes("MEASUREMENT_WINDOW_UNESTABLISHED"));
  assert.equal(result.learningCandidate, null);
});

test("fails closed when observed metric or unit identity drifts from the declared outcome", () => {
  const metricMismatch = withOutcome(compileDecisionMemoryV1(decisionInput()), {
    metricRef: "metric:different"
  });
  const metricResult = compileDecisionOutcomeLearningCandidateV1(candidateInput(metricMismatch));
  assert.equal(metricResult.state, "VERIFY_RECORD");
  assert.ok(metricResult.reasonCodes.includes("MEASUREMENT_METRIC_MISMATCH"));

  const unitMismatch = withOutcome(compileDecisionMemoryV1(decisionInput()), {
    unit: "COUNT"
  });
  const unitResult = compileDecisionOutcomeLearningCandidateV1(candidateInput(unitMismatch));
  assert.equal(unitResult.state, "VERIFY_RECORD");
  assert.ok(unitResult.reasonCodes.includes("MEASUREMENT_UNIT_MISMATCH"));
});
