import { createHash } from "node:crypto";

import {
  DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_POLICY_VERSION_V1,
  DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_VERSION_V1,
  type DecisionPortfolioDependencyEvidenceReviewV1
} from "./decision-portfolio-dependency-evidence-v1";
import {
  compileDecisionPortfolioExecutionV1,
  type DecisionPortfolioExecutionCompilerV1
} from "./decision-portfolio-execution-compiler-v1";
import type { DecisionPortfolioV1 } from "./decision-portfolio-v1";

export const EVIDENCE_BOUND_DECISION_PORTFOLIO_PREPARATION_VERSION_V1 =
  "EvidenceBoundDecisionPortfolioPreparationV1" as const;
export const EVIDENCE_BOUND_DECISION_PORTFOLIO_PREPARATION_POLICY_VERSION_V1 =
  "evidence_bound_decision_portfolio_preparation_v1.0.0" as const;

const MAX_REVIEW_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_SELECTED = 500;

export type EvidenceBoundDecisionPortfolioPreparationStateV1 =
  | "PREPARED"
  | "WAITING_DEPENDENCIES"
  | "VERIFY_SOURCE";

export type EvidenceBoundDecisionPortfolioPreparationReasonV1 =
  | "INVALID_INPUT"
  | "DEPENDENCY_REVIEW_CONTRACT_INVALID"
  | "DEPENDENCY_REVIEW_AUTHORITY_WIDENED"
  | "DEPENDENCY_REVIEW_INTERPRETATION_WIDENED"
  | "DEPENDENCY_REVIEW_TIMESTAMP_INVALID"
  | "DEPENDENCY_REVIEW_PREDATES_PORTFOLIO"
  | "DEPENDENCY_REVIEW_FROM_FUTURE"
  | "DEPENDENCY_REVIEW_STALE"
  | "PORTFOLIO_IDENTITY_MISMATCH"
  | "SELECTED_CANDIDATE_BOUND_EXCEEDED"
  | "DUPLICATE_SELECTED_CANDIDATE"
  | "DEPENDENCY_SET_MISMATCH"
  | "CANDIDATE_REVIEW_SET_MISMATCH"
  | "CANDIDATE_DEPENDENCY_BINDING_MISMATCH"
  | "SATISFIED_DEPENDENCY_SET_MISMATCH"
  | "DEPENDENCY_REVIEW_REQUIRES_VERIFICATION"
  | "DEPENDENCIES_NOT_READY";

export type EvidenceBoundDecisionPortfolioPreparationInputV1 = Readonly<{
  portfolio: DecisionPortfolioV1;
  dependencyReview: DecisionPortfolioDependencyEvidenceReviewV1;
  generatedAt: string;
  maximumDependencyReviewAgeMs: number;
  maximumPortfolioAgeMs: number;
  previousIdempotencyKeys?: readonly string[];
}>;

export type EvidenceBoundDecisionPortfolioPreparationV1 = Readonly<{
  contractVersion: typeof EVIDENCE_BOUND_DECISION_PORTFOLIO_PREPARATION_VERSION_V1;
  policyVersion: typeof EVIDENCE_BOUND_DECISION_PORTFOLIO_PREPARATION_POLICY_VERSION_V1;
  preparationId: string;
  state: EvidenceBoundDecisionPortfolioPreparationStateV1;
  generatedAt: string | null;
  portfolioId: string | null;
  dependencyReviewStatus: DecisionPortfolioDependencyEvidenceReviewV1["status"] | null;
  reasonCodes: readonly EvidenceBoundDecisionPortfolioPreparationReasonV1[];
  verifiedSatisfiedDependencyIds: readonly string[];
  executionCompiler: Readonly<DecisionPortfolioExecutionCompilerV1> | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causality: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    preparationCompilation: boolean;
    portfolioMutation: false;
    dependencyMutation: false;
    execution: false;
    externalAction: false;
    persistence: false;
    spend: false;
    pricing: false;
    outreach: false;
    publish: false;
    contractCommitment: false;
    rightsCommitment: false;
    approvalBypass: false;
  }>;
}>;

const EXPECTED_REVIEW_AUTHORITY = Object.freeze({
  analysisOnly: true,
  preparationInputCompilation: true,
  portfolioMutationAuthorized: false,
  dependencyMutationAuthorized: false,
  executionAuthorized: false,
  persistenceAuthorized: false,
  providerWriteAuthorized: false,
  externalActionAuthorized: false,
  spendAuthorized: false,
  approvalBypassAuthorized: false
});

const LIMITATIONS = Object.freeze([
  "This bridge prepares selected portfolio work only after dependency evidence has passed the canonical dependency review and still binds exactly to the current portfolio.",
  "A PREPARED result is not execution authority. Every prepared handoff preserves its existing review, owner, Keegan-approval, runtime-policy, blocker, freshness, and idempotency gates.",
  "Dependency completion is preserved as an upstream recorded fact and does not establish success, causality, confidence, monetary value, priority, or an expected outcome for dependent work.",
  "No portfolio/dependency mutation, persistence, spend, pricing, outreach, publishing, commitment, external execution, or approval bypass is authorized."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString() === normalized ? normalized : null;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function exactAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(EXPECTED_REVIEW_AUTHORITY).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) =>
      key === expectedKeys[index]
      && actual[key] === EXPECTED_REVIEW_AUTHORITY[key as keyof typeof EXPECTED_REVIEW_AUTHORITY]
    );
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `evidence-bound-portfolio-preparation:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function result(
  input: EvidenceBoundDecisionPortfolioPreparationInputV1,
  generatedAt: string | null,
  portfolioId: string | null,
  state: EvidenceBoundDecisionPortfolioPreparationStateV1,
  reasons: readonly EvidenceBoundDecisionPortfolioPreparationReasonV1[],
  satisfiedDependencyIds: readonly string[],
  compiler: DecisionPortfolioExecutionCompilerV1 | null,
  evidenceRefs: readonly string[],
  sourceRefs: readonly string[]
): EvidenceBoundDecisionPortfolioPreparationV1 {
  const reasonCodes = uniqueSorted(reasons) as readonly EvidenceBoundDecisionPortfolioPreparationReasonV1[];
  const verifiedSatisfiedDependencyIds = uniqueSorted(satisfiedDependencyIds);
  return deepFreeze({
    contractVersion: EVIDENCE_BOUND_DECISION_PORTFOLIO_PREPARATION_VERSION_V1,
    policyVersion: EVIDENCE_BOUND_DECISION_PORTFOLIO_PREPARATION_POLICY_VERSION_V1,
    preparationId: stableId([
      portfolioId ?? "<invalid>",
      generatedAt ?? "<invalid>",
      state,
      reasonCodes.join("|"),
      verifiedSatisfiedDependencyIds.join("|")
    ]),
    state,
    generatedAt,
    portfolioId,
    dependencyReviewStatus: input?.dependencyReview?.status ?? null,
    reasonCodes,
    verifiedSatisfiedDependencyIds,
    executionCompiler: compiler,
    evidenceRefs: uniqueSorted(evidenceRefs),
    sourceRefs: uniqueSorted(sourceRefs),
    causality: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: Object.freeze({
      analysisOnly: true as const,
      preparationCompilation: state === "PREPARED" && compiler !== null,
      portfolioMutation: false as const,
      dependencyMutation: false as const,
      execution: false as const,
      externalAction: false as const,
      persistence: false as const,
      spend: false as const,
      pricing: false as const,
      outreach: false as const,
      publish: false as const,
      contractCommitment: false as const,
      rightsCommitment: false as const,
      approvalBypass: false as const
    })
  });
}

/**
 * Canonical dependency-evidence -> preparation bridge. It refuses the execution
 * compiler's bare `satisfiedDependencyIds` seam unless those IDs come from one
 * current dependency review that still binds exactly to the selected portfolio.
 * The underlying compiler remains preparation-only and all execution authority
 * stays false.
 */
export function compileEvidenceBoundDecisionPortfolioPreparationV1(
  input: EvidenceBoundDecisionPortfolioPreparationInputV1
): EvidenceBoundDecisionPortfolioPreparationV1 {
  const portfolio = input?.portfolio;
  const review = input?.dependencyReview;
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  const portfolioGeneratedAt = canonicalTimestamp(portfolio?.generatedAt);
  const reviewedAt = canonicalTimestamp(review?.reviewedAt);
  const portfolioId = text(portfolio?.portfolioId);
  const reasons: EvidenceBoundDecisionPortfolioPreparationReasonV1[] = [];

  if (
    !portfolio
    || portfolio.contractVersion !== "DecisionPortfolioV1"
    || !portfolioId
    || !generatedAt
    || !portfolioGeneratedAt
    || !review
    || !Number.isFinite(input?.maximumDependencyReviewAgeMs)
    || input.maximumDependencyReviewAgeMs <= 0
    || input.maximumDependencyReviewAgeMs > MAX_REVIEW_AGE_MS
    || !Number.isFinite(input?.maximumPortfolioAgeMs)
    || input.maximumPortfolioAgeMs < 0
  ) {
    reasons.push("INVALID_INPUT");
  }

  if (
    review?.contractVersion !== DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_VERSION_V1
    || review?.policyVersion !== DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_POLICY_VERSION_V1
  ) reasons.push("DEPENDENCY_REVIEW_CONTRACT_INVALID");

  const expectedPreparationAuthority = review?.status === "READY_FOR_EXECUTION_COMPILER";
  if (
    !review?.authority
    || (expectedPreparationAuthority
      ? !exactAuthority(review.authority)
      : review.authority.analysisOnly !== true
        || review.authority.preparationInputCompilation !== false
        || review.authority.portfolioMutationAuthorized !== false
        || review.authority.dependencyMutationAuthorized !== false
        || review.authority.executionAuthorized !== false
        || review.authority.persistenceAuthorized !== false
        || review.authority.providerWriteAuthorized !== false
        || review.authority.externalActionAuthorized !== false
        || review.authority.spendAuthorized !== false
        || review.authority.approvalBypassAuthorized !== false)
  ) reasons.push("DEPENDENCY_REVIEW_AUTHORITY_WIDENED");

  if (
    review?.confidence !== "NOT_ESTABLISHED"
    || review?.causalInterpretation !== "NOT_ESTABLISHED"
    || review?.monetaryValue !== null
  ) reasons.push("DEPENDENCY_REVIEW_INTERPRETATION_WIDENED");

  if (!reviewedAt) reasons.push("DEPENDENCY_REVIEW_TIMESTAMP_INVALID");
  if (generatedAt && portfolioGeneratedAt && reviewedAt) {
    const generatedAtMs = Date.parse(generatedAt);
    const portfolioGeneratedAtMs = Date.parse(portfolioGeneratedAt);
    const reviewedAtMs = Date.parse(reviewedAt);
    if (reviewedAtMs < portfolioGeneratedAtMs) reasons.push("DEPENDENCY_REVIEW_PREDATES_PORTFOLIO");
    if (reviewedAtMs > generatedAtMs) reasons.push("DEPENDENCY_REVIEW_FROM_FUTURE");
    else if (
      Number.isFinite(input.maximumDependencyReviewAgeMs)
      && generatedAtMs - reviewedAtMs > input.maximumDependencyReviewAgeMs
    ) reasons.push("DEPENDENCY_REVIEW_STALE");
  }

  if (portfolioId && text(review?.portfolioId) !== portfolioId) reasons.push("PORTFOLIO_IDENTITY_MISMATCH");

  const selectedItems = Array.isArray(portfolio?.items)
    ? portfolio.items.filter((item) => item.disposition === "SELECTED")
    : [];
  if (selectedItems.length > MAX_SELECTED) reasons.push("SELECTED_CANDIDATE_BOUND_EXCEEDED");

  const selectedIds = selectedItems.map((item) => item.candidate.id);
  if (new Set(selectedIds).size !== selectedIds.length) reasons.push("DUPLICATE_SELECTED_CANDIDATE");

  const expectedDependencyIds = uniqueSorted(
    selectedItems.flatMap((item) => item.candidate.dependencyIds)
  );
  if (!sameStrings(review?.referencedDependencyIds ?? [], expectedDependencyIds)) {
    reasons.push("DEPENDENCY_SET_MISMATCH");
  }

  const candidateReviewById = new Map((review?.candidateReviews ?? []).map((item) => [item.candidateId, item] as const));
  if (
    candidateReviewById.size !== (review?.candidateReviews?.length ?? 0)
    || candidateReviewById.size !== selectedItems.length
    || selectedItems.some((item) => !candidateReviewById.has(item.candidate.id))
  ) reasons.push("CANDIDATE_REVIEW_SET_MISMATCH");

  for (const item of selectedItems) {
    const candidateReview = candidateReviewById.get(item.candidate.id);
    if (!candidateReview) continue;
    if (!sameStrings(candidateReview.dependencyIds, item.candidate.dependencyIds)) {
      reasons.push("CANDIDATE_DEPENDENCY_BINDING_MISMATCH");
    }
  }

  if (review?.status === "READY_FOR_EXECUTION_COMPILER") {
    if (!sameStrings(review.satisfiedDependencyIds, expectedDependencyIds)) {
      reasons.push("SATISFIED_DEPENDENCY_SET_MISMATCH");
    }
    if (review.candidateReviews.some((candidate) => candidate.state !== "READY")) {
      reasons.push("SATISFIED_DEPENDENCY_SET_MISMATCH");
    }
  }

  const evidenceRefs = Array.isArray(review?.evidenceRefs) ? review.evidenceRefs : [];
  const sourceRefs = Array.isArray(review?.sourceRefs) ? review.sourceRefs : [];
  if (reasons.length > 0) {
    return result(input, generatedAt, portfolioId, "VERIFY_SOURCE", reasons, [], null, evidenceRefs, sourceRefs);
  }

  if (review.status === "VERIFY_DEPENDENCY_EVIDENCE") {
    return result(
      input,
      generatedAt,
      portfolioId,
      "VERIFY_SOURCE",
      ["DEPENDENCY_REVIEW_REQUIRES_VERIFICATION"],
      [],
      null,
      evidenceRefs,
      sourceRefs
    );
  }

  if (review.status === "WAIT_FOR_DEPENDENCIES") {
    return result(
      input,
      generatedAt,
      portfolioId,
      "WAITING_DEPENDENCIES",
      ["DEPENDENCIES_NOT_READY"],
      [],
      null,
      evidenceRefs,
      sourceRefs
    );
  }

  const compiler = compileDecisionPortfolioExecutionV1({
    portfolio,
    generatedAt: generatedAt!,
    maxPortfolioAgeMs: input.maximumPortfolioAgeMs,
    satisfiedDependencyIds: review.satisfiedDependencyIds,
    previousIdempotencyKeys: input.previousIdempotencyKeys
  });

  return result(
    input,
    generatedAt,
    portfolioId,
    "PREPARED",
    [],
    review.satisfiedDependencyIds,
    compiler,
    evidenceRefs,
    sourceRefs
  );
}
