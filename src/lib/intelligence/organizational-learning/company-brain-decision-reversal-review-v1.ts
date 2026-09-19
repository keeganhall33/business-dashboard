import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionAttributionClassV1,
  type DecisionMemoryRecordV1,
  type DecisionOutcomeAssessmentV1
} from "./decision-memory-v1";
import { compileDecisionMemoryBriefV1 } from "./decision-memory-brief-v1";

export const COMPANY_BRAIN_DECISION_REVERSAL_REVIEW_VERSION_V1 =
  "CompanyBrainDecisionReversalReviewV1" as const;
export const COMPANY_BRAIN_DECISION_REVERSAL_REVIEW_POLICY_VERSION_V1 =
  "company_brain_decision_reversal_review_v1.0.0" as const;

const MAX_REFS = 500;

export type CompanyBrainDecisionReversalReviewStateV1 =
  | "READY_WITH_OUTCOME_CONTEXT"
  | "READY_CONTEXT_ONLY"
  | "NOT_APPLICABLE"
  | "VERIFY_SOURCE"
  | "BLOCKED";

export type CompanyBrainDecisionReversalReviewReasonV1 =
  | "REVERSAL_RECORDED_WITH_OUTCOME_CONTEXT"
  | "REVERSAL_RECORDED_WITHOUT_OUTCOME_CONTEXT"
  | "DECISION_NOT_REVERSED"
  | "INVALID_DECISION_MEMORY_CONTRACT"
  | "INVALID_DECISION_MEMORY_POLICY"
  | "INVALID_REVIEW_TIME"
  | "DECISION_IN_FUTURE"
  | "DECISION_INTEGRITY_FLAGS"
  | "DECISION_AUTHORITY_WIDENED"
  | "SOURCE_PROVENANCE_MISSING"
  | "REVERSAL_ACTION_EVIDENCE_MISSING"
  | "DECISION_BRIEF_VERIFY_INTEGRITY"
  | "DECISION_BRIEF_VERIFY_LINEAGE"
  | "DECISION_BRIEF_COMPILATION_FAILED"
  | "OUTCOME_BEFORE_DECISION"
  | "OUTCOME_IN_FUTURE"
  | "OUTCOME_ASSESSMENT_NOT_DECISION_GRADE"
  | "OUTCOME_SOURCE_PROVENANCE_MISSING";

export type CompanyBrainDecisionReversalReviewInputV1 = Readonly<{
  record: DecisionMemoryRecordV1;
  reviewedAt: string;
}>;

export type CompanyBrainDecisionReversalReviewV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_DECISION_REVERSAL_REVIEW_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_DECISION_REVERSAL_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  reviewedAt: string;
  state: CompanyBrainDecisionReversalReviewStateV1;
  reasonCodes: readonly CompanyBrainDecisionReversalReviewReasonV1[];
  decisionId: string;
  sourceRecordId: string;
  decisionClass: DecisionMemoryRecordV1["decisionClass"] | null;
  decidedAt: string | null;
  selectedAlternativeId: string | null;
  rationale: Readonly<{
    state: DecisionMemoryRecordV1["rationale"]["state"];
    value: string | null;
    evidenceRefs: readonly string[];
  }> | null;
  reversal: Readonly<{
    recorded: boolean;
    actionEvidenceRefs: readonly string[];
    occurredAt: null;
    occurredAtState: "NOT_ESTABLISHED";
    reason: null;
    reasonState: "NOT_ESTABLISHED";
    priorActionState: null;
    priorActionStateState: "NOT_ESTABLISHED";
    failureInference: "PROHIBITED";
    preferenceChangeInference: "PROHIBITED";
  }>;
  outcomeContext: Readonly<{
    observationId: string;
    observedAt: string;
    assessment: DecisionOutcomeAssessmentV1;
    attributionClass: DecisionAttributionClassV1;
    assessmentEvidenceRefs: readonly string[];
    attributionEvidenceRefs: readonly string[];
    sourceRefs: readonly string[];
    confounders: readonly Readonly<{
      confounderId: string;
      description: string;
      evidenceRefs: readonly string[];
    }>[];
    recordedLessonCandidatePresent: boolean;
  }> | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  nextInternalStep:
    | "REVIEW_RECORDED_REVERSAL_CONTEXT"
    | "REVIEW_REVERSAL_WITH_OUTCOME_CONTEXT"
    | "VERIFY_DECISION_MEMORY_SOURCE"
    | null;
  causeOfReversal: "NOT_ESTABLISHED";
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    reviewOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    reversalMutationAuthorized: false;
    lessonPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    capabilityPromotionAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
    causalAttributionAuthorized: false;
  }>;
}>;

const EXPECTED_RECORD_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationAuthorized: false,
  spendAuthorized: false,
  publishAuthorized: false
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  reviewOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  reversalMutationAuthorized: false as const,
  lessonPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  capabilityPromotionAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const,
  causalAttributionAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "REVERSED is preserved only as the canonical Decision Memory action state. The current contract does not record when the reversal occurred or why, so this review leaves both fields explicitly unestablished.",
  "A reversal is not treated as failure, regret, preference change, or evidence that the original rationale was wrong.",
  "An attached outcome remains historical context only. Its recorded attribution class is preserved without upgrading it to a cause of the reversal or a cause of the observed outcome.",
  "A recorded lesson candidate is surfaced only as present or absent. This review cannot promote it into durable learning, policy, capability, pricing guidance, or negotiation guidance.",
  "No decision, portfolio, allocation, campaign, experiment, pricing, negotiation, persistence, external action, or approval authority is granted by this review."
] as const);

const BLOCKING_REASONS = new Set<CompanyBrainDecisionReversalReviewReasonV1>([
  "INVALID_DECISION_MEMORY_CONTRACT",
  "INVALID_DECISION_MEMORY_POLICY",
  "INVALID_REVIEW_TIME",
  "DECISION_IN_FUTURE",
  "DECISION_AUTHORITY_WIDENED"
]);

const VERIFY_REASONS = new Set<CompanyBrainDecisionReversalReviewReasonV1>([
  "DECISION_INTEGRITY_FLAGS",
  "SOURCE_PROVENANCE_MISSING",
  "REVERSAL_ACTION_EVIDENCE_MISSING",
  "DECISION_BRIEF_VERIFY_INTEGRITY",
  "DECISION_BRIEF_VERIFY_LINEAGE",
  "DECISION_BRIEF_COMPILATION_FAILED",
  "OUTCOME_BEFORE_DECISION",
  "OUTCOME_IN_FUTURE",
  "OUTCOME_ASSESSMENT_NOT_DECISION_GRADE",
  "OUTCOME_SOURCE_PROVENANCE_MISSING"
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return null;
  return new Date(Date.parse(normalized)).toISOString();
}

function refs(values: unknown): readonly string[] | null {
  if (!Array.isArray(values) || values.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const value of values) {
    const parsed = text(value);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(EXPECTED_RECORD_AUTHORITY).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) =>
      key === expectedKeys[index]
      && actual[key] === EXPECTED_RECORD_AUTHORITY[key as keyof typeof EXPECTED_RECORD_AUTHORITY]
    );
}

function stableId(parts: readonly string[]): string {
  return `company-brain-reversal:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function collectEvidence(record: DecisionMemoryRecordV1): readonly string[] {
  const observation = record.outcomeObservation;
  return refs([
    ...record.actionEvidenceRefs,
    ...record.rationale.evidenceRefs,
    ...record.sourceRefs,
    ...(observation
      ? [
          ...observation.assessment.evidenceRefs,
          ...observation.attributionEvidenceRefs,
          ...observation.sourceRefs,
          ...observation.confounders.flatMap((confounder) => confounder.evidenceRefs),
          ...(observation.lessonCandidate?.evidenceRefs ?? [])
        ]
      : [])
  ]) ?? Object.freeze([]);
}

function reviewState(
  record: DecisionMemoryRecordV1 | undefined,
  reasons: ReadonlySet<CompanyBrainDecisionReversalReviewReasonV1>
): CompanyBrainDecisionReversalReviewStateV1 {
  if ([...reasons].some((reason) => BLOCKING_REASONS.has(reason))) return "BLOCKED";
  if (record?.actionState !== "REVERSED") return "NOT_APPLICABLE";
  if ([...reasons].some((reason) => VERIFY_REASONS.has(reason))) return "VERIFY_SOURCE";
  return record.outcomeObservation ? "READY_WITH_OUTCOME_CONTEXT" : "READY_CONTEXT_ONLY";
}

export function reviewCompanyBrainDecisionReversalV1(
  input: CompanyBrainDecisionReversalReviewInputV1
): CompanyBrainDecisionReversalReviewV1 {
  const record = input?.record;
  const reasons = new Set<CompanyBrainDecisionReversalReviewReasonV1>();

  if (!record || record.contractVersion !== "DecisionMemoryV1") {
    reasons.add("INVALID_DECISION_MEMORY_CONTRACT");
  }
  if (!record || record.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1) {
    reasons.add("INVALID_DECISION_MEMORY_POLICY");
  }

  const reviewedAt = timestamp(input?.reviewedAt);
  if (!reviewedAt) reasons.add("INVALID_REVIEW_TIME");

  const decidedAt = timestamp(record?.decidedAt);
  if (decidedAt && reviewedAt && Date.parse(decidedAt) > Date.parse(reviewedAt)) {
    reasons.add("DECISION_IN_FUTURE");
  }

  if (record && !exactAuthority(record.actionAuthority)) {
    reasons.add("DECISION_AUTHORITY_WIDENED");
  }
  if (record?.integrityFlags.length) reasons.add("DECISION_INTEGRITY_FLAGS");
  if (!refs(record?.sourceRefs)?.length) reasons.add("SOURCE_PROVENANCE_MISSING");

  if (record?.actionState !== "REVERSED") {
    reasons.add("DECISION_NOT_REVERSED");
  } else if (!refs(record.actionEvidenceRefs)?.length) {
    reasons.add("REVERSAL_ACTION_EVIDENCE_MISSING");
  }

  if (record && record.contractVersion === "DecisionMemoryV1" && reviewedAt) {
    try {
      const brief = compileDecisionMemoryBriefV1({ record, generatedAt: reviewedAt });
      if (brief.state === "VERIFY_INTEGRITY") reasons.add("DECISION_BRIEF_VERIFY_INTEGRITY");
      if (brief.state === "VERIFY_LINEAGE") reasons.add("DECISION_BRIEF_VERIFY_LINEAGE");
    } catch {
      reasons.add("DECISION_BRIEF_COMPILATION_FAILED");
    }
  }

  const observation = record?.outcomeObservation ?? null;
  let outcomeContext: CompanyBrainDecisionReversalReviewV1["outcomeContext"] = null;
  if (observation) {
    const observedAt = timestamp(observation.observedAt);
    if (observedAt && decidedAt && Date.parse(observedAt) < Date.parse(decidedAt)) {
      reasons.add("OUTCOME_BEFORE_DECISION");
    }
    if (observedAt && reviewedAt && Date.parse(observedAt) > Date.parse(reviewedAt)) {
      reasons.add("OUTCOME_IN_FUTURE");
    }
    if (!refs(observation.sourceRefs)?.length) {
      reasons.add("OUTCOME_SOURCE_PROVENANCE_MISSING");
    }

    const assessmentRefs = refs(observation.assessment.evidenceRefs);
    const assessment = observation.assessment;
    const decisionGradeAssessment =
      assessment.state === "KNOWN"
      && assessment.value != null
      && assessment.value !== "UNKNOWN"
      && assessment.value !== "INCONCLUSIVE"
      && Boolean(assessmentRefs?.length);
    if (!decisionGradeAssessment) {
      reasons.add("OUTCOME_ASSESSMENT_NOT_DECISION_GRADE");
    }

    if (observedAt && decisionGradeAssessment) {
      outcomeContext = {
        observationId: observation.observationId,
        observedAt,
        assessment: assessment.value as DecisionOutcomeAssessmentV1,
        attributionClass: observation.attributionClass,
        assessmentEvidenceRefs: assessmentRefs ?? Object.freeze([]),
        attributionEvidenceRefs: refs(observation.attributionEvidenceRefs) ?? Object.freeze([]),
        sourceRefs: refs(observation.sourceRefs) ?? Object.freeze([]),
        confounders: Object.freeze(
          observation.confounders.map((confounder) => ({
            confounderId: confounder.confounderId,
            description: confounder.description,
            evidenceRefs: refs(confounder.evidenceRefs) ?? Object.freeze([])
          }))
        ),
        recordedLessonCandidatePresent: observation.lessonCandidate != null
      };
    }
  }

  const state = reviewState(record, reasons);
  if (state === "READY_WITH_OUTCOME_CONTEXT") {
    reasons.add("REVERSAL_RECORDED_WITH_OUTCOME_CONTEXT");
  } else if (state === "READY_CONTEXT_ONLY") {
    reasons.add("REVERSAL_RECORDED_WITHOUT_OUTCOME_CONTEXT");
  }

  const reasonCodes = Object.freeze(
    [...reasons].sort((a, b) => a.localeCompare(b))
  ) as readonly CompanyBrainDecisionReversalReviewReasonV1[];
  const generatedReviewedAt = reviewedAt ?? input?.reviewedAt ?? "INVALID";
  const decisionId = text(record?.decisionId) ?? "unknown-decision";
  const sourceRecordId = text(record?.recordId) ?? "unknown-record";
  const actionEvidenceRefs = refs(record?.actionEvidenceRefs) ?? Object.freeze([]);
  const sourceRefs = refs(record?.sourceRefs) ?? Object.freeze([]);

  const nextInternalStep = state === "READY_WITH_OUTCOME_CONTEXT"
    ? "REVIEW_REVERSAL_WITH_OUTCOME_CONTEXT" as const
    : state === "READY_CONTEXT_ONLY"
      ? "REVIEW_RECORDED_REVERSAL_CONTEXT" as const
      : state === "VERIFY_SOURCE"
        ? "VERIFY_DECISION_MEMORY_SOURCE" as const
        : null;

  return deepFreeze({
    contractVersion: COMPANY_BRAIN_DECISION_REVERSAL_REVIEW_VERSION_V1,
    policyVersion: COMPANY_BRAIN_DECISION_REVERSAL_REVIEW_POLICY_VERSION_V1,
    reviewId: stableId([
      decisionId,
      sourceRecordId,
      generatedReviewedAt,
      state,
      ...reasonCodes
    ]),
    reviewedAt: generatedReviewedAt,
    state,
    reasonCodes,
    decisionId,
    sourceRecordId,
    decisionClass: record?.decisionClass ?? null,
    decidedAt,
    selectedAlternativeId: text(record?.selectedAlternativeId),
    rationale: record
      ? {
          state: record.rationale.state,
          value: record.rationale.value,
          evidenceRefs: refs(record.rationale.evidenceRefs) ?? Object.freeze([])
        }
      : null,
    reversal: {
      recorded: record?.actionState === "REVERSED",
      actionEvidenceRefs,
      occurredAt: null,
      occurredAtState: "NOT_ESTABLISHED",
      reason: null,
      reasonState: "NOT_ESTABLISHED",
      priorActionState: null,
      priorActionStateState: "NOT_ESTABLISHED",
      failureInference: "PROHIBITED",
      preferenceChangeInference: "PROHIBITED"
    },
    outcomeContext,
    evidenceRefs: record ? collectEvidence(record) : Object.freeze([]),
    sourceRefs,
    nextInternalStep,
    causeOfReversal: "NOT_ESTABLISHED",
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
