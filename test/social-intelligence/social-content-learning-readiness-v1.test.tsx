import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialContentLearningReadinessV1,
} from "@/lib/social-intelligence/social-content-learning-readiness-v1";
import type { SocialContentOutcomeReviewV1 } from "@/lib/social-intelligence/social-content-outcome-review-v1";

function review(options: {
  opportunityId?: string;
  targetContentRef?: string;
  evaluatedAt?: string;
  criterionState?: "MET" | "NOT_MET";
  criterionAtLeast?: number;
  sourcePlatform?: "INSTAGRAM" | "YOUTUBE";
  targetPlatform?: "FACEBOOK" | "TIKTOK";
  targetMetric?: "LINK_CLICKS" | "PROFILE_VISITS" | "SAVES";
  evidenceRefs?: readonly string[];
  linkedOutcomeCount?: number;
  strongestAttributionClass?: "DIRECT_TRACKED" | "SUPPORTED_ASSOCIATION" | null;
  status?: "REVIEW_READY" | "VERIFY_REQUIRED";
} = {}): SocialContentOutcomeReviewV1 {
  const status = options.status ?? "REVIEW_READY";
  const criterionState = options.criterionState ?? "MET";
  return {
    contractVersion: "SocialContentOutcomeReviewV1",
    evaluatedAt: options.evaluatedAt ?? "2026-09-18T15:00:00.000Z",
    status,
    opportunityId: options.opportunityId ?? "opportunity:1",
    sourcePlatform: options.sourcePlatform ?? "INSTAGRAM",
    targetPlatform: options.targetPlatform ?? "FACEBOOK",
    targetContentRef: status === "REVIEW_READY" ? options.targetContentRef ?? "FACEBOOK:post-1" : null,
    targetMetric: options.targetMetric ?? "LINK_CLICKS",
    observedMetricValue: status === "REVIEW_READY" ? 40 : null,
    baselineContentRef: null,
    baselineMetricValue: null,
    absoluteLift: null,
    percentageLift: null,
    criterion: { kind: "MINIMUM_VALUE", atLeast: options.criterionAtLeast ?? 25 },
    criterionState: status === "REVIEW_READY" ? criterionState : "UNVERIFIABLE",
    linkedOutcomes: {
      linkedOutcomeCount: options.linkedOutcomeCount ?? 0,
      directTrackedOutcomeCount: options.strongestAttributionClass === "DIRECT_TRACKED" ? 1 : 0,
      outcomeCounts: {
        SITE_SESSION: 0,
        EMAIL_SIGNUP: 0,
        INQUIRY: 0,
        PURCHASE: 0,
        OPPORTUNITY: 0,
        MEDIA_OUTCOME: 0,
      },
      strongestAttributionClass: options.strongestAttributionClass ?? null,
      evidenceRefs: options.linkedOutcomeCount ? ["evidence:downstream"] : [],
    },
    observationEvidenceRefs: status === "REVIEW_READY"
      ? [...(options.evidenceRefs ?? ["evidence:post-1"])]
      : [],
    verificationReasons: status === "REVIEW_READY" ? [] : ["TARGET_SOURCE_NOT_DECISION_GRADE"],
    reviewCandidate: status === "REVIEW_READY" ? "GOVERNED_LEARNING_REVIEW" : "NONE",
    learningScope: "SINGLE_OBSERVATION_NOT_DURABLE_POLICY",
    causalClaim: false,
    revenueAttributionClaim: false,
    competitorPerformanceClaim: false,
    durableLearningAllowed: false,
    futurePriorUpdateAllowed: false,
    publicPostingAuthority: "NONE",
    limitations: ["Observed result is not causal proof."],
    externalAccessPerformed: false,
    writesPerformed: false,
  };
}

const identity = {
  learningKey: "content-dna:instagram-to-facebook:link-clicks",
  sourcePlatform: "INSTAGRAM" as const,
  targetPlatform: "FACEBOOK" as const,
  targetMetric: "LINK_CLICKS" as const,
  evidenceRefs: ["evidence:shared-content-dna-hypothesis"],
};

function secondReview(overrides: Parameters<typeof review>[0] = {}) {
  return review({
    opportunityId: "opportunity:2",
    targetContentRef: "FACEBOOK:post-2",
    evaluatedAt: "2026-09-25T15:00:00.000Z",
    evidenceRefs: ["evidence:post-2"],
    ...overrides,
  });
}

test("surfaces repeated criterion results only for governed lesson review", () => {
  const result = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [review(), secondReview()],
  });

  assert.equal(result.status, "READY_FOR_GOVERNED_LESSON_REVIEW");
  assert.equal(result.reasonCode, "REPEATED_CRITERION_RESULT");
  assert.equal(result.repeatedCriterionState, "MET");
  assert.equal(result.independentObservationCount, 2);
  assert.equal(result.linkedBusinessEvidenceRole, "CONTEXT_ONLY_NOT_CAUSAL_PROOF");
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.authority.durableLearningPromotionAllowed, false);
  assert.equal(result.authority.futurePriorUpdateAllowed, false);
  assert.equal(result.authority.publicPostingAllowed, false);
  assert.equal(result.authority.paidAmplificationAllowed, false);
  assert.ok(result.evidenceRefs.includes("evidence:shared-content-dna-hypothesis"));
});

test("keeps a single clean outcome observational", () => {
  const result = compileSocialContentLearningReadinessV1({ identity, reviews: [review()] });

  assert.equal(result.status, "OBSERVATION_ONLY");
  assert.equal(result.reasonCode, "SINGLE_OBSERVATION_ONLY");
  assert.equal(result.independentObservationCount, 1);
  assert.equal(result.repeatedCriterionState, "MET");
});

test("preserves conflicting repeated results instead of manufacturing a winner", () => {
  const result = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [review({ criterionState: "MET" }), secondReview({ criterionState: "NOT_MET" })],
  });

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "CRITERION_RESULTS_CONFLICT");
  assert.equal(result.repeatedCriterionState, null);
  assert.equal(result.authority.strategyMutationAllowed, false);
});

test("requires the same evidence-backed platform and metric learning identity", () => {
  const targetMismatch = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [review(), secondReview({ targetPlatform: "TIKTOK" })],
  });
  assert.equal(targetMismatch.status, "VERIFY_REQUIRED");
  assert.equal(targetMismatch.reasonCode, "LEARNING_IDENTITY_MISMATCH");

  const metricMismatch = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [review(), secondReview({ targetMetric: "SAVES" })],
  });
  assert.equal(metricMismatch.reasonCode, "LEARNING_IDENTITY_MISMATCH");
});

test("requires the same predeclared criterion semantics", () => {
  const result = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [review({ criterionAtLeast: 25 }), secondReview({ criterionAtLeast: 50 })],
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.reasonCode, "CRITERION_IDENTITY_MISMATCH");
});

test("does not count one content observation twice", () => {
  const result = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [review(), secondReview({ targetContentRef: "FACEBOOK:post-1" })],
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.reasonCode, "DUPLICATE_TARGET_CONTENT");
});

test("fails closed when an upstream outcome review is not decision-grade", () => {
  const result = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [review(), secondReview({ status: "VERIFY_REQUIRED" })],
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.reasonCode, "UPSTREAM_REVIEW_NOT_READY");
  assert.equal(result.independentObservationCount, 0);
});

test("downstream tracked outcomes remain context only and do not increase authority", () => {
  const result = compileSocialContentLearningReadinessV1({
    identity,
    reviews: [
      review({ linkedOutcomeCount: 1, strongestAttributionClass: "DIRECT_TRACKED" }),
      secondReview({ linkedOutcomeCount: 2, strongestAttributionClass: "SUPPORTED_ASSOCIATION" }),
    ],
  });

  assert.equal(result.status, "READY_FOR_GOVERNED_LESSON_REVIEW");
  assert.equal(result.observations[0].linkedOutcomeCount, 1);
  assert.equal(result.observations[1].linkedOutcomeCount, 2);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.causalClaim, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("is deterministic, deeply immutable, and does not mutate caller input", () => {
  const input = { identity, reviews: [review(), secondReview()] } as const;
  const before = structuredClone(input);
  const first = compileSocialContentLearningReadinessV1(input);
  const second = compileSocialContentLearningReadinessV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.observations), true);
  assert.equal(Object.isFrozen(first.observations[0]), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
