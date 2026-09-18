import { createHash } from "node:crypto";

import type {
  ExperimentAttributionClassV1,
  ExperimentPortfolioItemV1,
  ExperimentPortfolioV1,
  ExperimentReviewStateV1
} from "@/lib/learning-engine/experiment-portfolio-v1";
import type {
  DecisionDispositionV1,
  DecisionOwnerV1
} from "@/lib/strategy-engine/decision-portfolio-v1";

export const EXPERIMENT_REALLOCATION_REVIEW_VERSION_V1 =
  "ExperimentReallocationReviewV1" as const;
export const EXPERIMENT_REALLOCATION_REVIEW_POLICY_VERSION_V1 =
  "experiment_reallocation_review_v1.0.0" as const;

export type ExperimentReallocationReviewStateV1 =
  | "READY_FOR_REVIEW"
  | "WAIT_FOR_ATTRIBUTION"
  | "NO_REALLOCATION_SIGNAL"
  | "VERIFY";

export type ExperimentReallocationReasonV1 =
  | "STOP_RULE_TRIGGERED"
  | "SCALE_RULE_TRIGGERED"
  | "SCALE_ATTRIBUTION_NOT_ESTABLISHED"
  | "OUTCOME_DOES_NOT_REQUIRE_REALLOCATION"
  | "EXPERIMENT_VERIFY_REQUIRED"
  | "DECISION_CANDIDATE_MISSING"
  | "DECISION_IDENTITY_MISMATCH"
  | "DECISION_EVIDENCE_NOT_KNOWN"
  | "DECISION_PROVENANCE_MISSING"
  | "DUPLICATE_EXPERIMENT_ITEM"
  | "INVALID_CHRONOLOGY"
  | "UPSTREAM_AUTHORITY_WIDENED";

export type ExperimentReallocationSignalV1 = Readonly<{
  experimentId: string;
  candidateId: string;
  title: string | null;
  owner: DecisionOwnerV1 | null;
  currentDisposition: DecisionDispositionV1 | null;
  upstreamReviewState: ExperimentReviewStateV1;
  upstreamAttributionClass: ExperimentAttributionClassV1;
  upstreamCausalClaimAllowed: boolean;
  confounders: readonly string[];
  state: ExperimentReallocationReviewStateV1;
  reasonCodes: readonly ExperimentReallocationReasonV1[];
  nextInternalStep:
    | "REVIEW_REDUCE_OR_STOP_ALLOCATION"
    | "REVIEW_SCALE_ALLOCATION"
    | "COLLECT_ATTRIBUTION_EVIDENCE_BEFORE_SCALE_REVIEW"
    | "VERIFY_EXPERIMENT_AND_PORTFOLIO_EVIDENCE"
    | null;
  candidateEvidenceRefs: readonly string[];
  candidateSourceRefs: readonly string[];
  causalInterpretation: "NOT_INFERRED_HERE";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  predictedOutcome: null;
}>;

export type ExperimentReallocationReviewInputV1 = Readonly<{
  portfolio: ExperimentPortfolioV1;
  reviewedAt: string;
}>;

export type ExperimentReallocationReviewV1 = Readonly<{
  contractVersion: typeof EXPERIMENT_REALLOCATION_REVIEW_VERSION_V1;
  policyVersion: typeof EXPERIMENT_REALLOCATION_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  reviewedAt: string;
  sourceExperimentPortfolioId: string;
  sourceDecisionPortfolioId: string;
  signals: readonly ExperimentReallocationSignalV1[];
  readyExperimentIds: readonly string[];
  waitingExperimentIds: readonly string[];
  verificationExperimentIds: readonly string[];
  portfolioEvidenceRefs: readonly string[];
  portfolioSourceRefs: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    experimentExecutionAuthorized: false;
    experimentStopAuthorized: false;
    experimentScaleAuthorized: false;
    spendChangeAuthorized: false;
    priceChangeAuthorized: false;
    publishAuthorized: false;
    outreachAuthorized: false;
    policyPromotionAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true,
  portfolioMutationAuthorized: false,
  allocationChangeAuthorized: false,
  experimentExecutionAuthorized: false,
  experimentStopAuthorized: false,
  experimentScaleAuthorized: false,
  spendChangeAuthorized: false,
  priceChangeAuthorized: false,
  publishAuthorized: false,
  outreachAuthorized: false,
  policyPromotionAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
} as const);

const LIMITATIONS = Object.freeze([
  "A pre-registered STOP or SCALE review state can request internal allocation review only; it does not change the portfolio or execute the experiment.",
  "STOP review does not establish that the experiment caused the observed result. SCALE review requires upstream causal support before this projection will surface a scale-allocation review.",
  "This projection preserves upstream attribution and confounders without inventing confidence, monetary value, or future outcomes.",
  "Pricing, spend, publishing, outreach, policy promotion, persistence, external action, and approval bypass remain unauthorized."
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function stableId(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 24);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) return null;
  return normalized;
}

function upstreamAuthorityIsSafe(portfolio: ExperimentPortfolioV1): boolean {
  return (
    portfolio.authority.launchExperiment === false &&
    portfolio.authority.changeSpend === false &&
    portfolio.authority.changePrice === false &&
    portfolio.authority.publish === false &&
    portfolio.authority.sendOutreach === false &&
    portfolio.authority.promotePolicy === false
  );
}

function itemState(
  item: ExperimentPortfolioItemV1,
  reasons: ExperimentReallocationReasonV1[]
): ExperimentReallocationReviewStateV1 {
  if (
    reasons.some((reason) =>
      [
        "EXPERIMENT_VERIFY_REQUIRED",
        "DECISION_CANDIDATE_MISSING",
        "DECISION_IDENTITY_MISMATCH",
        "DECISION_EVIDENCE_NOT_KNOWN",
        "DECISION_PROVENANCE_MISSING",
        "DUPLICATE_EXPERIMENT_ITEM",
        "INVALID_CHRONOLOGY",
        "UPSTREAM_AUTHORITY_WIDENED"
      ].includes(reason)
    )
  ) {
    return "VERIFY";
  }
  if (
    item.reviewState === "SCALE_REVIEW" &&
    (item.attributionClass !== "CAUSAL_SUPPORTED" || !item.causalClaimAllowed)
  ) {
    return "WAIT_FOR_ATTRIBUTION";
  }
  if (item.reviewState === "STOP_REVIEW" || item.reviewState === "SCALE_REVIEW") {
    return "READY_FOR_REVIEW";
  }
  return "NO_REALLOCATION_SIGNAL";
}

function nextStep(
  state: ExperimentReallocationReviewStateV1,
  reviewState: ExperimentReviewStateV1
): ExperimentReallocationSignalV1["nextInternalStep"] {
  if (state === "VERIFY") return "VERIFY_EXPERIMENT_AND_PORTFOLIO_EVIDENCE";
  if (state === "WAIT_FOR_ATTRIBUTION") return "COLLECT_ATTRIBUTION_EVIDENCE_BEFORE_SCALE_REVIEW";
  if (state === "READY_FOR_REVIEW" && reviewState === "STOP_REVIEW") {
    return "REVIEW_REDUCE_OR_STOP_ALLOCATION";
  }
  if (state === "READY_FOR_REVIEW" && reviewState === "SCALE_REVIEW") {
    return "REVIEW_SCALE_ALLOCATION";
  }
  return null;
}

/**
 * Bridges canonical experiment outcome review states into a bounded portfolio
 * reassessment queue. It deliberately does not mutate allocation or treat a
 * threshold result as proof of causality.
 */
export function buildExperimentReallocationReviewV1(
  input: ExperimentReallocationReviewInputV1
): ExperimentReallocationReviewV1 {
  if (!input?.portfolio || input.portfolio.contractVersion !== "ExperimentPortfolioV1") {
    throw new Error("EXPERIMENT_REALLOCATION_INVALID_PORTFOLIO");
  }

  const reviewedAt = canonicalTimestamp(input.reviewedAt);
  if (!reviewedAt) throw new Error("EXPERIMENT_REALLOCATION_INVALID_REVIEWED_AT");
  const generatedAt = canonicalTimestamp(input.portfolio.generatedAt);
  const chronologyInvalid = !generatedAt || Date.parse(generatedAt) > Date.parse(reviewedAt);
  const authoritySafe = upstreamAuthorityIsSafe(input.portfolio);

  const decisionItems = new Map(
    input.portfolio.decisionPortfolio.items.map((item) => [item.candidate.id, item])
  );
  const experimentCounts = new Map<string, number>();
  for (const item of input.portfolio.items) {
    experimentCounts.set(item.experimentId, (experimentCounts.get(item.experimentId) ?? 0) + 1);
  }

  const signals = input.portfolio.items
    .map((item): ExperimentReallocationSignalV1 => {
      const reasons: ExperimentReallocationReasonV1[] = [];
      const decisionItem = decisionItems.get(item.decisionCandidateId) ?? null;

      if ((experimentCounts.get(item.experimentId) ?? 0) > 1) {
        reasons.push("DUPLICATE_EXPERIMENT_ITEM");
      }
      if (chronologyInvalid) reasons.push("INVALID_CHRONOLOGY");
      if (!authoritySafe) reasons.push("UPSTREAM_AUTHORITY_WIDENED");
      if (item.preRegistrationState !== "VALID" || item.verificationReasons.length > 0 || item.reviewState === "VERIFY_REQUIRED") {
        reasons.push("EXPERIMENT_VERIFY_REQUIRED");
      }
      if (!decisionItem) {
        reasons.push("DECISION_CANDIDATE_MISSING");
      } else {
        if (
          decisionItem.candidate.id !== item.experimentId ||
          decisionItem.candidate.candidateType !== "EXPERIMENT"
        ) {
          reasons.push("DECISION_IDENTITY_MISMATCH");
        }
        if (decisionItem.candidate.evidenceState !== "KNOWN") {
          reasons.push("DECISION_EVIDENCE_NOT_KNOWN");
        }
        if (
          decisionItem.candidate.evidenceRefs.length === 0 ||
          decisionItem.candidate.sourceRefs.length === 0
        ) {
          reasons.push("DECISION_PROVENANCE_MISSING");
        }
      }

      if (item.reviewState === "STOP_REVIEW") reasons.push("STOP_RULE_TRIGGERED");
      else if (item.reviewState === "SCALE_REVIEW") {
        reasons.push("SCALE_RULE_TRIGGERED");
        if (item.attributionClass !== "CAUSAL_SUPPORTED" || !item.causalClaimAllowed) {
          reasons.push("SCALE_ATTRIBUTION_NOT_ESTABLISHED");
        }
      } else if (item.reviewState !== "VERIFY_REQUIRED") {
        reasons.push("OUTCOME_DOES_NOT_REQUIRE_REALLOCATION");
      }

      const reasonCodes = uniqueSorted(reasons) as ExperimentReallocationReasonV1[];
      const state = itemState(item, reasonCodes);

      return {
        experimentId: item.experimentId,
        candidateId: item.decisionCandidateId,
        title: decisionItem?.candidate.title ?? null,
        owner: decisionItem?.candidate.owner ?? null,
        currentDisposition: decisionItem?.disposition ?? null,
        upstreamReviewState: item.reviewState,
        upstreamAttributionClass: item.attributionClass,
        upstreamCausalClaimAllowed: item.causalClaimAllowed,
        confounders: uniqueSorted(item.confounders),
        state,
        reasonCodes,
        nextInternalStep: nextStep(state, item.reviewState),
        candidateEvidenceRefs: uniqueSorted(decisionItem?.candidate.evidenceRefs ?? []),
        candidateSourceRefs: uniqueSorted(decisionItem?.candidate.sourceRefs ?? []),
        causalInterpretation: "NOT_INFERRED_HERE",
        confidence: "NOT_ESTABLISHED",
        monetaryValue: null,
        predictedOutcome: null
      };
    })
    .sort((a, b) => a.experimentId.localeCompare(b.experimentId));

  const readyExperimentIds = uniqueSorted(
    signals.filter((signal) => signal.state === "READY_FOR_REVIEW").map((signal) => signal.experimentId)
  );
  const waitingExperimentIds = uniqueSorted(
    signals.filter((signal) => signal.state === "WAIT_FOR_ATTRIBUTION").map((signal) => signal.experimentId)
  );
  const verificationExperimentIds = uniqueSorted(
    signals.filter((signal) => signal.state === "VERIFY").map((signal) => signal.experimentId)
  );
  const portfolioEvidenceRefs = uniqueSorted(input.portfolio.evidenceRefs);
  const portfolioSourceRefs = uniqueSorted(input.portfolio.sourceRefs);

  const reviewId = `experiment-reallocation-review:${stableId({
    policyVersion: EXPERIMENT_REALLOCATION_REVIEW_POLICY_VERSION_V1,
    reviewedAt,
    sourceExperimentPortfolioId: input.portfolio.portfolioId,
    sourceDecisionPortfolioId: input.portfolio.decisionPortfolio.portfolioId,
    signals,
    portfolioEvidenceRefs,
    portfolioSourceRefs
  })}`;

  return deepFreeze({
    contractVersion: EXPERIMENT_REALLOCATION_REVIEW_VERSION_V1,
    policyVersion: EXPERIMENT_REALLOCATION_REVIEW_POLICY_VERSION_V1,
    reviewId,
    reviewedAt,
    sourceExperimentPortfolioId: input.portfolio.portfolioId,
    sourceDecisionPortfolioId: input.portfolio.decisionPortfolio.portfolioId,
    signals,
    readyExperimentIds,
    waitingExperimentIds,
    verificationExperimentIds,
    portfolioEvidenceRefs,
    portfolioSourceRefs,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
