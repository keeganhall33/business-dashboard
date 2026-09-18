import type { ConversionFrictionReadinessV1 } from "./conversion-friction-readiness-v1";
import type {
  RevenueOutcomeComparisonV1,
  RevenueOutcomeConfounderV1,
} from "./revenue-outcome-evaluation-v1";
import type { RevenueOutcomeLearningCandidateV1 } from "./revenue-outcome-learning-candidate-v1";

export const CONVERSION_FRICTION_OUTCOME_REVIEW_VERSION =
  "CONVERSION_FRICTION_OUTCOME_REVIEW_V1" as const;

export type ConversionFrictionOutcomeReviewStatusV1 =
  | "READY_FOR_GOVERNED_REVIEW"
  | "READY_WITH_CONFOUNDERS"
  | "BLOCKED";

export type ConversionFrictionOutcomeReviewReasonV1 =
  | "OBSERVED_OUTCOME_READY"
  | "OBSERVED_OUTCOME_READY_WITH_CONFOUNDERS"
  | "PRETEST_READINESS_NOT_ESTABLISHED"
  | "OUTCOME_NOT_REVIEW_ELIGIBLE"
  | "DECISION_BINDING_MISMATCH"
  | "OUTCOME_AUTHORITY_INTEGRITY_FAILURE"
  | "CANONICAL_WINDOW_INTEGRITY_FAILURE"
  | "HYPOTHESIS_EVIDENCE_INTEGRITY_FAILURE"
  | "REQUIRED_MECHANISM_OUTCOME_MISSING"
  | "WOO_COMMERCIAL_OUTCOME_MISSING";

export type ConversionFrictionObservedChangeV1 = Readonly<{
  source: RevenueOutcomeComparisonV1["source"];
  metric: string;
  unit: string;
  baselineValue: number;
  outcomeValue: number;
  absoluteChange: number;
  relativeChangeRatio: number | null;
  direction: RevenueOutcomeComparisonV1["direction"];
  evidenceRefs: readonly string[];
}>;

export type ConversionFrictionOutcomeReviewV1 = Readonly<{
  version: typeof CONVERSION_FRICTION_OUTCOME_REVIEW_VERSION;
  status: ConversionFrictionOutcomeReviewStatusV1;
  reasonCode: ConversionFrictionOutcomeReviewReasonV1;
  recommendationId: string;
  outcomeCandidateId: string | null;
  implementationRef: string | null;
  measurementStatus: RevenueOutcomeLearningCandidateV1["measurementStatus"];
  canonicalWindows: {
    baseline: Readonly<{ startDate: string; endDate: string }> | null;
    outcome: Readonly<{ startDate: string; endDate: string }> | null;
  };
  hypothesisBasis: {
    clarityRequired: boolean;
    checkoutRequired: boolean;
    supportingFacts: readonly string[];
  };
  observedChanges: readonly ConversionFrictionObservedChangeV1[];
  criterion: RevenueOutcomeLearningCandidateV1["criterion"];
  confounders: readonly Readonly<RevenueOutcomeConfounderV1>[];
  attribution: {
    causal: "NOT_ESTABLISHED";
    channel: "NOT_ESTABLISHED";
    mechanism: "NOT_ESTABLISHED";
  };
  limitations: readonly string[];
  authority: {
    durableLearningPromotionAllowed: false;
    reallocationAllowed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  };
}>;

export type ConversionFrictionOutcomeReviewInputV1 = Readonly<{
  readiness: ConversionFrictionReadinessV1;
  outcome: RevenueOutcomeLearningCandidateV1;
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function authority(): ConversionFrictionOutcomeReviewV1["authority"] {
  return {
    durableLearningPromotionAllowed: false,
    reallocationAllowed: false,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  };
}

function candidateAuthorityIsSafe(
  candidate: RevenueOutcomeLearningCandidateV1,
): boolean {
  return Object.values(candidate.authority).every((allowed) => allowed === false)
    && candidate.attribution.causal === "NOT_ESTABLISHED"
    && candidate.attribution.channel === "NOT_ESTABLISHED";
}

function sameRange(
  left: Readonly<{ startDate: string; endDate: string }>,
  right: Readonly<{ startDate: string; endDate: string }>,
): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

function comparisonIntegrity(
  candidate: RevenueOutcomeLearningCandidateV1,
): boolean {
  const baseline = candidate.canonicalWindows.baseline;
  const outcome = candidate.canonicalWindows.outcome;
  if (!baseline || !outcome || candidate.comparisons.length === 0) return false;
  if (candidate.evidenceRefs.length === 0) return false;

  const comparisonSources = [...new Set(candidate.comparisons.map((item) => item.source))].sort();
  const declaredSources = [...new Set(candidate.sources)].sort();
  if (comparisonSources.join("\u0000") !== declaredSources.join("\u0000")) return false;

  return candidate.comparisons.every((comparison) =>
    sameRange(comparison.baselineRange, baseline)
    && sameRange(comparison.outcomeRange, outcome)
    && comparison.evidenceRefs.length > 0,
  );
}

function copyComparison(
  comparison: RevenueOutcomeComparisonV1,
): ConversionFrictionObservedChangeV1 {
  return {
    source: comparison.source,
    metric: comparison.metric,
    unit: comparison.unit,
    baselineValue: comparison.baselineValue,
    outcomeValue: comparison.outcomeValue,
    absoluteChange: comparison.absoluteChange,
    relativeChangeRatio: comparison.relativeChangeRatio,
    direction: comparison.direction,
    evidenceRefs: [...comparison.evidenceRefs],
  };
}

function copyConfounder(
  confounder: RevenueOutcomeConfounderV1,
): RevenueOutcomeConfounderV1 {
  return { ...confounder, evidenceRefs: [...confounder.evidenceRefs] };
}

function blocked(
  input: ConversionFrictionOutcomeReviewInputV1,
  reasonCode: Exclude<ConversionFrictionOutcomeReviewReasonV1, "OBSERVED_OUTCOME_READY" | "OBSERVED_OUTCOME_READY_WITH_CONFOUNDERS">,
  limitation: string,
): ConversionFrictionOutcomeReviewV1 {
  return deepFreeze({
    version: CONVERSION_FRICTION_OUTCOME_REVIEW_VERSION,
    status: "BLOCKED",
    reasonCode,
    recommendationId: input.readiness.recommendationId,
    outcomeCandidateId: null,
    implementationRef: null,
    measurementStatus: input.outcome.measurementStatus,
    canonicalWindows: { baseline: null, outcome: null },
    hypothesisBasis: {
      clarityRequired: input.readiness.evidenceBasis.clarityUsed,
      checkoutRequired: input.readiness.evidenceBasis.checkoutUsed,
      supportingFacts: [...input.readiness.evidenceBasis.supportingFacts],
    },
    observedChanges: [],
    criterion: null,
    confounders: [],
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
      mechanism: "NOT_ESTABLISHED",
    },
    limitations: [
      limitation,
      "Blocked evidence cannot become a durable lesson, causal claim, resource reallocation, or production action.",
    ],
    authority: authority(),
  });
}

/**
 * Closes the read-only conversion-intelligence loop from an evidence-backed
 * friction hypothesis to a measured pre/post outcome candidate. This boundary
 * binds the outcome to the exact pre-test recommendation, requires canonical
 * window integrity, requires post-period evidence for each mechanism used in
 * the hypothesis, and always requires a Woo commercial outcome observation.
 *
 * It reports observed arithmetic changes only. It never decides whether an
 * arbitrary metric direction is "better", establishes causality/attribution,
 * promotes a durable lesson, reallocates resources, mutates production, or
 * writes to Meta.
 */
export function compileConversionFrictionOutcomeReviewV1(
  input: ConversionFrictionOutcomeReviewInputV1,
): ConversionFrictionOutcomeReviewV1 {
  const readiness = input.readiness;
  const candidate = input.outcome;

  if (readiness.status !== "READY_TO_PREPARE_TEST") {
    return blocked(
      input,
      "PRETEST_READINESS_NOT_ESTABLISHED",
      "The canonical pre-test friction gate was not READY_TO_PREPARE_TEST, so a later observation cannot retroactively create an approved hypothesis.",
    );
  }

  if (
    candidate.status !== "ELIGIBLE_FOR_REVIEW"
    || candidate.learningScope !== "OBSERVATIONAL_REVIEW_ONLY"
    || !candidate.candidateId
  ) {
    return blocked(
      input,
      "OUTCOME_NOT_REVIEW_ELIGIBLE",
      "The measured outcome did not pass the canonical observational-learning boundary.",
    );
  }

  if (candidate.decisionRef !== readiness.recommendationId) {
    return blocked(
      input,
      "DECISION_BINDING_MISMATCH",
      "The outcome decision reference does not match the exact pre-test conversion recommendation.",
    );
  }

  if (!candidateAuthorityIsSafe(candidate)) {
    return blocked(
      input,
      "OUTCOME_AUTHORITY_INTEGRITY_FAILURE",
      "The outcome candidate contains authority or attribution state that is not safe for this read-only review boundary.",
    );
  }

  if (!comparisonIntegrity(candidate)) {
    return blocked(
      input,
      "CANONICAL_WINDOW_INTEGRITY_FAILURE",
      "Outcome comparisons do not exactly preserve the canonical matched windows, declared sources, and evidence lineage.",
    );
  }

  const clarityRequired = readiness.evidenceBasis.clarityUsed;
  const checkoutRequired = readiness.evidenceBasis.checkoutUsed;
  if ((!clarityRequired && !checkoutRequired) || readiness.evidenceBasis.supportingFacts.length === 0) {
    return blocked(
      input,
      "HYPOTHESIS_EVIDENCE_INTEGRITY_FAILURE",
      "A conversion-friction test marked ready without a supported Clarity or checkout hypothesis fails closed.",
    );
  }

  const sourceSet = new Set(candidate.sources);
  const missingMechanism = (clarityRequired && !sourceSet.has("CLARITY"))
    || (checkoutRequired && !sourceSet.has("FUNNELKIT"));
  if (missingMechanism) {
    return blocked(
      input,
      "REQUIRED_MECHANISM_OUTCOME_MISSING",
      "The post-period measurement does not include every behavioral mechanism source used to justify the pre-test hypothesis.",
    );
  }

  if (!sourceSet.has("WOO")) {
    return blocked(
      input,
      "WOO_COMMERCIAL_OUTCOME_MISSING",
      "A behavioral friction result cannot close the revenue loop without an evidence-backed Woo commercial outcome observation.",
    );
  }

  const confounders = candidate.confounders.map(copyConfounder);
  const hasConfounders = confounders.length > 0
    || candidate.reasonCode === "OBSERVATIONAL_REVIEW_READY_WITH_CONFOUNDERS";

  return deepFreeze({
    version: CONVERSION_FRICTION_OUTCOME_REVIEW_VERSION,
    status: hasConfounders ? "READY_WITH_CONFOUNDERS" : "READY_FOR_GOVERNED_REVIEW",
    reasonCode: hasConfounders
      ? "OBSERVED_OUTCOME_READY_WITH_CONFOUNDERS"
      : "OBSERVED_OUTCOME_READY",
    recommendationId: readiness.recommendationId,
    outcomeCandidateId: candidate.candidateId,
    implementationRef: candidate.implementationRef,
    measurementStatus: candidate.measurementStatus,
    canonicalWindows: {
      baseline: candidate.canonicalWindows.baseline
        ? { ...candidate.canonicalWindows.baseline }
        : null,
      outcome: candidate.canonicalWindows.outcome
        ? { ...candidate.canonicalWindows.outcome }
        : null,
    },
    hypothesisBasis: {
      clarityRequired,
      checkoutRequired,
      supportingFacts: [...readiness.evidenceBasis.supportingFacts],
    },
    observedChanges: candidate.comparisons.map(copyComparison),
    criterion: candidate.criterion
      ? {
        ...candidate.criterion,
        rule: candidate.criterion.rule ? { ...candidate.criterion.rule } : null,
      }
      : null,
    confounders,
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
      mechanism: "NOT_ESTABLISHED",
    },
    limitations: [
      ...candidate.limitations,
      "Observed pre/post movement is arithmetic evidence only; this review does not establish that the tested change caused revenue, conversion, Clarity, or FunnelKit movement.",
      "Metric direction is preserved without labeling an arbitrary movement as improvement or deterioration; that interpretation requires the predeclared metric semantics and governed review.",
      "Meta observations, when present upstream, remain contextual and never authorize a paid-media write or establish channel attribution.",
      ...(hasConfounders
        ? ["Explicit confounders remain attached and prevent causal interpretation or autonomous reallocation."]
        : []),
    ],
    authority: authority(),
  });
}
