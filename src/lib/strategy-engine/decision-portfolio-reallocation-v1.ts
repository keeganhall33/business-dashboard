import { createHash } from "node:crypto";

import type {
  DecisionDispositionV1,
  DecisionEvidenceStateV1,
  DecisionPortfolioV1
} from "./decision-portfolio-v1";

export const DECISION_PORTFOLIO_REALLOCATION_CONTRACT_VERSION_V1 =
  "DecisionPortfolioReallocationReviewV1" as const;
export const DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1 =
  "decision_portfolio_reallocation_policy_v1.0.0" as const;

const MAX_OUTCOMES = 100;
const MAX_REFS = 100;
const MAX_ASSUMPTIONS = 100;

export type DecisionOutcomeResultV1 = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "INCONCLUSIVE";
export type DecisionSuccessCriterionStateV1 = "MET" | "NOT_MET" | "INCONCLUSIVE" | "NOT_EVALUABLE";
export type DecisionOutcomeMaterialityV1 = "MATERIAL" | "NON_MATERIAL" | "UNKNOWN";
export type DecisionAttributionClassV1 = "CAUSAL" | "CONTRIBUTORY" | "CORRELATIONAL" | "NOT_ESTABLISHED";
export type DecisionAssumptionStatusV1 = "SUPPORTED" | "CONTRADICTED" | "UNRESOLVED";
export type DecisionAssumptionRelevanceV1 = "MATERIAL" | "NON_MATERIAL" | "UNKNOWN";
export type DecisionReallocationReviewStateV1 = "HOLD" | "RECONSIDER" | "VERIFY";

export type DecisionAssumptionUpdateV1 = {
  assumptionId: string;
  status: DecisionAssumptionStatusV1;
  relevance: DecisionAssumptionRelevanceV1;
  evidenceRefs: readonly string[];
};

export type DecisionOutcomeObservationV1 = {
  outcomeId: string;
  candidateId: string;
  measuredAt: string;
  evidenceState: DecisionEvidenceStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  result: DecisionOutcomeResultV1;
  successCriterionState: DecisionSuccessCriterionStateV1;
  materiality: DecisionOutcomeMaterialityV1;
  materialityEvidenceRefs: readonly string[];
  attributionClass: DecisionAttributionClassV1;
  attributionEvidenceRefs: readonly string[];
  confounderRefs: readonly string[];
  assumptionUpdates: readonly DecisionAssumptionUpdateV1[];
};

export type DecisionCandidateReallocationReviewV1 = {
  candidateId: string;
  outcomeId: string;
  previousDisposition: DecisionDispositionV1;
  reviewState: DecisionReallocationReviewStateV1;
  reasons: readonly string[];
  result: DecisionOutcomeResultV1;
  successCriterionState: DecisionSuccessCriterionStateV1;
  materiality: DecisionOutcomeMaterialityV1;
  attributionClass: DecisionAttributionClassV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  confounderRefs: readonly string[];
  contradictedMaterialAssumptionIds: readonly string[];
  unresolvedAssumptionIds: readonly string[];
};

export type DecisionPortfolioReallocationReviewV1 = {
  contractVersion: typeof DECISION_PORTFOLIO_REALLOCATION_CONTRACT_VERSION_V1;
  policyVersion: typeof DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1;
  reviewId: string;
  sourcePortfolioId: string;
  generatedAt: string;
  status: "NO_CHANGE" | "REVIEW_REQUIRED" | "VERIFICATION_REQUIRED";
  requiresPortfolioRebuild: boolean;
  candidateReviews: readonly DecisionCandidateReallocationReviewV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  authority: {
    portfolioMutation: false;
    scoreMutation: false;
    monetaryMutation: false;
    confidenceMutation: false;
    externalAction: false;
    approvalBypass: false;
  };
  audit: {
    outcomesConsidered: number;
    reconsiderCount: number;
    verificationCount: number;
  };
};

export class DecisionPortfolioReallocationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionPortfolioReallocationError";
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionPortfolioReallocationError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new DecisionPortfolioReallocationError("INVALID_TIMESTAMP", `${label} must be an ISO-compatible timestamp`);
  }
  return normalized;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new DecisionPortfolioReallocationError("INVALID_REFS", `${label} is invalid`);
  }
  return [...new Set(values.map((value) => text(value, label)))].sort((a, b) => a.localeCompare(b));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new DecisionPortfolioReallocationError("INVALID_ENUM", `${label} is invalid`);
  }
  return value as T;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeAssumptions(
  assumptions: readonly DecisionAssumptionUpdateV1[],
  candidateId: string
): DecisionAssumptionUpdateV1[] {
  if (!Array.isArray(assumptions) || assumptions.length > MAX_ASSUMPTIONS) {
    throw new DecisionPortfolioReallocationError("ASSUMPTION_BOUND", `${candidateId} has too many assumption updates`);
  }
  const seen = new Set<string>();
  return assumptions
    .map((assumption) => {
      const assumptionId = text(assumption.assumptionId, `${candidateId}.assumptionId`);
      if (seen.has(assumptionId)) {
        throw new DecisionPortfolioReallocationError(
          "DUPLICATE_ASSUMPTION",
          `${candidateId} repeats assumption ${assumptionId}`
        );
      }
      seen.add(assumptionId);
      const status = enumValue(assumption.status, ["SUPPORTED", "CONTRADICTED", "UNRESOLVED"] as const, `${candidateId}.assumption.status`);
      const relevance = enumValue(assumption.relevance, ["MATERIAL", "NON_MATERIAL", "UNKNOWN"] as const, `${candidateId}.assumption.relevance`);
      const evidenceRefs = refs(assumption.evidenceRefs, `${candidateId}.assumption.evidenceRefs`);
      if (status !== "UNRESOLVED" && evidenceRefs.length === 0) {
        throw new DecisionPortfolioReallocationError(
          "ASSUMPTION_EVIDENCE_REQUIRED",
          `${candidateId} resolved assumption ${assumptionId} requires evidence`
        );
      }
      return { assumptionId, status, relevance, evidenceRefs };
    })
    .sort((a, b) => a.assumptionId.localeCompare(b.assumptionId));
}

function normalizeOutcome(
  outcome: DecisionOutcomeObservationV1,
  reviewedAt: string,
  candidateIds: ReadonlySet<string>
): DecisionOutcomeObservationV1 {
  const outcomeId = text(outcome.outcomeId, "outcome.outcomeId");
  const candidateId = text(outcome.candidateId, `${outcomeId}.candidateId`);
  if (!candidateIds.has(candidateId)) {
    throw new DecisionPortfolioReallocationError(
      "UNKNOWN_CANDIDATE",
      `${outcomeId} references candidate ${candidateId} outside the source portfolio`
    );
  }
  const measuredAt = timestamp(outcome.measuredAt, `${outcomeId}.measuredAt`);
  if (Date.parse(measuredAt) > Date.parse(reviewedAt)) {
    throw new DecisionPortfolioReallocationError("FUTURE_OUTCOME", `${outcomeId} is measured after the review time`);
  }
  const evidenceState = enumValue(
    outcome.evidenceState,
    ["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"] as const,
    `${outcomeId}.evidenceState`
  );
  const result = enumValue(outcome.result, ["POSITIVE", "NEUTRAL", "NEGATIVE", "INCONCLUSIVE"] as const, `${outcomeId}.result`);
  const successCriterionState = enumValue(
    outcome.successCriterionState,
    ["MET", "NOT_MET", "INCONCLUSIVE", "NOT_EVALUABLE"] as const,
    `${outcomeId}.successCriterionState`
  );
  const materiality = enumValue(outcome.materiality, ["MATERIAL", "NON_MATERIAL", "UNKNOWN"] as const, `${outcomeId}.materiality`);
  const attributionClass = enumValue(
    outcome.attributionClass,
    ["CAUSAL", "CONTRIBUTORY", "CORRELATIONAL", "NOT_ESTABLISHED"] as const,
    `${outcomeId}.attributionClass`
  );
  return {
    outcomeId,
    candidateId,
    measuredAt,
    evidenceState,
    evidenceRefs: refs(outcome.evidenceRefs, `${outcomeId}.evidenceRefs`),
    sourceRefs: refs(outcome.sourceRefs, `${outcomeId}.sourceRefs`),
    result,
    successCriterionState,
    materiality,
    materialityEvidenceRefs: refs(outcome.materialityEvidenceRefs, `${outcomeId}.materialityEvidenceRefs`),
    attributionClass,
    attributionEvidenceRefs: refs(outcome.attributionEvidenceRefs, `${outcomeId}.attributionEvidenceRefs`),
    confounderRefs: refs(outcome.confounderRefs, `${outcomeId}.confounderRefs`),
    assumptionUpdates: normalizeAssumptions(outcome.assumptionUpdates, candidateId)
  };
}

function evaluateOutcome(
  portfolio: DecisionPortfolioV1,
  outcome: DecisionOutcomeObservationV1
): DecisionCandidateReallocationReviewV1 {
  const item = portfolio.items.find((candidate) => candidate.candidate.id === outcome.candidateId);
  if (!item) {
    throw new DecisionPortfolioReallocationError("UNKNOWN_CANDIDATE", `${outcome.candidateId} is not in the source portfolio`);
  }

  const reasons = new Set<string>();
  let reviewState: DecisionReallocationReviewStateV1 = "HOLD";
  const startAt = Date.parse(item.candidate.evaluationWindow.start);
  const endAt = Date.parse(item.candidate.evaluationWindow.end);
  const measuredAt = Date.parse(outcome.measuredAt);

  if (outcome.evidenceState !== "KNOWN") reasons.add(`OUTCOME_EVIDENCE_${outcome.evidenceState}`);
  if (outcome.evidenceRefs.length === 0 || outcome.sourceRefs.length === 0) reasons.add("OUTCOME_PROVENANCE_REQUIRED");
  if (measuredAt < startAt) reasons.add("OUTCOME_BEFORE_EVALUATION_WINDOW");
  if (measuredAt < endAt && (outcome.successCriterionState === "MET" || outcome.successCriterionState === "NOT_MET")) {
    reasons.add("SUCCESS_CRITERION_EVALUATED_EARLY");
  }
  if (outcome.materiality === "UNKNOWN") reasons.add("MATERIALITY_UNKNOWN");
  if (outcome.materiality === "MATERIAL" && outcome.materialityEvidenceRefs.length === 0) reasons.add("MATERIALITY_EVIDENCE_REQUIRED");
  if ((outcome.attributionClass === "CAUSAL" || outcome.attributionClass === "CONTRIBUTORY") && outcome.attributionEvidenceRefs.length === 0) {
    reasons.add("ATTRIBUTION_EVIDENCE_REQUIRED");
  }

  const unresolvedAssumptionIds = outcome.assumptionUpdates
    .filter((assumption) => assumption.status === "UNRESOLVED" || assumption.relevance === "UNKNOWN")
    .map((assumption) => assumption.assumptionId);
  const contradictedMaterialAssumptionIds = outcome.assumptionUpdates
    .filter((assumption) => assumption.status === "CONTRADICTED" && assumption.relevance === "MATERIAL")
    .map((assumption) => assumption.assumptionId);

  if (unresolvedAssumptionIds.length > 0) reasons.add("ASSUMPTION_VERIFICATION_REQUIRED");

  const verificationReasons = [...reasons].filter((reason) =>
    reason.startsWith("OUTCOME_EVIDENCE_") ||
    reason === "OUTCOME_PROVENANCE_REQUIRED" ||
    reason === "OUTCOME_BEFORE_EVALUATION_WINDOW" ||
    reason === "SUCCESS_CRITERION_EVALUATED_EARLY" ||
    reason === "MATERIALITY_UNKNOWN" ||
    reason === "MATERIALITY_EVIDENCE_REQUIRED" ||
    reason === "ATTRIBUTION_EVIDENCE_REQUIRED" ||
    reason === "ASSUMPTION_VERIFICATION_REQUIRED"
  );

  if (verificationReasons.length > 0) {
    reviewState = "VERIFY";
  } else if (contradictedMaterialAssumptionIds.length > 0) {
    reviewState = "RECONSIDER";
    reasons.add("MATERIAL_ASSUMPTION_CONTRADICTED");
  } else if (outcome.materiality === "MATERIAL") {
    if (item.disposition === "SELECTED" && outcome.successCriterionState === "NOT_MET") {
      reviewState = "RECONSIDER";
      reasons.add("SELECTED_SUCCESS_CRITERION_NOT_MET");
    } else if (item.disposition !== "SELECTED" && outcome.successCriterionState === "MET") {
      reviewState = "RECONSIDER";
      reasons.add("NONSELECTED_SUCCESS_CRITERION_MET");
    } else if (outcome.successCriterionState === "INCONCLUSIVE" || outcome.successCriterionState === "NOT_EVALUABLE") {
      reviewState = "VERIFY";
      reasons.add("SUCCESS_CRITERION_UNRESOLVED");
    } else {
      reasons.add("CURRENT_DISPOSITION_NOT_CONTRADICTED");
    }
  } else {
    reasons.add("NON_MATERIAL_OUTCOME");
  }

  const evidenceRefs = refs(
    [
      ...outcome.evidenceRefs,
      ...outcome.materialityEvidenceRefs,
      ...outcome.attributionEvidenceRefs,
      ...outcome.assumptionUpdates.flatMap((assumption) => assumption.evidenceRefs)
    ],
    `${outcome.outcomeId}.allEvidenceRefs`
  );

  return {
    candidateId: outcome.candidateId,
    outcomeId: outcome.outcomeId,
    previousDisposition: item.disposition,
    reviewState,
    reasons: [...reasons].sort((a, b) => a.localeCompare(b)),
    result: outcome.result,
    successCriterionState: outcome.successCriterionState,
    materiality: outcome.materiality,
    attributionClass: outcome.attributionClass,
    evidenceRefs,
    sourceRefs: outcome.sourceRefs,
    confounderRefs: outcome.confounderRefs,
    contradictedMaterialAssumptionIds,
    unresolvedAssumptionIds
  };
}

export function reviewDecisionPortfolioReallocationV1(input: {
  portfolio: DecisionPortfolioV1;
  outcomes: readonly DecisionOutcomeObservationV1[];
  reviewedAt: string;
}): Readonly<DecisionPortfolioReallocationReviewV1> {
  if (input.portfolio.contractVersion !== "DecisionPortfolioV1") {
    throw new DecisionPortfolioReallocationError("INVALID_PORTFOLIO", "source portfolio contract is invalid");
  }
  const reviewedAt = timestamp(input.reviewedAt, "reviewedAt");
  if (Date.parse(reviewedAt) < Date.parse(input.portfolio.generatedAt)) {
    throw new DecisionPortfolioReallocationError("REVIEW_BEFORE_PORTFOLIO", "review cannot precede the source portfolio");
  }
  if (!Array.isArray(input.outcomes) || input.outcomes.length > MAX_OUTCOMES) {
    throw new DecisionPortfolioReallocationError("OUTCOME_BOUND", `at most ${MAX_OUTCOMES} outcomes may be reviewed`);
  }

  const candidateIds = new Set(input.portfolio.items.map((item) => item.candidate.id));
  const seenOutcomeIds = new Set<string>();
  const seenCandidateIds = new Set<string>();
  const normalized = input.outcomes.map((outcome) => {
    const value = normalizeOutcome(outcome, reviewedAt, candidateIds);
    if (seenOutcomeIds.has(value.outcomeId)) {
      throw new DecisionPortfolioReallocationError("DUPLICATE_OUTCOME", `duplicate outcome ${value.outcomeId}`);
    }
    if (seenCandidateIds.has(value.candidateId)) {
      throw new DecisionPortfolioReallocationError(
        "AMBIGUOUS_CANDIDATE_OUTCOME",
        `multiple current outcomes were supplied for ${value.candidateId}`
      );
    }
    seenOutcomeIds.add(value.outcomeId);
    seenCandidateIds.add(value.candidateId);
    return value;
  });

  const candidateReviews = normalized
    .map((outcome) => evaluateOutcome(input.portfolio, outcome))
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const reconsiderCount = candidateReviews.filter((review) => review.reviewState === "RECONSIDER").length;
  const verificationCount = candidateReviews.filter((review) => review.reviewState === "VERIFY").length;
  const status = verificationCount > 0
    ? "VERIFICATION_REQUIRED" as const
    : reconsiderCount > 0
      ? "REVIEW_REQUIRED" as const
      : "NO_CHANGE" as const;
  const evidenceRefs = refs(candidateReviews.flatMap((review) => review.evidenceRefs), "review.evidenceRefs");
  const sourceRefs = refs(candidateReviews.flatMap((review) => review.sourceRefs), "review.sourceRefs");

  const identity = canonical({
    policyVersion: DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1,
    sourcePortfolioId: input.portfolio.portfolioId,
    generatedAt: reviewedAt,
    candidateReviews
  });
  const reviewId = `portfolio-reallocation:${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24)}`;

  return freeze({
    contractVersion: DECISION_PORTFOLIO_REALLOCATION_CONTRACT_VERSION_V1,
    policyVersion: DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1,
    reviewId,
    sourcePortfolioId: input.portfolio.portfolioId,
    generatedAt: reviewedAt,
    status,
    requiresPortfolioRebuild: reconsiderCount > 0 && verificationCount === 0,
    candidateReviews,
    evidenceRefs,
    sourceRefs,
    authority: {
      portfolioMutation: false,
      scoreMutation: false,
      monetaryMutation: false,
      confidenceMutation: false,
      externalAction: false,
      approvalBypass: false
    },
    audit: {
      outcomesConsidered: candidateReviews.length,
      reconsiderCount,
      verificationCount
    }
  });
}
