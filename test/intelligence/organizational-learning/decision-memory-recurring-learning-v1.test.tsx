import assert from "node:assert/strict";
import test from "node:test";

import {
  compileDecisionMemoryRecurringLearningHandoffV1,
  type DecisionMemoryRecurringLearningReasonV1
} from "@/lib/intelligence/organizational-learning/decision-memory-recurring-learning-v1";
import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryClassV1,
  type DecisionMemoryInputV1,
  type DecisionMemoryRecordV1,
  type DecisionOutcomeObservationInputV1
} from "@/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  approveLearningCandidateV1,
  createValidatedLessonCandidateV1,
  type LearningObjectV1
} from "@/lib/intelligence/organizational-learning/learning-object-v1";
import {
  evaluateRecurringDecisionLessonV1,
  type RecurringLessonObservationV1
} from "@/lib/intelligence/organizational-learning/recurring-decision-lessons-v1";

const LESSON = "Holding the documented boundary avoided an unsupported concession in the observed case.";
const GENERATED_AT = "2026-09-18T12:00:00.000Z";

function decisionInput(
  n: number,
  decisionClass: DecisionMemoryClassV1 = "PRICING",
  overrides: Partial<DecisionMemoryInputV1> = {}
): DecisionMemoryInputV1 {
  return {
    decisionId: `decision:${n}`,
    decisionClass,
    decidedAt: "2026-09-01T10:00:00.000Z",
    actorRef: "person:keegan",
    context: {
      state: "KNOWN",
      value: "Choose a documented commercial posture.",
      evidenceRefs: [`evidence:context:${n}`]
    },
    selectedAlternativeId: "hold",
    alternatives: [
      {
        alternativeId: "hold",
        label: "Hold documented boundary",
        description: {
          state: "KNOWN",
          value: "Keep the documented boundary unchanged.",
          evidenceRefs: [`evidence:alternative:${n}`]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Available evidence did not support a concession.",
      evidenceRefs: [`evidence:rationale:${n}`]
    },
    assumptions: [],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: [`evidence:confidence:${n}`]
    },
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: null,
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-01T10:00:00.000Z",
      evidenceRefs: [`evidence:approval:${n}`]
    },
    actionState: "TAKEN",
    actionEvidenceRefs: [`evidence:action:${n}`],
    supersedesDecisionId: null,
    sourceRefs: [`source:decision:${n}`],
    ...overrides
  };
}

function outcomeInput(
  n: number,
  overrides: Partial<DecisionOutcomeObservationInputV1> = {}
): DecisionOutcomeObservationInputV1 {
  return {
    observedAt: "2026-09-10T10:00:00.000Z",
    outcomes: [
      {
        outcomeId: `outcome:${n}`,
        metricRef: null,
        description: {
          state: "KNOWN",
          value: "A documented commercial outcome was observed.",
          evidenceRefs: [`evidence:outcome:${n}`]
        },
        observedRange: {
          state: "UNKNOWN",
          value: null,
          evidenceRefs: []
        }
      }
    ],
    assessment: {
      state: "KNOWN",
      value: "POSITIVE",
      evidenceRefs: [`evidence:assessment:${n}`]
    },
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: [`evidence:attribution:${n}`],
    confounders: [
      {
        confounderId: `confounder:${n}`,
        description: "Counterparty preference may have independently contributed.",
        evidenceRefs: [`evidence:confounder:${n}`]
      }
    ],
    assumptionAssessments: [],
    lessonCandidate: {
      statement: LESSON,
      evidenceRefs: [`evidence:lesson:${n}`]
    },
    sourceRefs: [`source:outcome:${n}`],
    ...overrides
  };
}

function decisionRecord(
  n: number,
  decisionClass: DecisionMemoryClassV1 = "PRICING",
  decisionOverrides: Partial<DecisionMemoryInputV1> = {},
  outcomeOverrides: Partial<DecisionOutcomeObservationInputV1> = {}
): DecisionMemoryRecordV1 {
  return attachDecisionOutcomeObservationV1(
    compileDecisionMemoryV1(decisionInput(n, decisionClass, decisionOverrides)),
    outcomeInput(n, outcomeOverrides)
  );
}

function reviewedLesson(
  n: number,
  overrides: {
    content?: string;
    truthState?: "KNOWN" | "INFERRED";
    includeAction?: boolean;
    includeAssessment?: boolean;
    includeLesson?: boolean;
    candidateOnly?: boolean;
    evidenceObservedAt?: string;
  } = {}
): LearningObjectV1 {
  const lineage = `lineage:${n}`;
  const evidence = [
    ...(overrides.includeLesson === false
      ? []
      : [{
          evidence_id: `evidence:lesson:${n}`,
          source_lineage_id: lineage,
          observed_at: overrides.evidenceObservedAt ?? "2026-09-10T10:00:00.000Z"
        }]),
    ...(overrides.includeAssessment === false
      ? []
      : [{
          evidence_id: `evidence:assessment:${n}`,
          source_lineage_id: lineage,
          observed_at: "2026-09-10T10:00:00.000Z"
        }]),
    ...(overrides.includeAction === false
      ? []
      : [{
          evidence_id: `evidence:action:${n}`,
          source_lineage_id: lineage,
          observed_at: "2026-09-01T10:01:00.000Z"
        }])
  ];
  const candidate = createValidatedLessonCandidateV1({
    learning_id: `learning:${n}`,
    truth_state: overrides.truthState ?? "KNOWN",
    scope: "COMPANY",
    title: "Observed commercial-boundary lesson",
    content: overrides.content ?? LESSON,
    confidence: 0.5,
    observed_at: "2026-09-10T10:05:00.000Z",
    evidence
  });
  if (overrides.candidateOnly) return candidate as LearningObjectV1;
  return approveLearningCandidateV1(candidate as LearningObjectV1, {
    reviewer_id: `reviewer:${n}`,
    reviewed_at: "2026-09-11T10:00:00.000Z",
    decision: "APPROVE"
  }) as LearningObjectV1;
}

test("projects a reviewed pricing outcome into recurring review without creating causal or action authority", () => {
  const value = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1),
    learningObject: reviewedLesson(1),
    generatedAt: GENERATED_AT
  });

  assert.equal(value.state, "READY");
  assert.deepEqual(value.reasonCodes, ["READY_FOR_RECURRING_REVIEW"]);
  assert.equal(value.domain, "PRICING");
  assert.equal(value.attributionClass, "CORRELATIONAL");
  assert.equal(value.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(value.observations.length, 1);
  assert.equal(value.observations[0].decision_ref, "decision:1");
  assert.equal(value.observations[0].independence_key, "lineage:1");
  assert.equal(value.actionAuthority.persistenceAuthorized, false);
  assert.equal(value.actionAuthority.policyPromotionAuthorized, false);
  assert.equal(value.actionAuthority.capabilityPromotionAuthorized, false);
  assert.equal(value.actionAuthority.pricingChangeAuthorized, false);
  assert.equal(value.actionAuthority.negotiationActionAuthorized, false);
  assert.equal(value.actionAuthority.externalActionAuthorized, false);
  assert.equal("confidence" in value, false);
  assert.equal("monetaryValue" in value, false);
});

test("two independent canonical decision outcomes can reach recurring review but still cannot become a rule", () => {
  const first = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1, "NEGOTIATION"),
    learningObject: reviewedLesson(1),
    generatedAt: GENERATED_AT
  });
  const second = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(2, "NEGOTIATION"),
    learningObject: reviewedLesson(2),
    generatedAt: GENERATED_AT
  });

  assert.equal(first.state, "READY");
  assert.equal(second.state, "READY");
  const review = evaluateRecurringDecisionLessonV1({
    domain: "NEGOTIATION",
    pattern_key: "documented-commercial-boundary",
    evaluated_at: GENERATED_AT,
    observations: [...first.observations, ...second.observations]
  });

  assert.equal(review.state, "REVIEW_CANDIDATE");
  assert.equal(review.causal_interpretation, "NOT_ESTABLISHED");
  assert.equal(review.policy_promotion_allowed, false);
  assert.equal(review.pricing_change_allowed, false);
  assert.equal(review.negotiation_action_allowed, false);
  assert.equal(review.external_action_allowed, false);
  assert.equal(review.persistence_authority, false);
  assert.deepEqual(review.decision_refs, ["decision:1", "decision:2"]);
});

test("does not manufacture a recurring domain for unsupported decision classes", () => {
  const value = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1, "EXPERIMENT"),
    learningObject: reviewedLesson(1),
    generatedAt: GENERATED_AT
  });

  assert.equal(value.state, "NOT_APPLICABLE");
  assert.equal(value.domain, null);
  assert.deepEqual(value.reasonCodes, ["UNSUPPORTED_DECISION_CLASS"]);
  assert.deepEqual(value.observations, []);
});

test("waits for a canonical outcome instead of treating a decision as learned", () => {
  const value = compileDecisionMemoryRecurringLearningHandoffV1({
    record: compileDecisionMemoryV1(decisionInput(1)),
    learningObject: reviewedLesson(1),
    generatedAt: GENERATED_AT
  });

  assert.equal(value.state, "WAIT_FOR_OUTCOME");
  assert.deepEqual(value.reasonCodes, ["OUTCOME_NOT_OBSERVED"]);
  assert.deepEqual(value.observations, []);
});

test("fails closed on unreviewed, inferred, or mismatched lessons", () => {
  const cases: Array<[LearningObjectV1, DecisionMemoryRecurringLearningReasonV1]> = [
    [reviewedLesson(1, { candidateOnly: true }), "LEARNING_OBJECT_NOT_REVIEWED"],
    [reviewedLesson(1, { truthState: "INFERRED" }), "LEARNING_OBJECT_NOT_KNOWN"],
    [reviewedLesson(1, { content: "A different lesson." }), "LESSON_STATEMENT_MISMATCH"]
  ];

  for (const [learningObject, expectedReason] of cases) {
    const value = compileDecisionMemoryRecurringLearningHandoffV1({
      record: decisionRecord(1),
      learningObject,
      generatedAt: GENERATED_AT
    });
    assert.equal(value.state, "VERIFY_RECORD");
    assert.ok(value.reasonCodes.includes(expectedReason));
    assert.deepEqual(value.observations, []);
  }
});

test("requires observed action, outcome assessment, and exact evidence lineage", () => {
  const actionNotTaken = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1, "PRICING", { actionState: "DEFERRED", actionEvidenceRefs: [] }),
    learningObject: reviewedLesson(1),
    generatedAt: GENERATED_AT
  });
  assert.equal(actionNotTaken.state, "VERIFY_RECORD");
  assert.ok(actionNotTaken.reasonCodes.includes("ACTION_NOT_OBSERVED"));
  assert.ok(actionNotTaken.reasonCodes.includes("ACTION_EVIDENCE_MISSING"));

  const inconclusive = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1, "PRICING", {}, {
      assessment: {
        state: "KNOWN",
        value: "INCONCLUSIVE",
        evidenceRefs: ["evidence:assessment:1"]
      }
    }),
    learningObject: reviewedLesson(1),
    generatedAt: GENERATED_AT
  });
  assert.equal(inconclusive.state, "VERIFY_RECORD");
  assert.ok(inconclusive.reasonCodes.includes("OUTCOME_INCONCLUSIVE"));

  const missingLessonEvidence = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1),
    learningObject: reviewedLesson(1, { includeLesson: false }),
    generatedAt: GENERATED_AT
  });
  assert.equal(missingLessonEvidence.state, "VERIFY_RECORD");
  assert.ok(missingLessonEvidence.reasonCodes.includes("LESSON_EVIDENCE_GAP"));
  assert.ok(missingLessonEvidence.reasonCodes.includes("LESSON_LINEAGE_NOT_PROVEN"));

  const missingOutcomeEvidence = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1),
    learningObject: reviewedLesson(1, { includeAssessment: false }),
    generatedAt: GENERATED_AT
  });
  assert.equal(missingOutcomeEvidence.state, "VERIFY_RECORD");
  assert.ok(missingOutcomeEvidence.reasonCodes.includes("OUTCOME_EVIDENCE_GAP"));

  const missingActionEvidence = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1),
    learningObject: reviewedLesson(1, { includeAction: false }),
    generatedAt: GENERATED_AT
  });
  assert.equal(missingActionEvidence.state, "VERIFY_RECORD");
  assert.ok(missingActionEvidence.reasonCodes.includes("ACTION_EVIDENCE_GAP"));
});

test("future evidence and decision-memory integrity flags fail closed", () => {
  const futureEvidence = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1),
    learningObject: reviewedLesson(1, { evidenceObservedAt: "2027-01-01T00:00:00.000Z" }),
    generatedAt: GENERATED_AT
  });
  assert.equal(futureEvidence.state, "VERIFY_RECORD");
  assert.ok(futureEvidence.reasonCodes.includes("INVALID_CHRONOLOGY"));

  const integrity = compileDecisionMemoryRecurringLearningHandoffV1({
    record: decisionRecord(1, "PRICING", {
      rationale: { state: "UNKNOWN", value: null, evidenceRefs: [] }
    }),
    learningObject: reviewedLesson(1),
    generatedAt: GENERATED_AT
  });
  assert.equal(integrity.state, "VERIFY_RECORD");
  assert.deepEqual(integrity.reasonCodes, ["DECISION_INTEGRITY_FLAGS"]);
});

test("handoff is deterministic and immutable without mutating source records", () => {
  const record = decisionRecord(1);
  const learningObject = reviewedLesson(1);
  const recordBefore = structuredClone(record);
  const learningBefore = structuredClone(learningObject);

  const first = compileDecisionMemoryRecurringLearningHandoffV1({
    record,
    learningObject,
    generatedAt: GENERATED_AT
  });
  const second = compileDecisionMemoryRecurringLearningHandoffV1({
    record,
    learningObject,
    generatedAt: GENERATED_AT
  });

  assert.deepEqual(first, second);
  assert.deepEqual(record, recordBefore);
  assert.deepEqual(learningObject, learningBefore);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.observations));
  assert.ok(Object.isFrozen(first.observations[0]));
  assert.throws(() =>
    (first.observations as RecurringLessonObservationV1[]).push(first.observations[0])
  );
});
