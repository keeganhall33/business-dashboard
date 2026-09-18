import type {
  SocialContentOutcomeReviewV1,
  SocialContentOutcomeSuccessCriterionV1,
} from "./social-content-outcome-review-v1";

export const SOCIAL_CONTENT_LEARNING_READINESS_V1_VERSION =
  "SocialContentLearningReadinessV1" as const;

const MIN_INDEPENDENT_OBSERVATIONS = 2;
const MAX_OBSERVATIONS = 12;

export type SocialContentLearningReadinessStatusV1 =
  | "READY_FOR_GOVERNED_LESSON_REVIEW"
  | "OBSERVATION_ONLY"
  | "CONFLICTED"
  | "VERIFY_REQUIRED";

export type SocialContentLearningReadinessReasonV1 =
  | "REPEATED_CRITERION_RESULT"
  | "SINGLE_OBSERVATION_ONLY"
  | "CRITERION_RESULTS_CONFLICT"
  | "UPSTREAM_REVIEW_NOT_READY"
  | "LEARNING_IDENTITY_MISMATCH"
  | "CRITERION_IDENTITY_MISMATCH"
  | "DUPLICATE_TARGET_CONTENT"
  | "OBSERVATION_EVIDENCE_MISSING"
  | "INVALID_OBSERVATION_COUNT";

export type SocialContentLearningIdentityV1 = Readonly<{
  learningKey: string;
  sourcePlatform: NonNullable<SocialContentOutcomeReviewV1["sourcePlatform"]>;
  targetPlatform: NonNullable<SocialContentOutcomeReviewV1["targetPlatform"]>;
  targetMetric: NonNullable<SocialContentOutcomeReviewV1["targetMetric"]>;
  evidenceRefs: readonly string[];
}>;

export type SocialContentLearningObservationV1 = Readonly<{
  opportunityId: string;
  targetContentRef: string;
  evaluatedAt: string;
  criterionState: "MET" | "NOT_MET";
  observedMetricValue: number;
  linkedOutcomeCount: number;
  strongestAttributionClass: SocialContentOutcomeReviewV1["linkedOutcomes"]["strongestAttributionClass"];
  evidenceRefs: readonly string[];
}>;

export type SocialContentLearningReadinessV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_LEARNING_READINESS_V1_VERSION;
  status: SocialContentLearningReadinessStatusV1;
  reasonCode: SocialContentLearningReadinessReasonV1;
  learningIdentity: SocialContentLearningIdentityV1 | null;
  repeatedCriterionState: "MET" | "NOT_MET" | null;
  independentObservationCount: number;
  minimumIndependentObservations: typeof MIN_INDEPENDENT_OBSERVATIONS;
  observations: readonly SocialContentLearningObservationV1[];
  evidenceRefs: readonly string[];
  linkedBusinessEvidenceRole: "CONTEXT_ONLY_NOT_CAUSAL_PROOF";
  causalClaim: false;
  revenueAttributionClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  limitations: readonly string[];
  authority: Readonly<{
    durableLearningPromotionAllowed: false;
    futurePriorUpdateAllowed: false;
    publicPostingAllowed: false;
    paidAmplificationAllowed: false;
    strategyMutationAllowed: false;
    externalActionAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

export type SocialContentLearningReadinessInputV1 = Readonly<{
  identity: SocialContentLearningIdentityV1;
  reviews: readonly SocialContentOutcomeReviewV1[];
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function safeRef(value: string, field: string): string {
  const normalized = requiredText(value, field);
  if (/^op:\/\//i.test(normalized)) throw new Error(`${field} must not contain a secret reference`);
  return normalized;
}

function uniqueRefs(values: readonly string[], field: string): string[] {
  return [...new Set(values.map((value, index) => safeRef(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function criterionSignature(criterion: SocialContentOutcomeSuccessCriterionV1 | null): string | null {
  if (!criterion) return null;
  return `${criterion.kind}:${criterion.atLeast}`;
}

function safeAuthority(): SocialContentLearningReadinessV1["authority"] {
  return {
    durableLearningPromotionAllowed: false,
    futurePriorUpdateAllowed: false,
    publicPostingAllowed: false,
    paidAmplificationAllowed: false,
    strategyMutationAllowed: false,
    externalActionAllowed: false,
    approvalBypassAllowed: false,
  };
}

function baseLimitations(): string[] {
  return [
    "Repeated observed criterion results can justify governed lesson review, but they do not establish that the recommendation caused the result.",
    "Linked downstream business outcomes remain association or tracking context only and never increase learning readiness or establish revenue attribution.",
    "A governed review must decide whether any lesson is durable; this boundary cannot update future priors, strategy, posting, paid amplification, or execution policy.",
  ];
}

function blocked(
  reasonCode: SocialContentLearningReadinessReasonV1,
  limitation: string,
): SocialContentLearningReadinessV1 {
  return deepFreeze({
    contractVersion: SOCIAL_CONTENT_LEARNING_READINESS_V1_VERSION,
    status: "VERIFY_REQUIRED",
    reasonCode,
    learningIdentity: null,
    repeatedCriterionState: null,
    independentObservationCount: 0,
    minimumIndependentObservations: MIN_INDEPENDENT_OBSERVATIONS,
    observations: [],
    evidenceRefs: [],
    linkedBusinessEvidenceRole: "CONTEXT_ONLY_NOT_CAUSAL_PROOF",
    causalClaim: false,
    revenueAttributionClaim: false,
    competitorPerformanceClaim: false,
    endorsementClaim: false,
    relationshipClaim: false,
    limitations: [limitation, ...baseLimitations()],
    authority: safeAuthority(),
  });
}

function reviewMatchesIdentity(
  review: SocialContentOutcomeReviewV1,
  identity: SocialContentLearningIdentityV1,
): boolean {
  return review.sourcePlatform === identity.sourcePlatform
    && review.targetPlatform === identity.targetPlatform
    && review.targetMetric === identity.targetMetric;
}

function reviewIsDecisionGrade(review: SocialContentOutcomeReviewV1): boolean {
  return review.status === "REVIEW_READY"
    && review.reviewCandidate === "GOVERNED_LEARNING_REVIEW"
    && (review.criterionState === "MET" || review.criterionState === "NOT_MET")
    && review.criterion != null
    && review.targetContentRef != null
    && review.observedMetricValue != null
    && Number.isFinite(review.observedMetricValue)
    && review.observationEvidenceRefs.length > 0
    && review.verificationReasons.length === 0
    && review.causalClaim === false
    && review.revenueAttributionClaim === false
    && review.competitorPerformanceClaim === false
    && review.durableLearningAllowed === false
    && review.futurePriorUpdateAllowed === false
    && review.publicPostingAuthority === "NONE"
    && review.externalAccessPerformed === false
    && review.writesPerformed === false;
}

function finalize(
  status: Exclude<SocialContentLearningReadinessStatusV1, "VERIFY_REQUIRED">,
  reasonCode: SocialContentLearningReadinessReasonV1,
  identity: SocialContentLearningIdentityV1,
  reviews: readonly SocialContentOutcomeReviewV1[],
  repeatedCriterionState: "MET" | "NOT_MET" | null,
  extraLimitation: string,
): SocialContentLearningReadinessV1 {
  const ordered = [...reviews].sort((left, right) =>
    left.evaluatedAt.localeCompare(right.evaluatedAt)
      || (left.targetContentRef as string).localeCompare(right.targetContentRef as string),
  );
  const observations: SocialContentLearningObservationV1[] = ordered.map((review) => ({
    opportunityId: review.opportunityId,
    targetContentRef: review.targetContentRef as string,
    evaluatedAt: review.evaluatedAt,
    criterionState: review.criterionState as "MET" | "NOT_MET",
    observedMetricValue: review.observedMetricValue as number,
    linkedOutcomeCount: review.linkedOutcomes.linkedOutcomeCount,
    strongestAttributionClass: review.linkedOutcomes.strongestAttributionClass,
    evidenceRefs: [...review.observationEvidenceRefs],
  }));
  const evidenceRefs = uniqueRefs([
    ...identity.evidenceRefs,
    ...observations.flatMap((observation) => observation.evidenceRefs),
  ], "evidenceRefs");

  return deepFreeze({
    contractVersion: SOCIAL_CONTENT_LEARNING_READINESS_V1_VERSION,
    status,
    reasonCode,
    learningIdentity: {
      learningKey: identity.learningKey,
      sourcePlatform: identity.sourcePlatform,
      targetPlatform: identity.targetPlatform,
      targetMetric: identity.targetMetric,
      evidenceRefs: [...identity.evidenceRefs],
    },
    repeatedCriterionState,
    independentObservationCount: observations.length,
    minimumIndependentObservations: MIN_INDEPENDENT_OBSERVATIONS,
    observations,
    evidenceRefs,
    linkedBusinessEvidenceRole: "CONTEXT_ONLY_NOT_CAUSAL_PROOF",
    causalClaim: false,
    revenueAttributionClaim: false,
    competitorPerformanceClaim: false,
    endorsementClaim: false,
    relationshipClaim: false,
    limitations: [extraLimitation, ...baseLimitations()],
    authority: safeAuthority(),
  });
}

/**
 * Promotes repeated, independent Social Content Outcome reviews only to a
 * governed lesson-review boundary. The caller supplies an evidence-backed
 * learning identity; this compiler never invents a shared mechanism, causal
 * story, competitor inference, revenue attribution, or durable strategy rule.
 */
export function compileSocialContentLearningReadinessV1(
  input: SocialContentLearningReadinessInputV1,
): SocialContentLearningReadinessV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.reviews) || input.reviews.length === 0 || input.reviews.length > MAX_OBSERVATIONS) {
    return blocked("INVALID_OBSERVATION_COUNT", `Expected between 1 and ${MAX_OBSERVATIONS} bounded outcome reviews.`);
  }

  const identity = deepFreeze({
    learningKey: requiredText(input.identity.learningKey, "identity.learningKey"),
    sourcePlatform: input.identity.sourcePlatform,
    targetPlatform: input.identity.targetPlatform,
    targetMetric: input.identity.targetMetric,
    evidenceRefs: uniqueRefs(input.identity.evidenceRefs, "identity.evidenceRefs"),
  });
  if (identity.evidenceRefs.length === 0) {
    return blocked("LEARNING_IDENTITY_MISMATCH", "The shared learning identity requires explicit evidence lineage.");
  }

  if (input.reviews.some((review) => !reviewIsDecisionGrade(review))) {
    return blocked(
      "UPSTREAM_REVIEW_NOT_READY",
      "Every contributing social outcome review must be decision-grade, criterion-evaluated, evidence-backed, and mutation-free.",
    );
  }

  if (input.reviews.some((review) => !reviewMatchesIdentity(review, identity))) {
    return blocked(
      "LEARNING_IDENTITY_MISMATCH",
      "Reviews from different source platforms, target platforms, or target metrics cannot be combined into one learning candidate.",
    );
  }

  const firstCriterion = criterionSignature(input.reviews[0].criterion);
  if (!firstCriterion || input.reviews.some((review) => criterionSignature(review.criterion) !== firstCriterion)) {
    return blocked(
      "CRITERION_IDENTITY_MISMATCH",
      "Independent observations must preserve the same predeclared criterion kind and threshold before their results can be compared.",
    );
  }

  const targetContentRefs = input.reviews.map((review) => review.targetContentRef as string);
  if (new Set(targetContentRefs).size !== targetContentRefs.length) {
    return blocked(
      "DUPLICATE_TARGET_CONTENT",
      "The same target content observation cannot be counted more than once toward repeatability.",
    );
  }

  if (input.reviews.some((review) => review.observationEvidenceRefs.length === 0)) {
    return blocked("OBSERVATION_EVIDENCE_MISSING", "Every observation must preserve canonical evidence lineage.");
  }

  const states = input.reviews.map((review) => review.criterionState as "MET" | "NOT_MET");
  const distinctStates = new Set(states);
  if (distinctStates.size > 1) {
    return finalize(
      "CONFLICTED",
      "CRITERION_RESULTS_CONFLICT",
      identity,
      input.reviews,
      null,
      "Independent observations disagree on the same predeclared success criterion, so no repeated lesson is supported.",
    );
  }

  const repeatedCriterionState = states[0] ?? null;
  if (input.reviews.length < MIN_INDEPENDENT_OBSERVATIONS) {
    return finalize(
      "OBSERVATION_ONLY",
      "SINGLE_OBSERVATION_ONLY",
      identity,
      input.reviews,
      repeatedCriterionState,
      "One clean observation is insufficient to surface a durable-learning review candidate.",
    );
  }

  return finalize(
    "READY_FOR_GOVERNED_LESSON_REVIEW",
    "REPEATED_CRITERION_RESULT",
    identity,
    input.reviews,
    repeatedCriterionState,
    `At least ${MIN_INDEPENDENT_OBSERVATIONS} independently identified target content observations produced the same result under the same predeclared criterion.`,
  );
}
