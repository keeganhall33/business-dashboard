import { createHash } from "node:crypto";

import type { CounterfactualReviewV1 } from "../decision-simulation/counterfactual-review-v1";
import type { DecisionDispositionV1, DecisionPortfolioV1 } from "./decision-portfolio-v1";

export const COUNTERFACTUAL_PORTFOLIO_REVIEW_VERSION_V1 =
  "CounterfactualPortfolioReviewV1" as const;
export const COUNTERFACTUAL_PORTFOLIO_REVIEW_POLICY_VERSION_V1 =
  "counterfactual_portfolio_review_v1.0.0" as const;

const MAX_REVIEW_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_REFS = 200;

type CounterfactualScenarioV1 = CounterfactualReviewV1["scenarios"][number];
type CounterfactualDimensionV1 = CounterfactualScenarioV1["dimensions"][number];
type CounterfactualAssumptionV1 = CounterfactualScenarioV1["assumptions"][number];
type CounterfactualResourceDemandV1 = CounterfactualScenarioV1["resourceDemands"][number];

export type CounterfactualPortfolioReviewStateV1 =
  | "READY_FOR_INTERNAL_REVIEW"
  | "KEEGAN_REVIEW_REQUIRED"
  | "VERIFY_REQUIRED"
  | "BLOCKED";

export type CounterfactualPortfolioReviewReasonV1 =
  | "COUNTERFACTUAL_READY_FOR_PORTFOLIO_REVIEW"
  | "COUNTERFACTUAL_REQUIRES_VERIFICATION"
  | "COUNTERFACTUAL_BLOCKED"
  | "PORTFOLIO_CONTRACT_INVALID"
  | "COUNTERFACTUAL_CONTRACT_INVALID"
  | "TARGET_CANDIDATE_MISSING"
  | "TARGET_CANDIDATE_DUPLICATED"
  | "TARGET_NOT_DECISION"
  | "TARGET_NOT_KNOWN"
  | "TARGET_EVIDENCE_MISSING"
  | "TARGET_SOURCE_MISSING"
  | "INVALID_REVIEW_TIME"
  | "INVALID_FRESHNESS_POLICY"
  | "PORTFOLIO_TIME_INVALID"
  | "COUNTERFACTUAL_REVIEW_TIME_INVALID"
  | "REVIEW_PRECEDES_PORTFOLIO"
  | "REVIEW_IN_FUTURE"
  | "REVIEW_STALE"
  | "COUNTERFACTUAL_AUTHORITY_WIDENED"
  | "COUNTERFACTUAL_EMPTY_COMPARISON"
  | "COUNTERFACTUAL_COMPARISON_INVARIANT_FAILED"
  | "COUNTERFACTUAL_UNKNOWN_APPROVAL"
  | "COUNTERFACTUAL_UNKNOWN_REVERSIBILITY"
  | "KEEGAN_APPROVAL_REQUIRED"
  | "NON_REVERSIBLE_SCENARIO_REQUIRES_KEEGAN_REVIEW";

export type CounterfactualPortfolioReviewV1 = Readonly<{
  contractVersion: typeof COUNTERFACTUAL_PORTFOLIO_REVIEW_VERSION_V1;
  policyVersion: typeof COUNTERFACTUAL_PORTFOLIO_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  generatedAt: string;
  sourcePortfolioId: string;
  sourceCounterfactualReviewId: string;
  candidateId: string;
  previousDisposition: DecisionDispositionV1 | null;
  state: CounterfactualPortfolioReviewStateV1;
  reasonCodes: readonly CounterfactualPortfolioReviewReasonV1[];
  sourceStatus: CounterfactualReviewV1["status"] | null;
  sourceEvaluatedAt: string | null;
  reviewAgeMs: number | null;
  scenarioIds: readonly string[];
  comparisonDimensionRefs: readonly string[];
  sourceVerificationReasons: readonly string[];
  sourceBlockerReasons: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  nextInternalStep:
    | "REASSESS_CURRENT_DECISION_PORTFOLIO_CANDIDATE"
    | "PRESENT_COMPARISON_FOR_KEEGAN_REVIEW"
    | "REFRESH_OR_VERIFY_COUNTERFACTUAL_EVIDENCE"
    | null;
  scenarioWinner: null;
  recommendedDisposition: null;
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  outcomePrediction: null;
  causalInterpretation: "NOT_ESTABLISHED";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    scenarioSelectionAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    scoreMutationAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    experimentExecutionAuthorized: false;
    campaignExecutionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    externalActionAuthorized: false;
    persistenceAuthorized: false;
    approvalBypassAuthorized: false;
    causalAttributionAuthorized: false;
  }>;
}>;

export type CounterfactualPortfolioReviewInputV1 = Readonly<{
  portfolio: DecisionPortfolioV1;
  counterfactualReview: CounterfactualReviewV1;
  reviewedAt: string;
  maximumReviewAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  scenarioSelectionAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  allocationChangeAuthorized: false as const,
  scoreMutationAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  externalActionAuthorized: false as const,
  persistenceAuthorized: false as const,
  approvalBypassAuthorized: false as const,
  causalAttributionAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "A comparison-ready counterfactual is evidence for reviewing a current decision, not a scenario winner or instruction to change allocation.",
  "The bridge does not synthesize confidence, causal attribution, monetary value, expected return, or future outcomes from scenario comparison.",
  "Only an exact current DecisionPortfolioV1 candidate whose ID equals the counterfactual decision ID can be reviewed; fuzzy title, category, or semantic matching is prohibited.",
  "Any portfolio, allocation, campaign, experiment, pricing, negotiation, persistence, or external action remains separately governed and requires its own current evidence and authority."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function uniqueSorted(values: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(values)) return Object.freeze([]);
  return Object.freeze(
    [...new Set(values.map((value) => text(value)).filter((value): value is string => value !== null))]
      .slice(0, MAX_REFS)
      .sort((a, b) => a.localeCompare(b))
  );
}

function stableReviewId(values: readonly string[]): string {
  return `counterfactual-portfolio:${createHash("sha256")
    .update(values.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function safeCounterfactualAuthority(review: CounterfactualReviewV1 | undefined): boolean {
  const authority = review?.actionAuthority;
  return Boolean(
    authority
      && authority.analysisOnly === true
      && authority.scenarioSelectionAuthorized === false
      && authority.allocationMutationAuthorized === false
      && authority.experimentLaunchAuthorized === false
      && authority.externalActionAuthorized === false
      && authority.spendAuthorized === false
      && authority.pricingChangeAuthorized === false
      && authority.contractAuthorized === false
      && authority.outreachAuthorized === false
      && authority.publishAuthorized === false
      && authority.approvalBypassAuthorized === false
      && authority.causalAttributionAuthorized === false
  );
}

function counterfactualEvidence(review: CounterfactualReviewV1 | undefined): readonly string[] {
  if (!review || !Array.isArray(review.scenarios)) return Object.freeze([]);
  return uniqueSorted(
    review.scenarios.flatMap((scenario: CounterfactualScenarioV1) => [
      ...scenario.dimensions.flatMap(
        (dimension: CounterfactualDimensionV1) => dimension.evidenceRefs
      ),
      ...scenario.assumptions.flatMap(
        (assumption: CounterfactualAssumptionV1) => assumption.evidenceRefs
      ),
      ...scenario.resourceDemands.flatMap(
        (resource: CounterfactualResourceDemandV1) => resource.evidenceRefs
      )
    ])
  );
}

function comparisonInvariantHolds(review: CounterfactualReviewV1): boolean {
  return review.comparisons.every(
    (comparison) =>
      comparison.winnerSelected === false
      && comparison.causalClaimMade === false
      && comparison.monetaryValueSynthesized === false
  );
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

export function reviewCounterfactualForPortfolioV1(
  input: CounterfactualPortfolioReviewInputV1
): CounterfactualPortfolioReviewV1 {
  const portfolio = input?.portfolio;
  const review = input?.counterfactualReview;
  const reviewedAt = timestamp(input?.reviewedAt);
  const portfolioGeneratedAt = timestamp(portfolio?.generatedAt);
  const sourceEvaluatedAt = timestamp(review?.evaluatedAt);
  const maximumAge = input?.maximumReviewAgeMs;

  const blocking = new Set<CounterfactualPortfolioReviewReasonV1>();
  const verification = new Set<CounterfactualPortfolioReviewReasonV1>();
  const humanReview = new Set<CounterfactualPortfolioReviewReasonV1>();

  if (portfolio?.contractVersion !== "DecisionPortfolioV1") {
    blocking.add("PORTFOLIO_CONTRACT_INVALID");
  }
  if (review?.contractVersion !== "CounterfactualReviewV1" || !text(review?.reviewId) || !text(review?.decisionId)) {
    blocking.add("COUNTERFACTUAL_CONTRACT_INVALID");
  }
  if (!reviewedAt) blocking.add("INVALID_REVIEW_TIME");
  if (!portfolioGeneratedAt) blocking.add("PORTFOLIO_TIME_INVALID");
  if (!sourceEvaluatedAt) blocking.add("COUNTERFACTUAL_REVIEW_TIME_INVALID");
  if (!Number.isFinite(maximumAge) || maximumAge <= 0 || maximumAge > MAX_REVIEW_AGE_MS) {
    blocking.add("INVALID_FRESHNESS_POLICY");
  }

  const candidateId = text(review?.decisionId) ?? "unknown-decision";
  const matches = portfolio?.contractVersion === "DecisionPortfolioV1"
    ? portfolio.items.filter((item) => item.candidate.id === candidateId)
    : [];
  const candidate = matches.length === 1 ? matches[0] : null;

  if (matches.length === 0) blocking.add("TARGET_CANDIDATE_MISSING");
  if (matches.length > 1) blocking.add("TARGET_CANDIDATE_DUPLICATED");
  if (candidate?.candidate.candidateType !== undefined && candidate.candidate.candidateType !== "DECISION") {
    blocking.add("TARGET_NOT_DECISION");
  }
  if (candidate && candidate.candidate.evidenceState !== "KNOWN") {
    verification.add("TARGET_NOT_KNOWN");
  }
  if (candidate && uniqueSorted(candidate.candidate.evidenceRefs).length === 0) {
    verification.add("TARGET_EVIDENCE_MISSING");
  }
  if (candidate && uniqueSorted(candidate.candidate.sourceRefs).length === 0) {
    verification.add("TARGET_SOURCE_MISSING");
  }

  if (reviewedAt && portfolioGeneratedAt && Date.parse(reviewedAt) < Date.parse(portfolioGeneratedAt)) {
    blocking.add("REVIEW_PRECEDES_PORTFOLIO");
  }
  if (sourceEvaluatedAt && portfolioGeneratedAt && Date.parse(sourceEvaluatedAt) < Date.parse(portfolioGeneratedAt)) {
    blocking.add("REVIEW_PRECEDES_PORTFOLIO");
  }

  let reviewAgeMs: number | null = null;
  if (reviewedAt && sourceEvaluatedAt) {
    reviewAgeMs = Date.parse(reviewedAt) - Date.parse(sourceEvaluatedAt);
    if (reviewAgeMs < 0) blocking.add("REVIEW_IN_FUTURE");
    else if (Number.isFinite(maximumAge) && maximumAge > 0 && reviewAgeMs > maximumAge) {
      verification.add("REVIEW_STALE");
    }
  }

  if (review && !safeCounterfactualAuthority(review)) {
    blocking.add("COUNTERFACTUAL_AUTHORITY_WIDENED");
  }
  if (review && !comparisonInvariantHolds(review)) {
    blocking.add("COUNTERFACTUAL_COMPARISON_INVARIANT_FAILED");
  }

  if (review?.status === "BLOCKED") blocking.add("COUNTERFACTUAL_BLOCKED");
  if (review?.status === "VERIFY_REQUIRED") verification.add("COUNTERFACTUAL_REQUIRES_VERIFICATION");
  if (review?.status === "COMPARISON_READY" && review.comparisons.length === 0) {
    blocking.add("COUNTERFACTUAL_EMPTY_COMPARISON");
  }

  if (review) {
    if (review.scenarios.some((scenario) => scenario.approvalClass === "UNKNOWN")) {
      verification.add("COUNTERFACTUAL_UNKNOWN_APPROVAL");
    }
    if (review.scenarios.some((scenario) => scenario.reversibility === "UNKNOWN")) {
      verification.add("COUNTERFACTUAL_UNKNOWN_REVERSIBILITY");
    }
    if (candidate?.candidate.approvalClass === "KEEGAN" || review.scenarios.some((scenario) => scenario.approvalClass === "KEEGAN")) {
      humanReview.add("KEEGAN_APPROVAL_REQUIRED");
    }
    if (review.scenarios.some((scenario) => scenario.reversibility === "IRREVERSIBLE" || scenario.reversibility === "PARTIALLY_REVERSIBLE")) {
      humanReview.add("NON_REVERSIBLE_SCENARIO_REQUIRES_KEEGAN_REVIEW");
    }
  }

  let state: CounterfactualPortfolioReviewStateV1;
  if (blocking.size > 0) state = "BLOCKED";
  else if (verification.size > 0) state = "VERIFY_REQUIRED";
  else if (humanReview.size > 0) state = "KEEGAN_REVIEW_REQUIRED";
  else state = "READY_FOR_INTERNAL_REVIEW";

  const reasonCodes = state === "READY_FOR_INTERNAL_REVIEW"
    ? Object.freeze(["COUNTERFACTUAL_READY_FOR_PORTFOLIO_REVIEW"] as const)
    : Object.freeze(
        [...blocking, ...verification, ...humanReview].sort((a, b) => a.localeCompare(b))
      );

  const generatedAt = reviewedAt ?? input?.reviewedAt ?? "INVALID";
  const sourcePortfolioId = text(portfolio?.portfolioId) ?? "unknown-portfolio";
  const sourceCounterfactualReviewId = text(review?.reviewId) ?? "unknown-counterfactual-review";
  const scenarioIds = uniqueSorted(review?.scenarios?.map((scenario) => scenario.scenarioId));
  const comparisonDimensionRefs = uniqueSorted(
    review?.comparisons?.map((comparison) => comparison.dimensionRef)
  );
  const evidenceRefs = counterfactualEvidence(review);
  const sourceRefs = uniqueSorted(candidate?.candidate.sourceRefs);

  const nextInternalStep = state === "READY_FOR_INTERNAL_REVIEW"
    ? "REASSESS_CURRENT_DECISION_PORTFOLIO_CANDIDATE"
    : state === "KEEGAN_REVIEW_REQUIRED"
      ? "PRESENT_COMPARISON_FOR_KEEGAN_REVIEW"
      : state === "VERIFY_REQUIRED"
        ? "REFRESH_OR_VERIFY_COUNTERFACTUAL_EVIDENCE"
        : null;

  return freezeDeep({
    contractVersion: COUNTERFACTUAL_PORTFOLIO_REVIEW_VERSION_V1,
    policyVersion: COUNTERFACTUAL_PORTFOLIO_REVIEW_POLICY_VERSION_V1,
    reviewId: stableReviewId([
      sourcePortfolioId,
      sourceCounterfactualReviewId,
      candidateId,
      generatedAt
    ]),
    generatedAt,
    sourcePortfolioId,
    sourceCounterfactualReviewId,
    candidateId,
    previousDisposition: candidate?.disposition ?? null,
    state,
    reasonCodes,
    sourceStatus: review?.status ?? null,
    sourceEvaluatedAt,
    reviewAgeMs,
    scenarioIds,
    comparisonDimensionRefs,
    sourceVerificationReasons: uniqueSorted(review?.verificationReasons),
    sourceBlockerReasons: uniqueSorted(review?.blockerReasons),
    evidenceRefs,
    sourceRefs,
    nextInternalStep,
    scenarioWinner: null,
    recommendedDisposition: null,
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    outcomePrediction: null,
    causalInterpretation: "NOT_ESTABLISHED",
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
