import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCompanyBrainChiefOfStaffBriefV1,
  type CompanyBrainChiefOfStaffBriefInputV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-chief-of-staff-brief-v1";
import {
  COMPANY_BRAIN_DECISION_HISTORY_BRIEF_POLICY_VERSION_V1,
  COMPANY_BRAIN_DECISION_HISTORY_BRIEF_VERSION_V1,
  type CompanyBrainDecisionHistoryBriefV1,
  type CompanyBrainDecisionHistoryItemV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-decision-history-brief-v1";
import {
  COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_POLICY_VERSION_V1,
  COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_VERSION_V1,
  type CompanyBrainRecurringLessonItemV1,
  type CompanyBrainRecurringLessonsBriefV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-recurring-lessons-brief-v1";
import {
  DECISION_MEASUREMENT_ATTENTION_BRIEF_VERSION_V1,
  DECISION_MEASUREMENT_ATTENTION_POLICY_VERSION_V1,
  type DecisionMeasurementAttentionBriefV1,
  type DecisionMeasurementAttentionItemV1
} from "../../../src/lib/intelligence/organizational-learning/decision-measurement-attention-brief-v1";

const oneHour = 60 * 60 * 1000;
const sourceGeneratedAt = "2026-09-19T00:20:00.000Z";

function decisionItem(
  decisionId: string,
  safeNextStep: CompanyBrainDecisionHistoryItemV1["safeNextStep"],
  decisionClass: CompanyBrainDecisionHistoryItemV1["decisionClass"] = "STRATEGY"
): CompanyBrainDecisionHistoryItemV1 {
  const observed = safeNextStep === "REVIEW_OBSERVED_OUTCOME";
  return {
    sourceBriefId: `decision-memory-brief:${decisionId}`,
    decisionId,
    decisionClass,
    decidedAt: "2026-09-18T18:00:00.000Z",
    sourceGeneratedAt: "2026-09-19T00:15:00.000Z",
    sourceAgeMs: 5 * 60 * 1000,
    sourceState: safeNextStep === "REVIEW_DECISION_REVISIT" ? "REVIEW_REQUIRED" : "READY",
    lineageState: "NO_PRIOR",
    freshnessState: safeNextStep === "REVIEW_DECISION_REVISIT" ? "EXPIRED" : "CURRENT",
    selectedAlternativeId: "alt:documented",
    selectedAlternativeLabel: "Use documented evidence",
    rationale: {
      state: "KNOWN",
      value: "Use the documented evidence while preserving reversibility.",
      evidenceRefs: [`evidence:rationale:${decisionId}`]
    },
    sourceConfidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: [`evidence:confidence:${decisionId}`]
    },
    approvalState: "APPROVED",
    actionState: observed ? "TAKEN" : "PLANNED",
    outcomeState: observed ? "OBSERVED" : "NOT_OBSERVED",
    outcomeObservedAt: observed ? "2026-09-19T00:00:00.000Z" : null,
    outcomeAssessment: observed
      ? {
          state: "KNOWN",
          value: "POSITIVE",
          evidenceRefs: [`evidence:outcome:${decisionId}`]
        }
      : null,
    recordedAttributionClass: observed ? "CORRELATIONAL" : "UNKNOWN",
    confounderCount: observed ? 1 : 0,
    changesSincePrior: [],
    revisitSignals: safeNextStep === "REVIEW_DECISION_REVISIT"
      ? [{
          kind: "MATERIAL_ASSUMPTION",
          ref: "assumption:budget",
          text: "Revisit when documented budget evidence changes.",
          truthState: "KNOWN",
          evidenceRefs: ["evidence:budget"]
        }]
      : [],
    provenanceRefs: [`evidence:${decisionId}`, `source:${decisionId}`],
    integrityFlags: [],
    safeNextStep,
    causalInterpretation: "NOT_ESTABLISHED",
    monetaryValue: null
  };
}

function decisionHistory(
  overrides: Partial<CompanyBrainDecisionHistoryBriefV1> = {}
): CompanyBrainDecisionHistoryBriefV1 {
  const outcome = decisionItem("decision:strategy-1", "REVIEW_OBSERVED_OUTCOME");
  const revisit = decisionItem("decision:pricing-1", "REVIEW_DECISION_REVISIT", "PRICING");
  const timeline = [outcome, revisit];
  return {
    contractVersion: COMPANY_BRAIN_DECISION_HISTORY_BRIEF_VERSION_V1,
    policyVersion: COMPANY_BRAIN_DECISION_HISTORY_BRIEF_POLICY_VERSION_V1,
    briefId: "company-brain-decision-history:test",
    state: "READY",
    generatedAt: sourceGeneratedAt,
    maximumSourceAgeMs: oneHour,
    verificationReasons: [],
    rejectedDecisionIds: [],
    timeline,
    verificationRequired: [],
    revisitRequired: [revisit],
    outcomeReviewReady: [outcome],
    waitingOutcome: [],
    summary: {
      supplied: 2,
      accepted: 2,
      rejected: 0,
      verificationRequired: 0,
      revisitRequired: 1,
      outcomeReviewReady: 1,
      waitingOutcome: 0,
      observedOutcomes: 1,
      lineageChangeEvents: 0
    },
    evidenceRefs: [
      "evidence:decision:pricing-1",
      "evidence:decision:strategy-1",
      "source:decision:pricing-1",
      "source:decision:strategy-1"
    ],
    sourceDecisionIds: ["decision:pricing-1", "decision:strategy-1"],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    limitations: ["Canonical source limitation."],
    authority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      decisionMutationAuthorized: false,
      learningPromotionAuthorized: false,
      policyPromotionAuthorized: false,
      reallocationAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationActionAuthorized: false,
      campaignExecutionAuthorized: false,
      experimentExecutionAuthorized: false,
      externalActionAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function recurringItem(
  sourceId: string,
  lane: CompanyBrainRecurringLessonItemV1["lane"],
  domain: NonNullable<CompanyBrainRecurringLessonItemV1["domain"]>
): CompanyBrainRecurringLessonItemV1 {
  return {
    sourceId,
    evaluatedAt: "2026-09-19T00:12:00.000Z",
    sourceAgeMs: 8 * 60 * 1000,
    lane,
    sourceState: lane === "REVIEW_RECURRING_LESSON"
      ? "REVIEW_CANDIDATE"
      : lane === "GATHER_MORE_INDEPENDENT_EVIDENCE"
        ? "INSUFFICIENT_INDEPENDENT_EVIDENCE"
        : "NEEDS_VERIFICATION",
    sourceReasonCode: lane === "REVIEW_RECURRING_LESSON"
      ? "REPEATED_APPROVED_LESSON"
      : lane === "GATHER_MORE_INDEPENDENT_EVIDENCE"
        ? "TOO_FEW_INDEPENDENT_OBSERVATIONS"
        : "UNSAFE_SOURCE_LESSON",
    domain,
    patternKey: `pattern:${sourceId}`,
    lessonTitle: `Lesson ${sourceId}`,
    lessonContent: "Review the repeated observed pattern without promoting it to policy.",
    sourceLearningIds: [`learning:${sourceId}:1`, `learning:${sourceId}:2`],
    decisionRefs: [`decision:${sourceId}:1`, `decision:${sourceId}:2`],
    outcomeRefs: [`outcome:${sourceId}:1`, `outcome:${sourceId}:2`],
    evidenceRefs: [`evidence:${sourceId}:1`, `evidence:${sourceId}:2`],
    sourceLineageIds: [`lineage:${sourceId}:1`, `lineage:${sourceId}:2`],
    duplicateObservationIds: [],
    verificationReasons: lane === "REVIEW_RECURRING_LESSON" ? [] : ["MORE_EVIDENCE_REQUIRED"],
    independentDecisionCount: 2,
    independentOutcomeCount: 2,
    independentSourceLineageCount: 2,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  };
}

function recurringLessons(
  overrides: Partial<CompanyBrainRecurringLessonsBriefV1> = {}
): CompanyBrainRecurringLessonsBriefV1 {
  const pricing = recurringItem("pricing", "REVIEW_RECURRING_LESSON", "PRICING");
  const evidenceNeeded = recurringItem(
    "campaign",
    "GATHER_MORE_INDEPENDENT_EVIDENCE",
    "CAMPAIGN"
  );
  const all = [pricing, evidenceNeeded];
  return {
    contractVersion: COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_VERSION_V1,
    policyVersion: COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_POLICY_VERSION_V1,
    briefId: "company-brain-recurring-lessons:test",
    state: "READY",
    generatedAt: sourceGeneratedAt,
    maximumSourceAgeMs: oneHour,
    reviewCandidates: [pricing],
    evidenceNeeded: [evidenceNeeded],
    verificationRequired: [],
    rejectedSourceIds: [],
    sourceVerificationReasons: [],
    summary: {
      supplied: 2,
      accepted: 2,
      rejected: 0,
      reviewCandidates: 1,
      evidenceNeeded: 1,
      verificationRequired: 0,
      pricingPatternsForReview: 1,
      negotiationPatternsForReview: 0
    },
    evidenceRefs: [...new Set(all.flatMap((item) => item.evidenceRefs))].sort(),
    sourceLineageIds: [...new Set(all.flatMap((item) => item.sourceLineageIds))].sort(),
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    limitations: ["Canonical source limitation."],
    authority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      lessonPromotionAuthorized: false,
      policyPromotionAuthorized: false,
      capabilityPromotionAuthorized: false,
      portfolioReallocationAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationActionAuthorized: false,
      campaignExecutionAuthorized: false,
      experimentExecutionAuthorized: false,
      externalActionAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function measurementItem(
  decisionId: string,
  measurementState: DecisionMeasurementAttentionItemV1["measurementState"]
): DecisionMeasurementAttentionItemV1 {
  const nextStep: DecisionMeasurementAttentionItemV1["safeNextStep"] =
    measurementState === "DUE" || measurementState === "OVERDUE"
      ? "PREPARE_MEASUREMENT_EVIDENCE_REVIEW"
      : measurementState === "VERIFY_RECORD"
        ? "VERIFY_DECISION_RECORD"
        : measurementState === "NO_MEASUREMENT_PLAN"
          ? "REVIEW_MEASUREMENT_PLAN"
          : measurementState === "WAITING_WINDOW"
            ? "WAIT_FOR_RECORDED_MEASUREMENT_WINDOW"
            : measurementState === "WAITING_ACTION"
              ? "WAIT_FOR_ACTION_EVIDENCE"
              : "NO_MEASUREMENT_COVERAGE_ACTION";
  return {
    decisionId,
    decisionClass: "STRATEGY",
    measurementState,
    reasonCodes: [`reason:${measurementState}`],
    pendingOutcomeIds: measurementState === "COMPLETE" || measurementState === "NO_MEASUREMENT_PLAN"
      ? []
      : [`outcome:${decisionId}`],
    overdueOutcomeIds: measurementState === "OVERDUE" ? [`outcome:${decisionId}`] : [],
    nextMeasurementAt: measurementState === "DUE" || measurementState === "OVERDUE"
      ? "2026-09-19T00:10:00.000Z"
      : measurementState === "WAITING_WINDOW"
        ? "2026-09-19T00:40:00.000Z"
        : null,
    evidenceRefs: [`evidence:${decisionId}`],
    sourceRefs: [`source:${decisionId}`],
    safeNextStep: nextStep,
    causalInterpretation: "NOT_ESTABLISHED",
    outcomeInterpretation: "MEASUREMENT_COVERAGE_ONLY",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  };
}

function measurementAttention(
  overrides: Partial<DecisionMeasurementAttentionBriefV1> = {}
): DecisionMeasurementAttentionBriefV1 {
  const due = measurementItem("decision:due", "DUE");
  const verify = measurementItem("decision:verify", "VERIFY_RECORD");
  const noPlan = measurementItem("decision:no-plan", "NO_MEASUREMENT_PLAN");
  const waitingWindow = measurementItem("decision:waiting-window", "WAITING_WINDOW");
  const waitingAction = measurementItem("decision:waiting-action", "WAITING_ACTION");
  const complete = measurementItem("decision:complete", "COMPLETE");
  return {
    contractVersion: DECISION_MEASUREMENT_ATTENTION_BRIEF_VERSION_V1,
    policyVersion: DECISION_MEASUREMENT_ATTENTION_POLICY_VERSION_V1,
    briefId: "decision-measurement-attention:test",
    state: "READY",
    compiledAt: sourceGeneratedAt,
    sourceGeneratedAt: "2026-09-19T00:10:00.000Z",
    sourceAgeMs: 10 * 60 * 1000,
    verificationReasons: [],
    measurementNow: [due],
    verificationRequired: [verify],
    measurementPlanMissing: [noPlan],
    waitingWindow: [waitingWindow],
    waitingAction: [waitingAction],
    coverageComplete: [complete],
    summary: {
      total: 6,
      measurementNow: 1,
      overdue: 0,
      due: 1,
      verificationRequired: 1,
      measurementPlanMissing: 1,
      waitingWindow: 1,
      waitingAction: 1,
      coverageComplete: 1
    },
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: ["Canonical source limitation."],
    authority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      measurementExecutionAuthorized: false,
      evidenceCollectionAuthorized: false,
      decisionMutationAuthorized: false,
      portfolioMutationAuthorized: false,
      reallocationAuthorized: false,
      policyPromotionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationActionAuthorized: false,
      campaignExecutionAuthorized: false,
      experimentExecutionAuthorized: false,
      externalActionAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
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

test("composes durable memory, recurring learning, and measurement attention without inventing priority", () => {
  const result = compileCompanyBrainChiefOfStaffBriefV1(input());

  assert.equal(result.state, "READY");
  assert.deepEqual(result.verificationReasons, []);
  assert.deepEqual(result.summary, {
    attentionItems: 7,
    verification: 1,
    decisionRevisit: 1,
    outcomeReview: 1,
    measurementNow: 1,
    measurementOverdue: 0,
    measurementDue: 1,
    measurementPlanReview: 1,
    recurringLessonReview: 1,
    recurringEvidenceNeeded: 1,
    pricingPatternsForReview: 1,
    negotiationPatternsForReview: 0,
    decisionsWaitingForOutcome: 0,
    measurementsWaitingForWindow: 1,
    measurementsWaitingForAction: 1,
    measurementCoverageComplete: 1
  });
  assert.equal(result.decisionRevisit[0]?.decisionId, "decision:pricing-1");
  assert.equal(result.outcomeReview[0]?.decisionId, "decision:strategy-1");
  assert.equal(result.measurementNow[0]?.decisionId, "decision:due");
  assert.equal(result.recurringLessonReview[0]?.domain, "PRICING");
  assert.equal(result.verification[0]?.lane, "VERIFY_DECISION_RECORD");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
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
  const canonical = recurringLessons();
  const widened = {
    ...structuredClone(canonical),
    authority: {
      ...structuredClone(canonical.authority),
      pricingChangeAuthorized: true
    }
  } as unknown as CompanyBrainRecurringLessonsBriefV1;

  const result = compileCompanyBrainChiefOfStaffBriefV1(input({ recurringLessons: widened }));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.verificationReasons.includes("RECURRING_LESSONS_AUTHORITY_WIDENED"));
  assert.equal(result.sourceHealth.find((item) => item.sourceKind === "RECURRING_LESSONS")?.accepted, false);
  assert.equal(result.recurringLessonReview.length, 0);
  assert.equal(result.recurringEvidenceNeeded.length, 0);
  assert.equal(result.outcomeReview.length, 1);
  assert.equal(result.measurementNow.length, 1);
  assert.equal(result.summary.pricingPatternsForReview, 0);
});

test("rejects tampered summaries and stale sources instead of laundering them into chief-of-staff truth", () => {
  const canonicalHistory = decisionHistory();
  const tamperedHistory = {
    ...structuredClone(canonicalHistory),
    summary: {
      ...structuredClone(canonicalHistory.summary),
      outcomeReviewReady: 99
    }
  } as unknown as CompanyBrainDecisionHistoryBriefV1;

  const tampered = compileCompanyBrainChiefOfStaffBriefV1(input({
    decisionHistory: tamperedHistory
  }));
  assert.equal(tampered.state, "VERIFY_SOURCE");
  assert.ok(tampered.verificationReasons.includes("DECISION_HISTORY_SUMMARY_MISMATCH"));
  assert.equal(tampered.outcomeReview.length, 0);
  assert.equal(tampered.recurringLessonReview.length, 1);

  const staleHistory = decisionHistory({ generatedAt: "2026-09-18T22:00:00.000Z" });
  const stale = compileCompanyBrainChiefOfStaffBriefV1(input({ decisionHistory: staleHistory }));
  assert.equal(stale.state, "VERIFY_SOURCE");
  assert.ok(stale.verificationReasons.includes("DECISION_HISTORY_SOURCE_STALE"));
  assert.equal(stale.outcomeReview.length, 0);
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
  assert.ok(first.evidenceRefs.includes("evidence:decision:strategy-1"));
  assert.ok(first.sourceRefs.includes("lineage:pricing:1"));
});
