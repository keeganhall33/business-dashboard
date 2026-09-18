import type { ConversionFrictionOutcomeReviewV1 } from "./conversion-friction-outcome-review-v1";
import type { RevenueOutcomeCriterionStatusV1 } from "./revenue-outcome-evaluation-v1";

export const CONVERSION_FRICTION_LEARNING_READINESS_VERSION =
  "CONVERSION_FRICTION_LEARNING_READINESS_V1" as const;

const MIN_INDEPENDENT_RUNS = 2;
const MAX_REVIEW_RUNS = 10;

export type ConversionFrictionLearningReadinessStatusV1 =
  | "READY_FOR_GOVERNED_LESSON_REVIEW"
  | "OBSERVATION_ONLY"
  | "CONFLICTED"
  | "BLOCKED";

export type ConversionFrictionLearningReadinessReasonV1 =
  | "REPEATED_CLEAN_CRITERION_RESULT"
  | "SINGLE_OBSERVATION_ONLY"
  | "CONFOUNDERS_PRESENT"
  | "CRITERION_RESULTS_CONFLICT"
  | "CRITERION_NOT_EVALUATED"
  | "UPSTREAM_REVIEW_BLOCKED"
  | "RECOMMENDATION_IDENTITY_MISMATCH"
  | "HYPOTHESIS_IDENTITY_MISMATCH"
  | "CRITERION_RULE_MISMATCH"
  | "DUPLICATE_OUTCOME_CANDIDATE"
  | "IMPLEMENTATION_REUSE"
  | "OUTCOME_WINDOW_OVERLAP"
  | "OUTCOME_RUN_INTEGRITY_FAILURE"
  | "INVALID_REVIEW_COUNT";

export type ConversionFrictionLearningRunV1 = Readonly<{
  outcomeCandidateId: string;
  implementationRef: string;
  outcomeWindow: Readonly<{ startDate: string; endDate: string }>;
  criterionStatus: Exclude<RevenueOutcomeCriterionStatusV1, "NOT_EVALUATED">;
  confounderCount: number;
  evidenceRefs: readonly string[];
}>;

export type ConversionFrictionLearningReadinessV1 = Readonly<{
  version: typeof CONVERSION_FRICTION_LEARNING_READINESS_VERSION;
  status: ConversionFrictionLearningReadinessStatusV1;
  reasonCode: ConversionFrictionLearningReadinessReasonV1;
  recommendationId: string | null;
  learningScope:
    | "GOVERNED_LESSON_REVIEW_CANDIDATE"
    | "OBSERVATIONAL_ONLY"
    | "NONE";
  repeatedCriterionResult: Exclude<RevenueOutcomeCriterionStatusV1, "NOT_EVALUATED"> | null;
  independentRunCount: number;
  minimumIndependentRuns: typeof MIN_INDEPENDENT_RUNS;
  hypothesisBasis: Readonly<{
    clarityRequired: boolean;
    checkoutRequired: boolean;
    supportingFacts: readonly string[];
  }> | null;
  runs: readonly ConversionFrictionLearningRunV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  attribution: {
    causal: "NOT_ESTABLISHED";
    channel: "NOT_ESTABLISHED";
    mechanism: "NOT_ESTABLISHED";
  };
  authority: {
    durableLearningPromotionAllowed: false;
    policyChangeAllowed: false;
    reallocationAllowed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  };
}>;

export type ConversionFrictionLearningReadinessInputV1 = Readonly<{
  reviews: readonly ConversionFrictionOutcomeReviewV1[];
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function authority(): ConversionFrictionLearningReadinessV1["authority"] {
  return {
    durableLearningPromotionAllowed: false,
    policyChangeAllowed: false,
    reallocationAllowed: false,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  };
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString().slice(0, 10) === value;
}

function dateMs(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function normalizedFacts(review: ConversionFrictionOutcomeReviewV1): string[] {
  return [...review.hypothesisBasis.supportingFacts].sort();
}

function sameHypothesis(
  left: ConversionFrictionOutcomeReviewV1,
  right: ConversionFrictionOutcomeReviewV1,
): boolean {
  return left.hypothesisBasis.clarityRequired === right.hypothesisBasis.clarityRequired
    && left.hypothesisBasis.checkoutRequired === right.hypothesisBasis.checkoutRequired
    && normalizedFacts(left).join("\u0000") === normalizedFacts(right).join("\u0000");
}

function sameCriterionRule(
  left: NonNullable<ConversionFrictionOutcomeReviewV1["criterion"]>["rule"],
  right: NonNullable<ConversionFrictionOutcomeReviewV1["criterion"]>["rule"],
): boolean {
  if (!left || !right) return false;
  return left.source === right.source
    && left.metric === right.metric
    && left.unit === right.unit
    && left.comparator === right.comparator
    && left.threshold === right.threshold;
}

function reviewAuthorityIsSafe(review: ConversionFrictionOutcomeReviewV1): boolean {
  return Object.values(review.authority).every((allowed) => allowed === false)
    && review.attribution.causal === "NOT_ESTABLISHED"
    && review.attribution.channel === "NOT_ESTABLISHED"
    && review.attribution.mechanism === "NOT_ESTABLISHED";
}

function runEvidenceRefs(review: ConversionFrictionOutcomeReviewV1): string[] {
  const refs = [
    ...review.observedChanges.flatMap((change) => change.evidenceRefs),
    ...review.confounders.flatMap((confounder) => confounder.evidenceRefs),
    ...(review.criterion?.rule?.evidenceRef ? [review.criterion.rule.evidenceRef] : []),
  ];
  return [...new Set(refs)].sort();
}

function runIntegrity(review: ConversionFrictionOutcomeReviewV1): boolean {
  if (
    review.status === "BLOCKED"
    || !review.outcomeCandidateId
    || !review.implementationRef
    || !review.canonicalWindows.baseline
    || !review.canonicalWindows.outcome
    || !review.criterion
    || !review.criterion.rule
    || review.observedChanges.length === 0
    || review.hypothesisBasis.supportingFacts.length === 0
    || !reviewAuthorityIsSafe(review)
  ) {
    return false;
  }

  const baseline = review.canonicalWindows.baseline;
  const outcome = review.canonicalWindows.outcome;
  if (
    !validDateOnly(baseline.startDate)
    || !validDateOnly(baseline.endDate)
    || !validDateOnly(outcome.startDate)
    || !validDateOnly(outcome.endDate)
    || dateMs(baseline.endDate) < dateMs(baseline.startDate)
    || dateMs(outcome.endDate) < dateMs(outcome.startDate)
    || dateMs(outcome.startDate) <= dateMs(baseline.endDate)
    || !review.criterion.rule.evidenceRef
  ) {
    return false;
  }

  return review.observedChanges.every((change) =>
    change.evidenceRefs.length > 0
    && Number.isFinite(change.baselineValue)
    && Number.isFinite(change.outcomeValue)
    && Number.isFinite(change.absoluteChange)
    && (change.relativeChangeRatio === null || Number.isFinite(change.relativeChangeRatio)),
  );
}

function windowsOverlap(
  left: Readonly<{ startDate: string; endDate: string }>,
  right: Readonly<{ startDate: string; endDate: string }>,
): boolean {
  return dateMs(left.startDate) <= dateMs(right.endDate)
    && dateMs(right.startDate) <= dateMs(left.endDate);
}

function blocked(
  reasonCode: ConversionFrictionLearningReadinessReasonV1,
  recommendationId: string | null,
  limitation: string,
): ConversionFrictionLearningReadinessV1 {
  return deepFreeze({
    version: CONVERSION_FRICTION_LEARNING_READINESS_VERSION,
    status: "BLOCKED",
    reasonCode,
    recommendationId,
    learningScope: "NONE",
    repeatedCriterionResult: null,
    independentRunCount: 0,
    minimumIndependentRuns: MIN_INDEPENDENT_RUNS,
    hypothesisBasis: null,
    runs: [],
    evidenceRefs: [],
    limitations: [
      limitation,
      "Blocked evidence cannot become a durable lesson, policy update, causal claim, reallocation instruction, or production action.",
    ],
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
      mechanism: "NOT_ESTABLISHED",
    },
    authority: authority(),
  });
}

function finalize(
  status: ConversionFrictionLearningReadinessStatusV1,
  reasonCode: ConversionFrictionLearningReadinessReasonV1,
  reviews: readonly ConversionFrictionOutcomeReviewV1[],
  repeatedCriterionResult: Exclude<RevenueOutcomeCriterionStatusV1, "NOT_EVALUATED"> | null,
  limitations: readonly string[],
): ConversionFrictionLearningReadinessV1 {
  const first = reviews[0];
  const ordered = [...reviews].sort((left, right) => {
    const leftWindow = left.canonicalWindows.outcome as Readonly<{ startDate: string; endDate: string }>;
    const rightWindow = right.canonicalWindows.outcome as Readonly<{ startDate: string; endDate: string }>;
    return leftWindow.startDate.localeCompare(rightWindow.startDate)
      || leftWindow.endDate.localeCompare(rightWindow.endDate)
      || (left.outcomeCandidateId as string).localeCompare(right.outcomeCandidateId as string);
  });
  const runs: ConversionFrictionLearningRunV1[] = ordered.map((review) => ({
    outcomeCandidateId: review.outcomeCandidateId as string,
    implementationRef: review.implementationRef as string,
    outcomeWindow: { ...(review.canonicalWindows.outcome as Readonly<{ startDate: string; endDate: string }>) },
    criterionStatus: review.criterion?.status as Exclude<RevenueOutcomeCriterionStatusV1, "NOT_EVALUATED">,
    confounderCount: review.confounders.length,
    evidenceRefs: runEvidenceRefs(review),
  }));
  const evidenceRefs = [...new Set(runs.flatMap((run) => run.evidenceRefs))].sort();

  return deepFreeze({
    version: CONVERSION_FRICTION_LEARNING_READINESS_VERSION,
    status,
    reasonCode,
    recommendationId: first.recommendationId,
    learningScope: status === "READY_FOR_GOVERNED_LESSON_REVIEW"
      ? "GOVERNED_LESSON_REVIEW_CANDIDATE"
      : "OBSERVATIONAL_ONLY",
    repeatedCriterionResult,
    independentRunCount: runs.length,
    minimumIndependentRuns: MIN_INDEPENDENT_RUNS,
    hypothesisBasis: {
      clarityRequired: first.hypothesisBasis.clarityRequired,
      checkoutRequired: first.hypothesisBasis.checkoutRequired,
      supportingFacts: [...first.hypothesisBasis.supportingFacts],
    },
    runs,
    evidenceRefs,
    limitations: [
      ...limitations,
      "Repeated criterion outcomes are evidence of repeatability under the recorded windows, not proof that the tested change caused the result.",
      "A governed lesson review remains required before any durable learning, strategy rule, resource reallocation, or production mutation.",
    ],
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
      mechanism: "NOT_ESTABLISHED",
    },
    authority: authority(),
  });
}

/**
 * Requires replicated, independent conversion-friction outcome reviews before
 * surfacing a candidate for durable-learning review. This is deliberately a
 * review-readiness boundary only: even repeated clean results remain
 * observational and carry no causal, policy, reallocation, Meta-write, or
 * execution authority.
 */
export function compileConversionFrictionLearningReadinessV1(
  input: ConversionFrictionLearningReadinessInputV1,
): ConversionFrictionLearningReadinessV1 {
  const reviews = input.reviews;
  if (reviews.length === 0 || reviews.length > MAX_REVIEW_RUNS) {
    return blocked(
      "INVALID_REVIEW_COUNT",
      null,
      `Expected between 1 and ${MAX_REVIEW_RUNS} bounded outcome reviews.`,
    );
  }

  const recommendationId = reviews[0].recommendationId || null;
  if (reviews.some((review) => review.status === "BLOCKED")) {
    return blocked(
      "UPSTREAM_REVIEW_BLOCKED",
      recommendationId,
      "At least one conversion-friction outcome review is blocked and cannot contribute to learning readiness.",
    );
  }

  if (reviews.some((review) => !runIntegrity(review))) {
    return blocked(
      "OUTCOME_RUN_INTEGRITY_FAILURE",
      recommendationId,
      "At least one outcome review is missing canonical windows, evidence lineage, criterion registration, or safe authority state.",
    );
  }

  if (reviews.some((review) => review.recommendationId !== recommendationId)) {
    return blocked(
      "RECOMMENDATION_IDENTITY_MISMATCH",
      recommendationId,
      "Outcome reviews for different recommendations cannot be combined into one learning candidate.",
    );
  }

  const first = reviews[0];
  if (reviews.some((review) => !sameHypothesis(first, review))) {
    return blocked(
      "HYPOTHESIS_IDENTITY_MISMATCH",
      recommendationId,
      "Outcome reviews do not preserve the same evidence-backed conversion-friction hypothesis.",
    );
  }

  const firstRule = first.criterion?.rule;
  if (!firstRule || reviews.some((review) => !sameCriterionRule(firstRule, review.criterion?.rule ?? null))) {
    return blocked(
      "CRITERION_RULE_MISMATCH",
      recommendationId,
      "Replicated outcomes must use the same predeclared success rule before their results can be compared.",
    );
  }

  const candidateIds = reviews.map((review) => review.outcomeCandidateId as string);
  if (new Set(candidateIds).size !== candidateIds.length) {
    return blocked(
      "DUPLICATE_OUTCOME_CANDIDATE",
      recommendationId,
      "The same measured outcome candidate cannot be counted more than once toward replication.",
    );
  }

  const implementationRefs = reviews.map((review) => review.implementationRef as string);
  if (new Set(implementationRefs).size !== implementationRefs.length) {
    return blocked(
      "IMPLEMENTATION_REUSE",
      recommendationId,
      "Replication requires independently identified implementations; replaying one implementation cannot increase evidence weight.",
    );
  }

  const ordered = [...reviews].sort((left, right) =>
    (left.canonicalWindows.outcome as Readonly<{ startDate: string; endDate: string }>).startDate.localeCompare(
      (right.canonicalWindows.outcome as Readonly<{ startDate: string; endDate: string }>).startDate,
    ),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1].canonicalWindows.outcome as Readonly<{ startDate: string; endDate: string }>;
    const current = ordered[index].canonicalWindows.outcome as Readonly<{ startDate: string; endDate: string }>;
    if (windowsOverlap(previous, current)) {
      return blocked(
        "OUTCOME_WINDOW_OVERLAP",
        recommendationId,
        "Overlapping outcome windows are not counted as independent replications.",
      );
    }
  }

  if (reviews.some((review) => review.criterion?.status === "NOT_EVALUATED")) {
    return finalize(
      "OBSERVATION_ONLY",
      "CRITERION_NOT_EVALUATED",
      reviews,
      null,
      ["At least one run lacks an evaluated predeclared success criterion."],
    );
  }

  const criterionStatuses = reviews.map((review) =>
    review.criterion?.status as Exclude<RevenueOutcomeCriterionStatusV1, "NOT_EVALUATED">,
  );
  const distinctStatuses = new Set(criterionStatuses);
  if (distinctStatuses.size > 1) {
    return finalize(
      "CONFLICTED",
      "CRITERION_RESULTS_CONFLICT",
      reviews,
      null,
      ["Replicated runs disagree on whether the same predeclared criterion was met."],
    );
  }

  const repeatedCriterionResult = criterionStatuses[0] ?? null;
  if (
    reviews.some((review) => review.status === "READY_WITH_CONFOUNDERS")
    || reviews.some((review) => review.confounders.length > 0)
  ) {
    return finalize(
      "OBSERVATION_ONLY",
      "CONFOUNDERS_PRESENT",
      reviews,
      repeatedCriterionResult,
      ["At least one replicated outcome has explicit confounders, so it remains observational-only."],
    );
  }

  if (reviews.length < MIN_INDEPENDENT_RUNS) {
    return finalize(
      "OBSERVATION_ONLY",
      "SINGLE_OBSERVATION_ONLY",
      reviews,
      repeatedCriterionResult,
      ["One clean measured outcome is insufficient to surface a durable-learning review candidate."],
    );
  }

  return finalize(
    "READY_FOR_GOVERNED_LESSON_REVIEW",
    "REPEATED_CLEAN_CRITERION_RESULT",
    reviews,
    repeatedCriterionResult,
    [
      `At least ${MIN_INDEPENDENT_RUNS} non-overlapping, independently identified outcome runs produced the same result under the same predeclared criterion.`,
    ],
  );
}
