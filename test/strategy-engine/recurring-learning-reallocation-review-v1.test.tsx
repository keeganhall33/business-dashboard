import assert from "node:assert/strict";
import test from "node:test";

import type { RecurringDecisionLessonReviewV1 } from "@/lib/intelligence/organizational-learning/recurring-decision-lessons-v1";
import type { DecisionPortfolioV1 } from "@/lib/strategy-engine/decision-portfolio-v1";
import {
  reviewRecurringLearningForReallocationV1,
  type RecurringLearningReallocationInputV1
} from "@/lib/strategy-engine/recurring-learning-reallocation-review-v1";

const GENERATED_AT = "2026-09-18T16:00:00.000Z";
const REVIEWED_AT = "2026-09-18T17:00:00.000Z";
const SOURCE_OBSERVED_AT = "2026-09-18T16:30:00.000Z";
const LINK_EVIDENCE = "evidence:pattern-link";

function portfolio(overrides: Partial<DecisionPortfolioV1> = {}): DecisionPortfolioV1 {
  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt: GENERATED_AT,
    portfolioId: "portfolio:current",
    items: [
      {
        candidate: {
          id: "candidate:campaign",
          title: "Campaign allocation candidate",
          candidateType: "CAMPAIGN",
          owner: "JEEVES",
          approvalClass: "KEEGAN",
          evidenceState: "KNOWN",
          evidenceRefs: [LINK_EVIDENCE, "evidence:candidate-current"],
          sourceRefs: ["source:campaign-plan"],
          monetaryCase: null,
          value: {
            strategicFit: 80,
            compoundingAdvantage: 70,
            relationshipAccess: 40,
            futureOptions: 70,
            learningValue: 85,
            urgency: 50,
            reversibility: 90
          },
          risk: { execution: 20, reputation: 10, rights: 10 },
          resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 4, cashCents: 0 },
          dependencyIds: [],
          conflictKeys: [],
          blockers: [],
          informationGainAction: null,
          safeNextStep: "Prepare an internal evidence review.",
          successMetric: "Observed campaign outcome criterion",
          evaluationWindow: {
            start: "2026-09-01T00:00:00.000Z",
            end: "2026-10-01T00:00:00.000Z"
          }
        },
        disposition: "SELECTED",
        score: {
          monetaryExpectedCents: null,
          monetaryScore: 0,
          strategicScore: 75,
          riskPenalty: 10,
          totalScore: 65,
          components: {}
        },
        rank: 1,
        rationale: "Canonical portfolio rationale",
        exclusionReason: null,
        displacedBy: []
      }
    ],
    selectedIds: ["candidate:campaign"],
    ownerQueues: { KEEGAN: [], IOANA: [], JEEVES: ["candidate:campaign"] },
    keeganDecisionIds: ["candidate:campaign"],
    informationGainIds: [],
    usedCapacity: { keeganHours: 1, ioanaHours: 0, jeevesHours: 4, cashCents: 0 },
    remainingCapacity: { keeganHours: 4, ioanaHours: 4, jeevesHours: 12, cashCents: 0 },
    evidenceRefs: ["evidence:portfolio"],
    sourceRefs: ["source:portfolio"],
    audit: {
      candidatesConsidered: 1,
      feasiblePortfoliosEvaluated: 1,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true
    },
    ...overrides
  };
}

function recurringReview(overrides: Partial<RecurringDecisionLessonReviewV1> = {}): RecurringDecisionLessonReviewV1 {
  return {
    version: "RECURRING_DECISION_LESSONS_V1",
    state: "REVIEW_CANDIDATE",
    reason_code: "REPEATED_APPROVED_LESSON",
    domain: "CAMPAIGN",
    pattern_key: "campaign:predeclare-success-rule",
    lesson_title: "Predeclare campaign success criteria",
    lesson_content: "Campaign tests were more decision-useful when the success rule was fixed before execution.",
    source_learning_ids: ["learning:1", "learning:2"],
    decision_refs: ["decision:1", "decision:2"],
    outcome_refs: ["outcome:1", "outcome:2"],
    evidence_refs: [LINK_EVIDENCE, "evidence:lesson-1", "evidence:lesson-2"],
    source_lineage_ids: ["lineage:1", "lineage:2"],
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

function validInput(overrides: Partial<RecurringLearningReallocationInputV1> = {}): RecurringLearningReallocationInputV1 {
  return {
    portfolio: portfolio(),
    sourceReview: {
      review: recurringReview(),
      observedAt: SOURCE_OBSERVED_AT,
      evidenceRefs: ["evidence:review-observed"]
    },
    targetLink: {
      candidateId: "candidate:campaign",
      domain: "CAMPAIGN",
      patternKey: "campaign:predeclare-success-rule",
      evidenceRefs: [LINK_EVIDENCE]
    },
    reviewedAt: REVIEWED_AT,
    ...overrides
  };
}

test("repeated reviewed learning becomes only a bounded reallocation review handoff", () => {
  const result = reviewRecurringLearningForReallocationV1(validInput());

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.deepEqual(result.reasonCodes, ["REPEATED_LEARNING_READY_FOR_REALLOCATION_REVIEW"]);
  assert.equal(result.previousDisposition, "SELECTED");
  assert.equal(result.nextInternalStep, "REASSESS_CANONICAL_CANDIDATE_EVIDENCE");
  assert.equal(result.observedDecisionCount, 2);
  assert.equal(result.observedOutcomeCount, 2);
  assert.equal(result.independentLineageCount, 2);
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.outcomePrediction, null);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.deepEqual(result.authority, {
    analysisOnly: true,
    portfolioMutationAuthorized: false,
    allocationChangeAuthorized: false,
    scoreMutationAuthorized: false,
    confidenceMutationAuthorized: false,
    monetaryMutationAuthorized: false,
    policyPromotionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationActionAuthorized: false,
    experimentExecutionAuthorized: false,
    externalActionAuthorized: false,
    persistenceAuthorized: false,
    approvalBypassAuthorized: false
  });
});

test("one underpowered recurring review cannot trigger reallocation attention", () => {
  const result = reviewRecurringLearningForReallocationV1(validInput({
    sourceReview: {
      review: recurringReview({
        state: "INSUFFICIENT_INDEPENDENT_EVIDENCE",
        reason_code: "TOO_FEW_INDEPENDENT_OBSERVATIONS"
      }),
      observedAt: SOURCE_OBSERVED_AT,
      evidenceRefs: ["evidence:review-observed"]
    }
  }));

  assert.equal(result.state, "NO_ACTION");
  assert.deepEqual(result.reasonCodes, ["INSUFFICIENT_RECURRING_EVIDENCE"]);
  assert.equal(result.nextInternalStep, null);
});

test("conflicted recurring learning fails closed to verification", () => {
  const result = reviewRecurringLearningForReallocationV1(validInput({
    sourceReview: {
      review: recurringReview({
        state: "CONFLICTED",
        reason_code: "MATERIAL_STATEMENT_CONFLICT"
      }),
      observedAt: SOURCE_OBSERVED_AT,
      evidenceRefs: ["evidence:review-observed"]
    }
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("SOURCE_REVIEW_CONFLICTED"));
  assert.equal(result.nextInternalStep, null);
});

test("target mapping must match the exact reviewed domain and pattern", () => {
  const result = reviewRecurringLearningForReallocationV1(validInput({
    targetLink: {
      candidateId: "candidate:campaign",
      domain: "STRATEGY",
      patternKey: "strategy:other-pattern",
      evidenceRefs: [LINK_EVIDENCE]
    }
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("TARGET_LINK_MISMATCH"));
});

test("target-link evidence must be shared by both current candidate and recurring lesson", () => {
  const result = reviewRecurringLearningForReallocationV1(validInput({
    targetLink: {
      candidateId: "candidate:campaign",
      domain: "CAMPAIGN",
      patternKey: "campaign:predeclare-success-rule",
      evidenceRefs: ["evidence:unshared-link"]
    }
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("TARGET_LINK_EVIDENCE_NOT_SHARED"));
});

test("stale source review cannot be reused as current portfolio guidance", () => {
  const result = reviewRecurringLearningForReallocationV1(validInput({
    sourceReview: {
      review: recurringReview(),
      observedAt: "2026-06-01T00:00:00.000Z",
      evidenceRefs: ["evidence:review-observed"]
    },
    maximumSourceReviewAgeMs: 7 * 24 * 60 * 60 * 1000
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("SOURCE_REVIEW_STALE"));
});

test("upstream authority drift is rejected instead of inheriting consequential authority", () => {
  const unsafe = recurringReview() as RecurringDecisionLessonReviewV1 & { policy_promotion_allowed: boolean };
  unsafe.policy_promotion_allowed = true;

  const result = reviewRecurringLearningForReallocationV1(validInput({
    sourceReview: {
      review: unsafe,
      observedAt: SOURCE_OBSERVED_AT,
      evidenceRefs: ["evidence:review-observed"]
    }
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("SOURCE_AUTHORITY_INVARIANT_FAILED"));
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.allocationChangeAuthorized, false);
});

test("non-known target candidate evidence fails closed", () => {
  const current = portfolio();
  const candidate = current.items[0];
  const degraded: DecisionPortfolioV1 = {
    ...current,
    items: [
      {
        ...candidate,
        candidate: { ...candidate.candidate, evidenceState: "INFERRED" }
      }
    ]
  };

  const result = reviewRecurringLearningForReallocationV1(validInput({ portfolio: degraded }));
  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("TARGET_CANDIDATE_NOT_KNOWN"));
});

test("output is deterministic, deeply frozen, and leaves inputs unchanged", () => {
  const input = validInput();
  const snapshot = structuredClone(input);
  const first = reviewRecurringLearningForReallocationV1(input);
  const second = reviewRecurringLearningForReallocationV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.authority));
  assert.ok(Object.isFrozen(first.evidenceRefs));
  assert.throws(() => {
    (first.evidenceRefs as string[]).push("evidence:mutation");
  });
});
