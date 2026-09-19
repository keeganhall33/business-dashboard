import { createHash } from "node:crypto";

import {
  RECURRING_DECISION_LESSONS_VERSION,
  type RecurringDecisionLessonReviewV1,
  type RecurringLessonDomainV1
} from "./recurring-decision-lessons-v1";

export const COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_VERSION_V1 =
  "CompanyBrainRecurringLessonsBriefV1" as const;
export const COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_POLICY_VERSION_V1 =
  "company_brain_recurring_lessons_brief_v1.0.0" as const;

const MAX_SOURCES = 250;
const MAX_REFS_PER_SOURCE = 500;

export type CompanyBrainRecurringLessonLaneV1 =
  | "REVIEW_RECURRING_LESSON"
  | "GATHER_MORE_INDEPENDENT_EVIDENCE"
  | "VERIFY_RECURRING_LESSON";

export type CompanyBrainRecurringLessonSourceV1 = Readonly<{
  sourceId: string;
  evaluatedAt: string;
  review: RecurringDecisionLessonReviewV1;
}>;

export type CompanyBrainRecurringLessonItemV1 = Readonly<{
  sourceId: string;
  evaluatedAt: string;
  sourceAgeMs: number;
  lane: CompanyBrainRecurringLessonLaneV1;
  sourceState: RecurringDecisionLessonReviewV1["state"];
  sourceReasonCode: RecurringDecisionLessonReviewV1["reason_code"];
  domain: RecurringLessonDomainV1 | null;
  patternKey: string | null;
  lessonTitle: string | null;
  lessonContent: string | null;
  sourceLearningIds: readonly string[];
  decisionRefs: readonly string[];
  outcomeRefs: readonly string[];
  evidenceRefs: readonly string[];
  sourceLineageIds: readonly string[];
  duplicateObservationIds: readonly string[];
  verificationReasons: readonly string[];
  independentDecisionCount: number;
  independentOutcomeCount: number;
  independentSourceLineageCount: number;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CompanyBrainRecurringLessonsBriefV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_POLICY_VERSION_V1;
  briefId: string;
  state: "READY" | "VERIFY_SOURCE";
  generatedAt: string;
  maximumSourceAgeMs: number;
  reviewCandidates: readonly CompanyBrainRecurringLessonItemV1[];
  evidenceNeeded: readonly CompanyBrainRecurringLessonItemV1[];
  verificationRequired: readonly CompanyBrainRecurringLessonItemV1[];
  rejectedSourceIds: readonly string[];
  sourceVerificationReasons: readonly string[];
  summary: Readonly<{
    supplied: number;
    accepted: number;
    rejected: number;
    reviewCandidates: number;
    evidenceNeeded: number;
    verificationRequired: number;
    pricingPatternsForReview: number;
    negotiationPatternsForReview: number;
  }>;
  evidenceRefs: readonly string[];
  sourceLineageIds: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    lessonPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    capabilityPromotionAuthorized: false;
    portfolioReallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainRecurringLessonsBriefInputV1 = Readonly<{
  sources: readonly CompanyBrainRecurringLessonSourceV1[];
  generatedAt: string;
  maximumSourceAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  lessonPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  capabilityPromotionAuthorized: false as const,
  portfolioReallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This brief aggregates existing recurring-decision lesson reviews; it does not create, persist, approve, or promote a lesson.",
  "Repeated observations remain non-causal. The brief does not convert recurrence into confidence, monetary value, policy authority, or a prediction that the pattern will repeat.",
  "A REVIEW_RECURRING_LESSON lane means the upstream evaluator found repeated independently evidenced approved lessons. Human/governed review is still required before any durable promotion.",
  "Pricing and negotiation patterns are surfaced for review only and cannot change a price, negotiation posture, campaign, experiment, allocation, or external action."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === normalized ? normalized : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function uniqueBoundedStrings(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS_PER_SOURCE) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    const parsed = text(entry);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `company-brain-recurring-lessons:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function upstreamAuthoritySafe(review: RecurringDecisionLessonReviewV1): boolean {
  return review.review_required === true
    && review.policy_promotion_allowed === false
    && review.pricing_change_allowed === false
    && review.negotiation_action_allowed === false
    && review.external_action_allowed === false
    && review.persistence_authority === false
    && review.causal_interpretation === "NOT_ESTABLISHED";
}

function expectedReason(review: RecurringDecisionLessonReviewV1): boolean {
  switch (review.state) {
    case "REVIEW_CANDIDATE":
      return review.reason_code === "REPEATED_APPROVED_LESSON";
    case "INSUFFICIENT_INDEPENDENT_EVIDENCE":
      return review.reason_code === "TOO_FEW_INDEPENDENT_OBSERVATIONS";
    case "NEEDS_VERIFICATION":
      return review.reason_code === "UNSAFE_SOURCE_LESSON";
    case "CONFLICTED":
      return review.reason_code === "MATERIAL_STATEMENT_CONFLICT";
    case "INVALID_INPUT":
      return review.reason_code === "MALFORMED_OR_UNBOUNDED_INPUT";
    default:
      return false;
  }
}

function laneFor(review: RecurringDecisionLessonReviewV1): CompanyBrainRecurringLessonLaneV1 {
  if (review.state === "REVIEW_CANDIDATE") return "REVIEW_RECURRING_LESSON";
  if (review.state === "INSUFFICIENT_INDEPENDENT_EVIDENCE") {
    return "GATHER_MORE_INDEPENDENT_EVIDENCE";
  }
  return "VERIFY_RECURRING_LESSON";
}

function itemSort(
  left: CompanyBrainRecurringLessonItemV1,
  right: CompanyBrainRecurringLessonItemV1
): number {
  const evaluated = Date.parse(right.evaluatedAt) - Date.parse(left.evaluatedAt);
  if (evaluated !== 0) return evaluated;
  const domain = (left.domain ?? "").localeCompare(right.domain ?? "");
  if (domain !== 0) return domain;
  return (left.patternKey ?? left.sourceId).localeCompare(right.patternKey ?? right.sourceId);
}

function projectSource(
  source: CompanyBrainRecurringLessonSourceV1,
  generatedAtMs: number,
  maximumSourceAgeMs: number,
  verificationReasons: Set<string>
): CompanyBrainRecurringLessonItemV1 | null {
  const sourceId = text(source?.sourceId);
  if (!sourceId) {
    verificationReasons.add("SOURCE_ID_MISSING");
    return null;
  }
  const review = source?.review;
  if (!review || review.version !== RECURRING_DECISION_LESSONS_VERSION) {
    verificationReasons.add(`SOURCE_CONTRACT_INVALID:${sourceId}`);
    return null;
  }
  if (!upstreamAuthoritySafe(review)) {
    verificationReasons.add(`SOURCE_AUTHORITY_WIDENED:${sourceId}`);
    return null;
  }
  if (!expectedReason(review)) {
    verificationReasons.add(`SOURCE_STATE_REASON_MISMATCH:${sourceId}`);
    return null;
  }

  const evaluatedAt = canonicalTimestamp(source.evaluatedAt);
  if (!evaluatedAt) {
    verificationReasons.add(`SOURCE_EVALUATED_AT_INVALID:${sourceId}`);
    return null;
  }
  const sourceAgeMs = generatedAtMs - Date.parse(evaluatedAt);
  if (sourceAgeMs < 0) {
    verificationReasons.add(`SOURCE_EVALUATED_IN_FUTURE:${sourceId}`);
    return null;
  }
  if (sourceAgeMs > maximumSourceAgeMs) {
    verificationReasons.add(`SOURCE_REVIEW_STALE:${sourceId}`);
    return null;
  }

  const sourceLearningIds = uniqueBoundedStrings(review.source_learning_ids);
  const decisionRefs = uniqueBoundedStrings(review.decision_refs);
  const outcomeRefs = uniqueBoundedStrings(review.outcome_refs);
  const evidenceRefs = uniqueBoundedStrings(review.evidence_refs);
  const sourceLineageIds = uniqueBoundedStrings(review.source_lineage_ids);
  const duplicateObservationIds = uniqueBoundedStrings(review.duplicate_observation_ids);
  const sourceVerificationReasons = uniqueBoundedStrings(review.verification_reasons);
  if (
    !sourceLearningIds
    || !decisionRefs
    || !outcomeRefs
    || !evidenceRefs
    || !sourceLineageIds
    || !duplicateObservationIds
    || !sourceVerificationReasons
  ) {
    verificationReasons.add(`SOURCE_REFERENCES_INVALID:${sourceId}`);
    return null;
  }

  const domain = review.domain;
  const patternKey = review.pattern_key == null ? null : text(review.pattern_key);
  const lessonTitle = review.lesson_title == null ? null : text(review.lesson_title);
  const lessonContent = review.lesson_content == null ? null : text(review.lesson_content);

  if (review.state === "REVIEW_CANDIDATE") {
    if (!domain || !patternKey || !lessonTitle || !lessonContent) {
      verificationReasons.add(`REVIEW_CANDIDATE_IDENTITY_MISSING:${sourceId}`);
      return null;
    }
    if (
      new Set(decisionRefs).size < 2
      || new Set(outcomeRefs).size < 2
      || new Set(sourceLineageIds).size < 2
      || sourceLearningIds.length < 2
      || evidenceRefs.length === 0
      || sourceVerificationReasons.length > 0
    ) {
      verificationReasons.add(`REVIEW_CANDIDATE_INDEPENDENCE_INVALID:${sourceId}`);
      return null;
    }
  }

  const projected: CompanyBrainRecurringLessonItemV1 = {
    sourceId,
    evaluatedAt,
    sourceAgeMs,
    lane: laneFor(review),
    sourceState: review.state,
    sourceReasonCode: review.reason_code,
    domain,
    patternKey,
    lessonTitle,
    lessonContent,
    sourceLearningIds,
    decisionRefs,
    outcomeRefs,
    evidenceRefs,
    sourceLineageIds,
    duplicateObservationIds,
    verificationReasons: sourceVerificationReasons,
    independentDecisionCount: new Set(decisionRefs).size,
    independentOutcomeCount: new Set(outcomeRefs).size,
    independentSourceLineageCount: new Set(sourceLineageIds).size,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  };
  return deepFreeze(projected) as CompanyBrainRecurringLessonItemV1;
}

/**
 * Creates an exception-first read-only Company Brain projection over governed
 * recurring-decision lesson reviews. It deliberately stops before promotion,
 * policy mutation, reallocation, pricing, negotiation, or external execution.
 */
export function compileCompanyBrainRecurringLessonsBriefV1(
  input: CompanyBrainRecurringLessonsBriefInputV1
): CompanyBrainRecurringLessonsBriefV1 {
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("COMPANY_BRAIN_RECURRING_LESSONS_INVALID_GENERATED_AT");
  const generatedAtMs = Date.parse(generatedAt);
  const maximumSourceAgeMs = positiveFinite(input?.maximumSourceAgeMs);
  if (maximumSourceAgeMs == null) {
    throw new Error("COMPANY_BRAIN_RECURRING_LESSONS_INVALID_FRESHNESS_POLICY");
  }
  if (!Array.isArray(input?.sources) || input.sources.length > MAX_SOURCES) {
    throw new Error("COMPANY_BRAIN_RECURRING_LESSONS_INVALID_SOURCE_SET");
  }

  const verificationReasons = new Set<string>();
  const sourceIdCounts = new Map<string, number>();
  for (const source of input.sources) {
    const sourceId = text(source?.sourceId);
    if (sourceId) sourceIdCounts.set(sourceId, (sourceIdCounts.get(sourceId) ?? 0) + 1);
  }
  const duplicateSourceIds = new Set(
    [...sourceIdCounts.entries()].filter(([, count]) => count > 1).map(([sourceId]) => sourceId)
  );
  for (const sourceId of duplicateSourceIds) {
    verificationReasons.add(`DUPLICATE_SOURCE_ID:${sourceId}`);
  }

  const accepted: CompanyBrainRecurringLessonItemV1[] = [];
  const rejectedSourceIds = new Set<string>();
  const acceptedPatternKeys = new Set<string>();
  for (const source of input.sources) {
    const sourceId = text(source?.sourceId);
    if (sourceId && duplicateSourceIds.has(sourceId)) {
      rejectedSourceIds.add(sourceId);
      continue;
    }
    const projected = projectSource(source, generatedAtMs, maximumSourceAgeMs, verificationReasons);
    if (!projected) {
      if (sourceId) rejectedSourceIds.add(sourceId);
      continue;
    }
    if (projected.patternKey) {
      const patternIdentity = `${projected.domain ?? "UNKNOWN"}\u0000${projected.patternKey}`;
      if (acceptedPatternKeys.has(patternIdentity)) {
        verificationReasons.add(`DUPLICATE_PATTERN_REVIEW:${projected.domain ?? "UNKNOWN"}:${projected.patternKey}`);
        rejectedSourceIds.add(projected.sourceId);
        continue;
      }
      acceptedPatternKeys.add(patternIdentity);
    }
    accepted.push(projected);
  }

  const sorted = [...accepted].sort(itemSort);
  const reviewCandidates = Object.freeze(
    sorted.filter((item) => item.lane === "REVIEW_RECURRING_LESSON")
  );
  const evidenceNeeded = Object.freeze(
    sorted.filter((item) => item.lane === "GATHER_MORE_INDEPENDENT_EVIDENCE")
  );
  const verificationRequired = Object.freeze(
    sorted.filter((item) => item.lane === "VERIFY_RECURRING_LESSON")
  );
  const evidenceRefs = Object.freeze(
    [...new Set(sorted.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b))
  );
  const sourceLineageIds = Object.freeze(
    [...new Set(sorted.flatMap((item) => item.sourceLineageIds))].sort((a, b) => a.localeCompare(b))
  );
  const reasons = Object.freeze([...verificationReasons].sort((a, b) => a.localeCompare(b)));
  const rejected = Object.freeze([...rejectedSourceIds].sort((a, b) => a.localeCompare(b)));

  const output: CompanyBrainRecurringLessonsBriefV1 = {
    contractVersion: COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_VERSION_V1,
    policyVersion: COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_POLICY_VERSION_V1,
    briefId: stableId([
      generatedAt,
      String(maximumSourceAgeMs),
      ...sorted.map((item) => `${item.sourceId}:${item.evaluatedAt}:${item.sourceState}`),
      ...reasons
    ]),
    state: reasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    generatedAt,
    maximumSourceAgeMs,
    reviewCandidates,
    evidenceNeeded,
    verificationRequired,
    rejectedSourceIds: rejected,
    sourceVerificationReasons: reasons,
    summary: Object.freeze({
      supplied: input.sources.length,
      accepted: sorted.length,
      rejected: input.sources.length - sorted.length,
      reviewCandidates: reviewCandidates.length,
      evidenceNeeded: evidenceNeeded.length,
      verificationRequired: verificationRequired.length,
      pricingPatternsForReview: reviewCandidates.filter((item) => item.domain === "PRICING").length,
      negotiationPatternsForReview: reviewCandidates.filter((item) => item.domain === "NEGOTIATION").length
    }),
    evidenceRefs,
    sourceLineageIds,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  };

  return deepFreeze(output) as CompanyBrainRecurringLessonsBriefV1;
}
