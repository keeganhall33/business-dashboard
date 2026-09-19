import {
  EXPERIMENT_POLICY_REPLICATION_READINESS_POLICY_VERSION_V1,
  EXPERIMENT_POLICY_REPLICATION_READINESS_VERSION_V1,
  type ExperimentPolicyReplicationReadinessV1
} from "./experiment-policy-replication-readiness-v1";

export const EXPERIMENT_POLICY_PROMOTION_REVIEW_VERSION_V1 =
  "ExperimentPolicyPromotionReviewV1" as const;
export const EXPERIMENT_POLICY_PROMOTION_REVIEW_POLICY_VERSION_V1 =
  "experiment_policy_promotion_review_v1.0.0" as const;

const MAX_AUDIT_ENTRIES = 100;
const MAX_REFS = 1_000;
const MAX_TEXT = 2_000;

export type ExperimentPolicyIndependentReviewDispositionV1 =
  | "APPROVE_FOR_PROMOTION_DECISION"
  | "REQUEST_MORE_EVIDENCE"
  | "REJECT_RETURN_TO_EXPERIMENTS";

export type ExperimentPolicyShadowEvaluationResultV1 =
  | "PASS"
  | "FAIL"
  | "INCONCLUSIVE";

export type ExperimentPolicyIndependentReviewEvidenceV1 = Readonly<{
  reviewId: string;
  reviewedAt: string;
  reviewerRef: string;
  portfolioId: string;
  targetExperimentId: string;
  policyStatement: string;
  rollbackPlan: string;
  disposition: ExperimentPolicyIndependentReviewDispositionV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type ExperimentPolicyShadowEvaluationEvidenceV1 = Readonly<{
  evaluationId: string;
  evaluatedAt: string;
  mode: "SHADOW_ONLY";
  portfolioId: string;
  targetExperimentId: string;
  policyStatement: string;
  rollbackPlan: string;
  result: ExperimentPolicyShadowEvaluationResultV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  confounders: readonly string[];
}>;

export type ExperimentPolicyPromotionAuditEventTypeV1 =
  | "CANDIDATE_CREATED"
  | "REPLICATION_READINESS"
  | "INDEPENDENT_REVIEW"
  | "SHADOW_EVALUATION";

export type ExperimentPolicyPromotionAuditEntryV1 = Readonly<{
  eventId: string;
  eventType: ExperimentPolicyPromotionAuditEventTypeV1;
  occurredAt: string;
  portfolioId: string;
  targetExperimentId: string;
  policyStatement: string;
  rollbackPlan: string;
  artifactRef: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type ExperimentPolicyPromotionReviewInputV1 = Readonly<{
  replicationReadiness: ExperimentPolicyReplicationReadinessV1;
  independentReview: ExperimentPolicyIndependentReviewEvidenceV1 | null;
  shadowEvaluation: ExperimentPolicyShadowEvaluationEvidenceV1 | null;
  auditHistory: readonly ExperimentPolicyPromotionAuditEntryV1[];
  reviewedAt: string;
  maximumSourceAgeMs: number;
  maximumGovernanceEvidenceAgeMs: number;
}>;

export type ExperimentPolicyPromotionReviewStateV1 =
  | "NOT_APPLICABLE"
  | "WAIT_FOR_GOVERNANCE_EVIDENCE"
  | "VERIFY_REQUIRED"
  | "RETURN_TO_EXPERIMENT_REVIEW"
  | "READY_FOR_PROMOTION_DECISION";

export type ExperimentPolicyPromotionReviewReasonV1 =
  | "SOURCE_CONTRACT_MISMATCH"
  | "SOURCE_POLICY_MISMATCH"
  | "SOURCE_AUTHORITY_WIDENED"
  | "SOURCE_INTERPRETATION_WIDENED"
  | "SOURCE_PROVENANCE_INVALID"
  | "SOURCE_STATE_INCONSISTENT"
  | "SOURCE_FROM_FUTURE"
  | "SOURCE_STALE"
  | "SOURCE_VERIFY_REQUIRED"
  | "SOURCE_NOT_APPLICABLE"
  | "SOURCE_WAITING_FOR_REPLICATIONS"
  | "SOURCE_CONTRADICTION_REVIEW"
  | "POLICY_METADATA_MISSING"
  | "INDEPENDENT_REVIEW_MISSING"
  | "INDEPENDENT_REVIEW_INVALID"
  | "INDEPENDENT_REVIEW_IDENTITY_MISMATCH"
  | "INDEPENDENT_REVIEW_FROM_FUTURE"
  | "INDEPENDENT_REVIEW_STALE"
  | "INDEPENDENT_REVIEW_PRECEDES_REPLICATION_REVIEW"
  | "INDEPENDENT_REVIEW_MORE_EVIDENCE"
  | "INDEPENDENT_REVIEW_REJECTED"
  | "SHADOW_EVALUATION_MISSING"
  | "SHADOW_EVALUATION_INVALID"
  | "SHADOW_EVALUATION_IDENTITY_MISMATCH"
  | "SHADOW_EVALUATION_FROM_FUTURE"
  | "SHADOW_EVALUATION_STALE"
  | "SHADOW_EVALUATION_PRECEDES_REPLICATION_REVIEW"
  | "SHADOW_EVALUATION_INCONCLUSIVE"
  | "SHADOW_EVALUATION_FAILED"
  | "AUDIT_HISTORY_INVALID"
  | "AUDIT_ENTRY_DUPLICATE"
  | "AUDIT_ENTRY_IDENTITY_MISMATCH"
  | "AUDIT_ENTRY_FROM_FUTURE"
  | "AUDIT_ENTRY_PROVENANCE_MISSING"
  | "AUDIT_ARTIFACT_MISMATCH"
  | "AUDIT_REPLICATION_EVENT_MISSING"
  | "AUDIT_INDEPENDENT_REVIEW_EVENT_MISSING"
  | "AUDIT_SHADOW_EVALUATION_EVENT_MISSING"
  | "GOVERNANCE_REQUIREMENTS_SATISFIED";

export type ExperimentPolicyPromotionReviewV1 = Readonly<{
  contractVersion: typeof EXPERIMENT_POLICY_PROMOTION_REVIEW_VERSION_V1;
  policyVersion: typeof EXPERIMENT_POLICY_PROMOTION_REVIEW_POLICY_VERSION_V1;
  reviewedAt: string;
  portfolioId: string;
  targetExperimentId: string;
  sourceReplicationReviewedAt: string;
  state: ExperimentPolicyPromotionReviewStateV1;
  reasonCodes: readonly ExperimentPolicyPromotionReviewReasonV1[];
  policyStatement: string | null;
  rollbackPlan: string | null;
  independentReviewId: string | null;
  independentReviewDisposition: ExperimentPolicyIndependentReviewDispositionV1 | null;
  shadowEvaluationId: string | null;
  shadowEvaluationResult: ExperimentPolicyShadowEvaluationResultV1 | null;
  auditEventIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  confounders: readonly string[];
  nextInternalStep:
    | "COLLECT_GOVERNANCE_EVIDENCE"
    | "VERIFY_GOVERNANCE_EVIDENCE"
    | "RETURN_POLICY_TO_EXPERIMENT_REVIEW"
    | "HUMAN_OR_GOVERNED_PROMOTION_DECISION"
    | null;
  analysisOnly: true;
  policyPromotionAuthorized: false;
  policyMutationAuthorized: false;
  experimentLaunchAuthorized: false;
  rollbackExecutionAuthorized: false;
  allocationChangeAuthorized: false;
  spendChangeAuthorized: false;
  priceChangeAuthorized: false;
  persistenceAuthorized: false;
  externalActionAuthorized: false;
  approvalBypassAuthorized: false;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  expectedOutcome: null;
  limitations: readonly string[];
}>;

const EXPECTED_SOURCE_AUTHORITY = Object.freeze({
  analysisOnly: true,
  experimentLaunchAuthorized: false,
  policyPromotionAuthorized: false,
  policyMutationAuthorized: false,
  rollbackExecutionAuthorized: false,
  allocationChangeAuthorized: false,
  spendChangeAuthorized: false,
  priceChangeAuthorized: false,
  externalActionAuthorized: false,
  persistenceAuthorized: false,
  approvalBypassAuthorized: false
} as const);

const REVIEW_DISPOSITIONS = new Set<ExperimentPolicyIndependentReviewDispositionV1>([
  "APPROVE_FOR_PROMOTION_DECISION",
  "REQUEST_MORE_EVIDENCE",
  "REJECT_RETURN_TO_EXPERIMENTS"
]);
const SHADOW_RESULTS = new Set<ExperimentPolicyShadowEvaluationResultV1>([
  "PASS",
  "FAIL",
  "INCONCLUSIVE"
]);
const AUDIT_TYPES = new Set<ExperimentPolicyPromotionAuditEventTypeV1>([
  "CANDIDATE_CREATED",
  "REPLICATION_READINESS",
  "INDEPENDENT_REVIEW",
  "SHADOW_EVALUATION"
]);

const LIMITATIONS = Object.freeze([
  "READY_FOR_PROMOTION_DECISION means only that the recorded governance prerequisites are present and internally consistent. It does not promote or authorize a policy.",
  "Independent review and shadow-evaluation dispositions are accepted only as explicit evidence. This contract does not infer their correctness, statistical validity, causality, confidence, or future performance.",
  "A shadow PASS is not a success claim for the business. A FAIL or contradiction returns the candidate to experiment review only; rollback and experiment execution remain unauthorized.",
  "Audit-history coverage proves only that required governance events were recorded with provenance. It does not prove the underlying policy is beneficial or safe.",
  "No causality, confidence, monetary value, expected outcome, policy mutation, experiment launch, rollback execution, allocation, spend, pricing, persistence, external action, or approval bypass is created or authorized."
] as const);

function requiredText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = requiredText(value, 128);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) && new Date(millis).toISOString() === normalized
    ? normalized
    : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function uniqueRefs(value: unknown, allowEmpty = false): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS || (!allowEmpty && value.length === 0)) {
    return null;
  }
  const refs: string[] = [];
  for (const raw of value) {
    const ref = requiredText(raw, 512);
    if (!ref) return null;
    refs.push(ref);
  }
  if (new Set(refs).size !== refs.length) return null;
  return Object.freeze([...refs].sort((a, b) => a.localeCompare(b)));
}

function exactObject(value: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function pushReason(
  reasons: ExperimentPolicyPromotionReviewReasonV1[],
  reason: ExperimentPolicyPromotionReviewReasonV1
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function exactIdentity(
  value: {
    portfolioId: string;
    targetExperimentId: string;
    policyStatement: string;
    rollbackPlan: string;
  },
  portfolioId: string,
  targetExperimentId: string,
  policyStatement: string,
  rollbackPlan: string
): boolean {
  return value.portfolioId === portfolioId
    && value.targetExperimentId === targetExperimentId
    && value.policyStatement === policyStatement
    && value.rollbackPlan === rollbackPlan;
}

function nextStepFor(
  state: ExperimentPolicyPromotionReviewStateV1
): ExperimentPolicyPromotionReviewV1["nextInternalStep"] {
  if (state === "WAIT_FOR_GOVERNANCE_EVIDENCE") return "COLLECT_GOVERNANCE_EVIDENCE";
  if (state === "VERIFY_REQUIRED") return "VERIFY_GOVERNANCE_EVIDENCE";
  if (state === "RETURN_TO_EXPERIMENT_REVIEW") return "RETURN_POLICY_TO_EXPERIMENT_REVIEW";
  if (state === "READY_FOR_PROMOTION_DECISION") return "HUMAN_OR_GOVERNED_PROMOTION_DECISION";
  return null;
}

/**
 * Certifies only whether a shadow policy candidate has the explicit governance
 * evidence required to be presented for a promotion decision. It does not make
 * that decision and grants no policy or execution authority.
 */
export function reviewExperimentPolicyPromotionReadinessV1(
  input: ExperimentPolicyPromotionReviewInputV1
): ExperimentPolicyPromotionReviewV1 {
  const reviewedAt = canonicalTimestamp(input.reviewedAt);
  if (!reviewedAt) throw new Error("EXPERIMENT_POLICY_PROMOTION_INVALID_REVIEWED_AT");
  const maximumSourceAgeMs = positiveFinite(input.maximumSourceAgeMs);
  const maximumGovernanceEvidenceAgeMs = positiveFinite(input.maximumGovernanceEvidenceAgeMs);
  if (!maximumSourceAgeMs || !maximumGovernanceEvidenceAgeMs) {
    throw new Error("EXPERIMENT_POLICY_PROMOTION_INVALID_MAX_AGE");
  }
  if (!Array.isArray(input.auditHistory) || input.auditHistory.length > MAX_AUDIT_ENTRIES) {
    throw new Error("EXPERIMENT_POLICY_PROMOTION_INVALID_AUDIT_BOUND");
  }

  const readiness = input.replicationReadiness;
  const reviewedAtMs = Date.parse(reviewedAt);
  const sourceReviewedAt = canonicalTimestamp(readiness?.reviewedAt);
  const reasons: ExperimentPolicyPromotionReviewReasonV1[] = [];

  if (readiness?.contractVersion !== EXPERIMENT_POLICY_REPLICATION_READINESS_VERSION_V1) {
    pushReason(reasons, "SOURCE_CONTRACT_MISMATCH");
  }
  if (readiness?.policyVersion !== EXPERIMENT_POLICY_REPLICATION_READINESS_POLICY_VERSION_V1) {
    pushReason(reasons, "SOURCE_POLICY_MISMATCH");
  }
  if (!exactObject(readiness?.authority, EXPECTED_SOURCE_AUTHORITY)) {
    pushReason(reasons, "SOURCE_AUTHORITY_WIDENED");
  }
  if (
    readiness?.causalInterpretation !== "NOT_ESTABLISHED"
    || readiness?.confidence !== "NOT_ESTABLISHED"
    || readiness?.monetaryValue !== null
    || readiness?.expectedOutcome !== null
  ) {
    pushReason(reasons, "SOURCE_INTERPRETATION_WIDENED");
  }
  if (!sourceReviewedAt) {
    pushReason(reasons, "SOURCE_CONTRACT_MISMATCH");
  } else {
    const sourceMs = Date.parse(sourceReviewedAt);
    if (sourceMs > reviewedAtMs) pushReason(reasons, "SOURCE_FROM_FUTURE");
    if (reviewedAtMs - sourceMs > maximumSourceAgeMs) pushReason(reasons, "SOURCE_STALE");
  }
  if (readiness?.state === "VERIFY_REQUIRED") pushReason(reasons, "SOURCE_VERIFY_REQUIRED");
  if (readiness?.state === "NOT_APPLICABLE") pushReason(reasons, "SOURCE_NOT_APPLICABLE");
  if (readiness?.state === "WAIT_FOR_REPLICATIONS") {
    pushReason(reasons, "SOURCE_WAITING_FOR_REPLICATIONS");
  }
  if (readiness?.state === "CONTRADICTION_REVIEW") {
    pushReason(reasons, "SOURCE_CONTRADICTION_REVIEW");
  }

  const portfolioId = requiredText(readiness?.portfolioId, 256) ?? "";
  const targetExperimentId = requiredText(readiness?.targetExperimentId, 256) ?? "";
  const policyStatement = requiredText(readiness?.policyStatement);
  const rollbackPlan = requiredText(readiness?.rollbackPlan);
  if (!portfolioId || !targetExperimentId || !policyStatement || !rollbackPlan) {
    pushReason(reasons, "POLICY_METADATA_MISSING");
  }

  const sourceEvidenceRefs = uniqueRefs(readiness?.evidenceRefs, true);
  const sourceSourceRefs = uniqueRefs(readiness?.sourceRefs, true);
  const sourceConfounders = uniqueRefs(readiness?.confounders, true);
  if (!sourceEvidenceRefs || !sourceSourceRefs || !sourceConfounders) {
    pushReason(reasons, "SOURCE_PROVENANCE_INVALID");
  }
  if (
    readiness?.state === "READY_FOR_INDEPENDENT_REVIEW"
    && (
      !sourceEvidenceRefs
      || sourceEvidenceRefs.length === 0
      || !sourceSourceRefs
      || sourceSourceRefs.length === 0
      || !Number.isInteger(readiness?.minimumDistinctReplications)
      || (readiness?.minimumDistinctReplications ?? 0) < 2
      || readiness?.supportingReplicationCount < (readiness?.minimumDistinctReplications ?? Number.POSITIVE_INFINITY)
      || readiness?.contradictingReplicationCount !== 0
      || readiness?.distinctReplicationCount < readiness?.supportingReplicationCount
      || readiness?.nextInternalStep !== "INDEPENDENT_POLICY_REVIEW"
    )
  ) {
    pushReason(reasons, "SOURCE_STATE_INCONSISTENT");
  }

  const evidenceRefs = new Set<string>(sourceEvidenceRefs ?? []);
  const sourceRefs = new Set<string>(sourceSourceRefs ?? []);
  const confounders = new Set<string>(sourceConfounders ?? []);

  let independentReviewId: string | null = null;
  let independentReviewDisposition: ExperimentPolicyIndependentReviewDispositionV1 | null = null;
  const independentReview = input.independentReview;
  if (!independentReview) {
    pushReason(reasons, "INDEPENDENT_REVIEW_MISSING");
  } else {
    independentReviewId = requiredText(independentReview.reviewId, 256);
    const reviewTime = canonicalTimestamp(independentReview.reviewedAt);
    const reviewerRef = requiredText(independentReview.reviewerRef, 256);
    const reviewEvidence = uniqueRefs(independentReview.evidenceRefs);
    const reviewSources = uniqueRefs(independentReview.sourceRefs);
    independentReviewDisposition = REVIEW_DISPOSITIONS.has(independentReview.disposition)
      ? independentReview.disposition
      : null;
    if (!independentReviewId || !reviewTime || !reviewerRef || !reviewEvidence || !reviewSources || !independentReviewDisposition) {
      pushReason(reasons, "INDEPENDENT_REVIEW_INVALID");
    }
    if (
      policyStatement
      && rollbackPlan
      && !exactIdentity(independentReview, portfolioId, targetExperimentId, policyStatement, rollbackPlan)
    ) {
      pushReason(reasons, "INDEPENDENT_REVIEW_IDENTITY_MISMATCH");
    }
    if (reviewTime) {
      const reviewMs = Date.parse(reviewTime);
      if (reviewMs > reviewedAtMs) pushReason(reasons, "INDEPENDENT_REVIEW_FROM_FUTURE");
      if (reviewedAtMs - reviewMs > maximumGovernanceEvidenceAgeMs) {
        pushReason(reasons, "INDEPENDENT_REVIEW_STALE");
      }
      if (sourceReviewedAt && reviewMs < Date.parse(sourceReviewedAt)) {
        pushReason(reasons, "INDEPENDENT_REVIEW_PRECEDES_REPLICATION_REVIEW");
      }
    }
    if (independentReviewDisposition === "REQUEST_MORE_EVIDENCE") {
      pushReason(reasons, "INDEPENDENT_REVIEW_MORE_EVIDENCE");
    }
    if (independentReviewDisposition === "REJECT_RETURN_TO_EXPERIMENTS") {
      pushReason(reasons, "INDEPENDENT_REVIEW_REJECTED");
    }
    for (const ref of reviewEvidence ?? []) evidenceRefs.add(ref);
    for (const ref of reviewSources ?? []) sourceRefs.add(ref);
  }

  let shadowEvaluationId: string | null = null;
  let shadowEvaluationResult: ExperimentPolicyShadowEvaluationResultV1 | null = null;
  const shadowEvaluation = input.shadowEvaluation;
  if (!shadowEvaluation) {
    pushReason(reasons, "SHADOW_EVALUATION_MISSING");
  } else {
    shadowEvaluationId = requiredText(shadowEvaluation.evaluationId, 256);
    const evaluationTime = canonicalTimestamp(shadowEvaluation.evaluatedAt);
    const evaluationEvidence = uniqueRefs(shadowEvaluation.evidenceRefs);
    const evaluationSources = uniqueRefs(shadowEvaluation.sourceRefs);
    const evaluationConfounders = uniqueRefs(shadowEvaluation.confounders, true);
    shadowEvaluationResult = SHADOW_RESULTS.has(shadowEvaluation.result)
      ? shadowEvaluation.result
      : null;
    if (
      !shadowEvaluationId
      || !evaluationTime
      || shadowEvaluation.mode !== "SHADOW_ONLY"
      || !evaluationEvidence
      || !evaluationSources
      || !evaluationConfounders
      || !shadowEvaluationResult
    ) {
      pushReason(reasons, "SHADOW_EVALUATION_INVALID");
    }
    if (
      policyStatement
      && rollbackPlan
      && !exactIdentity(shadowEvaluation, portfolioId, targetExperimentId, policyStatement, rollbackPlan)
    ) {
      pushReason(reasons, "SHADOW_EVALUATION_IDENTITY_MISMATCH");
    }
    if (evaluationTime) {
      const evaluationMs = Date.parse(evaluationTime);
      if (evaluationMs > reviewedAtMs) pushReason(reasons, "SHADOW_EVALUATION_FROM_FUTURE");
      if (reviewedAtMs - evaluationMs > maximumGovernanceEvidenceAgeMs) {
        pushReason(reasons, "SHADOW_EVALUATION_STALE");
      }
      if (sourceReviewedAt && evaluationMs < Date.parse(sourceReviewedAt)) {
        pushReason(reasons, "SHADOW_EVALUATION_PRECEDES_REPLICATION_REVIEW");
      }
    }
    if (shadowEvaluationResult === "INCONCLUSIVE") {
      pushReason(reasons, "SHADOW_EVALUATION_INCONCLUSIVE");
    }
    if (shadowEvaluationResult === "FAIL") {
      pushReason(reasons, "SHADOW_EVALUATION_FAILED");
    }
    for (const ref of evaluationEvidence ?? []) evidenceRefs.add(ref);
    for (const ref of evaluationSources ?? []) sourceRefs.add(ref);
    for (const ref of evaluationConfounders ?? []) confounders.add(ref);
  }

  const auditEventIds = new Set<string>();
  const auditTypes = new Set<ExperimentPolicyPromotionAuditEventTypeV1>();
  for (const entry of input.auditHistory) {
    const eventId = requiredText(entry?.eventId, 256);
    const occurredAt = canonicalTimestamp(entry?.occurredAt);
    const artifactRef = requiredText(entry?.artifactRef, 512);
    const entryEvidence = uniqueRefs(entry?.evidenceRefs);
    const entrySources = uniqueRefs(entry?.sourceRefs);
    const eventType = AUDIT_TYPES.has(entry?.eventType) ? entry.eventType : null;
    if (!eventId || !occurredAt || !artifactRef || !entryEvidence || !entrySources || !eventType) {
      pushReason(reasons, "AUDIT_HISTORY_INVALID");
      continue;
    }
    if (auditEventIds.has(eventId)) pushReason(reasons, "AUDIT_ENTRY_DUPLICATE");
    auditEventIds.add(eventId);
    auditTypes.add(eventType);
    if (
      policyStatement
      && rollbackPlan
      && !exactIdentity(entry, portfolioId, targetExperimentId, policyStatement, rollbackPlan)
    ) {
      pushReason(reasons, "AUDIT_ENTRY_IDENTITY_MISMATCH");
    }
    if (Date.parse(occurredAt) > reviewedAtMs) pushReason(reasons, "AUDIT_ENTRY_FROM_FUTURE");
    if (entryEvidence.length === 0 || entrySources.length === 0) {
      pushReason(reasons, "AUDIT_ENTRY_PROVENANCE_MISSING");
    }
    const expectedReplicationArtifactRef = sourceReviewedAt
      ? `replication-readiness:${portfolioId}:${targetExperimentId}:${sourceReviewedAt}`
      : null;
    if (
      (eventType === "REPLICATION_READINESS"
        && expectedReplicationArtifactRef !== null
        && artifactRef !== expectedReplicationArtifactRef)
      || (eventType === "INDEPENDENT_REVIEW"
        && independentReviewId !== null
        && artifactRef !== independentReviewId)
      || (eventType === "SHADOW_EVALUATION"
        && shadowEvaluationId !== null
        && artifactRef !== shadowEvaluationId)
    ) {
      pushReason(reasons, "AUDIT_ARTIFACT_MISMATCH");
    }
    for (const ref of entryEvidence) evidenceRefs.add(ref);
    for (const ref of entrySources) sourceRefs.add(ref);
  }

  if (!auditTypes.has("REPLICATION_READINESS")) pushReason(reasons, "AUDIT_REPLICATION_EVENT_MISSING");
  if (!auditTypes.has("INDEPENDENT_REVIEW")) pushReason(reasons, "AUDIT_INDEPENDENT_REVIEW_EVENT_MISSING");
  if (!auditTypes.has("SHADOW_EVALUATION")) pushReason(reasons, "AUDIT_SHADOW_EVALUATION_EVENT_MISSING");

  const verifyReasons = new Set<ExperimentPolicyPromotionReviewReasonV1>([
    "SOURCE_CONTRACT_MISMATCH",
    "SOURCE_POLICY_MISMATCH",
    "SOURCE_AUTHORITY_WIDENED",
    "SOURCE_INTERPRETATION_WIDENED",
    "SOURCE_PROVENANCE_INVALID",
    "SOURCE_STATE_INCONSISTENT",
    "SOURCE_FROM_FUTURE",
    "SOURCE_VERIFY_REQUIRED",
    "POLICY_METADATA_MISSING",
    "INDEPENDENT_REVIEW_INVALID",
    "INDEPENDENT_REVIEW_IDENTITY_MISMATCH",
    "INDEPENDENT_REVIEW_FROM_FUTURE",
    "INDEPENDENT_REVIEW_PRECEDES_REPLICATION_REVIEW",
    "SHADOW_EVALUATION_INVALID",
    "SHADOW_EVALUATION_IDENTITY_MISMATCH",
    "SHADOW_EVALUATION_FROM_FUTURE",
    "SHADOW_EVALUATION_PRECEDES_REPLICATION_REVIEW",
    "AUDIT_HISTORY_INVALID",
    "AUDIT_ENTRY_DUPLICATE",
    "AUDIT_ENTRY_IDENTITY_MISMATCH",
    "AUDIT_ENTRY_FROM_FUTURE",
    "AUDIT_ENTRY_PROVENANCE_MISSING",
    "AUDIT_ARTIFACT_MISMATCH"
  ]);
  const returnReasons = new Set<ExperimentPolicyPromotionReviewReasonV1>([
    "SOURCE_CONTRADICTION_REVIEW",
    "INDEPENDENT_REVIEW_REJECTED",
    "SHADOW_EVALUATION_FAILED"
  ]);
  const waitReasons = new Set<ExperimentPolicyPromotionReviewReasonV1>([
    "SOURCE_STALE",
    "SOURCE_NOT_APPLICABLE",
    "SOURCE_WAITING_FOR_REPLICATIONS",
    "INDEPENDENT_REVIEW_MISSING",
    "INDEPENDENT_REVIEW_STALE",
    "INDEPENDENT_REVIEW_MORE_EVIDENCE",
    "SHADOW_EVALUATION_MISSING",
    "SHADOW_EVALUATION_STALE",
    "SHADOW_EVALUATION_INCONCLUSIVE",
    "AUDIT_REPLICATION_EVENT_MISSING",
    "AUDIT_INDEPENDENT_REVIEW_EVENT_MISSING",
    "AUDIT_SHADOW_EVALUATION_EVENT_MISSING"
  ]);

  let state: ExperimentPolicyPromotionReviewStateV1;
  if (reasons.some((reason) => verifyReasons.has(reason))) {
    state = "VERIFY_REQUIRED";
  } else if (reasons.some((reason) => returnReasons.has(reason))) {
    state = "RETURN_TO_EXPERIMENT_REVIEW";
  } else if (reasons.some((reason) => waitReasons.has(reason))) {
    state = readiness?.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "WAIT_FOR_GOVERNANCE_EVIDENCE";
  } else if (
    readiness?.state === "READY_FOR_INDEPENDENT_REVIEW"
    && independentReviewDisposition === "APPROVE_FOR_PROMOTION_DECISION"
    && shadowEvaluationResult === "PASS"
  ) {
    pushReason(reasons, "GOVERNANCE_REQUIREMENTS_SATISFIED");
    state = "READY_FOR_PROMOTION_DECISION";
  } else {
    state = "WAIT_FOR_GOVERNANCE_EVIDENCE";
  }

  return deepFreeze({
    contractVersion: EXPERIMENT_POLICY_PROMOTION_REVIEW_VERSION_V1,
    policyVersion: EXPERIMENT_POLICY_PROMOTION_REVIEW_POLICY_VERSION_V1,
    reviewedAt,
    portfolioId,
    targetExperimentId,
    sourceReplicationReviewedAt: sourceReviewedAt ?? readiness?.reviewedAt ?? "",
    state,
    reasonCodes: [...reasons].sort((a, b) => a.localeCompare(b)),
    policyStatement,
    rollbackPlan,
    independentReviewId,
    independentReviewDisposition,
    shadowEvaluationId,
    shadowEvaluationResult,
    auditEventIds: [...auditEventIds].sort((a, b) => a.localeCompare(b)),
    evidenceRefs: [...evidenceRefs].sort((a, b) => a.localeCompare(b)),
    sourceRefs: [...sourceRefs].sort((a, b) => a.localeCompare(b)),
    confounders: [...confounders].sort((a, b) => a.localeCompare(b)),
    nextInternalStep: nextStepFor(state),
    analysisOnly: true,
    policyPromotionAuthorized: false,
    policyMutationAuthorized: false,
    experimentLaunchAuthorized: false,
    rollbackExecutionAuthorized: false,
    allocationChangeAuthorized: false,
    spendChangeAuthorized: false,
    priceChangeAuthorized: false,
    persistenceAuthorized: false,
    externalActionAuthorized: false,
    approvalBypassAuthorized: false,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    expectedOutcome: null,
    limitations: LIMITATIONS
  });
}
