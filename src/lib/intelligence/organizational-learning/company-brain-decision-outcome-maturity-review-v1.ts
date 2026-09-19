import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionMemoryRecordV1,
  type DecisionMemoryTruthStateV1,
  type DecisionOutcomeAssessmentV1
} from "./decision-memory-v1";

export const COMPANY_BRAIN_DECISION_OUTCOME_MATURITY_REVIEW_VERSION_V1 =
  "CompanyBrainDecisionOutcomeMaturityReviewV1" as const;
export const COMPANY_BRAIN_DECISION_OUTCOME_MATURITY_REVIEW_POLICY_VERSION_V1 =
  "company_brain_decision_outcome_maturity_review_v1.0.0" as const;

const MAX_SOURCE_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REFS = 2_000;
const MAX_OUTCOMES = 200;

export type CompanyBrainDecisionOutcomeMaturityStateV1 =
  | "READY_FOR_GOVERNED_OUTCOME_REVIEW"
  | "WAIT_FOR_MEASUREMENT"
  | "VERIFY_SOURCE";

export type CompanyBrainDecisionOutcomeWindowStateV1 =
  | "MATURED"
  | "OPEN"
  | "UNESTABLISHED";

export type CompanyBrainDecisionOutcomeMaturityReasonV1 =
  | "INVALID_INPUT"
  | "INVALID_EVALUATED_AT"
  | "INVALID_SOURCE_SNAPSHOT_AT"
  | "INVALID_MAXIMUM_SOURCE_AGE"
  | "SOURCE_SNAPSHOT_IN_FUTURE"
  | "SOURCE_SNAPSHOT_STALE"
  | "SOURCE_PROVENANCE_MISSING"
  | "SOURCE_CONTRACT_INVALID"
  | "SOURCE_POLICY_INVALID"
  | "SOURCE_AUTHORITY_INVARIANT_FAILED"
  | "SOURCE_INTEGRITY_FLAGS_PRESENT"
  | "DECISION_IN_FUTURE"
  | "DECISION_PROVENANCE_MISSING"
  | "NO_MEASUREMENT_PLAN"
  | "OUTCOME_BOUND_EXCEEDED"
  | "DUPLICATE_EXPECTED_OUTCOME_ID"
  | "INVALID_EVALUATION_WINDOW"
  | "EVALUATION_WINDOW_BEFORE_DECISION"
  | "WINDOW_UNESTABLISHED"
  | "EVALUATION_WINDOW_OPEN"
  | "OUTCOME_OBSERVATION_MISSING"
  | "OUTCOME_OBSERVATION_BEFORE_DECISION"
  | "OUTCOME_OBSERVATION_IN_FUTURE"
  | "OUTCOME_OBSERVATION_AFTER_SOURCE_SNAPSHOT"
  | "OUTCOME_PROVENANCE_MISSING"
  | "DUPLICATE_OBSERVED_OUTCOME_ID"
  | "UNBOUND_OBSERVED_OUTCOME"
  | "MISSING_OBSERVED_OUTCOME"
  | "METRIC_REF_MISMATCH"
  | "UNIT_MISMATCH"
  | "EXPECTED_RANGE_NOT_DECISION_GRADE"
  | "OBSERVED_RANGE_NOT_DECISION_GRADE"
  | "OUTCOME_OBSERVATION_BEFORE_EVALUATION_WINDOW"
  | "DIRECTIONAL_ASSESSMENT_WITH_OPEN_WINDOW"
  | "ASSESSMENT_NOT_DECISION_GRADE"
  | "ATTRIBUTION_EVIDENCE_MISSING"
  | "CONFOUNDER_EVIDENCE_MISSING";

export type CompanyBrainDecisionOutcomeMaturityItemV1 = Readonly<{
  outcomeId: string;
  metricRef: string | null;
  evaluationWindowEndsAt: string | null;
  windowState: CompanyBrainDecisionOutcomeWindowStateV1;
  observed: boolean;
  observedAt: string | null;
  observationAfterWindow: boolean | null;
  expectedRangeTruthState: DecisionMemoryTruthStateV1;
  observedRangeTruthState: DecisionMemoryTruthStateV1 | null;
  unitBinding: "MATCH" | "MISMATCH" | "UNESTABLISHED";
}>;

export type CompanyBrainDecisionOutcomeMaturityReviewV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_DECISION_OUTCOME_MATURITY_REVIEW_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_DECISION_OUTCOME_MATURITY_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  state: CompanyBrainDecisionOutcomeMaturityStateV1;
  decisionId: string | null;
  recordId: string | null;
  evaluatedAt: string | null;
  sourceSnapshotAt: string | null;
  sourceAgeMs: number | null;
  reasonCodes: readonly CompanyBrainDecisionOutcomeMaturityReasonV1[];
  measurementPlan: readonly CompanyBrainDecisionOutcomeMaturityItemV1[];
  recordedAssessment: Readonly<{
    state: DecisionMemoryTruthStateV1;
    value: DecisionOutcomeAssessmentV1 | null;
    evidenceRefs: readonly string[];
  }> | null;
  recordedAttributionClass: DecisionMemoryRecordV1["outcomeObservation"] extends infer T
    ? T extends { attributionClass: infer A }
      ? A | null
      : null
    : null;
  sourceRefs: readonly string[];
  nextInternalStep:
    | "REVIEW_MATURED_OUTCOME_WITH_EXISTING_GOVERNANCE"
    | "WAIT_FOR_PREDECLARED_MEASUREMENT_WINDOW_OR_EVIDENCE"
    | "VERIFY_CANONICAL_DECISION_OR_OUTCOME_SOURCE"
    | null;
  causality: "NOT_ESTABLISHED";
  confidenceAdjustment: "NOT_AUTHORIZED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    decisionMutationAuthorized: false;
    outcomeMutationAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    confidenceMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainDecisionOutcomeMaturityReviewInputV1 = Readonly<{
  record: DecisionMemoryRecordV1;
  evaluatedAt: string;
  sourceSnapshotAt: string;
  maximumSourceAgeMs: number;
  sourceRefs: readonly string[];
}>;

const VERIFY_REASONS = new Set<CompanyBrainDecisionOutcomeMaturityReasonV1>([
  "INVALID_INPUT",
  "INVALID_EVALUATED_AT",
  "INVALID_SOURCE_SNAPSHOT_AT",
  "INVALID_MAXIMUM_SOURCE_AGE",
  "SOURCE_SNAPSHOT_IN_FUTURE",
  "SOURCE_SNAPSHOT_STALE",
  "SOURCE_PROVENANCE_MISSING",
  "SOURCE_CONTRACT_INVALID",
  "SOURCE_POLICY_INVALID",
  "SOURCE_AUTHORITY_INVARIANT_FAILED",
  "SOURCE_INTEGRITY_FLAGS_PRESENT",
  "DECISION_IN_FUTURE",
  "DECISION_PROVENANCE_MISSING",
  "OUTCOME_BOUND_EXCEEDED",
  "DUPLICATE_EXPECTED_OUTCOME_ID",
  "INVALID_EVALUATION_WINDOW",
  "EVALUATION_WINDOW_BEFORE_DECISION",
  "OUTCOME_OBSERVATION_BEFORE_DECISION",
  "OUTCOME_OBSERVATION_IN_FUTURE",
  "OUTCOME_OBSERVATION_AFTER_SOURCE_SNAPSHOT",
  "OUTCOME_PROVENANCE_MISSING",
  "DUPLICATE_OBSERVED_OUTCOME_ID",
  "UNBOUND_OBSERVED_OUTCOME",
  "METRIC_REF_MISMATCH",
  "UNIT_MISMATCH",
  "ATTRIBUTION_EVIDENCE_MISSING",
  "CONFOUNDER_EVIDENCE_MISSING"
]);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  decisionMutationAuthorized: false as const,
  outcomeMutationAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  allocationChangeAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  persistenceAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This review establishes only whether a canonical DecisionMemory outcome has reached its predeclared measurement window with exact evidence bindings. It does not decide whether the outcome was good, causal, valuable, or reusable.",
  "An observation recorded before a predeclared evaluation window closes is preserved as preliminary evidence but cannot become decision-grade learning through this review.",
  "A mature measurement window does not establish causality, confidence, monetary value, future performance, a pricing rule, a negotiation rule, or a policy update.",
  "Missing or unsafe evidence fails closed. The review never creates an outcome, repairs source data, mutates confidence, promotes learning, reallocates resources, or executes any internal or external action."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
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

function exactSourceAuthority(record: DecisionMemoryRecordV1): boolean {
  const value = record?.actionAuthority as unknown as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = {
    analysisOnly: true,
    persistenceAuthorized: false,
    externalActionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationAuthorized: false,
    spendAuthorized: false,
    publishAuthorized: false
  } as const;
  const actualKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && value[key] === expected[key as keyof typeof expected]);
}

function decisionGradeRange(value: {
  state: DecisionMemoryTruthStateV1;
  value: { min: number; max: number; unit: string } | null;
  evidenceRefs: readonly string[];
}): boolean {
  return value.state === "KNOWN"
    && value.value !== null
    && Number.isFinite(value.value.min)
    && Number.isFinite(value.value.max)
    && value.value.min <= value.value.max
    && Boolean(text(value.value.unit))
    && value.evidenceRefs.length > 0;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `company-brain-outcome-maturity:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function stateFrom(reasons: ReadonlySet<CompanyBrainDecisionOutcomeMaturityReasonV1>): CompanyBrainDecisionOutcomeMaturityStateV1 {
  if ([...reasons].some((reason) => VERIFY_REASONS.has(reason))) return "VERIFY_SOURCE";
  if (reasons.size > 0) return "WAIT_FOR_MEASUREMENT";
  return "READY_FOR_GOVERNED_OUTCOME_REVIEW";
}

/**
 * Prevents premature outcome learning by proving that canonical DecisionMemory
 * outcomes have reached their predeclared evaluation windows and still match
 * the exact outcome, metric, unit, provenance, freshness, and authority
 * bindings recorded before review. It does not interpret the outcome or grant
 * any confidence, policy, allocation, pricing, execution, or persistence power.
 */
export function reviewCompanyBrainDecisionOutcomeMaturityV1(
  input: CompanyBrainDecisionOutcomeMaturityReviewInputV1
): CompanyBrainDecisionOutcomeMaturityReviewV1 {
  const reasons = new Set<CompanyBrainDecisionOutcomeMaturityReasonV1>();
  const record = input?.record;
  const evaluatedAt = canonicalTimestamp(input?.evaluatedAt);
  const sourceSnapshotAt = canonicalTimestamp(input?.sourceSnapshotAt);
  const maximumSourceAgeMs = input?.maximumSourceAgeMs;
  const suppliedSourceRefs = refs(input?.sourceRefs);

  if (!record || typeof record !== "object" || Array.isArray(record)) reasons.add("INVALID_INPUT");
  if (!evaluatedAt) reasons.add("INVALID_EVALUATED_AT");
  if (!sourceSnapshotAt) reasons.add("INVALID_SOURCE_SNAPSHOT_AT");
  if (!Number.isFinite(maximumSourceAgeMs) || maximumSourceAgeMs <= 0 || maximumSourceAgeMs > MAX_SOURCE_AGE_MS) {
    reasons.add("INVALID_MAXIMUM_SOURCE_AGE");
  }
  if (!suppliedSourceRefs || suppliedSourceRefs.length === 0) reasons.add("SOURCE_PROVENANCE_MISSING");

  const evaluatedAtMs = evaluatedAt ? Date.parse(evaluatedAt) : null;
  const sourceSnapshotAtMs = sourceSnapshotAt ? Date.parse(sourceSnapshotAt) : null;
  let sourceAgeMs: number | null = null;
  if (evaluatedAtMs != null && sourceSnapshotAtMs != null) {
    sourceAgeMs = evaluatedAtMs - sourceSnapshotAtMs;
    if (sourceAgeMs < 0) reasons.add("SOURCE_SNAPSHOT_IN_FUTURE");
    else if (Number.isFinite(maximumSourceAgeMs) && sourceAgeMs > maximumSourceAgeMs) reasons.add("SOURCE_SNAPSHOT_STALE");
  }

  const decisionId = text(record?.decisionId);
  const recordId = text(record?.recordId);
  const decidedAt = canonicalTimestamp(record?.decidedAt);
  const decidedAtMs = decidedAt ? Date.parse(decidedAt) : null;

  if (record?.contractVersion !== "DecisionMemoryV1") reasons.add("SOURCE_CONTRACT_INVALID");
  if (record?.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1) reasons.add("SOURCE_POLICY_INVALID");
  if (!exactSourceAuthority(record as DecisionMemoryRecordV1)) reasons.add("SOURCE_AUTHORITY_INVARIANT_FAILED");
  if (!decisionId || !recordId || !decidedAt) reasons.add("INVALID_INPUT");
  if (record?.integrityFlags?.length > 0) reasons.add("SOURCE_INTEGRITY_FLAGS_PRESENT");
  if (!Array.isArray(record?.sourceRefs) || record.sourceRefs.length === 0) reasons.add("DECISION_PROVENANCE_MISSING");
  if (decidedAtMs != null && evaluatedAtMs != null && decidedAtMs > evaluatedAtMs) reasons.add("DECISION_IN_FUTURE");

  const expected = Array.isArray(record?.expectedOutcomes) ? record.expectedOutcomes : [];
  const observation = record?.outcomeObservation ?? null;
  const observed = observation && Array.isArray(observation.outcomes) ? observation.outcomes : [];
  if (expected.length > MAX_OUTCOMES || observed.length > MAX_OUTCOMES) reasons.add("OUTCOME_BOUND_EXCEEDED");
  if (expected.length === 0) reasons.add("NO_MEASUREMENT_PLAN");

  const expectedIds = expected.map((item) => text(item?.outcomeId)).filter((value): value is string => Boolean(value));
  if (expectedIds.length !== expected.length || new Set(expectedIds).size !== expectedIds.length) {
    reasons.add("DUPLICATE_EXPECTED_OUTCOME_ID");
  }
  const observedIds = observed.map((item) => text(item?.outcomeId)).filter((value): value is string => Boolean(value));
  if (observedIds.length !== observed.length || new Set(observedIds).size !== observedIds.length) {
    reasons.add("DUPLICATE_OBSERVED_OUTCOME_ID");
  }

  const observedById = new Map(observed.map((item) => [item.outcomeId, item]));
  for (const item of observed) {
    if (!expectedIds.includes(item.outcomeId)) reasons.add("UNBOUND_OBSERVED_OUTCOME");
  }

  const observationAt = observation ? canonicalTimestamp(observation.observedAt) : null;
  const observationAtMs = observationAt ? Date.parse(observationAt) : null;
  if (!observation) {
    reasons.add("OUTCOME_OBSERVATION_MISSING");
  } else {
    if (!observationAt) reasons.add("INVALID_INPUT");
    if (observationAtMs != null && decidedAtMs != null && observationAtMs < decidedAtMs) {
      reasons.add("OUTCOME_OBSERVATION_BEFORE_DECISION");
    }
    if (observationAtMs != null && evaluatedAtMs != null && observationAtMs > evaluatedAtMs) {
      reasons.add("OUTCOME_OBSERVATION_IN_FUTURE");
    }
    if (observationAtMs != null && sourceSnapshotAtMs != null && observationAtMs > sourceSnapshotAtMs) {
      reasons.add("OUTCOME_OBSERVATION_AFTER_SOURCE_SNAPSHOT");
    }
    if (!Array.isArray(observation.sourceRefs) || observation.sourceRefs.length === 0) {
      reasons.add("OUTCOME_PROVENANCE_MISSING");
    }
    if (
      (observation.attributionClass === "CAUSAL" || observation.attributionClass === "CONTRIBUTORY")
      && observation.attributionEvidenceRefs.length === 0
    ) {
      reasons.add("ATTRIBUTION_EVIDENCE_MISSING");
    }
    if (observation.confounders.some((item) => item.evidenceRefs.length === 0)) {
      reasons.add("CONFOUNDER_EVIDENCE_MISSING");
    }
    if (
      observation.assessment.state !== "KNOWN"
      || observation.assessment.value == null
      || observation.assessment.value === "UNKNOWN"
      || observation.assessment.evidenceRefs.length === 0
    ) {
      reasons.add("ASSESSMENT_NOT_DECISION_GRADE");
    }
  }

  let anyOpenWindow = false;
  const measurementPlan: CompanyBrainDecisionOutcomeMaturityItemV1[] = [];

  for (const item of expected.slice(0, MAX_OUTCOMES)) {
    const outcomeId = text(item.outcomeId) ?? "<invalid-outcome>";
    const window = item.evaluationWindowEndsAt == null ? null : canonicalTimestamp(item.evaluationWindowEndsAt);
    const windowMs = window ? Date.parse(window) : null;
    let windowState: CompanyBrainDecisionOutcomeWindowStateV1 = "UNESTABLISHED";

    if (item.evaluationWindowEndsAt == null) {
      reasons.add("WINDOW_UNESTABLISHED");
    } else if (!window) {
      reasons.add("INVALID_EVALUATION_WINDOW");
    } else if (decidedAtMs != null && windowMs != null && windowMs < decidedAtMs) {
      reasons.add("EVALUATION_WINDOW_BEFORE_DECISION");
    } else if (evaluatedAtMs != null && windowMs != null && evaluatedAtMs < windowMs) {
      windowState = "OPEN";
      anyOpenWindow = true;
      reasons.add("EVALUATION_WINDOW_OPEN");
    } else if (windowMs != null) {
      windowState = "MATURED";
    }

    if (!decisionGradeRange(item.expectedRange)) reasons.add("EXPECTED_RANGE_NOT_DECISION_GRADE");

    const observedItem = observedById.get(outcomeId);
    let observedRangeTruthState: DecisionMemoryTruthStateV1 | null = null;
    let unitBinding: CompanyBrainDecisionOutcomeMaturityItemV1["unitBinding"] = "UNESTABLISHED";
    let observationAfterWindow: boolean | null = null;

    if (!observedItem) {
      if (windowState === "MATURED") reasons.add("MISSING_OBSERVED_OUTCOME");
    } else {
      observedRangeTruthState = observedItem.observedRange.state;
      if (observedItem.metricRef !== item.metricRef) reasons.add("METRIC_REF_MISMATCH");
      if (!decisionGradeRange(observedItem.observedRange)) reasons.add("OBSERVED_RANGE_NOT_DECISION_GRADE");

      const expectedUnit = item.expectedRange.value ? text(item.expectedRange.value.unit) : null;
      const observedUnit = observedItem.observedRange.value ? text(observedItem.observedRange.value.unit) : null;
      if (expectedUnit && observedUnit) {
        unitBinding = expectedUnit === observedUnit ? "MATCH" : "MISMATCH";
        if (unitBinding === "MISMATCH") reasons.add("UNIT_MISMATCH");
      }

      if (observationAtMs != null && windowMs != null) {
        observationAfterWindow = observationAtMs >= windowMs;
        if (!observationAfterWindow) reasons.add("OUTCOME_OBSERVATION_BEFORE_EVALUATION_WINDOW");
      }
    }

    measurementPlan.push(Object.freeze({
      outcomeId,
      metricRef: item.metricRef,
      evaluationWindowEndsAt: window,
      windowState,
      observed: Boolean(observedItem),
      observedAt: observedItem ? observationAt : null,
      observationAfterWindow,
      expectedRangeTruthState: item.expectedRange.state,
      observedRangeTruthState,
      unitBinding
    }));
  }

  if (
    anyOpenWindow
    && observation?.assessment.state === "KNOWN"
    && observation.assessment.value != null
    && observation.assessment.value !== "UNKNOWN"
  ) {
    reasons.add("DIRECTIONAL_ASSESSMENT_WITH_OPEN_WINDOW");
  }

  const state = stateFrom(reasons);
  const normalizedReasons = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));
  const normalizedSourceRefs = suppliedSourceRefs ?? Object.freeze([] as string[]);
  const recordedAssessment = observation
    ? deepFreeze({
        state: observation.assessment.state,
        value: observation.assessment.value,
        evidenceRefs: Object.freeze([...observation.assessment.evidenceRefs].sort((a, b) => a.localeCompare(b)))
      })
    : null;

  return deepFreeze({
    contractVersion: COMPANY_BRAIN_DECISION_OUTCOME_MATURITY_REVIEW_VERSION_V1,
    policyVersion: COMPANY_BRAIN_DECISION_OUTCOME_MATURITY_REVIEW_POLICY_VERSION_V1,
    reviewId: stableId([
      decisionId ?? "<unknown>",
      recordId ?? "<unknown>",
      evaluatedAt ?? "<invalid>",
      sourceSnapshotAt ?? "<invalid>",
      normalizedReasons.join("|")
    ]),
    state,
    decisionId,
    recordId,
    evaluatedAt,
    sourceSnapshotAt,
    sourceAgeMs,
    reasonCodes: normalizedReasons,
    measurementPlan: Object.freeze(measurementPlan),
    recordedAssessment,
    recordedAttributionClass: observation?.attributionClass ?? null,
    sourceRefs: normalizedSourceRefs,
    nextInternalStep: state === "READY_FOR_GOVERNED_OUTCOME_REVIEW"
      ? "REVIEW_MATURED_OUTCOME_WITH_EXISTING_GOVERNANCE"
      : state === "WAIT_FOR_MEASUREMENT"
        ? "WAIT_FOR_PREDECLARED_MEASUREMENT_WINDOW_OR_EVIDENCE"
        : "VERIFY_CANONICAL_DECISION_OR_OUTCOME_SOURCE",
    causality: "NOT_ESTABLISHED",
    confidenceAdjustment: "NOT_AUTHORIZED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
