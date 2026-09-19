import { createHash } from "node:crypto";

import {
  COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1,
  COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1,
  type CommercialLearningApplicationReviewV1,
  type CommercialLearningDomainV1
} from "./commercial-learning-application-review-v1";
import {
  COMMERCIAL_LEARNING_PATTERN_POLICY_VERSION_V1,
  COMMERCIAL_LEARNING_PATTERN_REVIEW_VERSION_V1,
  type CommercialLearningPatternPostureV1,
  type CommercialLearningPatternReviewV1
} from "./commercial-learning-pattern-review-v1";

export const COMMERCIAL_LEARNING_REAPPLICATION_REVIEW_VERSION_V1 =
  "CommercialLearningReapplicationReviewV1" as const;
export const COMMERCIAL_LEARNING_REAPPLICATION_POLICY_VERSION_V1 =
  "commercial_learning_reapplication_review_v1.0.0" as const;

const MAX_SOURCE_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REFS = 2_000;

export type CommercialLearningReapplicationStateV1 =
  | "READY_FOR_CONTEXTUAL_REVIEW"
  | "REVIEW_NEGATIVE_HISTORY"
  | "REVIEW_MIXED_HISTORY"
  | "NEEDS_MORE_EVIDENCE"
  | "VERIFY_SOURCE";

export type CommercialLearningReapplicationReasonV1 =
  | "REPEATED_POSITIVE_HISTORY_PRESENT"
  | "REPEATED_NEGATIVE_HISTORY_PRESENT"
  | "MIXED_HISTORY_PRESENT"
  | "NO_REPEATED_DIRECTIONAL_HISTORY"
  | "SOURCE_APPLICATION_NOT_READY"
  | "SOURCE_PATTERN_NEEDS_MORE_EVIDENCE"
  | "SOURCE_APPLICATION_VERIFY"
  | "SOURCE_PATTERN_VERIFY"
  | "SOURCE_APPLICATION_CONTRACT_INVALID"
  | "SOURCE_PATTERN_CONTRACT_INVALID"
  | "SOURCE_APPLICATION_AUTHORITY_INVARIANT_FAILED"
  | "SOURCE_PATTERN_AUTHORITY_INVARIANT_FAILED"
  | "SOURCE_CAUSALITY_INVARIANT_FAILED"
  | "SOURCE_CONFIDENCE_INVARIANT_FAILED"
  | "SOURCE_MONETARY_INVARIANT_FAILED"
  | "SOURCE_RECOMMENDATION_INVARIANT_FAILED"
  | "DOMAIN_MISMATCH"
  | "PATTERN_MISMATCH"
  | "LEARNING_LINEAGE_NOT_SHARED"
  | "CURRENT_DECISION_ALREADY_IN_OUTCOME_HISTORY"
  | "SOURCE_EVIDENCE_INCOMPLETE"
  | "SOURCE_APPLICATION_IN_FUTURE"
  | "SOURCE_PATTERN_IN_FUTURE"
  | "SOURCE_APPLICATION_STALE"
  | "SOURCE_PATTERN_STALE"
  | "INVALID_EVALUATED_AT"
  | "INVALID_MAXIMUM_SOURCE_AGE"
  | "MALFORMED_INPUT";

export type CommercialLearningReapplicationReviewV1 = Readonly<{
  contractVersion: typeof COMMERCIAL_LEARNING_REAPPLICATION_REVIEW_VERSION_V1;
  policyVersion: typeof COMMERCIAL_LEARNING_REAPPLICATION_POLICY_VERSION_V1;
  reviewId: string;
  evaluatedAt: string | null;
  state: CommercialLearningReapplicationStateV1;
  reasonCodes: readonly CommercialLearningReapplicationReasonV1[];
  currentDecisionRef: string | null;
  domain: CommercialLearningDomainV1 | null;
  patternKey: string | null;
  applicationReviewId: string | null;
  outcomePatternReviewId: string | null;
  outcomeHistoryPosture: CommercialLearningPatternPostureV1 | null;
  historicalDecisionRefs: readonly string[];
  historicalOutcomeObservationIds: readonly string[];
  sharedLearningIds: readonly string[];
  sharedLineageIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  nextInternalStep:
    | "REVIEW_CURRENT_CONTEXT_WITH_REPEATED_POSITIVE_ASSOCIATIONS"
    | "REVIEW_CURRENT_CONTEXT_AND_REPEATED_NEGATIVE_ASSOCIATIONS"
    | "REVIEW_CURRENT_CONTEXT_AND_MIXED_ASSOCIATIONS"
    | "REVIEW_CURRENT_CONTEXT_WITHOUT_REPEATED_DIRECTIONAL_OUTCOME"
    | null;
  confidence: "NOT_ESTABLISHED";
  causalInterpretation: "NOT_ESTABLISHED";
  monetaryValue: null;
  recommendedPrice: null;
  recommendedNegotiationAction: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    lessonMutationAuthorized: false;
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

export type CommercialLearningReapplicationInputV1 = Readonly<{
  application: CommercialLearningApplicationReviewV1;
  outcomeHistory: CommercialLearningPatternReviewV1;
  evaluatedAt: string;
  maximumSourceAgeMs: number;
}>;

const APPLICATION_AUTHORITY = Object.freeze({
  analysisOnly: true,
  priceChangeAuthorized: false,
  negotiationActionAuthorized: false,
  externalActionAuthorized: false,
  persistenceAuthorized: false,
  policyPromotionAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  approvalBypassAuthorized: false
});

const PATTERN_AUTHORITY = Object.freeze({
  analysisOnly: true,
  lessonValidationAuthorized: false,
  lessonPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  priceChangeAuthorized: false,
  negotiationActionAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  lessonMutationAuthorized: false as const,
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
  "This review joins an already-governed current commercial-learning application with already-observed longitudinal outcome history. It does not create or validate a new lesson.",
  "Repeated positive, negative, mixed, or absent directional associations do not establish causality, confidence, transferability, expected return, or monetary value.",
  "Repeated positive history is not permission to reuse a price or negotiation tactic. Repeated negative or mixed history is review context, not proof that the lesson caused the outcomes.",
  "No price, concession, negotiation action, lesson mutation, policy promotion, persistence, external action, or approval bypass is authorized."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === normalized ? canonical : null;
}

function refs(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const item of value) {
    const ref = text(item);
    if (!ref) return null;
    normalized.push(ref);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactAuthority(value: unknown, expected: Readonly<Record<string, boolean>>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function intersection(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return Object.freeze(left.filter((value) => rightSet.has(value)).sort((a, b) => a.localeCompare(b)));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `commercial-learning-reapplication:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function sourceAgeReason(
  sourceAt: string | null,
  evaluatedAt: string | null,
  maximumSourceAgeMs: number,
  futureReason: CommercialLearningReapplicationReasonV1,
  staleReason: CommercialLearningReapplicationReasonV1,
  reasons: Set<CommercialLearningReapplicationReasonV1>
): void {
  if (!sourceAt || !evaluatedAt) return;
  const age = Date.parse(evaluatedAt) - Date.parse(sourceAt);
  if (age < 0) reasons.add(futureReason);
  else if (age > maximumSourceAgeMs) reasons.add(staleReason);
}

function nextStep(
  state: CommercialLearningReapplicationStateV1,
  posture: CommercialLearningPatternPostureV1 | null
): CommercialLearningReapplicationReviewV1["nextInternalStep"] {
  if (state === "VERIFY_SOURCE" || state === "NEEDS_MORE_EVIDENCE" || !posture) return null;
  if (posture === "DIRECTIONAL_POSITIVE") {
    return "REVIEW_CURRENT_CONTEXT_WITH_REPEATED_POSITIVE_ASSOCIATIONS";
  }
  if (posture === "DIRECTIONAL_NEGATIVE") {
    return "REVIEW_CURRENT_CONTEXT_AND_REPEATED_NEGATIVE_ASSOCIATIONS";
  }
  if (posture === "MIXED") return "REVIEW_CURRENT_CONTEXT_AND_MIXED_ASSOCIATIONS";
  return "REVIEW_CURRENT_CONTEXT_WITHOUT_REPEATED_DIRECTIONAL_OUTCOME";
}

/**
 * Closes the pricing / negotiation learning loop by binding a current lesson
 * application to observed longitudinal outcome history for the exact same
 * domain, pattern, and learning lineage. It is a review gate only: history is
 * never upgraded into causality, confidence, value, or execution authority.
 */
export function reviewCommercialLearningReapplicationV1(
  input: CommercialLearningReapplicationInputV1
): CommercialLearningReapplicationReviewV1 {
  const application = input?.application;
  const outcomeHistory = input?.outcomeHistory;
  const evaluatedAt = timestamp(input?.evaluatedAt);
  const maximumSourceAgeMs = input?.maximumSourceAgeMs;
  const reasons = new Set<CommercialLearningReapplicationReasonV1>();

  if (!application || typeof application !== "object" || !outcomeHistory || typeof outcomeHistory !== "object") {
    reasons.add("MALFORMED_INPUT");
  }
  if (!evaluatedAt) reasons.add("INVALID_EVALUATED_AT");
  if (
    !Number.isFinite(maximumSourceAgeMs)
    || maximumSourceAgeMs <= 0
    || maximumSourceAgeMs > MAX_SOURCE_AGE_MS
  ) {
    reasons.add("INVALID_MAXIMUM_SOURCE_AGE");
  }

  const applicationId = text(application?.reviewId);
  const patternReviewId = text(outcomeHistory?.reviewId);
  const currentDecisionRef = text(application?.currentDecisionRef);
  const applicationDomain = application?.domain === "PRICING" || application?.domain === "NEGOTIATION"
    ? application.domain
    : null;
  const patternDomain = outcomeHistory?.domain === "PRICING" || outcomeHistory?.domain === "NEGOTIATION"
    ? outcomeHistory.domain
    : null;
  const applicationPatternKey = text(application?.patternKey);
  const outcomePatternKey = text(outcomeHistory?.patternKey);
  const applicationReviewedAt = timestamp(application?.reviewedAt);
  const patternEvaluatedAt = timestamp(outcomeHistory?.evaluatedAt);

  if (!applicationId || !patternReviewId || !currentDecisionRef || !applicationDomain || !patternDomain || !applicationPatternKey || !outcomePatternKey) {
    reasons.add("MALFORMED_INPUT");
  }
  if (!applicationReviewedAt || !patternEvaluatedAt) reasons.add("MALFORMED_INPUT");

  if (
    application?.contractVersion !== COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1
    || application?.policyVersion !== COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1
  ) {
    reasons.add("SOURCE_APPLICATION_CONTRACT_INVALID");
  }
  if (
    outcomeHistory?.contractVersion !== COMMERCIAL_LEARNING_PATTERN_REVIEW_VERSION_V1
    || outcomeHistory?.policyVersion !== COMMERCIAL_LEARNING_PATTERN_POLICY_VERSION_V1
  ) {
    reasons.add("SOURCE_PATTERN_CONTRACT_INVALID");
  }

  if (!exactAuthority(application?.authority, APPLICATION_AUTHORITY)) {
    reasons.add("SOURCE_APPLICATION_AUTHORITY_INVARIANT_FAILED");
  }
  if (!exactAuthority(outcomeHistory?.authority, PATTERN_AUTHORITY)) {
    reasons.add("SOURCE_PATTERN_AUTHORITY_INVARIANT_FAILED");
  }
  if (application?.causalInterpretation !== "NOT_ESTABLISHED" || outcomeHistory?.causalInterpretation !== "NOT_ESTABLISHED") {
    reasons.add("SOURCE_CAUSALITY_INVARIANT_FAILED");
  }
  if (application?.confidence !== "NOT_ESTABLISHED" || outcomeHistory?.confidence !== "NOT_ESTABLISHED") {
    reasons.add("SOURCE_CONFIDENCE_INVARIANT_FAILED");
  }
  if (application?.monetaryValue !== null || outcomeHistory?.monetaryValue !== null) {
    reasons.add("SOURCE_MONETARY_INVARIANT_FAILED");
  }
  if (
    application?.recommendedPrice !== null
    || application?.recommendedNegotiationAction !== null
    || outcomeHistory?.recommendedPrice !== null
    || outcomeHistory?.recommendedNegotiationAction !== null
    || outcomeHistory?.policyUpdateCandidate !== null
  ) {
    reasons.add("SOURCE_RECOMMENDATION_INVARIANT_FAILED");
  }

  if (applicationDomain && patternDomain && applicationDomain !== patternDomain) reasons.add("DOMAIN_MISMATCH");
  if (applicationPatternKey && outcomePatternKey && applicationPatternKey !== outcomePatternKey) reasons.add("PATTERN_MISMATCH");

  const applicationLearningIds = refs(application?.sourceLearningIds);
  const applicationLineageIds = refs(application?.sourceLineageIds);
  const applicationCurrentEvidence = refs(application?.currentEvidenceRefs);
  const applicationLinkEvidence = refs(application?.applicationLinkEvidenceRefs);
  const applicationSourceEvidence = refs(application?.sourceReviewEvidenceRefs);
  const patternLearningIds = refs(outcomeHistory?.sourceLearningIds);
  const patternLineageIds = refs(outcomeHistory?.sourceLineageIds);
  const historicalDecisionRefs = refs(outcomeHistory?.currentDecisionRefs);
  const historicalOutcomeIds = refs(outcomeHistory?.outcomeObservationIds);
  const patternEvidence = refs(outcomeHistory?.evidenceRefs);

  if (
    applicationLearningIds === null
    || applicationLineageIds === null
    || applicationCurrentEvidence === null
    || applicationLinkEvidence === null
    || applicationSourceEvidence === null
    || patternLearningIds === null
    || patternLineageIds === null
    || historicalDecisionRefs === null
    || historicalOutcomeIds === null
    || patternEvidence === null
  ) {
    reasons.add("MALFORMED_INPUT");
  }

  const safeApplicationLearningIds = applicationLearningIds ?? Object.freeze([]);
  const safeApplicationLineageIds = applicationLineageIds ?? Object.freeze([]);
  const safeCurrentEvidence = applicationCurrentEvidence ?? Object.freeze([]);
  const safeApplicationLinkEvidence = applicationLinkEvidence ?? Object.freeze([]);
  const safeApplicationSourceEvidence = applicationSourceEvidence ?? Object.freeze([]);
  const safePatternLearningIds = patternLearningIds ?? Object.freeze([]);
  const safePatternLineageIds = patternLineageIds ?? Object.freeze([]);
  const safeHistoricalDecisionRefs = historicalDecisionRefs ?? Object.freeze([]);
  const safeHistoricalOutcomeIds = historicalOutcomeIds ?? Object.freeze([]);
  const safePatternEvidence = patternEvidence ?? Object.freeze([]);

  const sharedLearningIds = intersection(safeApplicationLearningIds, safePatternLearningIds);
  const sharedLineageIds = intersection(safeApplicationLineageIds, safePatternLineageIds);
  if (sharedLearningIds.length === 0 || sharedLineageIds.length === 0) {
    reasons.add("LEARNING_LINEAGE_NOT_SHARED");
  }
  if (currentDecisionRef && safeHistoricalDecisionRefs.includes(currentDecisionRef)) {
    reasons.add("CURRENT_DECISION_ALREADY_IN_OUTCOME_HISTORY");
  }
  if (
    safeCurrentEvidence.length === 0
    || safeApplicationLinkEvidence.length === 0
    || safeApplicationSourceEvidence.length === 0
    || safePatternEvidence.length === 0
  ) {
    reasons.add("SOURCE_EVIDENCE_INCOMPLETE");
  }

  if (application?.state === "VERIFY") reasons.add("SOURCE_APPLICATION_VERIFY");
  else if (application?.state !== "READY_FOR_REVIEW") reasons.add("SOURCE_APPLICATION_NOT_READY");
  if (outcomeHistory?.state === "VERIFY") reasons.add("SOURCE_PATTERN_VERIFY");
  else if (outcomeHistory?.state === "NEEDS_MORE_EVIDENCE") reasons.add("SOURCE_PATTERN_NEEDS_MORE_EVIDENCE");

  if (application?.state === "READY_FOR_REVIEW" && application?.nextInternalStep !== "REVIEW_LESSON_AGAINST_CURRENT_CONTEXT") {
    reasons.add("SOURCE_APPLICATION_CONTRACT_INVALID");
  }

  const posture = outcomeHistory?.posture ?? null;
  if (outcomeHistory?.state === "READY_FOR_INTERNAL_REVIEW" && posture === "DIRECTIONAL_POSITIVE") {
    reasons.add("REPEATED_POSITIVE_HISTORY_PRESENT");
  } else if (outcomeHistory?.state === "READY_FOR_INTERNAL_REVIEW" && posture === "DIRECTIONAL_NEGATIVE") {
    reasons.add("REPEATED_NEGATIVE_HISTORY_PRESENT");
  } else if (outcomeHistory?.state === "READY_FOR_INTERNAL_REVIEW" && posture === "MIXED") {
    reasons.add("MIXED_HISTORY_PRESENT");
  } else if (outcomeHistory?.state === "NO_ACTION" && posture === "NO_DIRECTIONAL_SIGNAL") {
    reasons.add("NO_REPEATED_DIRECTIONAL_HISTORY");
  } else if (outcomeHistory?.state !== "VERIFY" && outcomeHistory?.state !== "NEEDS_MORE_EVIDENCE") {
    reasons.add("SOURCE_PATTERN_CONTRACT_INVALID");
  }

  if (Number.isFinite(maximumSourceAgeMs) && maximumSourceAgeMs > 0) {
    sourceAgeReason(
      applicationReviewedAt,
      evaluatedAt,
      maximumSourceAgeMs,
      "SOURCE_APPLICATION_IN_FUTURE",
      "SOURCE_APPLICATION_STALE",
      reasons
    );
    sourceAgeReason(
      patternEvaluatedAt,
      evaluatedAt,
      maximumSourceAgeMs,
      "SOURCE_PATTERN_IN_FUTURE",
      "SOURCE_PATTERN_STALE",
      reasons
    );
  }

  const verificationReasons = new Set<CommercialLearningReapplicationReasonV1>([
    "SOURCE_APPLICATION_VERIFY",
    "SOURCE_PATTERN_VERIFY",
    "SOURCE_APPLICATION_CONTRACT_INVALID",
    "SOURCE_PATTERN_CONTRACT_INVALID",
    "SOURCE_APPLICATION_AUTHORITY_INVARIANT_FAILED",
    "SOURCE_PATTERN_AUTHORITY_INVARIANT_FAILED",
    "SOURCE_CAUSALITY_INVARIANT_FAILED",
    "SOURCE_CONFIDENCE_INVARIANT_FAILED",
    "SOURCE_MONETARY_INVARIANT_FAILED",
    "SOURCE_RECOMMENDATION_INVARIANT_FAILED",
    "DOMAIN_MISMATCH",
    "PATTERN_MISMATCH",
    "LEARNING_LINEAGE_NOT_SHARED",
    "CURRENT_DECISION_ALREADY_IN_OUTCOME_HISTORY",
    "SOURCE_EVIDENCE_INCOMPLETE",
    "SOURCE_APPLICATION_IN_FUTURE",
    "SOURCE_PATTERN_IN_FUTURE",
    "SOURCE_APPLICATION_STALE",
    "SOURCE_PATTERN_STALE",
    "INVALID_EVALUATED_AT",
    "INVALID_MAXIMUM_SOURCE_AGE",
    "MALFORMED_INPUT"
  ]);

  let state: CommercialLearningReapplicationStateV1;
  if ([...reasons].some((reason) => verificationReasons.has(reason))) {
    state = "VERIFY_SOURCE";
  } else if (
    reasons.has("SOURCE_APPLICATION_NOT_READY")
    || reasons.has("SOURCE_PATTERN_NEEDS_MORE_EVIDENCE")
  ) {
    state = "NEEDS_MORE_EVIDENCE";
  } else if (posture === "DIRECTIONAL_NEGATIVE") {
    state = "REVIEW_NEGATIVE_HISTORY";
  } else if (posture === "MIXED") {
    state = "REVIEW_MIXED_HISTORY";
  } else {
    state = "READY_FOR_CONTEXTUAL_REVIEW";
  }

  const reasonCodes = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));
  const evidenceRefs = Object.freeze([
    ...new Set([...safeCurrentEvidence, ...safeApplicationLinkEvidence, ...safeApplicationSourceEvidence, ...safePatternEvidence])
  ].sort((a, b) => a.localeCompare(b)));
  const sourceRefs = Object.freeze([
    ...new Set([
      ...(application?.sourceDecisionRefs ?? []),
      ...(application?.sourceOutcomeRefs ?? []),
      ...(outcomeHistory?.sourceReviewIds ?? [])
    ])
  ].sort((a, b) => a.localeCompare(b)));

  return deepFreeze({
    contractVersion: COMMERCIAL_LEARNING_REAPPLICATION_REVIEW_VERSION_V1,
    policyVersion: COMMERCIAL_LEARNING_REAPPLICATION_POLICY_VERSION_V1,
    reviewId: stableId([
      applicationId ?? "unknown-application",
      patternReviewId ?? "unknown-pattern-review",
      currentDecisionRef ?? "unknown-current-decision",
      evaluatedAt ?? "unknown-evaluated-at"
    ]),
    evaluatedAt,
    state,
    reasonCodes,
    currentDecisionRef,
    domain: applicationDomain,
    patternKey: applicationPatternKey,
    applicationReviewId: applicationId,
    outcomePatternReviewId: patternReviewId,
    outcomeHistoryPosture: posture,
    historicalDecisionRefs: safeHistoricalDecisionRefs,
    historicalOutcomeObservationIds: safeHistoricalOutcomeIds,
    sharedLearningIds,
    sharedLineageIds,
    evidenceRefs,
    sourceRefs,
    nextInternalStep: nextStep(state, posture),
    confidence: "NOT_ESTABLISHED",
    causalInterpretation: "NOT_ESTABLISHED",
    monetaryValue: null,
    recommendedPrice: null,
    recommendedNegotiationAction: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
