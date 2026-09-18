import type { ConversionFrictionReadinessV1 } from "./conversion-friction-readiness-v1";
import {
  compileConversionFrictionOutcomeReviewV1,
  type ConversionFrictionOutcomeReviewV1,
} from "./conversion-friction-outcome-review-v1";
import type { RevenueOutcomeEvaluationInputV1 } from "./revenue-outcome-evaluation-v1";
import {
  compileFreshRevenueOutcomeLearningCandidateV1,
  type RevenueOutcomeFreshnessPolicyV1,
  type RevenueOutcomeSourceFreshnessCheckV1,
} from "./revenue-outcome-freshness-gate-v1";

export const FRESH_CONVERSION_FRICTION_OUTCOME_REVIEW_VERSION =
  "FRESH_CONVERSION_FRICTION_OUTCOME_REVIEW_V1" as const;

export type FreshConversionFrictionOutcomeReviewStatusV1 =
  | "READY_FOR_GOVERNED_REVIEW"
  | "READY_WITH_CONFOUNDERS"
  | "BLOCKED";

export type FreshConversionFrictionOutcomeReviewReasonV1 =
  | "FRESH_CONVERSION_OUTCOME_READY"
  | "FRESH_CONVERSION_OUTCOME_READY_WITH_CONFOUNDERS"
  | "OUTCOME_FRESHNESS_BLOCKED"
  | "FRESHNESS_GATE_INTEGRITY_FAILURE"
  | "CONVERSION_OUTCOME_REVIEW_BLOCKED";

export type FreshConversionFrictionOutcomeReviewInputV1 = Readonly<{
  readiness: ConversionFrictionReadinessV1;
  outcomeInput: RevenueOutcomeEvaluationInputV1;
  freshnessPolicy: RevenueOutcomeFreshnessPolicyV1;
}>;

export type FreshConversionFrictionOutcomeReviewV1 = Readonly<{
  version: typeof FRESH_CONVERSION_FRICTION_OUTCOME_REVIEW_VERSION;
  status: FreshConversionFrictionOutcomeReviewStatusV1;
  reasonCode: FreshConversionFrictionOutcomeReviewReasonV1;
  recommendationId: string;
  decisionRef: string;
  implementationRef: string;
  evaluatedAt: string;
  freshness: {
    status: "ELIGIBLE_FOR_REVIEW" | "BLOCKED";
    reasonCodes: readonly string[];
    sourceChecks: readonly Readonly<RevenueOutcomeSourceFreshnessCheckV1>[];
  };
  review: ConversionFrictionOutcomeReviewV1 | null;
  attribution: {
    causal: "NOT_ESTABLISHED";
    channel: "NOT_ESTABLISHED";
    mechanism: "NOT_ESTABLISHED";
  };
  limitations: readonly string[];
  authority: {
    durableLearningPromotionAllowed: false;
    reallocationAllowed: false;
    causalClaimAllowed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  };
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function authority(): FreshConversionFrictionOutcomeReviewV1["authority"] {
  return {
    durableLearningPromotionAllowed: false,
    reallocationAllowed: false,
    causalClaimAllowed: false,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  };
}

function copySourceChecks(
  checks: readonly Readonly<RevenueOutcomeSourceFreshnessCheckV1>[],
): RevenueOutcomeSourceFreshnessCheckV1[] {
  return checks.map((check) => ({ ...check }));
}

function finalize(
  input: FreshConversionFrictionOutcomeReviewInputV1,
  status: FreshConversionFrictionOutcomeReviewStatusV1,
  reasonCode: FreshConversionFrictionOutcomeReviewReasonV1,
  freshnessStatus: "ELIGIBLE_FOR_REVIEW" | "BLOCKED",
  freshnessReasonCodes: readonly string[],
  freshnessChecks: readonly Readonly<RevenueOutcomeSourceFreshnessCheckV1>[],
  review: ConversionFrictionOutcomeReviewV1 | null,
  limitations: readonly string[],
): FreshConversionFrictionOutcomeReviewV1 {
  return deepFreeze({
    version: FRESH_CONVERSION_FRICTION_OUTCOME_REVIEW_VERSION,
    status,
    reasonCode,
    recommendationId: input.readiness.recommendationId,
    decisionRef: input.outcomeInput.decisionRef,
    implementationRef: input.outcomeInput.implementationRef,
    evaluatedAt: input.outcomeInput.evaluatedAt,
    freshness: {
      status: freshnessStatus,
      reasonCodes: [...freshnessReasonCodes],
      sourceChecks: copySourceChecks(freshnessChecks),
    },
    review,
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
      mechanism: "NOT_ESTABLISHED",
    },
    limitations: [...new Set(limitations)],
    authority: authority(),
  });
}

/**
 * Canonical decision-time boundary for conversion-friction outcome learning.
 *
 * The lower-level conversion outcome review intentionally accepts an already
 * compiled observational-learning candidate. This wrapper closes the freshness
 * bypass for production use by compiling that candidate only after every Woo,
 * GA4, Meta, Clarity, FunnelKit, and confounder observation in the raw outcome
 * input has passed the existing explicit freshness/completeness policy.
 *
 * A READY result remains governed observational review only. It does not
 * establish causality, channel/mechanism attribution, durable learning,
 * reallocation, production mutation, Meta writes, or approval bypass.
 */
export function compileFreshConversionFrictionOutcomeReviewV1(
  input: FreshConversionFrictionOutcomeReviewInputV1,
): FreshConversionFrictionOutcomeReviewV1 {
  const freshness = compileFreshRevenueOutcomeLearningCandidateV1(
    input.outcomeInput,
    input.freshnessPolicy,
  );

  if (freshness.status !== "ELIGIBLE_FOR_REVIEW") {
    return finalize(
      input,
      "BLOCKED",
      "OUTCOME_FRESHNESS_BLOCKED",
      freshness.status,
      freshness.reasonCodes,
      freshness.sourceChecks,
      null,
      [
        ...freshness.limitations,
        "Conversion-friction outcome review is withheld until the measured evidence is freshly retrieved and complete under the explicit source policy.",
      ],
    );
  }

  if (!freshness.acceptedCandidate) {
    return finalize(
      input,
      "BLOCKED",
      "FRESHNESS_GATE_INTEGRITY_FAILURE",
      freshness.status,
      freshness.reasonCodes,
      freshness.sourceChecks,
      null,
      [
        ...freshness.limitations,
        "The freshness gate reported review eligibility without an accepted canonical learning candidate and therefore fails closed.",
      ],
    );
  }

  const review = compileConversionFrictionOutcomeReviewV1({
    readiness: input.readiness,
    outcome: freshness.acceptedCandidate,
  });

  if (review.status === "BLOCKED") {
    return finalize(
      input,
      "BLOCKED",
      "CONVERSION_OUTCOME_REVIEW_BLOCKED",
      freshness.status,
      freshness.reasonCodes,
      freshness.sourceChecks,
      review,
      [...freshness.limitations, ...review.limitations],
    );
  }

  return finalize(
    input,
    review.status,
    review.status === "READY_WITH_CONFOUNDERS"
      ? "FRESH_CONVERSION_OUTCOME_READY_WITH_CONFOUNDERS"
      : "FRESH_CONVERSION_OUTCOME_READY",
    freshness.status,
    freshness.reasonCodes,
    freshness.sourceChecks,
    review,
    [...freshness.limitations, ...review.limitations],
  );
}
