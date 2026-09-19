import { createHash } from "node:crypto";

import type { CommercialLearningDomainV1 } from "./commercial-learning-application-review-v1";
import {
  COMMERCIAL_LEARNING_OUTCOME_POLICY_VERSION_V1,
  COMMERCIAL_LEARNING_OUTCOME_REVIEW_VERSION_V1,
  type CommercialLearningOutcomeReviewV1,
  type CommercialLearningOutcomeSignalV1
} from "./commercial-learning-outcome-review-v1";

export const COMMERCIAL_LEARNING_PATTERN_REVIEW_VERSION_V1 =
  "CommercialLearningPatternReviewV1" as const;
export const COMMERCIAL_LEARNING_PATTERN_POLICY_VERSION_V1 =
  "commercial_learning_pattern_review_v1.0.0" as const;

const MAX_REVIEWS = 100;
const MAX_REFS = 1_000;
const MAXIMUM_ALLOWED_REVIEW_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type CommercialLearningPatternReviewStateV1 =
  | "READY_FOR_INTERNAL_REVIEW"
  | "NO_ACTION"
  | "NEEDS_MORE_EVIDENCE"
  | "VERIFY";

export type CommercialLearningPatternPostureV1 =
  | "DIRECTIONAL_POSITIVE"
  | "DIRECTIONAL_NEGATIVE"
  | "MIXED"
  | "NO_DIRECTIONAL_SIGNAL";

export type CommercialLearningPatternReasonV1 =
  | "REPEATED_POSITIVE_ASSOCIATIONS"
  | "REPEATED_NEGATIVE_ASSOCIATIONS"
  | "MIXED_ASSOCIATIONS"
  | "NO_REPEATED_DIRECTIONAL_ASSOCIATION"
  | "INSUFFICIENT_DISTINCT_DECISIONS"
  | "INSUFFICIENT_DISTINCT_OUTCOMES"
  | "DOMAIN_MISMATCH"
  | "PATTERN_MISMATCH"
  | "SOURCE_REVIEW_NOT_READY"
  | "SOURCE_CONTRACT_INVALID"
  | "SOURCE_AUTHORITY_INVARIANT_FAILED"
  | "SOURCE_CAUSALITY_INVARIANT_FAILED"
  | "SOURCE_EVIDENCE_INCOMPLETE"
  | "SOURCE_SIGNAL_INCONSISTENT"
  | "SOURCE_REVIEW_IN_FUTURE"
  | "SOURCE_REVIEW_STALE"
  | "DUPLICATE_REVIEW_ID"
  | "DUPLICATE_DECISION_REF"
  | "DUPLICATE_OUTCOME_OBSERVATION_ID"
  | "INVALID_EVALUATED_AT"
  | "INVALID_MAXIMUM_REVIEW_AGE"
  | "MALFORMED_INPUT";

export type CommercialLearningPatternSignalCountsV1 = Readonly<{
  positive: number;
  negative: number;
  neutral: number;
  inconclusive: number;
}>;

export type CommercialLearningPatternReviewV1 = Readonly<{
  contractVersion: typeof COMMERCIAL_LEARNING_PATTERN_REVIEW_VERSION_V1;
  policyVersion: typeof COMMERCIAL_LEARNING_PATTERN_POLICY_VERSION_V1;
  reviewId: string;
  evaluatedAt: string | null;
  domain: CommercialLearningDomainV1 | null;
  patternKey: string | null;
  state: CommercialLearningPatternReviewStateV1;
  reasonCodes: readonly CommercialLearningPatternReasonV1[];
  posture: CommercialLearningPatternPostureV1 | null;
  signalCounts: CommercialLearningPatternSignalCountsV1;
  sourceReviewIds: readonly string[];
  currentDecisionRefs: readonly string[];
  outcomeObservationIds: readonly string[];
  sourceLearningIds: readonly string[];
  sourceLineageIds: readonly string[];
  evidenceRefs: readonly string[];
  recordedAttributionClasses: readonly string[];
  nextInternalStep:
    | "REVIEW_REPEATED_POSITIVE_ASSOCIATIONS"
    | "REVIEW_REPEATED_NEGATIVE_ASSOCIATIONS"
    | "REVIEW_MIXED_ASSOCIATIONS"
    | null;
  confidence: "NOT_ESTABLISHED";
  causalInterpretation: "NOT_ESTABLISHED";
  monetaryValue: null;
  recommendedPrice: null;
  recommendedNegotiationAction: null;
  policyUpdateCandidate: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    lessonValidationAuthorized: false;
    lessonPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    priceChangeAuthorized: false;
    negotiationActionAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CommercialLearningPatternReviewInputV1 = Readonly<{
  domain: CommercialLearningDomainV1;
  patternKey: string;
  reviews: readonly CommercialLearningOutcomeReviewV1[];
  evaluatedAt: string;
  maximumReviewAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  lessonValidationAuthorized: false as const,
  lessonPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  priceChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  persistenceAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "Repeated positive or negative associations are directional review evidence only; they do not establish causality, confidence, expected value, or monetary impact.",
  "Mixed associations are preserved as contradiction rather than averaged into a synthetic score or recommendation.",
  "Distinct decisions and outcome observations prevent duplicate counting but do not prove statistical or causal independence.",
  "No pattern review can validate a lesson, promote policy, change price, make a concession, execute a negotiation action, persist truth, or bypass approval."
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
  return `commercial-learning-pattern:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function sourceAuthorityHolds(review: CommercialLearningOutcomeReviewV1): boolean {
  return review.authority?.analysisOnly === true
    && review.authority.lessonValidationAuthorized === false
    && review.authority.priceChangeAuthorized === false
    && review.authority.negotiationActionAuthorized === false
    && review.authority.persistenceAuthorized === false
    && review.authority.policyPromotionAuthorized === false
    && review.authority.confidenceMutationAuthorized === false
    && review.authority.monetaryMutationAuthorized === false
    && review.authority.externalActionAuthorized === false
    && review.authority.approvalBypassAuthorized === false
    && review.confidence === "NOT_ESTABLISHED"
    && review.monetaryValue === null
    && review.recommendedPrice === null
    && review.recommendedNegotiationAction === null
    && review.policyUpdateCandidate === null;
}

function signalMatchesAssessment(review: CommercialLearningOutcomeReviewV1): boolean {
  const expected: Record<CommercialLearningOutcomeSignalV1, string> = {
    POSITIVE_ASSOCIATION: "POSITIVE",
    NEGATIVE_ASSOCIATION: "NEGATIVE",
    NEUTRAL_OBSERVATION: "NEUTRAL",
    INCONCLUSIVE_OBSERVATION: "INCONCLUSIVE"
  };
  return review.outcomeSignal !== null
    && review.observedAssessment !== null
    && expected[review.outcomeSignal] === review.observedAssessment;
}

function postureFor(counts: CommercialLearningPatternSignalCountsV1): CommercialLearningPatternPostureV1 {
  if (counts.positive > 0 && counts.negative > 0) return "MIXED";
  if (counts.positive >= 2) return "DIRECTIONAL_POSITIVE";
  if (counts.negative >= 2) return "DIRECTIONAL_NEGATIVE";
  return "NO_DIRECTIONAL_SIGNAL";
}

function nextStepFor(
  posture: CommercialLearningPatternPostureV1,
  state: CommercialLearningPatternReviewStateV1
): CommercialLearningPatternReviewV1["nextInternalStep"] {
  if (state !== "READY_FOR_INTERNAL_REVIEW") return null;
  if (posture === "DIRECTIONAL_POSITIVE") return "REVIEW_REPEATED_POSITIVE_ASSOCIATIONS";
  if (posture === "DIRECTIONAL_NEGATIVE") return "REVIEW_REPEATED_NEGATIVE_ASSOCIATIONS";
  if (posture === "MIXED") return "REVIEW_MIXED_ASSOCIATIONS";
  return null;
}

function postureReason(posture: CommercialLearningPatternPostureV1): CommercialLearningPatternReasonV1 {
  if (posture === "DIRECTIONAL_POSITIVE") return "REPEATED_POSITIVE_ASSOCIATIONS";
  if (posture === "DIRECTIONAL_NEGATIVE") return "REPEATED_NEGATIVE_ASSOCIATIONS";
  if (posture === "MIXED") return "MIXED_ASSOCIATIONS";
  return "NO_REPEATED_DIRECTIONAL_ASSOCIATION";
}

/**
 * Reviews repeated observed outcomes from the existing commercial-learning
 * application loop. This is intentionally a longitudinal diagnostic only: it
 * never upgrades repeated association into causality, confidence, value, a
 * pricing rule, a negotiation instruction, or authoritative company memory.
 */
export function reviewCommercialLearningPatternV1(
  input: CommercialLearningPatternReviewInputV1
): CommercialLearningPatternReviewV1 {
  const domain = input?.domain === "PRICING" || input?.domain === "NEGOTIATION" ? input.domain : null;
  const patternKey = text(input?.patternKey);
  const evaluatedAt = timestamp(input?.evaluatedAt);
  const maximumReviewAgeMs = input?.maximumReviewAgeMs;
  const reasons = new Set<CommercialLearningPatternReasonV1>();

  if (!domain || !patternKey || !Array.isArray(input?.reviews) || input.reviews.length === 0 || input.reviews.length > MAX_REVIEWS) {
    reasons.add("MALFORMED_INPUT");
  }
  if (!evaluatedAt) reasons.add("INVALID_EVALUATED_AT");
  if (
    !Number.isFinite(maximumReviewAgeMs)
    || maximumReviewAgeMs <= 0
    || maximumReviewAgeMs > MAXIMUM_ALLOWED_REVIEW_AGE_MS
  ) {
    reasons.add("INVALID_MAXIMUM_REVIEW_AGE");
  }

  const sourceReviewIds: string[] = [];
  const currentDecisionRefs: string[] = [];
  const outcomeObservationIds: string[] = [];
  const sourceLearningIds: string[] = [];
  const sourceLineageIds: string[] = [];
  const evidenceRefs: string[] = [];
  const recordedAttributionClasses: string[] = [];
  const signals: CommercialLearningOutcomeSignalV1[] = [];

  for (const review of input?.reviews ?? []) {
    if (!review || typeof review !== "object") {
      reasons.add("MALFORMED_INPUT");
      continue;
    }
    if (
      review.contractVersion !== COMMERCIAL_LEARNING_OUTCOME_REVIEW_VERSION_V1
      || review.policyVersion !== COMMERCIAL_LEARNING_OUTCOME_POLICY_VERSION_V1
    ) {
      reasons.add("SOURCE_CONTRACT_INVALID");
    }
    if (
      review.state !== "READY_FOR_LEARNING_REVIEW"
      || review.nextInternalStep !== "REVIEW_COMMERCIAL_LESSON_WITH_CURRENT_OUTCOME"
    ) {
      reasons.add("SOURCE_REVIEW_NOT_READY");
    }
    if (!sourceAuthorityHolds(review)) reasons.add("SOURCE_AUTHORITY_INVARIANT_FAILED");
    if (review.causalInterpretation !== "NOT_ESTABLISHED") {
      reasons.add("SOURCE_CAUSALITY_INVARIANT_FAILED");
    }
    if (domain && review.domain !== domain) reasons.add("DOMAIN_MISMATCH");
    if (patternKey && review.patternKey !== patternKey) reasons.add("PATTERN_MISMATCH");

    const reviewId = text(review.reviewId);
    const decisionRef = text(review.currentDecisionRef);
    const outcomeObservationId = text(review.outcomeObservationId);
    const reviewedAt = timestamp(review.reviewedAt);
    if (!reviewId || !decisionRef || !outcomeObservationId || !reviewedAt) {
      reasons.add("MALFORMED_INPUT");
    } else {
      sourceReviewIds.push(reviewId);
      currentDecisionRefs.push(decisionRef);
      outcomeObservationIds.push(outcomeObservationId);
      if (evaluatedAt) {
        const age = Date.parse(evaluatedAt) - Date.parse(reviewedAt);
        if (age < 0) reasons.add("SOURCE_REVIEW_IN_FUTURE");
        else if (Number.isFinite(maximumReviewAgeMs) && maximumReviewAgeMs > 0 && age > maximumReviewAgeMs) {
          reasons.add("SOURCE_REVIEW_STALE");
        }
      }
    }

    const reviewLearningIds = refs(review.sourceLearningIds);
    const reviewLineageIds = refs(review.sourceLineageIds);
    const applicationEvidence = refs(review.applicationEvidenceRefs);
    const actionEvidence = refs(review.actionEvidenceRefs);
    const outcomeEvidence = refs(review.outcomeEvidenceRefs);
    const decisionSources = refs(review.decisionSourceRefs);
    if (
      reviewLearningIds === null
      || reviewLineageIds === null
      || applicationEvidence === null
      || actionEvidence === null
      || outcomeEvidence === null
      || decisionSources === null
    ) {
      reasons.add("MALFORMED_INPUT");
    } else {
      sourceLearningIds.push(...reviewLearningIds);
      sourceLineageIds.push(...reviewLineageIds);
      evidenceRefs.push(...applicationEvidence, ...actionEvidence, ...outcomeEvidence, ...decisionSources);
      if (
        reviewLearningIds.length < 2
        || reviewLineageIds.length < 2
        || applicationEvidence.length === 0
        || actionEvidence.length === 0
        || outcomeEvidence.length === 0
        || decisionSources.length === 0
      ) {
        reasons.add("SOURCE_EVIDENCE_INCOMPLETE");
      }
    }

    if (!signalMatchesAssessment(review)) {
      reasons.add("SOURCE_SIGNAL_INCONSISTENT");
    } else if (review.outcomeSignal !== null) {
      signals.push(review.outcomeSignal);
    }
    if (review.recordedAttributionClass !== null) {
      recordedAttributionClasses.push(review.recordedAttributionClass);
    }
  }

  if (new Set(sourceReviewIds).size !== sourceReviewIds.length) reasons.add("DUPLICATE_REVIEW_ID");
  if (new Set(currentDecisionRefs).size !== currentDecisionRefs.length) reasons.add("DUPLICATE_DECISION_REF");
  if (new Set(outcomeObservationIds).size !== outcomeObservationIds.length) {
    reasons.add("DUPLICATE_OUTCOME_OBSERVATION_ID");
  }

  const distinctDecisionCount = new Set(currentDecisionRefs).size;
  const distinctOutcomeCount = new Set(outcomeObservationIds).size;
  const structuralVerificationReasons = [...reasons];
  if (structuralVerificationReasons.length === 0) {
    if (distinctDecisionCount < 2) reasons.add("INSUFFICIENT_DISTINCT_DECISIONS");
    if (distinctOutcomeCount < 2) reasons.add("INSUFFICIENT_DISTINCT_OUTCOMES");
  }

  const signalCounts: CommercialLearningPatternSignalCountsV1 = Object.freeze({
    positive: signals.filter((signal) => signal === "POSITIVE_ASSOCIATION").length,
    negative: signals.filter((signal) => signal === "NEGATIVE_ASSOCIATION").length,
    neutral: signals.filter((signal) => signal === "NEUTRAL_OBSERVATION").length,
    inconclusive: signals.filter((signal) => signal === "INCONCLUSIVE_OBSERVATION").length
  });
  const posture = reasons.size === 0
    || [...reasons].every((reason) => reason === "INSUFFICIENT_DISTINCT_DECISIONS" || reason === "INSUFFICIENT_DISTINCT_OUTCOMES")
    ? postureFor(signalCounts)
    : null;

  const verificationReasonSet = new Set<CommercialLearningPatternReasonV1>([
    "DOMAIN_MISMATCH",
    "PATTERN_MISMATCH",
    "SOURCE_REVIEW_NOT_READY",
    "SOURCE_CONTRACT_INVALID",
    "SOURCE_AUTHORITY_INVARIANT_FAILED",
    "SOURCE_CAUSALITY_INVARIANT_FAILED",
    "SOURCE_EVIDENCE_INCOMPLETE",
    "SOURCE_SIGNAL_INCONSISTENT",
    "SOURCE_REVIEW_IN_FUTURE",
    "SOURCE_REVIEW_STALE",
    "DUPLICATE_REVIEW_ID",
    "DUPLICATE_DECISION_REF",
    "DUPLICATE_OUTCOME_OBSERVATION_ID",
    "INVALID_EVALUATED_AT",
    "INVALID_MAXIMUM_REVIEW_AGE",
    "MALFORMED_INPUT"
  ]);
  const hasVerificationReason = [...reasons].some((reason) => verificationReasonSet.has(reason));
  const hasInsufficientEvidence = reasons.has("INSUFFICIENT_DISTINCT_DECISIONS")
    || reasons.has("INSUFFICIENT_DISTINCT_OUTCOMES");

  let state: CommercialLearningPatternReviewStateV1;
  if (hasVerificationReason) state = "VERIFY";
  else if (hasInsufficientEvidence) state = "NEEDS_MORE_EVIDENCE";
  else if (posture === "NO_DIRECTIONAL_SIGNAL") state = "NO_ACTION";
  else state = "READY_FOR_INTERNAL_REVIEW";

  if (!hasVerificationReason && !hasInsufficientEvidence && posture) reasons.add(postureReason(posture));

  const reasonCodes = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));
  const normalizedReviewIds = Object.freeze([...new Set(sourceReviewIds)].sort((a, b) => a.localeCompare(b)));
  const normalizedDecisionRefs = Object.freeze([...new Set(currentDecisionRefs)].sort((a, b) => a.localeCompare(b)));
  const normalizedOutcomeIds = Object.freeze([...new Set(outcomeObservationIds)].sort((a, b) => a.localeCompare(b)));
  const normalizedLearningIds = Object.freeze([...new Set(sourceLearningIds)].sort((a, b) => a.localeCompare(b)));
  const normalizedLineageIds = Object.freeze([...new Set(sourceLineageIds)].sort((a, b) => a.localeCompare(b)));
  const normalizedEvidenceRefs = Object.freeze([...new Set(evidenceRefs)].sort((a, b) => a.localeCompare(b)));
  const normalizedAttributionClasses = Object.freeze([...new Set(recordedAttributionClasses)].sort((a, b) => a.localeCompare(b)));

  return freezeDeep({
    contractVersion: COMMERCIAL_LEARNING_PATTERN_REVIEW_VERSION_V1,
    policyVersion: COMMERCIAL_LEARNING_PATTERN_POLICY_VERSION_V1,
    reviewId: stableId([
      domain ?? "unknown-domain",
      patternKey ?? "unknown-pattern",
      evaluatedAt ?? "unknown-evaluated-at",
      ...normalizedReviewIds
    ]),
    evaluatedAt,
    domain,
    patternKey,
    state,
    reasonCodes,
    posture,
    signalCounts,
    sourceReviewIds: normalizedReviewIds,
    currentDecisionRefs: normalizedDecisionRefs,
    outcomeObservationIds: normalizedOutcomeIds,
    sourceLearningIds: normalizedLearningIds,
    sourceLineageIds: normalizedLineageIds,
    evidenceRefs: normalizedEvidenceRefs,
    recordedAttributionClasses: normalizedAttributionClasses,
    nextInternalStep: posture ? nextStepFor(posture, state) : null,
    confidence: "NOT_ESTABLISHED",
    causalInterpretation: "NOT_ESTABLISHED",
    monetaryValue: null,
    recommendedPrice: null,
    recommendedNegotiationAction: null,
    policyUpdateCandidate: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
