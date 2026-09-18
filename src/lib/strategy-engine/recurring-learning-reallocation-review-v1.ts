import { createHash } from "node:crypto";

import type {
  RecurringDecisionLessonReviewV1,
  RecurringLessonDomainV1
} from "../intelligence/organizational-learning/recurring-decision-lessons-v1";
import type {
  DecisionDispositionV1,
  DecisionPortfolioV1
} from "./decision-portfolio-v1";

export const RECURRING_LEARNING_REALLOCATION_REVIEW_VERSION_V1 =
  "RecurringLearningReallocationReviewV1" as const;
export const RECURRING_LEARNING_REALLOCATION_POLICY_VERSION_V1 =
  "recurring_learning_reallocation_review_v1.0.0" as const;

const DEFAULT_MAX_REVIEW_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REVIEW_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_REFS = 100;

export type RecurringLearningReallocationStateV1 =
  | "READY_FOR_REVIEW"
  | "NO_ACTION"
  | "VERIFY";

export type RecurringLearningReallocationReasonV1 =
  | "REPEATED_LEARNING_READY_FOR_REALLOCATION_REVIEW"
  | "INSUFFICIENT_RECURRING_EVIDENCE"
  | "SOURCE_REVIEW_REQUIRES_VERIFICATION"
  | "SOURCE_REVIEW_CONFLICTED"
  | "SOURCE_REVIEW_INVALID"
  | "SOURCE_REVIEW_STALE"
  | "SOURCE_REVIEW_IN_FUTURE"
  | "SOURCE_REVIEW_EVIDENCE_MISSING"
  | "SOURCE_AUTHORITY_INVARIANT_FAILED"
  | "SOURCE_CAUSALITY_INVARIANT_FAILED"
  | "RECURRING_PATTERN_INCOMPLETE"
  | "TARGET_CANDIDATE_MISSING"
  | "TARGET_CANDIDATE_NOT_KNOWN"
  | "TARGET_LINK_MISMATCH"
  | "TARGET_LINK_EVIDENCE_MISSING"
  | "TARGET_LINK_EVIDENCE_NOT_SHARED"
  | "INVALID_REVIEW_TIME"
  | "REVIEW_PRECEDES_PORTFOLIO";

export type RecurringLearningTargetLinkV1 = Readonly<{
  candidateId: string;
  domain: RecurringLessonDomainV1;
  patternKey: string;
  evidenceRefs: readonly string[];
}>;

export type RecurringLearningSourceReviewEnvelopeV1 = Readonly<{
  review: RecurringDecisionLessonReviewV1;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type RecurringLearningReallocationReviewV1 = Readonly<{
  contractVersion: typeof RECURRING_LEARNING_REALLOCATION_REVIEW_VERSION_V1;
  policyVersion: typeof RECURRING_LEARNING_REALLOCATION_POLICY_VERSION_V1;
  reviewId: string;
  generatedAt: string;
  sourcePortfolioId: string;
  candidateId: string;
  previousDisposition: DecisionDispositionV1 | null;
  state: RecurringLearningReallocationStateV1;
  reasonCodes: readonly RecurringLearningReallocationReasonV1[];
  domain: RecurringLessonDomainV1 | null;
  patternKey: string | null;
  lessonTitle: string | null;
  lessonContent: string | null;
  observedDecisionCount: number;
  observedOutcomeCount: number;
  independentLineageCount: number;
  decisionRefs: readonly string[];
  outcomeRefs: readonly string[];
  sourceLearningIds: readonly string[];
  sourceLineageIds: readonly string[];
  evidenceRefs: readonly string[];
  targetLinkEvidenceRefs: readonly string[];
  nextInternalStep: "REASSESS_CANONICAL_CANDIDATE_EVIDENCE" | null;
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  outcomePrediction: null;
  causalInterpretation: "NOT_ESTABLISHED";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    scoreMutationAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    persistenceAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type RecurringLearningReallocationInputV1 = Readonly<{
  portfolio: DecisionPortfolioV1;
  sourceReview: RecurringLearningSourceReviewEnvelopeV1;
  targetLink: RecurringLearningTargetLinkV1;
  reviewedAt: string;
  maximumSourceReviewAgeMs?: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  portfolioMutationAuthorized: false as const,
  allocationChangeAuthorized: false as const,
  scoreMutationAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  persistenceAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "A repeated reviewed lesson is a signal to reassess canonical candidate evidence, not a command to reallocate the portfolio.",
  "Recurring observations do not establish causality, future outcome direction, confidence, monetary value, or expected return.",
  "The target link must be explicit and evidence-backed in both the recurring lesson lineage and the current portfolio candidate; names, text similarity, and category similarity are never used as a substitute.",
  "Any allocation, score, policy, pricing, negotiation, experiment, persistence, or external action remains separately governed and requires its own current evidence and approval boundary."
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
  return `recurring-reallocation:${createHash("sha256").update(values.join("\u0000")).digest("hex").slice(0, 20)}`;
}

function authorityInvariantHolds(review: RecurringDecisionLessonReviewV1): boolean {
  return review.review_required === true
    && review.policy_promotion_allowed === false
    && review.pricing_change_allowed === false
    && review.negotiation_action_allowed === false
    && review.external_action_allowed === false
    && review.persistence_authority === false;
}

function sourceStateReason(review: RecurringDecisionLessonReviewV1): RecurringLearningReallocationReasonV1 | null {
  switch (review.state) {
    case "REVIEW_CANDIDATE":
      return null;
    case "INSUFFICIENT_INDEPENDENT_EVIDENCE":
      return "INSUFFICIENT_RECURRING_EVIDENCE";
    case "NEEDS_VERIFICATION":
      return "SOURCE_REVIEW_REQUIRES_VERIFICATION";
    case "CONFLICTED":
      return "SOURCE_REVIEW_CONFLICTED";
    case "INVALID_INPUT":
      return "SOURCE_REVIEW_INVALID";
  }
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

export function reviewRecurringLearningForReallocationV1(
  input: RecurringLearningReallocationInputV1
): RecurringLearningReallocationReviewV1 {
  const reviewedAt = timestamp(input?.reviewedAt);
  const portfolioId = text(input?.portfolio?.portfolioId) ?? "unknown-portfolio";
  const candidateId = text(input?.targetLink?.candidateId) ?? "unknown-candidate";
  const sourceObservedAt = timestamp(input?.sourceReview?.observedAt);
  const maximumAge = input?.maximumSourceReviewAgeMs ?? DEFAULT_MAX_REVIEW_AGE_MS;
  const review = input?.sourceReview?.review;
  const target = input?.targetLink;

  const reasons = new Set<RecurringLearningReallocationReasonV1>();
  if (!reviewedAt) reasons.add("INVALID_REVIEW_TIME");
  if (!Number.isFinite(maximumAge) || maximumAge < 0 || maximumAge > MAX_REVIEW_AGE_MS) {
    reasons.add("SOURCE_REVIEW_REQUIRES_VERIFICATION");
  }

  const candidate = input?.portfolio?.contractVersion === "DecisionPortfolioV1"
    ? input.portfolio.items.find((item) => item.candidate.id === candidateId) ?? null
    : null;
  if (!candidate) reasons.add("TARGET_CANDIDATE_MISSING");
  else if (candidate.candidate.evidenceState !== "KNOWN") reasons.add("TARGET_CANDIDATE_NOT_KNOWN");

  if (reviewedAt && input?.portfolio?.generatedAt && Date.parse(reviewedAt) < Date.parse(input.portfolio.generatedAt)) {
    reasons.add("REVIEW_PRECEDES_PORTFOLIO");
  }

  const sourceEnvelopeEvidence = uniqueSorted(input?.sourceReview?.evidenceRefs);
  if (!sourceObservedAt || sourceEnvelopeEvidence.length === 0) reasons.add("SOURCE_REVIEW_EVIDENCE_MISSING");
  if (reviewedAt && sourceObservedAt) {
    const age = Date.parse(reviewedAt) - Date.parse(sourceObservedAt);
    if (age < 0) reasons.add("SOURCE_REVIEW_IN_FUTURE");
    else if (Number.isFinite(maximumAge) && age > maximumAge) reasons.add("SOURCE_REVIEW_STALE");
  }

  if (!review || review.version !== "RECURRING_DECISION_LESSONS_V1") {
    reasons.add("SOURCE_REVIEW_INVALID");
  } else {
    const stateReason = sourceStateReason(review);
    if (stateReason) reasons.add(stateReason);
    if (!authorityInvariantHolds(review)) reasons.add("SOURCE_AUTHORITY_INVARIANT_FAILED");
    if (review.causal_interpretation !== "NOT_ESTABLISHED") reasons.add("SOURCE_CAUSALITY_INVARIANT_FAILED");
  }

  const decisionRefs = uniqueSorted(review?.decision_refs);
  const outcomeRefs = uniqueSorted(review?.outcome_refs);
  const sourceLearningIds = uniqueSorted(review?.source_learning_ids);
  const sourceLineageIds = uniqueSorted(review?.source_lineage_ids);
  const recurringEvidence = uniqueSorted(review?.evidence_refs);
  const targetEvidence = uniqueSorted(target?.evidenceRefs);

  const recurringPatternComplete = Boolean(
    review
      && review.state === "REVIEW_CANDIDATE"
      && text(review.domain)
      && text(review.pattern_key)
      && text(review.lesson_title)
      && text(review.lesson_content)
      && decisionRefs.length >= 2
      && outcomeRefs.length >= 2
      && sourceLineageIds.length >= 2
      && recurringEvidence.length > 0
  );
  if (review?.state === "REVIEW_CANDIDATE" && !recurringPatternComplete) reasons.add("RECURRING_PATTERN_INCOMPLETE");

  if (
    review
      && target
      && (target.domain !== review.domain || text(target.patternKey) !== text(review.pattern_key))
  ) {
    reasons.add("TARGET_LINK_MISMATCH");
  }

  if (targetEvidence.length === 0) {
    reasons.add("TARGET_LINK_EVIDENCE_MISSING");
  } else if (candidate && review) {
    const candidateEvidence = new Set(uniqueSorted(candidate.candidate.evidenceRefs));
    const recurringEvidenceSet = new Set(recurringEvidence);
    if (targetEvidence.some((ref) => !candidateEvidence.has(ref) || !recurringEvidenceSet.has(ref))) {
      reasons.add("TARGET_LINK_EVIDENCE_NOT_SHARED");
    }
  }

  const noActionOnly = reasons.size === 1 && reasons.has("INSUFFICIENT_RECURRING_EVIDENCE");
  const state: RecurringLearningReallocationStateV1 = reasons.size === 0
    ? "READY_FOR_REVIEW"
    : noActionOnly
      ? "NO_ACTION"
      : "VERIFY";

  const reasonCodes = reasons.size === 0
    ? Object.freeze(["REPEATED_LEARNING_READY_FOR_REALLOCATION_REVIEW"] as const)
    : Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));

  const generatedAt = reviewedAt ?? input?.reviewedAt ?? "INVALID";
  const reviewId = stableReviewId([
    portfolioId,
    candidateId,
    text(review?.domain) ?? "unknown-domain",
    text(review?.pattern_key) ?? "unknown-pattern",
    generatedAt
  ]);

  return freezeDeep({
    contractVersion: RECURRING_LEARNING_REALLOCATION_REVIEW_VERSION_V1,
    policyVersion: RECURRING_LEARNING_REALLOCATION_POLICY_VERSION_V1,
    reviewId,
    generatedAt,
    sourcePortfolioId: portfolioId,
    candidateId,
    previousDisposition: candidate?.disposition ?? null,
    state,
    reasonCodes,
    domain: review?.domain ?? null,
    patternKey: review?.pattern_key ?? null,
    lessonTitle: review?.lesson_title ?? null,
    lessonContent: review?.lesson_content ?? null,
    observedDecisionCount: decisionRefs.length,
    observedOutcomeCount: outcomeRefs.length,
    independentLineageCount: sourceLineageIds.length,
    decisionRefs,
    outcomeRefs,
    sourceLearningIds,
    sourceLineageIds,
    evidenceRefs: uniqueSorted([...recurringEvidence, ...sourceEnvelopeEvidence, ...targetEvidence]),
    targetLinkEvidenceRefs: targetEvidence,
    nextInternalStep: state === "READY_FOR_REVIEW" ? "REASSESS_CANONICAL_CANDIDATE_EVIDENCE" : null,
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    outcomePrediction: null,
    causalInterpretation: "NOT_ESTABLISHED",
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
