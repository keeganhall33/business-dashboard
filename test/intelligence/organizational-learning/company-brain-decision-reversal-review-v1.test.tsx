import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryRecordV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  reviewCompanyBrainDecisionReversalV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-decision-reversal-review-v1";

const DECIDED_AT = "2026-09-15T12:00:00.000Z";
const OBSERVED_AT = "2026-09-18T12:00:00.000Z";
const REVIEWED_AT = "2026-09-19T12:00:00.000Z";

function record(actionState: DecisionMemoryRecordV1["actionState"] = "REVERSED") {
  return compileDecisionMemoryV1({
    decisionId: "decision:campaign-alpha",
    decisionClass: "CAMPAIGN",
    decidedAt: DECIDED_AT,
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: "Choose whether to proceed with campaign alpha.",
      evidenceRefs: ["evidence:decision:context"]
    },
    selectedAlternativeId: "launch",
    alternatives: [
      {
        alternativeId: "launch",
        label: "Launch",
        description: {
          state: "KNOWN",
          value: "Launch the bounded campaign.",
          evidenceRefs: ["evidence:alternative:launch"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "The bounded campaign preserved optionality while testing the channel.",
      evidenceRefs: ["evidence:decision:rationale"]
    },
    assumptions: [],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:decision:confidence"]
    },
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: null,
    approval: {
      authorityClass: "NONE",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState,
    actionEvidenceRefs: ["evidence:decision:action-state"],
    supersedesDecisionId: null,
    sourceRefs: ["source:decision:campaign-alpha"]
  });
}

function withOutcome(source: DecisionMemoryRecordV1) {
  return attachDecisionOutcomeObservationV1(source, {
    observedAt: OBSERVED_AT,
    outcomes: [
      {
        outcomeId: "qualified-replies",
        metricRef: "qualified-replies",
        description: {
          state: "KNOWN",
          value: "Qualified replies observed during the recorded evaluation window.",
          evidenceRefs: ["evidence:outcome:description"]
        },
        observedRange: {
          state: "KNOWN",
          value: { min: 4, max: 6, unit: "replies" },
          evidenceRefs: ["evidence:outcome:range"]
        }
      }
    ],
    assessment: {
      state: "KNOWN",
      value: "NEGATIVE",
      evidenceRefs: ["evidence:outcome:assessment"]
    },
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: ["evidence:outcome:attribution"],
    confounders: [
      {
        confounderId: "confounder:timing",
        description: "Timing may have influenced observed response.",
        evidenceRefs: ["evidence:confounder:timing"]
      }
    ],
    assumptionAssessments: [],
    lessonCandidate: {
      statement: "Review campaign timing before considering reuse.",
      evidenceRefs: ["evidence:lesson:candidate"]
    },
    sourceRefs: ["source:outcome:campaign-alpha"]
  });
}

function run(source: DecisionMemoryRecordV1, reviewedAt = REVIEWED_AT) {
  return reviewCompanyBrainDecisionReversalV1({ record: source, reviewedAt });
}

test("surfaces an evidenced reversal without inventing when, why, failure, preference change, or a lesson", () => {
  const result = run(record());

  assert.equal(result.state, "READY_CONTEXT_ONLY");
  assert.deepEqual(result.reasonCodes, ["REVERSAL_RECORDED_WITHOUT_OUTCOME_CONTEXT"]);
  assert.equal(result.reversal.recorded, true);
  assert.deepEqual(result.reversal.actionEvidenceRefs, ["evidence:decision:action-state"]);
  assert.equal(result.reversal.occurredAt, null);
  assert.equal(result.reversal.occurredAtState, "NOT_ESTABLISHED");
  assert.equal(result.reversal.reason, null);
  assert.equal(result.reversal.reasonState, "NOT_ESTABLISHED");
  assert.equal(result.reversal.priorActionState, null);
  assert.equal(result.reversal.priorActionStateState, "NOT_ESTABLISHED");
  assert.equal(result.reversal.failureInference, "PROHIBITED");
  assert.equal(result.reversal.preferenceChangeInference, "PROHIBITED");
  assert.equal(result.outcomeContext, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.causeOfReversal, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.nextInternalStep, "REVIEW_RECORDED_REVERSAL_CONTEXT");
  assert.equal(result.authority.lessonPromotionAuthorized, false);
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("preserves a decision-grade observed outcome only as historical context", () => {
  const result = run(withOutcome(record()));

  assert.equal(result.state, "READY_WITH_OUTCOME_CONTEXT");
  assert.deepEqual(result.reasonCodes, ["REVERSAL_RECORDED_WITH_OUTCOME_CONTEXT"]);
  assert.equal(result.outcomeContext?.assessment, "NEGATIVE");
  assert.equal(result.outcomeContext?.attributionClass, "CORRELATIONAL");
  assert.equal(result.outcomeContext?.recordedLessonCandidatePresent, true);
  assert.equal(result.outcomeContext?.confounders[0]?.confounderId, "confounder:timing");
  assert.equal(result.causeOfReversal, "NOT_ESTABLISHED");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.nextInternalStep, "REVIEW_REVERSAL_WITH_OUTCOME_CONTEXT");
  assert.equal(result.authority.causalAttributionAuthorized, false);
  assert.equal(result.authority.learningPromotionAuthorized, undefined);
});

test("returns not applicable for a decision that is not recorded as reversed", () => {
  const result = run(record("TAKEN"));

  assert.equal(result.state, "NOT_APPLICABLE");
  assert.deepEqual(result.reasonCodes, ["DECISION_NOT_REVERSED"]);
  assert.equal(result.reversal.recorded, false);
  assert.equal(result.nextInternalStep, null);
});

test("requires source-backed action evidence for the recorded reversal state", () => {
  const source = record();
  const tampered = {
    ...source,
    actionEvidenceRefs: []
  } as DecisionMemoryRecordV1;

  const result = run(tampered);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("REVERSAL_ACTION_EVIDENCE_MISSING"));
  assert.equal(result.nextInternalStep, "VERIFY_DECISION_MEMORY_SOURCE");
});

test("fails closed on outcome chronology that would leak future evidence into the review", () => {
  const source = withOutcome(record());
  const futureOutcome = {
    ...source,
    outcomeObservation: source.outcomeObservation
      ? { ...source.outcomeObservation, observedAt: "2026-09-20T12:00:00.000Z" }
      : null
  } as DecisionMemoryRecordV1;

  const result = run(futureOutcome);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("OUTCOME_IN_FUTURE"));
  assert.ok(result.reasonCodes.includes("DECISION_BRIEF_VERIFY_INTEGRITY"));
  assert.equal(result.causeOfReversal, "NOT_ESTABLISHED");
});

test("does not turn an inconclusive outcome into reversal learning", () => {
  const source = withOutcome(record());
  const inconclusive = {
    ...source,
    outcomeObservation: source.outcomeObservation
      ? {
          ...source.outcomeObservation,
          assessment: {
            ...source.outcomeObservation.assessment,
            value: "INCONCLUSIVE" as const
          }
        }
      : null
  } as DecisionMemoryRecordV1;

  const result = run(inconclusive);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("OUTCOME_ASSESSMENT_NOT_DECISION_GRADE"));
  assert.equal(result.outcomeContext, null);
  assert.equal(result.inferredOutcome, null);
});

test("blocks widened source authority while preserving review authority boundaries", () => {
  const source = record();
  const widened = {
    ...source,
    actionAuthority: {
      ...source.actionAuthority,
      externalActionAuthorized: true
    }
  } as unknown as DecisionMemoryRecordV1;

  const result = run(widened);

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasonCodes.includes("DECISION_AUTHORITY_WIDENED"));
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});
