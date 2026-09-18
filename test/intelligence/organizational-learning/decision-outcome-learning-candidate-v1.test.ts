import assert from "node:assert/strict";
import test from "node:test";

import {
  compileDecisionMemoryV1,
  attachDecisionOutcomeObservationV1,
  type DecisionMemoryInputV1,
  type DecisionMemoryRecordV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  compileDecisionOutcomeLearningCandidateV1,
  type DecisionOutcomeLearningCandidateInputV1,
  type DecisionOutcomeLearningEvidenceLineageV1
} from "../../../src/lib/intelligence/organizational-learning/decision-outcome-learning-candidate-v1";

const GENERATED_AT = "2026-09-18T15:00:00.000Z";

function decisionInput(actionState: DecisionMemoryInputV1["actionState"] = "TAKEN"): DecisionMemoryInputV1 {
  return {
    decisionId: "decision:pricing:collector-offer",
    decisionClass: "PRICING",
    decidedAt: "2026-09-10T16:00:00.000Z",
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: "Evaluate a bounded collector offer without weakening premium positioning.",
      evidenceRefs: ["ev:context"]
    },
    selectedAlternativeId: "alt:hold-premium",
    alternatives: [
      {
        alternativeId: "alt:hold-premium",
        label: "Hold premium price",
        description: {
          state: "KNOWN",
          value: "Keep the premium anchor and test a bounded offer presentation.",
          evidenceRefs: ["ev:alternative"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Protect premium positioning while measuring a reversible presentation change.",
      evidenceRefs: ["ev:rationale"]
    },
    assumptions: [
      {
        assumptionId: "assumption:premium-anchor",
        statement: {
          state: "KNOWN",
          value: "The premium anchor remains visible to the same audience.",
          evidenceRefs: ["ev:assumption"]
        },
        material: true,
        revisitTrigger: "Premium anchor changes."
      }
    ],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["ev:decision-confidence"]
    },
    expectedOutcomes: [
      {
        outcomeId: "outcome:conversion",
        metricRef: "metric:checkout-conversion",
        description: {
          state: "KNOWN",
          value: "Observe whether the bounded presentation changes checkout conversion.",
          evidenceRefs: ["ev:expected-description"]
        },
        expectedRange: {
          state: "KNOWN",
          value: { min: 0, max: 10, unit: "PERCENT" },
          evidenceRefs: ["ev:expected-range"]
        },
        evaluationWindowEndsAt: "2026-09-17T23:59:59.000Z"
      }
    ],
    successCriteria: [
      {
        state: "KNOWN",
        value: "Use only a completed measurement window.",
        evidenceRefs: ["ev:success"]
      }
    ],
    failureCriteria: [
      {
        state: "KNOWN",
        value: "Stop if premium-positioning evidence materially deteriorates.",
        evidenceRefs: ["ev:failure"]
      }
    ],
    revisitTriggers: ["New pricing evidence arrives."],
    validUntil: null,
    approval: {
      authorityClass: "KEEGAN",
      approvalState: "APPROVED",
      approvedByRef: "actor:keegan",
      approvedAt: "2026-09-10T15:55:00.000Z",
      evidenceRefs: ["ev:approval"]
    },
    actionState,
    actionEvidenceRefs: actionState === "TAKEN" ? ["ev:action"] : [],
    supersedesDecisionId: null,
    sourceRefs: ["source:decision-memory"]
  };
}

function record(
  overrides: {
    actionState?: DecisionMemoryInputV1["actionState"];
    lesson?: boolean;
    assessment?: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "INCONCLUSIVE" | "UNKNOWN";
    attributionClass?: "CAUSAL" | "CONTRIBUTORY" | "CORRELATIONAL" | "UNKNOWN";
  } = {}
): DecisionMemoryRecordV1 {
  const base = compileDecisionMemoryV1(decisionInput(overrides.actionState));
  return attachDecisionOutcomeObservationV1(base, {
    observedAt: "2026-09-18T14:00:00.000Z",
    outcomes: [
      {
        outcomeId: "outcome:conversion",
        metricRef: "metric:checkout-conversion",
        description: {
          state: "KNOWN",
          value: "The completed window showed a measurable conversion change.",
          evidenceRefs: ["ev:observed-description"]
        },
        observedRange: {
          state: "KNOWN",
          value: { min: 2, max: 4, unit: "PERCENT" },
          evidenceRefs: ["ev:observed-range"]
        }
      }
    ],
    assessment: {
      state: "KNOWN",
      value: overrides.assessment ?? "POSITIVE",
      evidenceRefs: ["ev:assessment"]
    },
    attributionClass: overrides.attributionClass ?? "CORRELATIONAL",
    attributionEvidenceRefs:
      (overrides.attributionClass ?? "CORRELATIONAL") === "UNKNOWN" ? [] : ["ev:attribution"],
    confounders: [
      {
        confounderId: "confounder:traffic-mix",
        description: "Traffic mix also changed during the observed window.",
        evidenceRefs: ["ev:confounder"]
      }
    ],
    assumptionAssessments: [
      {
        assumptionId: "assumption:premium-anchor",
        assessment: "SUPPORTED",
        evidenceRefs: ["ev:assumption-outcome"]
      }
    ],
    lessonCandidate:
      overrides.lesson === false
        ? null
        : {
            statement: "Preserve the premium anchor when testing bounded offer presentation changes.",
            evidenceRefs: ["ev:lesson"]
          },
    sourceRefs: ["source:woo", "source:ga4"]
  });
}

function lineageFor(recordValue: DecisionMemoryRecordV1): DecisionOutcomeLearningEvidenceLineageV1[] {
  const observation = recordValue.outcomeObservation;
  const refs = new Set<string>([
    ...recordValue.actionEvidenceRefs,
    ...(observation?.lessonCandidate?.evidenceRefs ?? []),
    ...(observation?.assessment.evidenceRefs ?? []),
    ...(observation?.attributionEvidenceRefs ?? []),
    ...(observation?.assumptionAssessments.flatMap((item) => item.evidenceRefs) ?? []),
    "ev:learning-confidence"
  ]);
  return [...refs].sort().map((evidenceId) => ({
    evidenceId,
    sourceLineageId: `lineage:${evidenceId}`,
    observedAt: "2026-09-18T14:30:00.000Z"
  }));
}

function input(recordValue = record()): DecisionOutcomeLearningCandidateInputV1 {
  return {
    record: recordValue,
    generatedAt: GENERATED_AT,
    title: "Bounded premium-offer lesson",
    scope: "COMPANY",
    confidence: {
      value: 0.72,
      evidenceRefs: ["ev:learning-confidence"]
    },
    evidenceLineage: lineageFor(recordValue)
  };
}

test("compiles an observed decision outcome into an inferred review candidate without promotion authority", () => {
  const result = compileDecisionOutcomeLearningCandidateV1(input());

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.deepEqual(result.reasonCodes, ["READY_GOVERNED_CANDIDATE"]);
  assert.equal(result.decisionClass, "PRICING");
  assert.equal(result.attributionClass, "CORRELATIONAL");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.learningCandidate?.kind, "VALIDATED_LESSON");
  assert.equal(result.learningCandidate?.lifecycle_state, "CANDIDATE");
  assert.equal(result.learningCandidate?.truth_state, "INFERRED");
  assert.equal(result.learningCandidate?.confidence, 0.72);
  assert.equal(result.learningCandidate?.content, "Preserve the premium anchor when testing bounded offer presentation changes.");
  assert.equal(result.learningCandidate?.approval, null);
  assert.equal(result.authority.learningPromotionAllowed, false);
  assert.equal(result.authority.pricingChangeAllowed, false);
  assert.equal(result.authority.negotiationActionAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
  assert.equal(result.authority.persistenceAllowed, false);
  assert.equal(result.authority.approvalBypassAllowed, false);
  assert.deepEqual(result.assumptionAssessments.map((item) => item.assessment), ["SUPPORTED"]);
  assert.equal(result.confounders[0]?.confounderId, "confounder:traffic-mix");
});

test("preserves a causal attribution label as evidence context but still refuses to claim causality", () => {
  const result = compileDecisionOutcomeLearningCandidateV1(input(record({ attributionClass: "CAUSAL" })));

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.equal(result.attributionClass, "CAUSAL");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.learningCandidate?.truth_state, "INFERRED");
});

test("waits for an observed outcome instead of manufacturing a lesson", () => {
  const result = compileDecisionOutcomeLearningCandidateV1(input(compileDecisionMemoryV1(decisionInput())));

  assert.equal(result.state, "WAIT_FOR_OUTCOME");
  assert.deepEqual(result.reasonCodes, ["OUTCOME_NOT_OBSERVED"]);
  assert.equal(result.learningCandidate, null);
});

test("does not create reusable learning when the canonical outcome has no lesson or remains inconclusive", () => {
  const noLesson = compileDecisionOutcomeLearningCandidateV1(input(record({ lesson: false })));
  assert.equal(noLesson.state, "NO_REUSABLE_LESSON");
  assert.deepEqual(noLesson.reasonCodes, ["LESSON_CANDIDATE_MISSING"]);
  assert.equal(noLesson.learningCandidate, null);

  const inconclusive = compileDecisionOutcomeLearningCandidateV1(input(record({ assessment: "INCONCLUSIVE" })));
  assert.equal(inconclusive.state, "NO_REUSABLE_LESSON");
  assert.deepEqual(inconclusive.reasonCodes, ["OUTCOME_INCONCLUSIVE"]);
  assert.equal(inconclusive.learningCandidate, null);
});

test("requires action evidence and observed execution before a decision lesson can enter review", () => {
  const planned = record({ actionState: "PLANNED" });
  const result = compileDecisionOutcomeLearningCandidateV1(input(planned));

  assert.equal(result.state, "VERIFY_RECORD");
  assert.ok(result.reasonCodes.includes("ACTION_NOT_OBSERVED"));
  assert.ok(result.reasonCodes.includes("ACTION_EVIDENCE_MISSING"));
  assert.equal(result.learningCandidate, null);
});

test("requires explicit evidence-backed learning confidence rather than deriving confidence from the outcome", () => {
  const value = input();
  const result = compileDecisionOutcomeLearningCandidateV1({
    ...value,
    confidence: { value: null, evidenceRefs: [] }
  });

  assert.equal(result.state, "VERIFY_RECORD");
  assert.ok(result.reasonCodes.includes("CONFIDENCE_NOT_EVIDENCED"));
  assert.equal(result.learningCandidate, null);
});

test("fails closed when required provenance is absent or one evidence id maps to conflicting lineage", () => {
  const value = input();
  const missing = compileDecisionOutcomeLearningCandidateV1({
    ...value,
    evidenceLineage: value.evidenceLineage.filter((item) => item.evidenceId !== "ev:lesson")
  });
  assert.equal(missing.state, "VERIFY_RECORD");
  assert.ok(missing.reasonCodes.includes("EVIDENCE_LINEAGE_MISSING"));

  const conflict = compileDecisionOutcomeLearningCandidateV1({
    ...value,
    evidenceLineage: [
      ...value.evidenceLineage,
      {
        evidenceId: "ev:lesson",
        sourceLineageId: "lineage:conflicting-copy",
        observedAt: "2026-09-18T14:30:00.000Z"
      }
    ]
  });
  assert.equal(conflict.state, "VERIFY_RECORD");
  assert.ok(conflict.reasonCodes.includes("EVIDENCE_LINEAGE_CONFLICT"));
  assert.equal(conflict.learningCandidate, null);
});

test("refuses future outcome chronology and records carrying canonical integrity flags", () => {
  const future = input();
  const chronological = compileDecisionOutcomeLearningCandidateV1({
    ...future,
    generatedAt: "2026-09-18T13:00:00.000Z"
  });
  assert.equal(chronological.state, "VERIFY_RECORD");
  assert.ok(chronological.reasonCodes.includes("INVALID_CHRONOLOGY"));

  const flaggedRecord = {
    ...record(),
    integrityFlags: ["RATIONALE_UNSUPPORTED" as const]
  };
  const flagged = compileDecisionOutcomeLearningCandidateV1(input(flaggedRecord));
  assert.equal(flagged.state, "VERIFY_RECORD");
  assert.deepEqual(flagged.reasonCodes, ["DECISION_INTEGRITY_FLAGS"]);
});

test("is deterministic, deeply immutable, and leaves caller input unchanged", () => {
  const source = input();
  const before = structuredClone(source);
  const first = compileDecisionOutcomeLearningCandidateV1(source);
  const second = compileDecisionOutcomeLearningCandidateV1(source);

  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.authority), true);
  assert.equal(Object.isFrozen(first.learningCandidate), true);
  assert.equal(Object.isFrozen(first.assumptionAssessments), true);
  assert.equal(Object.isFrozen(first.confounders), true);
});
