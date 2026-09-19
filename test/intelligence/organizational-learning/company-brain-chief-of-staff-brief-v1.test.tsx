import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCompanyBrainChiefOfStaffBriefV1,
  type CompanyBrainChiefOfStaffBriefInputV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-chief-of-staff-brief-v1";
import {
  compileCompanyBrainDecisionHistoryBriefV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-decision-history-brief-v1";
import {
  compileCompanyBrainRecurringLessonsBriefV1,
  type CompanyBrainRecurringLessonSourceV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-recurring-lessons-brief-v1";
import {
  compileDecisionMeasurementAttentionBriefV1
} from "../../../src/lib/intelligence/organizational-learning/decision-measurement-attention-brief-v1";
import {
  DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
  type DecisionMemoryBriefV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-brief-v1";
import {
  RECURRING_DECISION_LESSONS_VERSION,
  type RecurringDecisionLessonReviewV1
} from "../../../src/lib/intelligence/organizational-learning/recurring-decision-lessons-v1";
import type {
  DecisionMeasurementQueueItemV1,
  DecisionMeasurementQueueStateV1,
  DecisionMeasurementQueueV1
} from "../../../src/lib/intelligence/organizational-learning/decision-measurement-queue-v1";

const oneHour = 60 * 60 * 1000;

function decisionMemoryBrief(
  overrides: Partial<DecisionMemoryBriefV1> = {}
): DecisionMemoryBriefV1 {
  return {
    contractVersion: "DecisionMemoryBriefV1",
    policyVersion: DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
    briefId: "decision-memory-brief:strategy-1",
    generatedAt: "2026-09-19T00:15:00.000Z",
    state: "READY",
    lineageState: "NO_PRIOR",
    freshnessState: "CURRENT",
    decisionId: "decision:strategy-1",
    decisionClass: "STRATEGY",
    decidedAt: "2026-09-18T18:00:00.000Z",
    selectedAlternativeId: "alt:focus-a",
    selectedAlternativeLabel: "Focus on documented evidence",
    rationale: {
      state: "KNOWN",
      value: "Use the documented evidence while preserving reversibility.",
      evidenceRefs: ["evidence:rationale:strategy-1"]
    },
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:confidence:strategy-1"]
    },
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T18:00:00.000Z",
      evidenceRefs: ["evidence:approval:strategy-1"]
    },
    actionState: "TAKEN",
    outcome: {
      state: "OBSERVED",
      observedAt: "2026-09-19T00:00:00.000Z",
      assessment: {
        state: "KNOWN",
        value: "POSITIVE",
        evidenceRefs: ["evidence:outcome:strategy-1"]
      },
      attributionClass: "CORRELATIONAL",
      attributionEvidenceRefs: ["evidence:attribution:strategy-1"],
      confounderCount: 1,
      lessonCandidateReviewRequired: true,
      causalityClaimedByBrief: false
    },
    changesSincePrior: [],
    revisitSignals: [],
    provenanceRefs: [
      "evidence:approval:strategy-1",
      "evidence:attribution:strategy-1",
      "evidence:confidence:strategy-1",
      "evidence:outcome:strategy-1",
      "evidence:rationale:strategy-1",
      "source:strategy:strategy-1"
    ],
    integrityFlags: [],
    limitations: ["Source brief limitation."],
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function decisionHistory() {
  const revisit = decisionMemoryBrief({
    briefId: "decision-memory-brief:pricing-1",
    decisionId: "decision:pricing-1",
    decisionClass: "PRICING",
    decidedAt: "2026-09-18T17:00:00.000Z",
    state: "REVIEW_REQUIRED",
    freshnessState: "EXPIRED",
    actionState: "PLANNED",
    outcome: {
      state: "NOT_OBSERVED",
      observedAt: null,
      assessment: null,
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    },
    revisitSignals: [{
      kind: "MATERIAL_ASSUMPTION",
      ref: "assumption:budget",
      text: "Revisit when documented budget evidence changes.",
      truthState: "KNOWN",
      evidenceRefs: ["evidence:budget"]
    }],
    provenanceRefs: ["evidence:budget", "source:decision:pricing-1"]
  });
  return compileCompanyBrainDecisionHistoryBriefV1({
    briefs: [decisionMemoryBrief(), revisit],
    generatedAt: "2026-09-19T00:20:00.000Z",
    maximumSourceAgeMs: oneHour
  });
}

function recurringReview(
  overrides: Partial<RecurringDecisionLessonReviewV1> = {}
): RecurringDecisionLessonReviewV1 {
  return {
    version: RECURRING_DECISION_LESSONS_VERSION,
    state: "REVIEW_CANDIDATE",
    reason_code: "REPEATED_APPROVED_LESSON",
    domain: "PRICING",
    pattern_key: "hold-documented-price-until-evidence-changes",
    lesson_title: "Review documented evidence before changing price",
    lesson_content: "Repeated approved lessons support reviewing documented evidence before changing price.",
    source_learning_ids: ["learning:pricing-1", "learning:pricing-2"],
    decision_refs: ["decision:pricing-1", "decision:pricing-2"],
    outcome_refs: ["outcome:pricing-1", "outcome:pricing-2"],
    evidence_refs: ["evidence:pricing-1", "evidence:pricing-2"],
    source_lineage_ids: ["source:deal-1", "source:deal-2"],
    duplicate_observation_ids: [],
    verification_reasons: [],
    causal_interpretation: "NOT_ESTABLISHED",
    review_required: true,
    policy_promotion_allowed: false,
    pricing_change_allowed: false,
    negotiation_action_allowed: false,
    external_action_allowed: false,
    persistence_authority: false,
    ...overrides
  };
}

function recurringLessons() {
  const sources: CompanyBrainRecurringLessonSourceV1[] = [
    {
      sourceId: "source-review:pricing",
      evaluatedAt: "2026-09-19T00:12:00.000Z",
      review: recurringReview()
    },
    {
      sourceId: "source-review:campaign",
      evaluatedAt: "2026-09-19T00:11:00.000Z",
      review: recurringReview({
        state: "INSUFFICIENT_INDEPENDENT_EVIDENCE",
        reason_code: "TOO_FEW_INDEPENDENT_OBSERVATIONS",
        domain: "CAMPAIGN",
        pattern_key: "campaign-format-pattern",
        lesson_title: "Campaign format needs more evidence",
        lesson_content: "The available evidence is not independently repeated yet.",
        source_learning_ids: ["learning:campaign-1"],
        decision_refs: ["decision:campaign-1"],
        outcome_refs: ["outcome:campaign-1"],
        evidence_refs: ["evidence:campaign-1"],
        source_lineage_ids: ["source:campaign-1"],
        verification_reasons: ["INSUFFICIENT_SOURCE_INDEPENDENCE"]
      })
    }
  ];
  return compileCompanyBrainRecurringLessonsBriefV1({
    sources,
    generatedAt: "2026-09-19T00:20:00.000Z",
    maximumSourceAgeMs: oneHour
  });
}

const measurementReason: Record<DecisionMeasurementQueueStateV1, string> = {
  WAITING_ACTION: "ACTION_NOT_OBSERVED",
  WAITING_WINDOW: "WINDOW_NOT_ENDED",
  DUE: "MEASUREMENT_DUE",
  OVERDUE: "MEASUREMENT_OVERDUE",
  COMPLETE: "ALL_EXPECTED_OUTCOMES_OBSERVED",
  NO_MEASUREMENT_PLAN: "NO_EXPECTED_OUTCOMES",
  VERIFY_RECORD: "DECISION_INTEGRITY_FLAGS"
};

function measurementItem(
  decisionId: string,
  state: DecisionMeasurementQueueStateV1
): DecisionMeasurementQueueItemV1 {
  const expected = state === "NO_MEASUREMENT_PLAN" ? [] : [`outcome:${decisionId}`];
  return {
    decisionId,
    decisionClass: "STRATEGY",
    state,
    reasonCodes: [measurementReason[state] as DecisionMeasurementQueueItemV1["reasonCodes"][number]],
    decidedAt: "2026-09-18T10:00:00.000Z",
    actionState: state === "WAITING_ACTION" ? "PLANNED" : "TAKEN",
    expectedOutcomeIds: expected,
    observedOutcomeIds: state === "COMPLETE" ? expected : [],
    pendingOutcomeIds: state === "COMPLETE" || state === "NO_MEASUREMENT_PLAN" ? [] : expected,
    nextMeasurementAt: state === "WAITING_WINDOW"
      ? "2026-09-19T00:40:00.000Z"
      : state === "DUE"
        ? "2026-09-19T00:10:00.000Z"
        : null,
    overdueOutcomeIds: [],
    evidenceRefs: [`evidence:${decisionId}`],
    sourceRefs: [`source:${decisionId}`],
    causalInterpretation: "NOT_ESTABLISHED",
    outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY"
  };
}

function measurementAttention() {
  const items = [
    measurementItem("decision:due", "DUE"),
    measurementItem("decision:verify", "VERIFY_RECORD"),
    measurementItem("decision:no-plan", "NO_MEASUREMENT_PLAN"),
    measurementItem("decision:waiting-window", "WAITING_WINDOW"),
    measurementItem("decision:waiting-action", "WAITING_ACTION"),
    measurementItem("decision:complete", "COMPLETE")
  ];
  const queue: DecisionMeasurementQueueV1 = {
    contractVersion: "DecisionMeasurementQueueV1",
    policyVersion: "decision_measurement_queue_v1.0.0",
    generatedAt: "2026-09-19T00:10:00.000Z",
    overdueGraceMs: 30 * 60 * 1000,
    items,
    summary: {
      total: items.length,
      waitingAction: 1,
      waitingWindow: 1,
      due: 1,
      overdue: 0,
      complete: 1,
      noMeasurementPlan: 1,
      verifyRecord: 1
    },
    limitations: ["Canonical source limitation."],
    authority: {
      persistenceAllowed: false,
      measurementExecutionAllowed: false,
      portfolioMutationAllowed: false,
      reallocationAllowed: false,
      policyPromotionAllowed: false,
      pricingChangeAllowed: false,
      negotiationActionAllowed: false,
      campaignExecutionAllowed: false,
      experimentExecutionAllowed: false,
      externalActionAllowed: false,
      approvalBypassAllowed: false
    }
  };
  return compileDecisionMeasurementAttentionBriefV1({
    queue,
    compiledAt: "2026-09-19T00:20:00.000Z",
    maximumQueueAgeMs: oneHour
  });
}

function input(
  overrides: Partial<CompanyBrainChiefOfStaffBriefInputV1> = {}
): CompanyBrainChiefOfStaffBriefInputV1 {
  return {
    decisionHistory: decisionHistory(),
    recurringLessons: recurringLessons(),
    measurementAttention: measurementAttention(),
    generatedAt: "2026-09-19T00:30:00.000Z",
    maximumSourceAgeMs: oneHour,
    ...overrides
  };
}

test("composes durable decision memory, recurring learning, and measurement attention without inventing priority", () => {
  const result = compileCompanyBrainChiefOfStaffBriefV1(input());

  assert.equal(result.state, "READY");
  assert.deepEqual(result.verificationReasons, []);
  assert.equal(result.summary.attentionItems, 7);
  assert.equal(result.summary.verification, 1);
  assert.equal(result.summary.decisionRevisit, 1);
  assert.equal(result.summary.outcomeReview, 1);
  assert.equal(result.summary.measurementNow, 1);
  assert.equal(result.summary.measurementDue, 1);
  assert.equal(result.summary.measurementOverdue, 0);
  assert.equal(result.summary.measurementPlanReview, 1);
  assert.equal(result.summary.recurringLessonReview, 1);
  assert.equal(result.summary.recurringEvidenceNeeded, 1);
  assert.equal(result.summary.pricingPatternsForReview, 1);
  assert.equal(result.summary.negotiationPatternsForReview, 0);
  assert.equal(result.summary.measurementsWaitingForWindow, 1);
  assert.equal(result.summary.measurementsWaitingForAction, 1);
  assert.equal(result.summary.measurementCoverageComplete, 1);

  assert.equal(result.decisionRevisit[0]?.decisionId, "decision:pricing-1");
  assert.equal(result.outcomeReview[0]?.decisionId, "decision:strategy-1");
  assert.equal(result.measurementNow[0]?.decisionId, "decision:due");
  assert.equal(result.recurringLessonReview[0]?.domain, "PRICING");
  assert.equal(result.recurringLessonReview[0]?.lane, "REVIEW_RECURRING_LESSON");
  assert.equal(result.recurringEvidenceNeeded[0]?.lane, "GATHER_MORE_INDEPENDENT_EVIDENCE");
  assert.equal(result.verification[0]?.lane, "VERIFY_DECISION_RECORD");

  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.analysisOnly, true);
  assert.equal(result.authority.persistenceAuthorized, false);
  assert.equal(result.authority.measurementExecutionAuthorized, false);
  assert.equal(result.authority.learningPromotionAuthorized, false);
  assert.equal(result.authority.reallocationAuthorized, false);
  assert.equal(result.authority.pricingChangeAuthorized, false);
  assert.equal(result.authority.negotiationActionAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("fails closed on widened source authority while preserving independent valid lanes", () => {
  const recurring = structuredClone(recurringLessons());
  recurring.authority.pricingChangeAuthorized = true;

  const result = compileCompanyBrainChiefOfStaffBriefV1(input({
    recurringLessons: recurring
  }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.includes("RECURRING_LESSONS_AUTHORITY_WIDENED"));
  assert.equal(result.sourceHealth.find((item) => item.sourceKind === "RECURRING_LESSONS")?.accepted, false);
  assert.equal(result.recurringLessonReview.length, 0);
  assert.equal(result.recurringEvidenceNeeded.length, 0);
  assert.equal(result.outcomeReview.length, 1);
  assert.equal(result.measurementNow.length, 1);
  assert.equal(result.summary.pricingPatternsForReview, 0);
});

test("rejects stale and tampered source summaries instead of laundering them into chief-of-staff truth", () => {
  const history = structuredClone(decisionHistory());
  history.summary.outcomeReviewReady = 99;
  const measurement = measurementAttention();

  const result = compileCompanyBrainChiefOfStaffBriefV1({
    decisionHistory: history,
    recurringLessons: recurringLessons(),
    measurementAttention: measurement,
    generatedAt: "2026-09-19T02:00:00.000Z",
    maximumSourceAgeMs: 30 * 60 * 1000
  });

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.includes("DECISION_HISTORY_SOURCE_STALE"));
  assert.ok(result.verificationReasons.includes("DECISION_HISTORY_SUMMARY_MISMATCH"));
  assert.ok(result.verificationReasons.includes("RECURRING_LESSONS_SOURCE_STALE"));
  assert.ok(result.verificationReasons.includes("MEASUREMENT_ATTENTION_SOURCE_STALE"));
  assert.equal(result.summary.attentionItems, 0);
  assert.equal(result.summary.measurementDue, 0);
  assert.equal(result.summary.pricingPatternsForReview, 0);
});

test("is deterministic, deeply immutable, and preserves caller-owned source briefs", () => {
  const value = input();
  const before = structuredClone(value);
  const first = compileCompanyBrainChiefOfStaffBriefV1(value);
  const second = compileCompanyBrainChiefOfStaffBriefV1(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.summary));
  assert.ok(Object.isFrozen(first.recurringLessonReview));
  assert.ok(Object.isFrozen(first.recurringLessonReview[0]));
  assert.ok(first.evidenceRefs.includes("evidence:outcome:strategy-1"));
  assert.ok(first.sourceRefs.includes("source:deal-1"));
});
