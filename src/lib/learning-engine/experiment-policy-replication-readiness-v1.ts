import type { DecisionEvidenceStateV1 } from "@/lib/strategy-engine/decision-portfolio-v1";
import {
  EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
  type ExperimentAttributionClassV1,
  type ExperimentPortfolioV1
} from "@/lib/learning-engine/experiment-portfolio-v1";

export const EXPERIMENT_POLICY_REPLICATION_READINESS_VERSION_V1 =
  "ExperimentPolicyReplicationReadinessV1" as const;
export const EXPERIMENT_POLICY_REPLICATION_READINESS_POLICY_VERSION_V1 =
  "experiment_policy_replication_readiness_v1.0.0" as const;

export type ExperimentPolicyReplicationAssessmentV1 =
  | "SUPPORTS_POLICY"
  | "CONTRADICTS_POLICY"
  | "INCONCLUSIVE";

export type ExperimentPolicyReplicationEvidenceV1 = Readonly<{
  experimentId: string;
  policyStatement: string;
  rollbackPlan: string;
  assessment: ExperimentPolicyReplicationAssessmentV1;
  truthState: DecisionEvidenceStateV1;
  attributionClass: ExperimentAttributionClassV1;
  observedAt: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  confounders: readonly string[];
}>;

export type ExperimentPolicyReplicationReadinessStateV1 =
  | "NOT_APPLICABLE"
  | "WAIT_FOR_REPLICATIONS"
  | "READY_FOR_INDEPENDENT_REVIEW"
  | "CONTRADICTION_REVIEW"
  | "VERIFY_REQUIRED";

export type ExperimentPolicyReplicationReadinessReasonV1 =
  | "SOURCE_CONTRACT_MISMATCH"
  | "SOURCE_AUTHORITY_WIDENED"
  | "SOURCE_FROM_FUTURE"
  | "SOURCE_STALE"
  | "TARGET_EXPERIMENT_NOT_FOUND"
  | "NO_SHADOW_POLICY_CANDIDATE"
  | "POLICY_METADATA_INVALID"
  | "REPLICATION_FROM_TARGET_EXPERIMENT"
  | "DUPLICATE_REPLICATION_EXPERIMENT"
  | "DUPLICATE_REPLICATION_EVIDENCE"
  | "POLICY_STATEMENT_MISMATCH"
  | "ROLLBACK_PLAN_MISMATCH"
  | "REPLICATION_EVIDENCE_NOT_BOUND_TO_PORTFOLIO"
  | "REPLICATION_PROVENANCE_MISSING"
  | "REPLICATION_FROM_FUTURE"
  | "REPLICATION_STALE"
  | "REPLICATION_NOT_KNOWN"
  | "REPLICATION_CONFLICTED"
  | "CONTRADICTORY_REPLICATION_OBSERVED"
  | "INCONCLUSIVE_REPLICATION_OBSERVED"
  | "MINIMUM_DISTINCT_SUPPORT_NOT_MET";

export type ExperimentPolicyReplicationReadinessInputV1 = Readonly<{
  portfolio: ExperimentPortfolioV1;
  targetExperimentId: string;
  replications: readonly ExperimentPolicyReplicationEvidenceV1[];
  reviewedAt: string;
  maxEvidenceAgeMs: number;
}>;

export type ExperimentPolicyReplicationReadinessV1 = Readonly<{
  contractVersion: typeof EXPERIMENT_POLICY_REPLICATION_READINESS_VERSION_V1;
  policyVersion: typeof EXPERIMENT_POLICY_REPLICATION_READINESS_POLICY_VERSION_V1;
  reviewedAt: string;
  portfolioId: string;
  targetExperimentId: string;
  state: ExperimentPolicyReplicationReadinessStateV1;
  reasonCodes: readonly ExperimentPolicyReplicationReadinessReasonV1[];
  policyStatement: string | null;
  rollbackPlan: string | null;
  minimumDistinctReplications: number | null;
  distinctReplicationCount: number;
  supportingReplicationCount: number;
  contradictingReplicationCount: number;
  inconclusiveReplicationCount: number;
  causalSupportedReplicationCount: number;
  consideredExperimentIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  confounders: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  expectedOutcome: null;
  nextInternalStep:
    | "INDEPENDENT_POLICY_REVIEW"
    | "REVIEW_CONTRADICTORY_REPLICATIONS"
    | "COLLECT_DISTINCT_REPLICATION_EVIDENCE"
    | "VERIFY_POLICY_REPLICATION_EVIDENCE"
    | null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    experimentLaunchAuthorized: false;
    policyPromotionAuthorized: false;
    policyMutationAuthorized: false;
    rollbackExecutionAuthorized: false;
    allocationChangeAuthorized: false;
    spendChangeAuthorized: false;
    priceChangeAuthorized: false;
    externalActionAuthorized: false;
    persistenceAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
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

const LIMITATIONS = Object.freeze([
  "Distinct experiment IDs and distinct evidence references prevent simple reference-count inflation but do not prove statistical independence.",
  "A READY_FOR_INDEPENDENT_REVIEW result only prepares human or governed review; it does not promote a policy or authorize execution.",
  "Supporting replications are preserved as observed assessments and never converted into causal truth, confidence, expected value, monetary value, or future performance.",
  "Contradictory, stale, future-dated, conflicted, unbound, or missing-provenance evidence fails closed."
] as const);

const VERIFY_REASONS = new Set<ExperimentPolicyReplicationReadinessReasonV1>([
  "SOURCE_CONTRACT_MISMATCH",
  "SOURCE_AUTHORITY_WIDENED",
  "SOURCE_FROM_FUTURE",
  "TARGET_EXPERIMENT_NOT_FOUND",
  "POLICY_METADATA_INVALID",
  "REPLICATION_FROM_TARGET_EXPERIMENT",
  "DUPLICATE_REPLICATION_EXPERIMENT",
  "DUPLICATE_REPLICATION_EVIDENCE",
  "POLICY_STATEMENT_MISMATCH",
  "ROLLBACK_PLAN_MISMATCH",
  "REPLICATION_EVIDENCE_NOT_BOUND_TO_PORTFOLIO",
  "REPLICATION_PROVENANCE_MISSING",
  "REPLICATION_FROM_FUTURE",
  "REPLICATION_CONFLICTED"
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function requiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsedTimestamp(value: unknown): string | null {
  const text = requiredText(value);
  if (!text) return null;
  return Number.isFinite(Date.parse(text)) ? text : null;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function pushReason(
  reasons: ExperimentPolicyReplicationReadinessReasonV1[],
  reason: ExperimentPolicyReplicationReadinessReasonV1
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function stateFor(
  reasons: readonly ExperimentPolicyReplicationReadinessReasonV1[],
  hasPolicy: boolean,
  supportCount: number,
  minimum: number | null,
  contradictionCount: number
): ExperimentPolicyReplicationReadinessStateV1 {
  if (reasons.some((reason) => VERIFY_REASONS.has(reason))) return "VERIFY_REQUIRED";
  if (!hasPolicy) return "NOT_APPLICABLE";
  if (contradictionCount > 0) return "CONTRADICTION_REVIEW";
  if (minimum !== null && supportCount >= minimum) return "READY_FOR_INDEPENDENT_REVIEW";
  return "WAIT_FOR_REPLICATIONS";
}

function nextStepFor(
  state: ExperimentPolicyReplicationReadinessStateV1
): ExperimentPolicyReplicationReadinessV1["nextInternalStep"] {
  if (state === "READY_FOR_INDEPENDENT_REVIEW") return "INDEPENDENT_POLICY_REVIEW";
  if (state === "CONTRADICTION_REVIEW") return "REVIEW_CONTRADICTORY_REPLICATIONS";
  if (state === "WAIT_FOR_REPLICATIONS") return "COLLECT_DISTINCT_REPLICATION_EVIDENCE";
  if (state === "VERIFY_REQUIRED") return "VERIFY_POLICY_REPLICATION_EVIDENCE";
  return null;
}

/**
 * Re-audits a shadow-only experiment policy candidate using explicit,
 * distinct-experiment evidence. The source portfolio's legacy replication-ref
 * count is intentionally not treated as proof that independent replications
 * exist. This projection can only prepare governed review.
 */
export function reviewExperimentPolicyReplicationReadinessV1(
  input: ExperimentPolicyReplicationReadinessInputV1
): ExperimentPolicyReplicationReadinessV1 {
  const reviewedAt = parsedTimestamp(input.reviewedAt);
  if (!reviewedAt) throw new Error("EXPERIMENT_POLICY_REPLICATION_INVALID_REVIEWED_AT");
  if (
    !Number.isInteger(input.maxEvidenceAgeMs) ||
    input.maxEvidenceAgeMs <= 0 ||
    input.maxEvidenceAgeMs > 366 * 24 * 60 * 60 * 1000
  ) {
    throw new Error("EXPERIMENT_POLICY_REPLICATION_INVALID_MAX_AGE");
  }
  if (!Array.isArray(input.replications) || input.replications.length > 100) {
    throw new Error("EXPERIMENT_POLICY_REPLICATION_INVALID_BOUND");
  }

  const reasons: ExperimentPolicyReplicationReadinessReasonV1[] = [];
  const portfolio = input.portfolio;
  const targetExperimentId = requiredText(input.targetExperimentId) ?? "";
  const reviewedAtMs = Date.parse(reviewedAt);

  if (
    !portfolio ||
    portfolio.contractVersion !== "ExperimentPortfolioV1" ||
    portfolio.policyVersion !== EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1
  ) {
    pushReason(reasons, "SOURCE_CONTRACT_MISMATCH");
  }
  if (portfolio?.authority?.promotePolicy !== false) {
    pushReason(reasons, "SOURCE_AUTHORITY_WIDENED");
  }

  const portfolioGeneratedAt = parsedTimestamp(portfolio?.generatedAt);
  if (!portfolioGeneratedAt || Date.parse(portfolioGeneratedAt) > reviewedAtMs) {
    pushReason(reasons, "SOURCE_FROM_FUTURE");
  } else if (reviewedAtMs - Date.parse(portfolioGeneratedAt) > input.maxEvidenceAgeMs) {
    pushReason(reasons, "SOURCE_STALE");
  }

  const target = portfolio?.items?.find((item) => item.experimentId === targetExperimentId) ?? null;
  if (!target) pushReason(reasons, "TARGET_EXPERIMENT_NOT_FOUND");

  const hasPolicy = target?.policyUpdate?.mode === "SHADOW_ONLY";
  if (target && !hasPolicy) pushReason(reasons, "NO_SHADOW_POLICY_CANDIDATE");

  const policyStatement = hasPolicy ? requiredText(target?.policyUpdate.statement) : null;
  const rollbackPlan = hasPolicy ? requiredText(target?.policyUpdate.rollbackPlan) : null;
  const minimumDistinctReplications = hasPolicy
    ? target?.policyUpdate.minimumIndependentReplications ?? null
    : null;

  if (
    hasPolicy &&
    (!policyStatement ||
      !rollbackPlan ||
      minimumDistinctReplications === null ||
      !Number.isInteger(minimumDistinctReplications) ||
      minimumDistinctReplications < 2 ||
      target?.policyUpdate.canPromoteAutomatically !== false)
  ) {
    pushReason(reasons, "POLICY_METADATA_INVALID");
  }

  const portfolioEvidenceRefs = new Set(uniqueSorted(portfolio?.evidenceRefs ?? []));
  const seenExperimentIds = new Set<string>();
  const seenEvidenceRefs = new Set<string>();
  const consideredExperimentIds: string[] = [];
  const evidenceRefs: string[] = [];
  const sourceRefs: string[] = [];
  const confounders: string[] = [];
  let supportingReplicationCount = 0;
  let contradictingReplicationCount = 0;
  let inconclusiveReplicationCount = 0;
  let causalSupportedReplicationCount = 0;

  for (const raw of input.replications) {
    const experimentId = requiredText(raw?.experimentId);
    const statement = requiredText(raw?.policyStatement);
    const rollback = requiredText(raw?.rollbackPlan);
    const observedAt = parsedTimestamp(raw?.observedAt);
    const recordEvidenceRefs = uniqueSorted(raw?.evidenceRefs ?? []);
    const recordSourceRefs = uniqueSorted(raw?.sourceRefs ?? []);
    const recordConfounders = uniqueSorted(raw?.confounders ?? []);

    if (!experimentId || !observedAt || recordEvidenceRefs.length === 0 || recordSourceRefs.length === 0) {
      pushReason(reasons, "REPLICATION_PROVENANCE_MISSING");
      continue;
    }
    if (experimentId === targetExperimentId) pushReason(reasons, "REPLICATION_FROM_TARGET_EXPERIMENT");
    if (seenExperimentIds.has(experimentId)) pushReason(reasons, "DUPLICATE_REPLICATION_EXPERIMENT");
    seenExperimentIds.add(experimentId);

    if (policyStatement && statement !== policyStatement) pushReason(reasons, "POLICY_STATEMENT_MISMATCH");
    if (rollbackPlan && rollback !== rollbackPlan) pushReason(reasons, "ROLLBACK_PLAN_MISMATCH");

    if (Date.parse(observedAt) > reviewedAtMs) pushReason(reasons, "REPLICATION_FROM_FUTURE");
    else if (reviewedAtMs - Date.parse(observedAt) > input.maxEvidenceAgeMs) {
      pushReason(reasons, "REPLICATION_STALE");
    }

    if (raw.truthState === "CONFLICTED") pushReason(reasons, "REPLICATION_CONFLICTED");
    else if (raw.truthState !== "KNOWN") pushReason(reasons, "REPLICATION_NOT_KNOWN");

    if (recordEvidenceRefs.some((ref) => !portfolioEvidenceRefs.has(ref))) {
      pushReason(reasons, "REPLICATION_EVIDENCE_NOT_BOUND_TO_PORTFOLIO");
    }
    for (const ref of recordEvidenceRefs) {
      if (seenEvidenceRefs.has(ref)) pushReason(reasons, "DUPLICATE_REPLICATION_EVIDENCE");
      seenEvidenceRefs.add(ref);
    }

    consideredExperimentIds.push(experimentId);
    evidenceRefs.push(...recordEvidenceRefs);
    sourceRefs.push(...recordSourceRefs);
    confounders.push(...recordConfounders);

    const recordUsable =
      raw.truthState === "KNOWN" &&
      Date.parse(observedAt) <= reviewedAtMs &&
      reviewedAtMs - Date.parse(observedAt) <= input.maxEvidenceAgeMs &&
      statement === policyStatement &&
      rollback === rollbackPlan &&
      experimentId !== targetExperimentId &&
      recordEvidenceRefs.every((ref) => portfolioEvidenceRefs.has(ref));

    if (!recordUsable) continue;
    if (raw.assessment === "SUPPORTS_POLICY") supportingReplicationCount += 1;
    else if (raw.assessment === "CONTRADICTS_POLICY") {
      contradictingReplicationCount += 1;
      pushReason(reasons, "CONTRADICTORY_REPLICATION_OBSERVED");
    } else {
      inconclusiveReplicationCount += 1;
      pushReason(reasons, "INCONCLUSIVE_REPLICATION_OBSERVED");
    }
    if (raw.attributionClass === "CAUSAL_SUPPORTED") causalSupportedReplicationCount += 1;
  }

  if (
    hasPolicy &&
    minimumDistinctReplications !== null &&
    supportingReplicationCount < minimumDistinctReplications
  ) {
    pushReason(reasons, "MINIMUM_DISTINCT_SUPPORT_NOT_MET");
  }

  const state = stateFor(
    reasons,
    hasPolicy,
    supportingReplicationCount,
    minimumDistinctReplications,
    contradictingReplicationCount
  );

  return deepFreeze({
    contractVersion: EXPERIMENT_POLICY_REPLICATION_READINESS_VERSION_V1,
    policyVersion: EXPERIMENT_POLICY_REPLICATION_READINESS_POLICY_VERSION_V1,
    reviewedAt,
    portfolioId: portfolio?.portfolioId ?? "",
    targetExperimentId,
    state,
    reasonCodes: [...reasons].sort((a, b) => a.localeCompare(b)),
    policyStatement,
    rollbackPlan,
    minimumDistinctReplications,
    distinctReplicationCount: new Set(consideredExperimentIds).size,
    supportingReplicationCount,
    contradictingReplicationCount,
    inconclusiveReplicationCount,
    causalSupportedReplicationCount,
    consideredExperimentIds: uniqueSorted(consideredExperimentIds),
    evidenceRefs: uniqueSorted(evidenceRefs),
    sourceRefs: uniqueSorted(sourceRefs),
    confounders: uniqueSorted(confounders),
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    expectedOutcome: null,
    nextInternalStep: nextStepFor(state),
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
