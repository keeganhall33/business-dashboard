import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1,
  COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1,
  type CommercialLearningApplicationReviewV1
} from "../../../src/lib/intelligence/organizational-learning/commercial-learning-application-review-v1";
import {
  COMMERCIAL_LEARNING_PATTERN_POLICY_VERSION_V1,
  COMMERCIAL_LEARNING_PATTERN_REVIEW_VERSION_V1,
  type CommercialLearningPatternPostureV1,
  type CommercialLearningPatternReviewV1
} from "../../../src/lib/intelligence/organizational-learning/commercial-learning-pattern-review-v1";
import {
  reviewCommercialLearningReapplicationV1,
  type CommercialLearningReapplicationStateV1
} from "../../../src/lib/intelligence/organizational-learning/commercial-learning-reapplication-review-v1";

const evaluatedAt = "2026-09-19T12:00:00.000Z";
const sourceAt = "2026-09-18T12:00:00.000Z";
const maximumSourceAgeMs = 7 * 24 * 60 * 60 * 1000;

function application(
  overrides: Partial<CommercialLearningApplicationReviewV1> = {}
): CommercialLearningApplicationReviewV1 {
  return {
    contractVersion: COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1,
    policyVersion: COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1,
    reviewId: "application-review:current",
    reviewedAt: sourceAt,
    state: "READY_FOR_REVIEW",
    reasonCodes: ["REPEATED_LESSON_READY_FOR_CURRENT_REVIEW"],
    currentDecisionRef: "decision:current",
    domain: "PRICING",
    patternKey: "pattern:premium-positioning",
    lessonTitle: "Premium framing held in prior negotiations",
    lessonContent: "Review premium framing against the current context before deciding.",
    sourceDecisionRefs: ["decision:old-a", "decision:old-b"],
    sourceOutcomeRefs: ["outcome:old-a", "outcome:old-b"],
    sourceLearningIds: ["learning:a", "learning:b"],
    sourceLineageIds: ["lineage:a", "lineage:b"],
    sourceLessonEvidenceRefs: ["evidence:lesson"],
    sourceReviewEvidenceRefs: ["evidence:lesson"],
    currentEvidenceRefs: ["evidence:current-context", "evidence:pattern-link"],
    applicationLinkEvidenceRefs: ["evidence:pattern-link"],
    nextInternalStep: "REVIEW_LESSON_AGAINST_CURRENT_CONTEXT",
    confidence: "NOT_ESTABLISHED",
    recommendedPrice: null,
    recommendedNegotiationAction: null,
    monetaryValue: null,
    causalInterpretation: "NOT_ESTABLISHED",
    limitations: [],
    authority: {
      analysisOnly: true,
      priceChangeAuthorized: false,
      negotiationActionAuthorized: false,
      externalActionAuthorized: false,
      persistenceAuthorized: false,
      policyPromotionAuthorized: false,
      confidenceMutationAuthorized: false,
      monetaryMutationAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function pattern(
  posture: CommercialLearningPatternPostureV1,
  overrides: Partial<CommercialLearningPatternReviewV1> = {}
): CommercialLearningPatternReviewV1 {
  const state = posture === "NO_DIRECTIONAL_SIGNAL" ? "NO_ACTION" : "READY_FOR_INTERNAL_REVIEW";
  const nextInternalStep = posture === "DIRECTIONAL_POSITIVE"
    ? "REVIEW_REPEATED_POSITIVE_ASSOCIATIONS"
    : posture === "DIRECTIONAL_NEGATIVE"
      ? "REVIEW_REPEATED_NEGATIVE_ASSOCIATIONS"
      : posture === "MIXED"
        ? "REVIEW_MIXED_ASSOCIATIONS"
        : null;
  return {
    contractVersion: COMMERCIAL_LEARNING_PATTERN_REVIEW_VERSION_V1,
    policyVersion: COMMERCIAL_LEARNING_PATTERN_POLICY_VERSION_V1,
    reviewId: `pattern-review:${posture.toLowerCase()}`,
    evaluatedAt: sourceAt,
    domain: "PRICING",
    patternKey: "pattern:premium-positioning",
    state,
    reasonCodes: posture === "DIRECTIONAL_POSITIVE"
      ? ["REPEATED_POSITIVE_ASSOCIATIONS"]
      : posture === "DIRECTIONAL_NEGATIVE"
        ? ["REPEATED_NEGATIVE_ASSOCIATIONS"]
        : posture === "MIXED"
          ? ["MIXED_ASSOCIATIONS"]
          : ["NO_REPEATED_DIRECTIONAL_ASSOCIATION"],
    posture,
    signalCounts: posture === "DIRECTIONAL_POSITIVE"
      ? { positive: 2, negative: 0, neutral: 0, inconclusive: 0 }
      : posture === "DIRECTIONAL_NEGATIVE"
        ? { positive: 0, negative: 2, neutral: 0, inconclusive: 0 }
        : posture === "MIXED"
          ? { positive: 1, negative: 1, neutral: 0, inconclusive: 0 }
          : { positive: 0, negative: 0, neutral: 2, inconclusive: 0 },
    sourceReviewIds: ["outcome-review:a", "outcome-review:b"],
    currentDecisionRefs: ["decision:old-a", "decision:old-b"],
    outcomeObservationIds: ["outcome:old-a", "outcome:old-b"],
    sourceLearningIds: ["learning:a", "learning:b"],
    sourceLineageIds: ["lineage:a", "lineage:b"],
    evidenceRefs: ["evidence:history-a", "evidence:history-b"],
    recordedAttributionClasses: ["CORRELATIONAL"],
    nextInternalStep,
    confidence: "NOT_ESTABLISHED",
    causalInterpretation: "NOT_ESTABLISHED",
    monetaryValue: null,
    recommendedPrice: null,
    recommendedNegotiationAction: null,
    policyUpdateCandidate: null,
    limitations: [],
    authority: {
      analysisOnly: true,
      lessonValidationAuthorized: false,
      lessonPromotionAuthorized: false,
      policyPromotionAuthorized: false,
      priceChangeAuthorized: false,
      negotiationActionAuthorized: false,
      confidenceMutationAuthorized: false,
      monetaryMutationAuthorized: false,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function review(
  outcomeHistory: CommercialLearningPatternReviewV1,
  current = application(),
  maximumAge = maximumSourceAgeMs
) {
  return reviewCommercialLearningReapplicationV1({
    application: current,
    outcomeHistory,
    evaluatedAt,
    maximumSourceAgeMs: maximumAge
  });
}

test("keeps repeated positive history as contextual review evidence without upgrading confidence or authorizing a price action", () => {
  const result = review(pattern("DIRECTIONAL_POSITIVE"));

  assert.equal(result.state, "READY_FOR_CONTEXTUAL_REVIEW");
  assert.equal(result.outcomeHistoryPosture, "DIRECTIONAL_POSITIVE");
  assert.ok(result.reasonCodes.includes("REPEATED_POSITIVE_HISTORY_PRESENT"));
  assert.equal(result.nextInternalStep, "REVIEW_CURRENT_CONTEXT_WITH_REPEATED_POSITIVE_ASSOCIATIONS");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.recommendedPrice, null);
  assert.equal(result.recommendedNegotiationAction, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.priceChangeAuthorized, false);
  assert.equal(result.authority.negotiationActionAuthorized, false);
  assert.equal(result.authority.lessonPromotionAuthorized, false);
});

test("surfaces repeated negative history before the same commercial lesson is reused", () => {
  const result = review(pattern("DIRECTIONAL_NEGATIVE"));

  assert.equal(result.state, "REVIEW_NEGATIVE_HISTORY");
  assert.ok(result.reasonCodes.includes("REPEATED_NEGATIVE_HISTORY_PRESENT"));
  assert.equal(result.nextInternalStep, "REVIEW_CURRENT_CONTEXT_AND_REPEATED_NEGATIVE_ASSOCIATIONS");
  assert.equal(result.recommendedPrice, null);
  assert.equal(result.recommendedNegotiationAction, null);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("preserves mixed outcome history instead of averaging it into a recommendation", () => {
  const result = review(pattern("MIXED"));

  assert.equal(result.state, "REVIEW_MIXED_HISTORY");
  assert.ok(result.reasonCodes.includes("MIXED_HISTORY_PRESENT"));
  assert.equal(result.nextInternalStep, "REVIEW_CURRENT_CONTEXT_AND_MIXED_ASSOCIATIONS");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
});

test("allows current-context review with no repeated directional outcome while explicitly preserving that absence", () => {
  const result = review(pattern("NO_DIRECTIONAL_SIGNAL"));

  assert.equal(result.state, "READY_FOR_CONTEXTUAL_REVIEW");
  assert.ok(result.reasonCodes.includes("NO_REPEATED_DIRECTIONAL_HISTORY"));
  assert.equal(result.nextInternalStep, "REVIEW_CURRENT_CONTEXT_WITHOUT_REPEATED_DIRECTIONAL_OUTCOME");
  assert.equal(result.inferredOutcome, null);
});

test("waits for more history when the longitudinal source has not established enough distinct evidence", () => {
  const history = pattern("DIRECTIONAL_POSITIVE", {
    state: "NEEDS_MORE_EVIDENCE",
    reasonCodes: ["INSUFFICIENT_DISTINCT_OUTCOMES"],
    nextInternalStep: null
  });
  const result = review(history);

  assert.equal(result.state, "NEEDS_MORE_EVIDENCE");
  assert.ok(result.reasonCodes.includes("SOURCE_PATTERN_NEEDS_MORE_EVIDENCE"));
  assert.equal(result.nextInternalStep, null);
});

test("fails closed when current application and outcome history do not share exact learning lineage", () => {
  const history = pattern("DIRECTIONAL_POSITIVE", {
    sourceLearningIds: ["learning:other-a", "learning:other-b"],
    sourceLineageIds: ["lineage:other-a", "lineage:other-b"]
  });
  const result = review(history);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("LEARNING_LINEAGE_NOT_SHARED"));
  assert.deepEqual(result.sharedLearningIds, []);
  assert.deepEqual(result.sharedLineageIds, []);
  assert.equal(result.nextInternalStep, null);
});

test("fails closed when the current decision has already been counted inside the historical outcome pattern", () => {
  const history = pattern("DIRECTIONAL_POSITIVE", {
    currentDecisionRefs: ["decision:current", "decision:old-b"]
  });
  const result = review(history);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("CURRENT_DECISION_ALREADY_IN_OUTCOME_HISTORY"));
  assert.equal(result.nextInternalStep, null);
});

test("fails closed on stale history rather than silently reusing an old pricing lesson", () => {
  const staleAt = "2026-08-01T12:00:00.000Z";
  const result = review(
    pattern("DIRECTIONAL_POSITIVE", { evaluatedAt: staleAt }),
    application({ reviewedAt: staleAt }),
    24 * 60 * 60 * 1000
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("SOURCE_PATTERN_STALE"));
  assert.ok(result.reasonCodes.includes("SOURCE_APPLICATION_STALE"));
  assert.equal(result.nextInternalStep, null);
});

test("is deterministic and leaves source reviews untouched", () => {
  const current = application();
  const history = pattern("DIRECTIONAL_NEGATIVE");
  const currentBefore = structuredClone(current);
  const historyBefore = structuredClone(history);

  const first = review(history, current);
  const second = review(history, current);

  assert.equal(first.reviewId, second.reviewId);
  assert.deepEqual(current, currentBefore);
  assert.deepEqual(history, historyBefore);
});

test("never grants execution authority across any review state", () => {
  const cases: Array<[CommercialLearningReapplicationStateV1, CommercialLearningPatternReviewV1]> = [
    ["READY_FOR_CONTEXTUAL_REVIEW", pattern("DIRECTIONAL_POSITIVE")],
    ["REVIEW_NEGATIVE_HISTORY", pattern("DIRECTIONAL_NEGATIVE")],
    ["REVIEW_MIXED_HISTORY", pattern("MIXED")]
  ];

  for (const [expectedState, history] of cases) {
    const result = review(history);
    assert.equal(result.state, expectedState);
    assert.deepEqual(result.authority, {
      analysisOnly: true,
      lessonMutationAuthorized: false,
      lessonPromotionAuthorized: false,
      policyPromotionAuthorized: false,
      priceChangeAuthorized: false,
      negotiationActionAuthorized: false,
      confidenceMutationAuthorized: false,
      monetaryMutationAuthorized: false,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      approvalBypassAuthorized: false
    });
  }
});
