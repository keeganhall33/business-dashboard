import { createHash } from "node:crypto";

import type {
  DecisionAttributionClassV1,
  DecisionMemoryRecordV1,
  DecisionOutcomeAssessmentV1
} from "../intelligence/organizational-learning/decision-memory-v1";
import type {
  DecisionDispositionV1,
  DecisionPortfolioV1
} from "./decision-portfolio-v1";

export const DECISION_OUTCOME_PORTFOLIO_REVIEW_VERSION_V1 =
  "DecisionOutcomePortfolioReviewV1" as const;
export const DECISION_OUTCOME_PORTFOLIO_REVIEW_POLICY_VERSION_V1 =
  "decision_outcome_portfolio_review_v1.0.0" as const;

const MAX_OUTCOME_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REFS = 100;

export type DecisionOutcomePortfolioReviewStateV1 =
  | "READY_FOR_REVIEW"
  | "WAIT_FOR_EVIDENCE"
  | "NO_ACTION"
  | "VERIFY";

export type DecisionOutcomePortfolioReviewReasonV1 =
  | "NEGATIVE_OUTCOME_REQUIRES_REASSESSMENT"
  | "POSITIVE_OUTCOME_READY_FOR_REVIEW"
  | "NEUTRAL_OUTCOME_NO_REALLOCATION_SIGNAL"
  | "OUTCOME_INCONCLUSIVE"
  | "OUTCOME_NOT_OBSERVED"
  | "OUTCOME_NOT_DECISION_GRADE"
  | "DECISION_INTEGRITY_FLAGS"
  | "ACTION_NOT_OBSERVED"
  | "ACTION_EVIDENCE_MISSING"
  | "TARGET_CANDIDATE_MISSING"
  | "DUPLICATE_TARGET_CANDIDATE"
  | "TARGET_CANDIDATE_NOT_KNOWN"
  | "TARGET_DECISION_ID_MISMATCH"
  | "TARGET_LINK_EVIDENCE_MISSING"
  | "TARGET_LINK_EVIDENCE_NOT_SHARED"
  | "INVALID_FRESHNESS_POLICY"
  | "INVALID_CHRONOLOGY"
  | "OUTCOME_STALE"
  | "OUTCOME_EVIDENCE_MISSING"
  | "ATTRIBUTION_EVIDENCE_MISSING"
  | "SOURCE_AUTHORITY_INVARIANT_FAILED";

export type DecisionOutcomePortfolioTargetLinkV1 = Readonly<{
  candidateId: string;
  evidenceRefs: readonly string[];
}>;

export type DecisionOutcomePortfolioReviewInputV1 = Readonly<{
  portfolio: DecisionPortfolioV1;
  record: DecisionMemoryRecordV1;
  targetLink: DecisionOutcomePortfolioTargetLinkV1;
  reviewedAt: string;
  maximumOutcomeAgeMs: number;
}>;

export type DecisionOutcomePortfolioReviewV1 = Readonly<{
  contractVersion: typeof DECISION_OUTCOME_PORTFOLIO_REVIEW_VERSION_V1;
  policyVersion: typeof DECISION_OUTCOME_PORTFOLIO_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  reviewedAt: string;
  sourcePortfolioId: string;
  decisionId: string;
  candidateId: string;
  previousDisposition: DecisionDispositionV1 | null;
  state: DecisionOutcomePortfolioReviewStateV1;
  reasonCodes: readonly DecisionOutcomePortfolioReviewReasonV1[];
  outcomeObservationId: string | null;
  outcomeAssessment: DecisionOutcomeAssessmentV1 | null;
  attributionClass: DecisionAttributionClassV1;
  observedOutcomeIds: readonly string[];
  evidenceRefs: readonly string[];
  targetLinkEvidenceRefs: readonly string[];
  nextInternalStep:
    | "REASSESS_CANONICAL_CANDIDATE_EVIDENCE"
    | "REVIEW_OUTCOME_WITHOUT_AUTOMATIC_SCALING"
    | "COLLECT_DECISION_OUTCOME_EVIDENCE"
    | "VERIFY_DECISION_OUTCOME_AND_PORTFOLIO_LINK"
    | null;
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  outcomePrediction: null;
  causalInterpretation: "NOT_ESTABLISHED";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    decisionMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    scoreMutationAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    persistenceAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true,
  decisionMutationAuthorized: false,
  portfolioMutationAuthorized: false,
  allocationChangeAuthorized: false,
  scoreMutationAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  policyPromotionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  persistenceAuthorized: false,
  approvalBypassAuthorized: false
} as const);

const LIMITATIONS = Object.freeze([
  "An observed decision outcome can trigger internal portfolio reassessment, but never changes allocation or candidate disposition by itself.",
  "Positive outcomes are review signals only and never become automatic scale instructions; negative outcomes never prove the decision caused the result.",
  "Attribution, confidence, monetary value, future outcomes, and causality are not inferred by this projection.",
  "Missing, stale, conflicting, unsupported, or unlinked evidence fails closed and grants no persistence, execution, pricing, negotiation, spend, or approval authority."
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
  return `decision-outcome-portfolio:${createHash("sha256")
    .update(values.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function sourceAuthorityInvariantHolds(record: DecisionMemoryRecordV1): boolean {
  return record.actionAuthority.analysisOnly === true
    && record.actionAuthority.persistenceAuthorized === false
    && record.actionAuthority.externalActionAuthorized === false
    && record.actionAuthority.pricingChangeAuthorized === false
    && record.actionAuthority.negotiationAuthorized === false
    && record.actionAuthority.spendAuthorized === false
    && record.actionAuthority.publishAuthorized === false;
}

function outcomeEvidenceRefs(record: DecisionMemoryRecordV1): readonly string[] {
  const observation = record.outcomeObservation;
  if (!observation) return uniqueSorted(record.actionEvidenceRefs);
  return uniqueSorted([
    ...record.actionEvidenceRefs,
    ...observation.assessment.evidenceRefs,
    ...observation.attributionEvidenceRefs,
    ...observation.sourceRefs,
    ...observation.outcomes.flatMap((outcome) => [
      ...outcome.description.evidenceRefs,
      ...outcome.observedRange.evidenceRefs
    ]),
    ...observation.assumptionAssessments.flatMap((assessment) => assessment.evidenceRefs),
    ...(observation.lessonCandidate?.evidenceRefs ?? [])
  ]);
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

const VERIFY_REASONS = new Set<DecisionOutcomePortfolioReviewReasonV1>([
  "DECISION_INTEGRITY_FLAGS",
  "ACTION_NOT_OBSERVED",
  "ACTION_EVIDENCE_MISSING",
  "TARGET_CANDIDATE_MISSING",
  "DUPLICATE_TARGET_CANDIDATE",
  "TARGET_CANDIDATE_NOT_KNOWN",
  "TARGET_DECISION_ID_MISMATCH",
  "TARGET_LINK_EVIDENCE_MISSING",
  "TARGET_LINK_EVIDENCE_NOT_SHARED",
  "INVALID_FRESHNESS_POLICY",
  "INVALID_CHRONOLOGY",
  "OUTCOME_STALE",
  "OUTCOME_EVIDENCE_MISSING",
  "ATTRIBUTION_EVIDENCE_MISSING",
  "SOURCE_AUTHORITY_INVARIANT_FAILED"
]);

function stateFor(
  reasons: readonly DecisionOutcomePortfolioReviewReasonV1[],
  assessment: DecisionOutcomeAssessmentV1 | null
): DecisionOutcomePortfolioReviewStateV1 {
  if (reasons.some((reason) => VERIFY_REASONS.has(reason))) return "VERIFY";
  if (reasons.includes("OUTCOME_NOT_OBSERVED") || reasons.includes("OUTCOME_NOT_DECISION_GRADE")) {
    return "WAIT_FOR_EVIDENCE";
  }
  if (assessment === "INCONCLUSIVE" || assessment === "UNKNOWN" || assessment === null) {
    return "WAIT_FOR_EVIDENCE";
  }
  if (assessment === "NEUTRAL") return "NO_ACTION";
  return "READY_FOR_REVIEW";
}

function nextInternalStepFor(
  state: DecisionOutcomePortfolioReviewStateV1,
  assessment: DecisionOutcomeAssessmentV1 | null
): DecisionOutcomePortfolioReviewV1["nextInternalStep"] {
  if (state === "VERIFY") return "VERIFY_DECISION_OUTCOME_AND_PORTFOLIO_LINK";
  if (state === "WAIT_FOR_EVIDENCE") return "COLLECT_DECISION_OUTCOME_EVIDENCE";
  if (state !== "READY_FOR_REVIEW") return null;
  return assessment === "POSITIVE"
    ? "REVIEW_OUTCOME_WITHOUT_AUTOMATIC_SCALING"
    : "REASSESS_CANONICAL_CANDIDATE_EVIDENCE";
}

/**
 * Bridges one canonical DecisionMemory outcome observation into the current
 * DecisionPortfolio as an internal review signal only. The bridge requires an
 * exact decision/candidate identity plus shared evidence; it never reallocates,
 * rescales, reprices, executes, or upgrades attribution into causal truth.
 */
export function reviewDecisionOutcomeForPortfolioV1(
  input: DecisionOutcomePortfolioReviewInputV1
): DecisionOutcomePortfolioReviewV1 {
  if (!input?.record || input.record.contractVersion !== "DecisionMemoryV1") {
    throw new Error("DECISION_OUTCOME_PORTFOLIO_INVALID_RECORD");
  }
  if (!input?.portfolio || input.portfolio.contractVersion !== "DecisionPortfolioV1") {
    throw new Error("DECISION_OUTCOME_PORTFOLIO_INVALID_PORTFOLIO");
  }

  const reviewedAt = timestamp(input.reviewedAt);
  if (!reviewedAt) throw new Error("DECISION_OUTCOME_PORTFOLIO_INVALID_REVIEWED_AT");
  const reviewedAtMs = Date.parse(reviewedAt);
  const maximumOutcomeAgeMs = input.maximumOutcomeAgeMs;

  const reasons = new Set<DecisionOutcomePortfolioReviewReasonV1>();
  if (
    !Number.isFinite(maximumOutcomeAgeMs)
      || maximumOutcomeAgeMs <= 0
      || maximumOutcomeAgeMs > MAX_OUTCOME_AGE_MS
  ) {
    reasons.add("INVALID_FRESHNESS_POLICY");
  }

  if (input.record.integrityFlags.length > 0) reasons.add("DECISION_INTEGRITY_FLAGS");
  if (!sourceAuthorityInvariantHolds(input.record)) reasons.add("SOURCE_AUTHORITY_INVARIANT_FAILED");
  if (input.record.actionState !== "TAKEN" && input.record.actionState !== "REVERSED") {
    reasons.add("ACTION_NOT_OBSERVED");
  }
  if (input.record.actionEvidenceRefs.length === 0) reasons.add("ACTION_EVIDENCE_MISSING");

  const candidateId = text(input.targetLink?.candidateId) ?? "unknown-candidate";
  const matchingCandidates = input.portfolio.items.filter((item) => item.candidate.id === candidateId);
  const targetItem = matchingCandidates.length === 1 ? matchingCandidates[0] : null;
  if (matchingCandidates.length === 0) reasons.add("TARGET_CANDIDATE_MISSING");
  if (matchingCandidates.length > 1) reasons.add("DUPLICATE_TARGET_CANDIDATE");
  if (targetItem && targetItem.candidate.evidenceState !== "KNOWN") {
    reasons.add("TARGET_CANDIDATE_NOT_KNOWN");
  }
  if (candidateId !== input.record.decisionId) reasons.add("TARGET_DECISION_ID_MISMATCH");

  const linkEvidenceRefs = uniqueSorted(input.targetLink?.evidenceRefs);
  if (linkEvidenceRefs.length === 0) reasons.add("TARGET_LINK_EVIDENCE_MISSING");
  if (targetItem && linkEvidenceRefs.length > 0) {
    const candidateEvidence = new Set(uniqueSorted(targetItem.candidate.evidenceRefs));
    const decisionEvidence = new Set(outcomeEvidenceRefs(input.record));
    if (linkEvidenceRefs.some((ref) => !candidateEvidence.has(ref) || !decisionEvidence.has(ref))) {
      reasons.add("TARGET_LINK_EVIDENCE_NOT_SHARED");
    }
  }

  const decisionAt = timestamp(input.record.decidedAt);
  const portfolioAt = timestamp(input.portfolio.generatedAt);
  const observation = input.record.outcomeObservation;
  const observationAt = observation ? timestamp(observation.observedAt) : null;
  if (
    !decisionAt
      || !portfolioAt
      || Date.parse(decisionAt) > reviewedAtMs
      || Date.parse(portfolioAt) > reviewedAtMs
      || (observation !== null
        && (!observationAt
          || Date.parse(observationAt) < Date.parse(decisionAt)
          || Date.parse(observationAt) > reviewedAtMs))
  ) {
    reasons.add("INVALID_CHRONOLOGY");
  }

  if (observationAt && Number.isFinite(maximumOutcomeAgeMs) && maximumOutcomeAgeMs > 0) {
    if (reviewedAtMs - Date.parse(observationAt) > maximumOutcomeAgeMs) reasons.add("OUTCOME_STALE");
  }

  let assessment: DecisionOutcomeAssessmentV1 | null = null;
  if (!observation) {
    reasons.add("OUTCOME_NOT_OBSERVED");
  } else {
    const decisionGradeAssessment = observation.assessment.state === "KNOWN"
      && observation.assessment.value != null
      && observation.assessment.value !== "UNKNOWN"
      && observation.assessment.evidenceRefs.length > 0;
    if (!decisionGradeAssessment) {
      reasons.add("OUTCOME_NOT_DECISION_GRADE");
      if (observation.assessment.evidenceRefs.length === 0) reasons.add("OUTCOME_EVIDENCE_MISSING");
    } else {
      assessment = observation.assessment.value;
      if (assessment === "NEGATIVE") reasons.add("NEGATIVE_OUTCOME_REQUIRES_REASSESSMENT");
      if (assessment === "POSITIVE") reasons.add("POSITIVE_OUTCOME_READY_FOR_REVIEW");
      if (assessment === "NEUTRAL") reasons.add("NEUTRAL_OUTCOME_NO_REALLOCATION_SIGNAL");
      if (assessment === "INCONCLUSIVE") reasons.add("OUTCOME_INCONCLUSIVE");
    }
    if (observation.attributionClass !== "UNKNOWN" && observation.attributionEvidenceRefs.length === 0) {
      reasons.add("ATTRIBUTION_EVIDENCE_MISSING");
    }
  }

  const reasonCodes = Object.freeze(
    [...reasons].sort((a, b) => a.localeCompare(b))
  ) as readonly DecisionOutcomePortfolioReviewReasonV1[];
  const state = stateFor(reasonCodes, assessment);
  const evidenceRefs = uniqueSorted([
    ...outcomeEvidenceRefs(input.record),
    ...linkEvidenceRefs
  ]);
  const observedOutcomeIds = Object.freeze(
    [...(observation?.outcomes ?? [])]
      .map((outcome) => outcome.outcomeId)
      .sort((a, b) => a.localeCompare(b))
  );
  const outcomeObservationId = observation?.observationId ?? null;
  const attributionClass = observation?.attributionClass ?? "UNKNOWN";
  const previousDisposition = targetItem?.disposition ?? null;
  const nextInternalStep = nextInternalStepFor(state, assessment);
  const portfolioId = input.portfolio.portfolioId;

  const reviewId = stableReviewId([
    DECISION_OUTCOME_PORTFOLIO_REVIEW_POLICY_VERSION_V1,
    portfolioId,
    input.record.decisionId,
    candidateId,
    outcomeObservationId ?? "no-outcome",
    reviewedAt,
    state,
    ...reasonCodes,
    ...evidenceRefs
  ]);

  return freezeDeep({
    contractVersion: DECISION_OUTCOME_PORTFOLIO_REVIEW_VERSION_V1,
    policyVersion: DECISION_OUTCOME_PORTFOLIO_REVIEW_POLICY_VERSION_V1,
    reviewId,
    reviewedAt,
    sourcePortfolioId: portfolioId,
    decisionId: input.record.decisionId,
    candidateId,
    previousDisposition,
    state,
    reasonCodes,
    outcomeObservationId,
    outcomeAssessment: assessment,
    attributionClass,
    observedOutcomeIds,
    evidenceRefs,
    targetLinkEvidenceRefs: linkEvidenceRefs,
    nextInternalStep,
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    outcomePrediction: null,
    causalInterpretation: "NOT_ESTABLISHED",
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
