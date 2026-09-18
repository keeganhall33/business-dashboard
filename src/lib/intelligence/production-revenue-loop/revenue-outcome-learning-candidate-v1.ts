import type {
  RevenueOutcomeComparisonV1,
  RevenueOutcomeConfounderV1,
  RevenueOutcomeEvaluationInputV1,
  RevenueOutcomeEvaluationV1,
  RevenueOutcomeSourceV1,
} from "./revenue-outcome-evaluation-v1";
import {
  evaluateRevenueOutcomeWithWindowIntegrityV1,
  type RevenueOutcomeWindowIntegrityReasonV1,
} from "./revenue-outcome-window-integrity-v1";

export const REVENUE_OUTCOME_LEARNING_CANDIDATE_VERSION =
  "REVENUE_OUTCOME_LEARNING_CANDIDATE_V1" as const;

export type RevenueOutcomeLearningCandidateStatusV1 =
  | "ELIGIBLE_FOR_REVIEW"
  | "BLOCKED";

export type RevenueOutcomeLearningCandidateReasonV1 =
  | "OBSERVATIONAL_REVIEW_READY"
  | "OBSERVATIONAL_REVIEW_READY_WITH_CONFOUNDERS"
  | "WINDOW_INTEGRITY_BLOCKED";

export interface RevenueOutcomeLearningCandidateV1 {
  version: typeof REVENUE_OUTCOME_LEARNING_CANDIDATE_VERSION;
  candidateId: string | null;
  status: RevenueOutcomeLearningCandidateStatusV1;
  reasonCode: RevenueOutcomeLearningCandidateReasonV1;
  decisionRef: string;
  implementationRef: string;
  evaluatedAt: string;
  windowReasonCode: RevenueOutcomeWindowIntegrityReasonV1;
  measurementStatus: RevenueOutcomeEvaluationV1["status"];
  upstreamReasonCodes: readonly string[];
  learningScope: "OBSERVATIONAL_REVIEW_ONLY" | "NONE";
  canonicalWindows: {
    baseline: Readonly<{ startDate: string; endDate: string }> | null;
    outcome: Readonly<{ startDate: string; endDate: string }> | null;
  };
  sources: readonly RevenueOutcomeSourceV1[];
  comparisons: readonly Readonly<RevenueOutcomeComparisonV1>[];
  criterion: RevenueOutcomeEvaluationV1["criterion"] | null;
  confounders: readonly Readonly<RevenueOutcomeConfounderV1>[];
  evidenceRefs: readonly string[];
  attribution: {
    causal: "NOT_ESTABLISHED";
    channel: "NOT_ESTABLISHED";
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
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function authority(): RevenueOutcomeLearningCandidateV1["authority"] {
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

function copyComparison(
  comparison: RevenueOutcomeComparisonV1,
): RevenueOutcomeComparisonV1 {
  return {
    ...comparison,
    baselineRange: { ...comparison.baselineRange },
    outcomeRange: { ...comparison.outcomeRange },
    evidenceRefs: [...comparison.evidenceRefs],
  };
}

function copyConfounder(
  confounder: RevenueOutcomeConfounderV1,
): RevenueOutcomeConfounderV1 {
  return {
    ...confounder,
    evidenceRefs: [...confounder.evidenceRefs],
  };
}

function copyCriterion(
  criterion: RevenueOutcomeEvaluationV1["criterion"],
): RevenueOutcomeEvaluationV1["criterion"] {
  return {
    ...criterion,
    rule: criterion.rule ? { ...criterion.rule } : null,
  };
}

/**
 * Builds the review boundary between measured revenue/behavior outcomes and
 * durable learning or reallocation.
 *
 * Only a canonical outcome that already passed the temporal-integrity gate can
 * become an observational learning candidate. Even then, the candidate is not
 * a durable lesson, causal conclusion, allocation instruction, or execution
 * authority. Human/governed review remains required before any downstream
 * promotion.
 */
export function compileRevenueOutcomeLearningCandidateV1(
  input: RevenueOutcomeEvaluationInputV1,
): RevenueOutcomeLearningCandidateV1 {
  const integrity = evaluateRevenueOutcomeWithWindowIntegrityV1(input);

  if (integrity.status !== "EVALUATED" || !integrity.evaluation) {
    return deepFreeze({
      version: REVENUE_OUTCOME_LEARNING_CANDIDATE_VERSION,
      candidateId: null,
      status: "BLOCKED",
      reasonCode: "WINDOW_INTEGRITY_BLOCKED",
      decisionRef: integrity.decisionRef,
      implementationRef: integrity.implementationRef,
      evaluatedAt: integrity.evaluatedAt,
      windowReasonCode: integrity.reasonCode,
      measurementStatus: integrity.upstreamStatus,
      upstreamReasonCodes: [...integrity.upstreamReasonCodes],
      learningScope: "NONE",
      canonicalWindows: {
        baseline: null,
        outcome: null,
      },
      sources: [],
      comparisons: [],
      criterion: null,
      confounders: [],
      evidenceRefs: [],
      attribution: {
        causal: "NOT_ESTABLISHED",
        channel: "NOT_ESTABLISHED",
      },
      limitations: [
        ...integrity.limitations,
        "Blocked measurements cannot be promoted into outcome learning, durable lessons, or resource reallocation.",
      ],
      authority: authority(),
    });
  }

  const evaluation = integrity.evaluation;
  const comparisons = evaluation.comparisons.map(copyComparison);
  const confounders = evaluation.confounders.map(copyConfounder);
  const sources = [...new Set(comparisons.map((comparison) => comparison.source))].sort();
  const evidenceRefs = [...new Set(evaluation.evidenceRefs)].sort();
  const hasConfounders = evaluation.status === "MEASURED_WITH_CONFOUNDERS";

  return deepFreeze({
    version: REVENUE_OUTCOME_LEARNING_CANDIDATE_VERSION,
    candidateId: `revenue-learning-candidate:${evaluation.evaluationId}`,
    status: "ELIGIBLE_FOR_REVIEW",
    reasonCode: hasConfounders
      ? "OBSERVATIONAL_REVIEW_READY_WITH_CONFOUNDERS"
      : "OBSERVATIONAL_REVIEW_READY",
    decisionRef: evaluation.decisionRef,
    implementationRef: evaluation.implementationRef,
    evaluatedAt: evaluation.evaluatedAt,
    windowReasonCode: integrity.reasonCode,
    measurementStatus: evaluation.status,
    upstreamReasonCodes: [...evaluation.reasonCodes],
    learningScope: "OBSERVATIONAL_REVIEW_ONLY",
    canonicalWindows: {
      baseline: integrity.canonicalWindows.baseline
        ? { ...integrity.canonicalWindows.baseline }
        : null,
      outcome: integrity.canonicalWindows.outcome
        ? { ...integrity.canonicalWindows.outcome }
        : null,
    },
    sources,
    comparisons,
    criterion: copyCriterion(evaluation.criterion),
    confounders,
    evidenceRefs,
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
    },
    limitations: [
      ...integrity.limitations,
      "This record is a candidate for governed observational learning only; it is not itself a durable lesson or strategy rule.",
      "A predeclared criterion being met or not met is arithmetic evidence about the observed window, not proof that the implementation caused the result.",
      ...(hasConfounders
        ? ["Explicit current confounders remain attached and prevent causal interpretation or autonomous reallocation."]
        : []),
    ],
    authority: authority(),
  });
}
