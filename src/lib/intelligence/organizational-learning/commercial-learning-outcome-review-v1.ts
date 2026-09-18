import { createHash } from "node:crypto";

import {
  COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1,
  COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1,
  type CommercialLearningApplicationReviewV1,
  type CommercialLearningDomainV1
} from "./commercial-learning-application-review-v1";
import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionAttributionClassV1,
  type DecisionMemoryRecordV1,
  type DecisionOutcomeAssessmentV1
} from "./decision-memory-v1";

export const COMMERCIAL_LEARNING_OUTCOME_REVIEW_VERSION_V1 =
  "CommercialLearningOutcomeReviewV1" as const;
export const COMMERCIAL_LEARNING_OUTCOME_POLICY_VERSION_V1 =
  "commercial_learning_outcome_review_v1.0.0" as const;

const MAX_REFS = 300;

export type CommercialLearningOutcomeReviewStateV1 =
  | "READY_FOR_LEARNING_REVIEW"
  | "WAITING_FOR_OUTCOME"
  | "VERIFY";

export type CommercialLearningOutcomeSignalV1 =
  | "POSITIVE_ASSOCIATION"
  | "NEGATIVE_ASSOCIATION"
  | "NEUTRAL_OBSERVATION"
  | "INCONCLUSIVE_OBSERVATION";

export type CommercialLearningOutcomeReasonV1 =
  | "POSITIVE_OUTCOME_READY_FOR_REVIEW"
  | "NEGATIVE_OUTCOME_READY_FOR_REVIEW"
  | "NEUTRAL_OUTCOME_READY_FOR_REVIEW"
  | "INCONCLUSIVE_OUTCOME_READY_FOR_REVIEW"
  | "OUTCOME_NOT_OBSERVED"
  | "OUTCOME_ASSESSMENT_UNKNOWN"
  | "APPLICATION_NOT_READY"
  | "APPLICATION_CONTRACT_INVALID"
  | "APPLICATION_AUTHORITY_INVARIANT_FAILED"
  | "APPLICATION_CAUSALITY_INVARIANT_FAILED"
  | "APPLICATION_EVIDENCE_INCOMPLETE"
  | "DECISION_CONTRACT_INVALID"
  | "DECISION_ID_MISMATCH"
  | "DECISION_DOMAIN_MISMATCH"
  | "DECISION_INTEGRITY_FAILED"
  | "DECISION_AUTHORITY_INVARIANT_FAILED"
  | "ACTION_NOT_OBSERVED"
  | "ACTION_EVIDENCE_MISSING"
  | "OUTCOME_ASSESSMENT_NOT_KNOWN"
  | "OUTCOME_ASSESSMENT_EVIDENCE_MISSING"
  | "OUTCOME_ID_UNEXPECTED"
  | "OUTCOME_ID_DUPLICATE"
  | "OUTCOME_OBSERVED_BEFORE_DECISION"
  | "OUTCOME_OBSERVED_BEFORE_APPLICATION_REVIEW"
  | "OUTCOME_IN_FUTURE"
  | "OUTCOME_STALE"
  | "APPLICATION_REVIEW_IN_FUTURE"
  | "INVALID_REVIEW_TIME"
  | "INVALID_MAXIMUM_OUTCOME_AGE"
  | "MALFORMED_INPUT";

export type CommercialLearningOutcomeReviewV1 = Readonly<{
  contractVersion: typeof COMMERCIAL_LEARNING_OUTCOME_REVIEW_VERSION_V1;
  policyVersion: typeof COMMERCIAL_LEARNING_OUTCOME_POLICY_VERSION_V1;
  reviewId: string;
  reviewedAt: string | null;
  state: CommercialLearningOutcomeReviewStateV1;
  reasonCodes: readonly CommercialLearningOutcomeReasonV1[];
  currentDecisionRef: string | null;
  domain: CommercialLearningDomainV1 | null;
  patternKey: string | null;
  sourceLessonTitle: string | null;
  sourceLessonContent: string | null;
  observedAssessment: DecisionOutcomeAssessmentV1 | null;
  recordedAttributionClass: DecisionAttributionClassV1 | null;
  outcomeSignal: CommercialLearningOutcomeSignalV1 | null;
  applicationReviewId: string | null;
  outcomeObservationId: string | null;
  sourceDecisionRefs: readonly string[];
  sourceOutcomeRefs: readonly string[];
  sourceLearningIds: readonly string[];
  sourceLineageIds: readonly string[];
  sourceLessonEvidenceRefs: readonly string[];
  applicationEvidenceRefs: readonly string[];
  actionEvidenceRefs: readonly string[];
  outcomeEvidenceRefs: readonly string[];
  decisionSourceRefs: readonly string[];
  nextInternalStep: "REVIEW_COMMERCIAL_LESSON_WITH_CURRENT_OUTCOME" | null;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  recommendedPrice: null;
  recommendedNegotiationAction: null;
  policyUpdateCandidate: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    lessonValidationAuthorized: false;
    priceChangeAuthorized: false;
    negotiationActionAuthorized: false;
    persistenceAuthorized: false;
    policyPromotionAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CommercialLearningOutcomeReviewInputV1 = Readonly<{
  application: CommercialLearningApplicationReviewV1;
  decision: DecisionMemoryRecordV1;
  reviewedAt: string;
  maximumOutcomeAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  lessonValidationAuthorized: false as const,
  priceChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  persistenceAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "A current commercial outcome is review evidence about one application context; it does not validate or invalidate the recurring lesson by itself.",
  "A positive or negative association does not establish causality, attribution, confidence, monetary value, transferability, or a recommended price or negotiation action.",
  "The recorded attribution class is preserved as source evidence and is never upgraded by this review.",
  "Any lesson persistence, policy promotion, price change, concession, negotiation action, or external action remains separately governed."
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
  return `commercial-learning-outcome:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function applicationAuthorityHolds(application: CommercialLearningApplicationReviewV1): boolean {
  return application.authority?.analysisOnly === true
    && application.authority.priceChangeAuthorized === false
    && application.authority.negotiationActionAuthorized === false
    && application.authority.externalActionAuthorized === false
    && application.authority.persistenceAuthorized === false
    && application.authority.policyPromotionAuthorized === false
    && application.authority.confidenceMutationAuthorized === false
    && application.authority.monetaryMutationAuthorized === false
    && application.authority.approvalBypassAuthorized === false
    && application.confidence === "NOT_ESTABLISHED"
    && application.recommendedPrice === null
    && application.recommendedNegotiationAction === null
    && application.monetaryValue === null;
}

function decisionAuthorityHolds(decision: DecisionMemoryRecordV1): boolean {
  return decision.actionAuthority?.analysisOnly === true
    && decision.actionAuthority.persistenceAuthorized === false
    && decision.actionAuthority.externalActionAuthorized === false
    && decision.actionAuthority.pricingChangeAuthorized === false
    && decision.actionAuthority.negotiationAuthorized === false
    && decision.actionAuthority.spendAuthorized === false
    && decision.actionAuthority.publishAuthorized === false;
}

function expectedDecisionClass(domain: CommercialLearningDomainV1 | null): "PRICING" | "NEGOTIATION" | null {
  if (domain === "PRICING") return "PRICING";
  if (domain === "NEGOTIATION") return "NEGOTIATION";
  return null;
}

function signalForAssessment(
  assessment: DecisionOutcomeAssessmentV1
): CommercialLearningOutcomeSignalV1 | null {
  switch (assessment) {
    case "POSITIVE":
      return "POSITIVE_ASSOCIATION";
    case "NEGATIVE":
      return "NEGATIVE_ASSOCIATION";
    case "NEUTRAL":
      return "NEUTRAL_OBSERVATION";
    case "INCONCLUSIVE":
      return "INCONCLUSIVE_OBSERVATION";
    case "UNKNOWN":
      return null;
  }
}

function readyReason(
  assessment: DecisionOutcomeAssessmentV1
): CommercialLearningOutcomeReasonV1 | null {
  switch (assessment) {
    case "POSITIVE":
      return "POSITIVE_OUTCOME_READY_FOR_REVIEW";
    case "NEGATIVE":
      return "NEGATIVE_OUTCOME_READY_FOR_REVIEW";
    case "NEUTRAL":
      return "NEUTRAL_OUTCOME_READY_FOR_REVIEW";
    case "INCONCLUSIVE":
      return "INCONCLUSIVE_OUTCOME_READY_FOR_REVIEW";
    case "UNKNOWN":
      return null;
  }
}

function collectOutcomeEvidence(decision: DecisionMemoryRecordV1): readonly string[] | null {
  const observation = decision.outcomeObservation;
  if (!observation) return Object.freeze([]);
  const groups: unknown[] = [
    observation.assessment?.evidenceRefs,
    observation.attributionEvidenceRefs,
    observation.sourceRefs
  ];
  for (const outcome of observation.outcomes ?? []) {
    groups.push(outcome?.description?.evidenceRefs, outcome?.observedRange?.evidenceRefs);
  }
  for (const assessment of observation.assumptionAssessments ?? []) groups.push(assessment?.evidenceRefs);
  for (const confounder of observation.confounders ?? []) groups.push(confounder?.evidenceRefs);

  const merged: string[] = [];
  for (const group of groups) {
    const normalized = refs(group);
    if (normalized === null) return null;
    merged.push(...normalized);
  }
  return Object.freeze([...new Set(merged)].sort((a, b) => a.localeCompare(b)));
}

export function reviewCommercialLearningOutcomeV1(
  input: CommercialLearningOutcomeReviewInputV1
): CommercialLearningOutcomeReviewV1 {
  const application = input?.application;
  const decision = input?.decision;
  const reviewedAt = timestamp(input?.reviewedAt);
  const applicationReviewedAt = timestamp(application?.reviewedAt);
  const decisionDecidedAt = timestamp(decision?.decidedAt);
  const outcomeObservedAt = timestamp(decision?.outcomeObservation?.observedAt);
  const maximumOutcomeAgeMs = input?.maximumOutcomeAgeMs;
  const reasonCodes = new Set<CommercialLearningOutcomeReasonV1>();

  if (!reviewedAt) reasonCodes.add("INVALID_REVIEW_TIME");
  if (!Number.isFinite(maximumOutcomeAgeMs) || maximumOutcomeAgeMs <= 0) {
    reasonCodes.add("INVALID_MAXIMUM_OUTCOME_AGE");
  }

  const currentDecisionRef = text(application?.currentDecisionRef);
  const patternKey = text(application?.patternKey);
  const applicationReviewId = text(application?.reviewId);
  const domain = application?.domain === "PRICING" || application?.domain === "NEGOTIATION"
    ? application.domain
    : null;
  if (!application || !decision || !currentDecisionRef || !patternKey || !applicationReviewId || !domain) {
    reasonCodes.add("MALFORMED_INPUT");
  }

  if (
    application?.contractVersion !== COMMERCIAL_LEARNING_APPLICATION_REVIEW_VERSION_V1
    || application?.policyVersion !== COMMERCIAL_LEARNING_APPLICATION_POLICY_VERSION_V1
  ) {
    reasonCodes.add("APPLICATION_CONTRACT_INVALID");
  }
  if (
    application?.state !== "READY_FOR_REVIEW"
    || application?.reasonCodes?.length !== 1
    || application?.reasonCodes?.[0] !== "REPEATED_LESSON_READY_FOR_CURRENT_REVIEW"
    || application?.nextInternalStep !== "REVIEW_LESSON_AGAINST_CURRENT_CONTEXT"
  ) {
    reasonCodes.add("APPLICATION_NOT_READY");
  }
  if (application && !applicationAuthorityHolds(application)) {
    reasonCodes.add("APPLICATION_AUTHORITY_INVARIANT_FAILED");
  }
  if (application?.causalInterpretation !== "NOT_ESTABLISHED") {
    reasonCodes.add("APPLICATION_CAUSALITY_INVARIANT_FAILED");
  }

  const sourceDecisionRefs = refs(application?.sourceDecisionRefs);
  const sourceOutcomeRefs = refs(application?.sourceOutcomeRefs);
  const sourceLearningIds = refs(application?.sourceLearningIds);
  const sourceLineageIds = refs(application?.sourceLineageIds);
  const sourceLessonEvidenceRefs = refs(application?.sourceLessonEvidenceRefs);
  const sourceReviewEvidenceRefs = refs(application?.sourceReviewEvidenceRefs);
  const currentEvidenceRefs = refs(application?.currentEvidenceRefs);
  const applicationLinkEvidenceRefs = refs(application?.applicationLinkEvidenceRefs);
  const actionEvidenceRefs = refs(decision?.actionEvidenceRefs);
  const decisionSourceRefs = refs(decision?.sourceRefs);
  const outcomeEvidenceRefs = decision ? collectOutcomeEvidence(decision) : null;

  if (
    sourceDecisionRefs === null
    || sourceOutcomeRefs === null
    || sourceLearningIds === null
    || sourceLineageIds === null
    || sourceLessonEvidenceRefs === null
    || sourceReviewEvidenceRefs === null
    || currentEvidenceRefs === null
    || applicationLinkEvidenceRefs === null
    || actionEvidenceRefs === null
    || decisionSourceRefs === null
    || outcomeEvidenceRefs === null
  ) {
    reasonCodes.add("MALFORMED_INPUT");
  }

  const safeSourceDecisionRefs = sourceDecisionRefs ?? Object.freeze([]);
  const safeSourceOutcomeRefs = sourceOutcomeRefs ?? Object.freeze([]);
  const safeSourceLearningIds = sourceLearningIds ?? Object.freeze([]);
  const safeSourceLineageIds = sourceLineageIds ?? Object.freeze([]);
  const safeSourceLessonEvidenceRefs = sourceLessonEvidenceRefs ?? Object.freeze([]);
  const safeSourceReviewEvidenceRefs = sourceReviewEvidenceRefs ?? Object.freeze([]);
  const safeCurrentEvidenceRefs = currentEvidenceRefs ?? Object.freeze([]);
  const safeApplicationLinkEvidenceRefs = applicationLinkEvidenceRefs ?? Object.freeze([]);
  const safeActionEvidenceRefs = actionEvidenceRefs ?? Object.freeze([]);
  const safeDecisionSourceRefs = decisionSourceRefs ?? Object.freeze([]);
  const safeOutcomeEvidenceRefs = outcomeEvidenceRefs ?? Object.freeze([]);
  const applicationEvidenceRefs = Object.freeze([
    ...new Set([
      ...safeSourceReviewEvidenceRefs,
      ...safeCurrentEvidenceRefs,
      ...safeApplicationLinkEvidenceRefs
    ])
  ].sort((a, b) => a.localeCompare(b)));

  if (
    safeSourceDecisionRefs.length < 2
    || safeSourceOutcomeRefs.length < 2
    || safeSourceLearningIds.length < 2
    || safeSourceLineageIds.length < 2
    || safeSourceLessonEvidenceRefs.length === 0
    || safeSourceReviewEvidenceRefs.length === 0
    || safeCurrentEvidenceRefs.length === 0
    || safeApplicationLinkEvidenceRefs.length === 0
  ) {
    reasonCodes.add("APPLICATION_EVIDENCE_INCOMPLETE");
  }

  if (
    decision?.contractVersion !== "DecisionMemoryV1"
    || decision?.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1
  ) {
    reasonCodes.add("DECISION_CONTRACT_INVALID");
  }
  if (decision && !decisionAuthorityHolds(decision)) reasonCodes.add("DECISION_AUTHORITY_INVARIANT_FAILED");
  if (currentDecisionRef && text(decision?.decisionId) !== currentDecisionRef) reasonCodes.add("DECISION_ID_MISMATCH");
  const expectedClass = expectedDecisionClass(domain);
  if (expectedClass && decision?.decisionClass !== expectedClass) reasonCodes.add("DECISION_DOMAIN_MISMATCH");
  if (!Array.isArray(decision?.integrityFlags) || decision.integrityFlags.length > 0) {
    reasonCodes.add("DECISION_INTEGRITY_FAILED");
  }
  if (decision?.actionState !== "TAKEN" && decision?.actionState !== "REVERSED") {
    reasonCodes.add("ACTION_NOT_OBSERVED");
  }
  if (safeActionEvidenceRefs.length === 0) reasonCodes.add("ACTION_EVIDENCE_MISSING");

  const outcome = decision?.outcomeObservation ?? null;
  const assessmentState = outcome?.assessment?.state;
  const assessment = outcome?.assessment?.value ?? null;
  if (outcome && assessmentState !== "KNOWN") reasonCodes.add("OUTCOME_ASSESSMENT_NOT_KNOWN");
  if (outcome && refs(outcome.assessment?.evidenceRefs)?.length === 0) {
    reasonCodes.add("OUTCOME_ASSESSMENT_EVIDENCE_MISSING");
  }

  if (outcome) {
    const observedOutcomeIds = (outcome.outcomes ?? []).map((item) => text(item?.outcomeId));
    if (observedOutcomeIds.some((value) => !value)) reasonCodes.add("MALFORMED_INPUT");
    const safeObservedIds = observedOutcomeIds.filter((value): value is string => Boolean(value));
    if (new Set(safeObservedIds).size !== safeObservedIds.length) reasonCodes.add("OUTCOME_ID_DUPLICATE");
    const expectedOutcomeIds = new Set((decision?.expectedOutcomes ?? []).map((item) => text(item?.outcomeId)).filter(Boolean));
    if (safeObservedIds.some((id) => !expectedOutcomeIds.has(id))) reasonCodes.add("OUTCOME_ID_UNEXPECTED");
  }

  if (reviewedAt && applicationReviewedAt && Date.parse(applicationReviewedAt) > Date.parse(reviewedAt)) {
    reasonCodes.add("APPLICATION_REVIEW_IN_FUTURE");
  }
  if (outcomeObservedAt && decisionDecidedAt && Date.parse(outcomeObservedAt) < Date.parse(decisionDecidedAt)) {
    reasonCodes.add("OUTCOME_OBSERVED_BEFORE_DECISION");
  }
  if (outcomeObservedAt && applicationReviewedAt && Date.parse(outcomeObservedAt) < Date.parse(applicationReviewedAt)) {
    reasonCodes.add("OUTCOME_OBSERVED_BEFORE_APPLICATION_REVIEW");
  }
  if (reviewedAt && outcomeObservedAt) {
    const age = Date.parse(reviewedAt) - Date.parse(outcomeObservedAt);
    if (age < 0) reasonCodes.add("OUTCOME_IN_FUTURE");
    else if (Number.isFinite(maximumOutcomeAgeMs) && maximumOutcomeAgeMs > 0 && age > maximumOutcomeAgeMs) {
      reasonCodes.add("OUTCOME_STALE");
    }
  }

  const verificationReasons = [...reasonCodes].sort((a, b) => a.localeCompare(b));
  const waitingForOutcome = verificationReasons.length === 0 && !outcome;
  const waitingForAssessment = verificationReasons.length === 0 && Boolean(outcome)
    && (assessment === null || assessment === "UNKNOWN");
  const ready = verificationReasons.length === 0
    && Boolean(outcome)
    && Boolean(assessment)
    && assessment !== "UNKNOWN";

  const state: CommercialLearningOutcomeReviewStateV1 = ready
    ? "READY_FOR_LEARNING_REVIEW"
    : waitingForOutcome || waitingForAssessment
      ? "WAITING_FOR_OUTCOME"
      : "VERIFY";

  const finalReasonCodes: readonly CommercialLearningOutcomeReasonV1[] = ready && assessment
    ? [readyReason(assessment) as CommercialLearningOutcomeReasonV1]
    : waitingForOutcome
      ? ["OUTCOME_NOT_OBSERVED"]
      : waitingForAssessment
        ? ["OUTCOME_ASSESSMENT_UNKNOWN"]
        : verificationReasons;

  const reviewId = stableId([
    applicationReviewId ?? "unknown-application-review",
    currentDecisionRef ?? "unknown-decision",
    text(outcome?.observationId) ?? "no-outcome-observation",
    reviewedAt ?? "unknown-reviewed-at"
  ]);

  return freezeDeep({
    contractVersion: COMMERCIAL_LEARNING_OUTCOME_REVIEW_VERSION_V1,
    policyVersion: COMMERCIAL_LEARNING_OUTCOME_POLICY_VERSION_V1,
    reviewId,
    reviewedAt,
    state,
    reasonCodes: finalReasonCodes,
    currentDecisionRef,
    domain,
    patternKey,
    sourceLessonTitle: text(application?.lessonTitle),
    sourceLessonContent: text(application?.lessonContent),
    observedAssessment: ready ? assessment : null,
    recordedAttributionClass: outcome?.attributionClass ?? null,
    outcomeSignal: ready && assessment ? signalForAssessment(assessment) : null,
    applicationReviewId,
    outcomeObservationId: text(outcome?.observationId),
    sourceDecisionRefs: safeSourceDecisionRefs,
    sourceOutcomeRefs: safeSourceOutcomeRefs,
    sourceLearningIds: safeSourceLearningIds,
    sourceLineageIds: safeSourceLineageIds,
    sourceLessonEvidenceRefs: safeSourceLessonEvidenceRefs,
    applicationEvidenceRefs,
    actionEvidenceRefs: safeActionEvidenceRefs,
    outcomeEvidenceRefs: safeOutcomeEvidenceRefs,
    decisionSourceRefs: safeDecisionSourceRefs,
    nextInternalStep: ready ? "REVIEW_COMMERCIAL_LESSON_WITH_CURRENT_OUTCOME" : null,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    recommendedPrice: null,
    recommendedNegotiationAction: null,
    policyUpdateCandidate: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
