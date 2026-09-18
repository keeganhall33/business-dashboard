import { createHash } from "node:crypto";

import type { DecisionMemoryTruthStateV1 } from "./decision-memory-v1";
import type {
  RecurringDecisionLessonReviewV1,
  RecurringLessonDomainV1
} from "./recurring-decision-lessons-v1";

export const COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1 =
  "CommercialLearningApplicationReviewV1" as const;
export const COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1 =
  "commercial_learning_application_review_v1.0.0" as const;

const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REFS = 200;

export type CommercialLearningDomainV1 = Extract<
  RecurringLessonDomainV1,
  "PRICING" | "NEGOTIATION"
>;

export type CommercialLearningApplicationStateV1 =
  | "READY_FOR_REVIEW"
  | "NO_ACTION"
  | "VERIFY";

export type CommercialLearningApplicationReasonV1 =
  | "REPEATED_LESSON_READY_FOR_CURRENT_REVIEW"
  | "INSUFFICIENT_RECURRING_EVIDENCE"
  | "SOURCE_REVIEW_REQUIRES_VERIFICATION"
  | "SOURCE_REVIEW_CONFLICTED"
  | "SOURCE_REVIEW_INVALID"
  | "SOURCE_DOMAIN_UNSUPPORTED"
  | "CURRENT_DOMAIN_MISMATCH"
  | "PATTERN_MISMATCH"
  | "CURRENT_CONTEXT_NOT_KNOWN"
  | "CURRENT_CONTEXT_EVIDENCE_MISSING"
  | "APPLICATION_LINK_EVIDENCE_MISSING"
  | "APPLICATION_LINK_EVIDENCE_NOT_CURRENT"
  | "CURRENT_DECISION_REUSES_SOURCE_OBSERVATION"
  | "SOURCE_EVIDENCE_MISSING"
  | "SOURCE_ENVELOPE_EVIDENCE_NOT_SHARED"
  | "SOURCE_REVIEW_STALE"
  | "CURRENT_CONTEXT_STALE"
  | "SOURCE_REVIEW_IN_FUTURE"
  | "CURRENT_CONTEXT_IN_FUTURE"
  | "INVALID_REVIEW_TIME"
  | "INVALID_MAX_AGE"
  | "SOURCE_AUTHORITY_INVARIANT_FAILED"
  | "SOURCE_CAUSALITY_INVARIANT_FAILED"
  | "RECURRING_PATTERN_INCOMPLETE"
  | "MALFORMED_INPUT";

export type CommercialLearningSourceEnvelopeV1 = Readonly<{
  review: RecurringDecisionLessonReviewV1;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type CommercialLearningCurrentContextV1 = Readonly<{
  decisionRef: string;
  domain: CommercialLearningDomainV1;
  patternKey: string;
  observedAt: string;
  truthState: DecisionMemoryTruthStateV1;
  evidenceRefs: readonly string[];
  applicationLinkEvidenceRefs: readonly string[];
}>;

export type CommercialLearningApplicationReviewV1 = Readonly<{
  contractVersion: typeof COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1;
  policyVersion: typeof COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1;
  reviewId: string;
  reviewedAt: string | null;
  state: CommercialLearningApplicationStateV1;
  reasonCodes: readonly CommercialLearningApplicationReasonV1[];
  currentDecisionRef: string | null;
  domain: CommercialLearningDomainV1 | null;
  patternKey: string | null;
  lessonTitle: string | null;
  lessonContent: string | null;
  sourceDecisionRefs: readonly string[];
  sourceOutcomeRefs: readonly string[];
  sourceLearningIds: readonly string[];
  sourceLineageIds: readonly string[];
  sourceLessonEvidenceRefs: readonly string[];
  sourceReviewEvidenceRefs: readonly string[];
  currentEvidenceRefs: readonly string[];
  applicationLinkEvidenceRefs: readonly string[];
  nextInternalStep: "REVIEW_LESSON_AGAINST_CURRENT_CONTEXT" | null;
  confidence: "NOT_ESTABLISHED";
  recommendedPrice: null;
  recommendedNegotiationAction: null;
  monetaryValue: null;
  causalInterpretation: "NOT_ESTABLISHED";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    priceChangeAuthorized: false;
    negotiationActionAuthorized: false;
    externalActionAuthorized: false;
    persistenceAuthorized: false;
    policyPromotionAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CommercialLearningApplicationInputV1 = Readonly<{
  source: CommercialLearningSourceEnvelopeV1;
  current: CommercialLearningCurrentContextV1;
  reviewedAt: string;
  maximumAgeMs?: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  priceChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  externalActionAuthorized: false as const,
  persistenceAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "A repeated commercial lesson is context for a current decision review, not a price, negotiation instruction, or policy.",
  "Recurrence does not establish causality, confidence, monetary value, expected return, or transferability to the current decision.",
  "The current decision must be linked to the recurring pattern by explicit current evidence; names, text similarity, and category similarity are not substitutes.",
  "Any pricing, negotiation, persistence, policy, or external action remains separately governed and requires current evidence plus its existing approval boundary."
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

function refs(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const item of value) {
    const ref = text(item);
    if (!ref) return null;
    normalized.push(ref);
  }
  return Object.freeze([...new Set(normalized)].sort((a, b) => a.localeCompare(b)));
}

function stableId(parts: readonly string[]): string {
  return `commercial-learning-review:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function supportedDomain(value: unknown): CommercialLearningDomainV1 | null {
  return value === "PRICING" || value === "NEGOTIATION" ? value : null;
}

function sourceAuthorityInvariantHolds(review: RecurringDecisionLessonReviewV1): boolean {
  return review.review_required === true
    && review.policy_promotion_allowed === false
    && review.pricing_change_allowed === false
    && review.negotiation_action_allowed === false
    && review.external_action_allowed === false
    && review.persistence_authority === false;
}

function sourceStateReason(
  review: RecurringDecisionLessonReviewV1
): CommercialLearningApplicationReasonV1 | null {
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

export function reviewCommercialLearningApplicationV1(
  input: CommercialLearningApplicationInputV1
): CommercialLearningApplicationReviewV1 {
  const sourceReview = input?.source?.review;
  const reviewedAt = timestamp(input?.reviewedAt);
  const sourceObservedAt = timestamp(input?.source?.observedAt);
  const currentObservedAt = timestamp(input?.current?.observedAt);
  const currentDecisionRef = text(input?.current?.decisionRef);
  const currentPatternKey = text(input?.current?.patternKey);
  const sourcePatternKey = text(sourceReview?.pattern_key);
  const sourceDomain = supportedDomain(sourceReview?.domain);
  const currentDomain = supportedDomain(input?.current?.domain);
  const maximumAgeMs = input?.maximumAgeMs ?? DEFAULT_MAX_AGE_MS;

  const reasonCodes = new Set<CommercialLearningApplicationReasonV1>();
  if (!reviewedAt) reasonCodes.add("INVALID_REVIEW_TIME");
  if (!Number.isFinite(maximumAgeMs) || maximumAgeMs < 0 || maximumAgeMs > MAX_AGE_MS) {
    reasonCodes.add("INVALID_MAX_AGE");
  }
  if (!currentDecisionRef || !currentPatternKey || !currentDomain || !sourceReview) {
    reasonCodes.add("MALFORMED_INPUT");
  }

  const sourceReviewEvidenceRefs = refs(input?.source?.evidenceRefs);
  const currentEvidenceRefs = refs(input?.current?.evidenceRefs);
  const applicationLinkEvidenceRefs = refs(input?.current?.applicationLinkEvidenceRefs);
  const sourceDecisionRefs = refs(sourceReview?.decision_refs);
  const sourceOutcomeRefs = refs(sourceReview?.outcome_refs);
  const sourceLearningIds = refs(sourceReview?.source_learning_ids);
  const sourceLineageIds = refs(sourceReview?.source_lineage_ids);
  const sourceLessonEvidenceRefs = refs(sourceReview?.evidence_refs);

  if (
    sourceReviewEvidenceRefs === null
    || currentEvidenceRefs === null
    || applicationLinkEvidenceRefs === null
    || sourceDecisionRefs === null
    || sourceOutcomeRefs === null
    || sourceLearningIds === null
    || sourceLineageIds === null
    || sourceLessonEvidenceRefs === null
  ) {
    reasonCodes.add("MALFORMED_INPUT");
  }

  const safeSourceReviewEvidenceRefs = sourceReviewEvidenceRefs ?? Object.freeze([]);
  const safeCurrentEvidenceRefs = currentEvidenceRefs ?? Object.freeze([]);
  const safeApplicationLinkEvidenceRefs = applicationLinkEvidenceRefs ?? Object.freeze([]);
  const safeSourceDecisionRefs = sourceDecisionRefs ?? Object.freeze([]);
  const safeSourceOutcomeRefs = sourceOutcomeRefs ?? Object.freeze([]);
  const safeSourceLearningIds = sourceLearningIds ?? Object.freeze([]);
  const safeSourceLineageIds = sourceLineageIds ?? Object.freeze([]);
  const safeSourceLessonEvidenceRefs = sourceLessonEvidenceRefs ?? Object.freeze([]);

  if (!sourceReview || sourceReview.version !== "RECURRING_DECISION_LESSONS_V1") {
    reasonCodes.add("SOURCE_REVIEW_INVALID");
  } else {
    const stateReason = sourceStateReason(sourceReview);
    if (stateReason) reasonCodes.add(stateReason);
    if (!sourceAuthorityInvariantHolds(sourceReview)) reasonCodes.add("SOURCE_AUTHORITY_INVARIANT_FAILED");
    if (sourceReview.causal_interpretation !== "NOT_ESTABLISHED") {
      reasonCodes.add("SOURCE_CAUSALITY_INVARIANT_FAILED");
    }
  }

  if (sourceReview?.domain != null && !sourceDomain) reasonCodes.add("SOURCE_DOMAIN_UNSUPPORTED");
  if (sourceDomain && currentDomain && sourceDomain !== currentDomain) reasonCodes.add("CURRENT_DOMAIN_MISMATCH");
  if (sourcePatternKey && currentPatternKey && sourcePatternKey !== currentPatternKey) {
    reasonCodes.add("PATTERN_MISMATCH");
  }

  if (input?.current?.truthState !== "KNOWN") reasonCodes.add("CURRENT_CONTEXT_NOT_KNOWN");
  if (safeCurrentEvidenceRefs.length === 0) reasonCodes.add("CURRENT_CONTEXT_EVIDENCE_MISSING");
  if (safeApplicationLinkEvidenceRefs.length === 0) {
    reasonCodes.add("APPLICATION_LINK_EVIDENCE_MISSING");
  } else {
    const currentEvidenceSet = new Set(safeCurrentEvidenceRefs);
    if (safeApplicationLinkEvidenceRefs.some((ref) => !currentEvidenceSet.has(ref))) {
      reasonCodes.add("APPLICATION_LINK_EVIDENCE_NOT_CURRENT");
    }
  }

  if (currentDecisionRef && safeSourceDecisionRefs.includes(currentDecisionRef)) {
    reasonCodes.add("CURRENT_DECISION_REUSES_SOURCE_OBSERVATION");
  }
  if (safeSourceReviewEvidenceRefs.length === 0 || safeSourceLessonEvidenceRefs.length === 0) {
    reasonCodes.add("SOURCE_EVIDENCE_MISSING");
  } else {
    const sourceLessonEvidenceSet = new Set(safeSourceLessonEvidenceRefs);
    if (!safeSourceReviewEvidenceRefs.some((ref) => sourceLessonEvidenceSet.has(ref))) {
      reasonCodes.add("SOURCE_ENVELOPE_EVIDENCE_NOT_SHARED");
    }
  }

  const recurringPatternComplete = Boolean(
    sourceReview
      && sourceReview.state === "REVIEW_CANDIDATE"
      && sourceDomain
      && sourcePatternKey
      && text(sourceReview.lesson_title)
      && text(sourceReview.lesson_content)
      && safeSourceDecisionRefs.length >= 2
      && safeSourceOutcomeRefs.length >= 2
      && safeSourceLearningIds.length >= 2
      && safeSourceLineageIds.length >= 2
      && safeSourceLessonEvidenceRefs.length > 0
  );
  if (sourceReview?.state === "REVIEW_CANDIDATE" && !recurringPatternComplete) {
    reasonCodes.add("RECURRING_PATTERN_INCOMPLETE");
  }

  if (!sourceObservedAt) reasonCodes.add("SOURCE_EVIDENCE_MISSING");
  if (!currentObservedAt) reasonCodes.add("MALFORMED_INPUT");
  if (reviewedAt && sourceObservedAt) {
    const age = Date.parse(reviewedAt) - Date.parse(sourceObservedAt);
    if (age < 0) reasonCodes.add("SOURCE_REVIEW_IN_FUTURE");
    else if (Number.isFinite(maximumAgeMs) && age > maximumAgeMs) reasonCodes.add("SOURCE_REVIEW_STALE");
  }
  if (reviewedAt && currentObservedAt) {
    const age = Date.parse(reviewedAt) - Date.parse(currentObservedAt);
    if (age < 0) reasonCodes.add("CURRENT_CONTEXT_IN_FUTURE");
    else if (Number.isFinite(maximumAgeMs) && age > maximumAgeMs) reasonCodes.add("CURRENT_CONTEXT_STALE");
  }

  const reasons = [...reasonCodes].sort((a, b) => a.localeCompare(b));
  const insufficientOnly = reasons.length === 1 && reasons[0] === "INSUFFICIENT_RECURRING_EVIDENCE";
  const state: CommercialLearningApplicationStateV1 = reasons.length === 0
    ? "READY_FOR_REVIEW"
    : insufficientOnly
      ? "NO_ACTION"
      : "VERIFY";
  const finalReasons = state === "READY_FOR_REVIEW"
    ? ["REPEATED_LESSON_READY_FOR_CURRENT_REVIEW" as const]
    : reasons;

  const reviewId = stableId([
    currentDecisionRef ?? "unknown-current-decision",
    currentDomain ?? "unknown-current-domain",
    currentPatternKey ?? "unknown-current-pattern",
    sourceReview?.reason_code ?? "unknown-source-review",
    sourceObservedAt ?? "unknown-source-observed-at",
    reviewedAt ?? "unknown-reviewed-at"
  ]);

  return freezeDeep({
    contractVersion: COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1,
    policyVersion: COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1,
    reviewId,
    reviewedAt,
    state,
    reasonCodes: finalReasons,
    currentDecisionRef,
    domain: currentDomain,
    patternKey: currentPatternKey,
    lessonTitle: text(sourceReview?.lesson_title),
    lessonContent: text(sourceReview?.lesson_content),
    sourceDecisionRefs: safeSourceDecisionRefs,
    sourceOutcomeRefs: safeSourceOutcomeRefs,
    sourceLearningIds: safeSourceLearningIds,
    sourceLineageIds: safeSourceLineageIds,
    sourceLessonEvidenceRefs: safeSourceLessonEvidenceRefs,
    sourceReviewEvidenceRefs: safeSourceReviewEvidenceRefs,
    currentEvidenceRefs: safeCurrentEvidenceRefs,
    applicationLinkEvidenceRefs: safeApplicationLinkEvidenceRefs,
    nextInternalStep: state === "READY_FOR_REVIEW" ? "REVIEW_LESSON_AGAINST_CURRENT_CONTEXT" : null,
    confidence: "NOT_ESTABLISHED",
    recommendedPrice: null,
    recommendedNegotiationAction: null,
    monetaryValue: null,
    causalInterpretation: "NOT_ESTABLISHED",
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
