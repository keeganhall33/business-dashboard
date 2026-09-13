import {
  CONFLICTED,
  INFERRED,
  KNOWN,
  STALE,
  UNKNOWN,
  MAX_LEARNING_ARRAY_ITEMS,
  MAX_LEARNING_TEXT_BYTES,
  createFactCorrectionCandidateV1,
  createLearningCandidateV1,
  createPreferencePolicyCandidateV1,
  createTechniqueSkillCandidateV1,
  createValidatedLessonCandidateV1,
  type LearningEvidenceV1,
  type LearningObjectV1,
  type LearningScope,
  type LearningTruthState
} from "./learning-object-v1";

export const CORRECTION_ROUTER_VERSION = "CORRECTION_ROUTER_V1" as const;
export const MAX_CORRECTION_SCOPE_ITEMS = 20;

export const supportedCorrectionClasses = [
  "FACT_CORRECTION",
  "STRATEGIC_DECISION",
  "PREFERENCE_POLICY",
  "TECHNIQUE_SKILL",
  "VALIDATED_LESSON"
] as const;

export type SupportedCorrectionClassV1 = (typeof supportedCorrectionClasses)[number];
export type CorrectionReviewDecisionV1 = "APPROVE" | "REJECT";

export interface CorrectionReviewV1 {
  reviewer_id: string;
  reviewed_at: string;
  decision: CorrectionReviewDecisionV1;
}

export interface ReviewedCorrectionEvidenceV1 {
  correction_id: string;
  correction_class: SupportedCorrectionClassV1 | string;
  truth_state: LearningTruthState;
  scope: LearningScope;
  title: string;
  content: string;
  confidence: number;
  observed_at: string;
  evidence: readonly LearningEvidenceV1[];
  affected_scope: readonly string[];
  review: CorrectionReviewV1 | null;
  ambiguous?: boolean;
}

export type CorrectionWithheldReasonV1 =
  | "UNREVIEWED_CORRECTION"
  | "REVIEW_REJECTED"
  | "AMBIGUOUS_CORRECTION"
  | "UNSUPPORTED_CORRECTION_CLASS"
  | "MISSING_EVIDENCE"
  | "DUPLICATE_CORRECTION"
  | "DUPLICATE_EVIDENCE"
  | "UNKNOWN_CORRECTION"
  | "STALE_CORRECTION"
  | "CONFLICTED_CORRECTION"
  | "INVALID_CORRECTION";

export type CorrectionRouteResultV1 =
  | {
      version: typeof CORRECTION_ROUTER_VERSION;
      status: "CANDIDATE";
      reasonCode: "SUPPORTED_REVIEWED_CORRECTION";
      sourceRefs: readonly string[];
      affectedScope: readonly string[];
      canonicalPromotionRequiresReview: true;
      candidate: Readonly<LearningObjectV1>;
    }
  | {
      version: typeof CORRECTION_ROUTER_VERSION;
      status: "WITHHELD";
      reasonCode: CorrectionWithheldReasonV1;
      sourceRefs: readonly string[];
      affectedScope: readonly string[];
      canonicalPromotionRequiresReview: true;
      candidate: null;
    };

export interface CorrectionRouterOptionsV1 {
  existingCorrectionIds?: readonly string[];
  existingLearningIds?: readonly string[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function boundedText(value: string): boolean {
  return Buffer.byteLength(value, "utf8") <= MAX_LEARNING_TEXT_BYTES;
}

function sourceRefs(evidence: readonly LearningEvidenceV1[]): readonly string[] {
  return Object.freeze(
    evidence
      .map((item) => `${item.source_lineage_id}:${item.evidence_id}`)
      .sort((a, b) => a.localeCompare(b))
  );
}

function affectedScope(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => value.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  );
}

function withheld(
  reasonCode: CorrectionWithheldReasonV1,
  evidence: readonly LearningEvidenceV1[] = [],
  scope: readonly string[] = []
): CorrectionRouteResultV1 {
  return Object.freeze({
    version: CORRECTION_ROUTER_VERSION,
    status: "WITHHELD",
    reasonCode,
    sourceRefs: sourceRefs(evidence),
    affectedScope: affectedScope(scope),
    canonicalPromotionRequiresReview: true,
    candidate: null
  });
}

function correctionTruthReason(
  truthState: LearningTruthState
): CorrectionWithheldReasonV1 | null {
  if (truthState === UNKNOWN) return "UNKNOWN_CORRECTION";
  if (truthState === STALE) return "STALE_CORRECTION";
  if (truthState === CONFLICTED) return "CONFLICTED_CORRECTION";
  return null;
}

function createCandidate(
  correction: ReviewedCorrectionEvidenceV1,
  evidence: readonly LearningEvidenceV1[]
): Readonly<LearningObjectV1> {
  const input = {
    learning_id: `learning:correction:${correction.correction_id.trim()}`,
    truth_state: correction.truth_state,
    scope: correction.scope,
    title: correction.title.trim(),
    content: correction.content.trim(),
    confidence: correction.confidence,
    observed_at: correction.observed_at,
    evidence
  } as const;

  switch (correction.correction_class) {
    case "FACT_CORRECTION":
      return createFactCorrectionCandidateV1(input);
    case "PREFERENCE_POLICY":
      return createPreferencePolicyCandidateV1(input);
    case "TECHNIQUE_SKILL":
      return createTechniqueSkillCandidateV1(input);
    case "VALIDATED_LESSON":
      return createValidatedLessonCandidateV1(input);
    case "STRATEGIC_DECISION":
      return createLearningCandidateV1({ ...input, kind: "STRATEGIC_DECISION" });
    default:
      throw new Error("UNSUPPORTED_CORRECTION_CLASS");
  }
}

export function routeCorrectionToLearningCandidateV1(
  correction: ReviewedCorrectionEvidenceV1,
  options: CorrectionRouterOptionsV1 = {}
): CorrectionRouteResultV1 {
  const evidence = Array.isArray(correction?.evidence) ? correction.evidence : [];
  const scope = Array.isArray(correction?.affected_scope) ? correction.affected_scope : [];

  if (!correction?.review) return withheld("UNREVIEWED_CORRECTION", evidence, scope);
  if (correction.review.decision !== "APPROVE") return withheld("REVIEW_REJECTED", evidence, scope);
  if (correction.ambiguous) return withheld("AMBIGUOUS_CORRECTION", evidence, scope);
  if (!supportedCorrectionClasses.includes(correction.correction_class as SupportedCorrectionClassV1)) {
    return withheld("UNSUPPORTED_CORRECTION_CLASS", evidence, scope);
  }

  const truthReason = correctionTruthReason(correction.truth_state);
  if (truthReason) return withheld(truthReason, evidence, scope);
  if (evidence.length === 0) return withheld("MISSING_EVIDENCE", evidence, scope);

  const learningId = `learning:correction:${correction.correction_id?.trim?.() ?? ""}`;
  if (
    options.existingCorrectionIds?.includes(correction.correction_id) ||
    options.existingLearningIds?.includes(learningId)
  ) {
    return withheld("DUPLICATE_CORRECTION", evidence, scope);
  }

  const refs = sourceRefs(evidence);
  if (new Set(refs).size !== evidence.length) {
    return withheld("DUPLICATE_EVIDENCE", evidence, scope);
  }

  const normalizedScope = affectedScope(scope);
  const latestEvidenceAt = Math.max(...evidence.map((item) => Date.parse(item.observed_at)));
  const valid =
    nonEmpty(correction.correction_id) &&
    nonEmpty(correction.title) &&
    nonEmpty(correction.content) &&
    nonEmpty(correction.review.reviewer_id) &&
    validTimestamp(correction.observed_at) &&
    validTimestamp(correction.review.reviewed_at) &&
    Number.isFinite(latestEvidenceAt) &&
    Date.parse(correction.review.reviewed_at) >= latestEvidenceAt &&
    evidence.length <= MAX_LEARNING_ARRAY_ITEMS &&
    normalizedScope.length > 0 &&
    normalizedScope.length <= MAX_CORRECTION_SCOPE_ITEMS &&
    Number.isFinite(correction.confidence) &&
    correction.confidence >= 0 &&
    correction.confidence <= 1 &&
    boundedText(correction.title) &&
    boundedText(correction.content) &&
    (correction.truth_state === KNOWN || correction.truth_state === INFERRED);

  if (!valid) return withheld("INVALID_CORRECTION", evidence, scope);

  try {
    const candidate = createCandidate(correction, evidence);
    return Object.freeze({
      version: CORRECTION_ROUTER_VERSION,
      status: "CANDIDATE",
      reasonCode: "SUPPORTED_REVIEWED_CORRECTION",
      sourceRefs: refs,
      affectedScope: normalizedScope,
      canonicalPromotionRequiresReview: true,
      candidate
    });
  } catch {
    return withheld("INVALID_CORRECTION", evidence, scope);
  }
}
