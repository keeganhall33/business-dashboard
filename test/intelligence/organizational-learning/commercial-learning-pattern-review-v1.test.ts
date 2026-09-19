import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewCommercialLearningPatternV1,
  type CommercialLearningPatternReviewInputV1
} from "@/lib/intelligence/organizational-learning/commercial-learning-pattern-review-v1";
import type {
  CommercialLearningOutcomeReviewV1,
  CommercialLearningOutcomeSignalV1
} from "@/lib/intelligence/organizational-learning/commercial-learning-outcome-review-v1";

const evaluatedAt = "2026-09-18T22:00:00.000Z";
const fourHours = 4 * 60 * 60 * 1000;

function sourceReview(
  sequence: number,
  signal: CommercialLearningOutcomeSignalV1,
  overrides: Partial<CommercialLearningOutcomeReviewV1> = {}
): CommercialLearningOutcomeReviewV1 {
  const observedAssessment = signal === "POSITIVE_ASSOCIATION"
    ? "POSITIVE"
    : signal === "NEGATIVE_ASSOCIATION"
      ? "NEGATIVE"
      : signal === "NEUTRAL_OBSERVATION"
        ? "NEUTRAL"
        : "INCONCLUSIVE";
  const readyReason = signal === "POSITIVE_ASSOCIATION"
    ? "POSITIVE_OUTCOME_READY_FOR_REVIEW"
    : signal === "NEGATIVE_ASSOCIATION"
      ? "NEGATIVE_OUTCOME_READY_FOR_REVIEW"
      : signal === "NEUTRAL_OBSERVATION"
        ? "NEUTRAL_OUTCOME_READY_FOR_REVIEW"
        : "INCONCLUSIVE_OUTCOME_READY_FOR_REVIEW";

  return {
    contractVersion: "CommercialLearningOutcomeReviewV1",
    policyVersion: "commercial_learning_outcome_review_v1.0.0",
    reviewId: `commercial-learning-outcome:${sequence}`,
    reviewedAt: `2026-09-18T2${sequence}:00:00.000Z`,
    state: "READY_FOR_LEARNING_REVIEW",
    reasonCodes: [readyReason],
    currentDecisionRef: `decision:current:${sequence}`,
    domain: "PRICING",
    patternKey: "deposit-before-production",
    sourceLessonTitle: "Verify commercial terms before production",
    sourceLessonContent: "Observed commercial terms were reviewed before production began.",
    observedAssessment,
    recordedAttributionClass: "UNKNOWN",
    outcomeSignal: signal,
    applicationReviewId: `commercial-learning-application:${sequence}`,
    outcomeObservationId: `outcome-observation:${sequence}`,
    sourceDecisionRefs: ["decision:past:1", "decision:past:2"],
    sourceOutcomeRefs: ["outcome:past:1", "outcome:past:2"],
    sourceLearningIds: ["learning:past:1", "learning:past:2"],
    sourceLineageIds: ["lineage:past:1", "lineage:past:2"],
    sourceLessonEvidenceRefs: ["evidence:lesson:1", "evidence:lesson:2"],
    applicationEvidenceRefs: [`evidence:application:${sequence}`],
    actionEvidenceRefs: [`evidence:action:${sequence}`],
    outcomeEvidenceRefs: [`evidence:outcome:${sequence}`],
    decisionSourceRefs: [`source:decision:${sequence}`],
    nextInternalStep: "REVIEW_COMMERCIAL_LESSON_WITH_CURRENT_OUTCOME",
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    recommendedPrice: null,
    recommendedNegotiationAction: null,
    policyUpdateCandidate: null,
    limitations: [],
    authority: {
      analysisOnly: true,
      lessonValidationAuthorized: false,
      priceChangeAuthorized: false,
      negotiationActionAuthorized: false,
      persistenceAuthorized: false,
      policyPromotionAuthorized: false,
      confidenceMutationAuthorized: false,
      monetaryMutationAuthorized: false,
      externalActionAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function input(
  reviews: readonly CommercialLearningOutcomeReviewV1[],
  overrides: Partial<CommercialLearningPatternReviewInputV1> = {}
): CommercialLearningPatternReviewInputV1 {
  return {
    domain: "PRICING",
    patternKey: "deposit-before-production",
    reviews,
    evaluatedAt,
    maximumReviewAgeMs: fourHours,
    ...overrides
  };
}

test("surfaces repeated positive pricing associations without turning them into causality or a price action", () => {
  const value = reviewCommercialLearningPatternV1(input([
    sourceReview(0, "POSITIVE_ASSOCIATION"),
    sourceReview(1, "POSITIVE_ASSOCIATION")
  ]));

  assert.equal(value.state, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(value.posture, "DIRECTIONAL_POSITIVE");
  assert.deepEqual(value.reasonCodes, ["REPEATED_POSITIVE_ASSOCIATIONS"]);
  assert.deepEqual(value.signalCounts, {
    positive: 2,
    negative: 0,
    neutral: 0,
    inconclusive: 0
  });
  assert.equal(value.nextInternalStep, "REVIEW_REPEATED_POSITIVE_ASSOCIATIONS");
  assert.equal(value.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(value.confidence, "NOT_ESTABLISHED");
  assert.equal(value.monetaryValue, null);
  assert.equal(value.recommendedPrice, null);
  assert.equal(value.recommendedNegotiationAction, null);
  assert.equal(value.policyUpdateCandidate, null);
  assert.deepEqual(value.authority, {
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
  });
});

test("surfaces repeated negative negotiation associations without authorizing a concession", () => {
  const reviews = [
    sourceReview(0, "NEGATIVE_ASSOCIATION", {
      domain: "NEGOTIATION",
      patternKey: "scope-before-concession"
    }),
    sourceReview(1, "NEGATIVE_ASSOCIATION", {
      domain: "NEGOTIATION",
      patternKey: "scope-before-concession"
    })
  ];
  const value = reviewCommercialLearningPatternV1(input(reviews, {
    domain: "NEGOTIATION",
    patternKey: "scope-before-concession"
  }));

  assert.equal(value.state, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(value.posture, "DIRECTIONAL_NEGATIVE");
  assert.deepEqual(value.reasonCodes, ["REPEATED_NEGATIVE_ASSOCIATIONS"]);
  assert.equal(value.nextInternalStep, "REVIEW_REPEATED_NEGATIVE_ASSOCIATIONS");
  assert.equal(value.authority.negotiationActionAuthorized, false);
});

test("preserves mixed commercial outcomes as contradiction instead of averaging them", () => {
  const value = reviewCommercialLearningPatternV1(input([
    sourceReview(0, "POSITIVE_ASSOCIATION"),
    sourceReview(1, "NEGATIVE_ASSOCIATION")
  ]));

  assert.equal(value.state, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(value.posture, "MIXED");
  assert.deepEqual(value.reasonCodes, ["MIXED_ASSOCIATIONS"]);
  assert.equal(value.nextInternalStep, "REVIEW_MIXED_ASSOCIATIONS");
});

test("does not manufacture a directional lesson from one positive and one neutral result", () => {
  const value = reviewCommercialLearningPatternV1(input([
    sourceReview(0, "POSITIVE_ASSOCIATION"),
    sourceReview(1, "NEUTRAL_OBSERVATION")
  ]));

  assert.equal(value.state, "NO_ACTION");
  assert.equal(value.posture, "NO_DIRECTIONAL_SIGNAL");
  assert.deepEqual(value.reasonCodes, ["NO_REPEATED_DIRECTIONAL_ASSOCIATION"]);
  assert.equal(value.nextInternalStep, null);
});

test("requires at least two distinct decisions and outcomes before a repeated pattern can be reviewed", () => {
  const value = reviewCommercialLearningPatternV1(input([
    sourceReview(0, "POSITIVE_ASSOCIATION")
  ]));

  assert.equal(value.state, "NEEDS_MORE_EVIDENCE");
  assert.equal(value.posture, "NO_DIRECTIONAL_SIGNAL");
  assert.deepEqual(value.reasonCodes, [
    "INSUFFICIENT_DISTINCT_DECISIONS",
    "INSUFFICIENT_DISTINCT_OUTCOMES"
  ]);
  assert.equal(value.nextInternalStep, null);
});

test("fails closed when duplicate decision or outcome observations could inflate recurrence", () => {
  const first = sourceReview(0, "POSITIVE_ASSOCIATION");
  const value = reviewCommercialLearningPatternV1(input([
    first,
    sourceReview(1, "POSITIVE_ASSOCIATION", {
      currentDecisionRef: first.currentDecisionRef,
      outcomeObservationId: first.outcomeObservationId
    })
  ]));

  assert.equal(value.state, "VERIFY");
  assert.equal(value.posture, null);
  assert.ok(value.reasonCodes.includes("DUPLICATE_DECISION_REF"));
  assert.ok(value.reasonCodes.includes("DUPLICATE_OUTCOME_OBSERVATION_ID"));
  assert.equal(value.nextInternalStep, null);
});

test("fails closed on domain or pattern drift", () => {
  const value = reviewCommercialLearningPatternV1(input([
    sourceReview(0, "POSITIVE_ASSOCIATION"),
    sourceReview(1, "POSITIVE_ASSOCIATION", { patternKey: "different-pattern" })
  ]));

  assert.equal(value.state, "VERIFY");
  assert.ok(value.reasonCodes.includes("PATTERN_MISMATCH"));
  assert.equal(value.posture, null);
});

test("fails closed on stale and future source reviews", () => {
  const stale = reviewCommercialLearningPatternV1(input([
    sourceReview(0, "POSITIVE_ASSOCIATION", { reviewedAt: "2026-09-18T10:00:00.000Z" }),
    sourceReview(1, "POSITIVE_ASSOCIATION")
  ]));
  assert.equal(stale.state, "VERIFY");
  assert.ok(stale.reasonCodes.includes("SOURCE_REVIEW_STALE"));

  const future = reviewCommercialLearningPatternV1(input([
    sourceReview(0, "POSITIVE_ASSOCIATION", { reviewedAt: "2026-09-18T23:00:00.000Z" }),
    sourceReview(1, "POSITIVE_ASSOCIATION")
  ]));
  assert.equal(future.state, "VERIFY");
  assert.ok(future.reasonCodes.includes("SOURCE_REVIEW_IN_FUTURE"));
});

test("rejects widened source authority and inconsistent source signals", () => {
  const widened = sourceReview(0, "POSITIVE_ASSOCIATION");
  const value = reviewCommercialLearningPatternV1(input([
    {
      ...widened,
      authority: {
        ...widened.authority,
        priceChangeAuthorized: true
      }
    } as unknown as CommercialLearningOutcomeReviewV1,
    sourceReview(1, "POSITIVE_ASSOCIATION", {
      observedAssessment: "NEGATIVE"
    })
  ]));

  assert.equal(value.state, "VERIFY");
  assert.ok(value.reasonCodes.includes("SOURCE_AUTHORITY_INVARIANT_FAILED"));
  assert.ok(value.reasonCodes.includes("SOURCE_SIGNAL_INCONSISTENT"));
  assert.equal(value.authority.priceChangeAuthorized, false);
});

test("is deterministic regardless of source review ordering", () => {
  const first = sourceReview(0, "POSITIVE_ASSOCIATION");
  const second = sourceReview(1, "POSITIVE_ASSOCIATION");
  const a = reviewCommercialLearningPatternV1(input([first, second]));
  const b = reviewCommercialLearningPatternV1(input([second, first]));

  assert.equal(a.reviewId, b.reviewId);
  assert.deepEqual(a.sourceReviewIds, b.sourceReviewIds);
  assert.deepEqual(a.currentDecisionRefs, b.currentDecisionRefs);
  assert.deepEqual(a.outcomeObservationIds, b.outcomeObservationIds);
  assert.deepEqual(a.evidenceRefs, b.evidenceRefs);
});
