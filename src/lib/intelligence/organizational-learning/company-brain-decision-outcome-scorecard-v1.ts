import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionActionStateV1,
  type DecisionAttributionClassV1,
  type DecisionMemoryClassV1,
  type DecisionMemoryRecordV1,
  type DecisionOutcomeAssessmentV1
} from "./decision-memory-v1";

export const COMPANY_BRAIN_DECISION_OUTCOME_SCORECARD_VERSION_V1 =
  "CompanyBrainDecisionOutcomeScorecardV1" as const;
export const COMPANY_BRAIN_DECISION_OUTCOME_SCORECARD_POLICY_VERSION_V1 =
  "company_brain_decision_outcome_scorecard_v1.0.0" as const;

const MAX_RECORDS = 2_000;
const MAX_REFS = 2_000;
const MAX_SOURCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type CompanyBrainScorecardCoverageV1 =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "CONFLICTED";

export type CompanyBrainDecisionOutcomeScorecardStateV1 = "READY" | "VERIFY_SOURCE";

export type CompanyBrainDecisionOutcomeScorecardReasonV1 =
  | "SOURCE_COVERAGE_NOT_COMPLETE"
  | "SOURCE_PROVENANCE_MISSING"
  | "INVALID_SOURCE_FRESHNESS_POLICY"
  | "SOURCE_SNAPSHOT_INVALID"
  | "SOURCE_SNAPSHOT_IN_FUTURE"
  | "SOURCE_SNAPSHOT_STALE"
  | "INVALID_REPORT_TIME"
  | "INVALID_PERIOD"
  | "PERIOD_ENDS_AFTER_REPORT_TIME"
  | "RECORD_BOUND_EXCEEDED"
  | "INVALID_RECORD_CONTRACT"
  | "INVALID_RECORD_POLICY"
  | "DUPLICATE_RECORD_ID"
  | "DUPLICATE_DECISION_ID"
  | "INVALID_RECORD_CHRONOLOGY"
  | "RELEVANT_RECORD_PROVENANCE_MISSING"
  | "SOURCE_AUTHORITY_INVARIANT_FAILED";

export type CompanyBrainDecisionOutcomeScorecardInputV1 = Readonly<{
  records: readonly DecisionMemoryRecordV1[];
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  sourceSnapshotAt: string;
  maximumSourceAgeMs: number;
  sourceCoverage: CompanyBrainScorecardCoverageV1;
  sourceRefs: readonly string[];
}>;

type ActionStateCounts = Readonly<Record<DecisionActionStateV1, number>>;
type DecisionClassCounts = Readonly<Record<DecisionMemoryClassV1, number>>;
type OutcomeAssessmentCounts = Readonly<
  Record<Exclude<DecisionOutcomeAssessmentV1, "UNKNOWN">, number>
>;
type AttributionCounts = Readonly<Record<DecisionAttributionClassV1, number>>;

export type CompanyBrainDecisionOutcomeScorecardMetricsV1 = Readonly<{
  decisionCohort: Readonly<{
    semantics: "DECISIONS_DECIDED_IN_PERIOD_CURRENT_RECORDED_STATE";
    total: number;
    byClass: DecisionClassCounts;
    actionState: ActionStateCounts;
    actionObservedWithEvidence: number;
    actionStateWithoutEvidence: number;
    withExpectedOutcomePlan: number;
    withoutExpectedOutcomePlan: number;
    withOutcomeObservationAsOfReport: number;
    withDecisionGradeOutcomeAsOfReport: number;
    withIntegrityFlags: number;
    withMaterialUnresolvedAssumptions: number;
  }>;
  outcomeActivity: Readonly<{
    semantics: "OUTCOME_OBSERVATIONS_RECORDED_IN_PERIOD";
    observedDecisionCount: number;
    decisionGradeAssessmentCount: number;
    unsupportedOrUnknownAssessmentCount: number;
    assessment: OutcomeAssessmentCounts;
    attributionAsRecorded: AttributionCounts;
    attributionEvidenceMissing: number;
    withRecordedConfounders: number;
    lessonCandidatesAwaitingGovernedReview: number;
  }>;
  closure: Readonly<{
    semantics: "DECISIONS_DECIDED_IN_PERIOD_AS_OF_REPORT_TIME";
    actionObservedWithEvidence: number;
    outcomeObserved: number;
    decisionGradeOutcomeObserved: number;
    actionAndDecisionGradeOutcomeObserved: number;
    causalOutcomeClaims: "NOT_ESTABLISHED";
  }>;
}>;

export type CompanyBrainDecisionOutcomeScorecardV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_DECISION_OUTCOME_SCORECARD_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_DECISION_OUTCOME_SCORECARD_POLICY_VERSION_V1;
  reportId: string;
  state: CompanyBrainDecisionOutcomeScorecardStateV1;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  sourceSnapshotAt: string | null;
  sourceAgeMs: number | null;
  sourceCoverage: CompanyBrainScorecardCoverageV1;
  sourceRefs: readonly string[];
  verificationReasons: readonly CompanyBrainDecisionOutcomeScorecardReasonV1[];
  metrics: CompanyBrainDecisionOutcomeScorecardMetricsV1 | null;
  causalConclusion: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    outcomeMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    reallocationAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    experimentExecutionAuthorized: false;
    campaignExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  outcomeMutationAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  allocationChangeAuthorized: false as const,
  reallocationAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This scorecard reports canonical DecisionMemory coverage and observed closure only. It does not count recommendations that never became decision records, so it is not the complete system-level learning scorecard requested by the broader Company Brain program.",
  "Decision-cohort action states are the current recorded state of decisions decided in the selected period because DecisionMemoryV1 does not carry a separate action timestamp. They are not claims that the action itself occurred inside the period.",
  "Outcome activity is based only on outcome observations whose recorded observedAt falls inside the selected period. Assessment counts require KNOWN assessment evidence; unsupported, inferred, stale, conflicted, or UNKNOWN assessments stay outside directional counts.",
  "Attribution classes are counted exactly as recorded. Their distribution is not a synthesized causal conclusion, confidence score, forecast, business value, or monetary effect.",
  "A lesson candidate remains governed-review work. Its presence does not promote a policy, pricing rule, negotiation rule, capability, or future recommendation.",
  "Incomplete, conflicted, stale, future-dated, duplicate, malformed, or provenance-free source snapshots fail closed and suppress aggregate metrics instead of manufacturing partial truth."
] as const);

const DECISION_CLASSES: readonly DecisionMemoryClassV1[] = Object.freeze([
  "STRATEGY",
  "ALLOCATION",
  "PRICING",
  "NEGOTIATION",
  "CAMPAIGN",
  "EXPERIMENT",
  "RELATIONSHIP",
  "REVENUE",
  "OPERATIONS",
  "OTHER"
]);

const ACTION_STATES: readonly DecisionActionStateV1[] = Object.freeze([
  "PLANNED",
  "TAKEN",
  "DEFERRED",
  "REJECTED",
  "REVERSED"
]);

const DIRECTIONAL_ASSESSMENTS: readonly Exclude<DecisionOutcomeAssessmentV1, "UNKNOWN">[] =
  Object.freeze(["POSITIVE", "NEUTRAL", "NEGATIVE", "INCONCLUSIVE"]);

const ATTRIBUTION_CLASSES: readonly DecisionAttributionClassV1[] = Object.freeze([
  "CAUSAL",
  "CONTRIBUTORY",
  "CORRELATIONAL",
  "UNKNOWN"
]);

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString();
}

function uniqueStrings(values: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(values) || values.length > maximum) return null;
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) return null;
    normalized.push(value.trim());
  }
  return Object.freeze([...new Set(normalized)].sort((a, b) => a.localeCompare(b)));
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `company-brain-scorecard:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function sourceAuthorityHolds(record: DecisionMemoryRecordV1): boolean {
  return record.actionAuthority?.analysisOnly === true
    && record.actionAuthority.persistenceAuthorized === false
    && record.actionAuthority.externalActionAuthorized === false
    && record.actionAuthority.pricingChangeAuthorized === false
    && record.actionAuthority.negotiationAuthorized === false
    && record.actionAuthority.spendAuthorized === false
    && record.actionAuthority.publishAuthorized === false;
}

function zeroRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function inClosedPeriod(timestamp: string, startMs: number, endMs: number): boolean {
  const millis = Date.parse(timestamp);
  return millis >= startMs && millis <= endMs;
}

function relevantRecord(
  record: DecisionMemoryRecordV1,
  startMs: number,
  endMs: number
): boolean {
  if (inClosedPeriod(record.decidedAt, startMs, endMs)) return true;
  const observedAt = record.outcomeObservation?.observedAt;
  return Boolean(observedAt && inClosedPeriod(observedAt, startMs, endMs));
}

function decisionGradeAssessment(record: DecisionMemoryRecordV1): DecisionOutcomeAssessmentV1 | null {
  const assessment = record.outcomeObservation?.assessment;
  if (
    !assessment
    || assessment.state !== "KNOWN"
    || assessment.value == null
    || assessment.value === "UNKNOWN"
    || assessment.evidenceRefs.length === 0
  ) {
    return null;
  }
  return assessment.value;
}

function actionObservedWithEvidence(record: DecisionMemoryRecordV1): boolean {
  return (record.actionState === "TAKEN" || record.actionState === "REVERSED")
    && record.actionEvidenceRefs.length > 0;
}

function buildMetrics(
  records: readonly DecisionMemoryRecordV1[],
  periodStartMs: number,
  periodEndMs: number
): CompanyBrainDecisionOutcomeScorecardMetricsV1 {
  const decisionCohort = records.filter((record) =>
    inClosedPeriod(record.decidedAt, periodStartMs, periodEndMs)
  );
  const outcomeActivity = records.filter((record) => {
    const observedAt = record.outcomeObservation?.observedAt;
    return Boolean(observedAt && inClosedPeriod(observedAt, periodStartMs, periodEndMs));
  });

  const byClass = zeroRecord(DECISION_CLASSES);
  const actionState = zeroRecord(ACTION_STATES);
  for (const record of decisionCohort) {
    byClass[record.decisionClass] += 1;
    actionState[record.actionState] += 1;
  }

  const assessment = zeroRecord(DIRECTIONAL_ASSESSMENTS);
  const attributionAsRecorded = zeroRecord(ATTRIBUTION_CLASSES);
  let decisionGradeAssessmentCount = 0;
  let unsupportedOrUnknownAssessmentCount = 0;
  let attributionEvidenceMissing = 0;
  let withRecordedConfounders = 0;
  let lessonCandidatesAwaitingGovernedReview = 0;

  for (const record of outcomeActivity) {
    const grade = decisionGradeAssessment(record);
    if (grade) {
      assessment[grade] += 1;
      decisionGradeAssessmentCount += 1;
    } else {
      unsupportedOrUnknownAssessmentCount += 1;
    }

    const observation = record.outcomeObservation;
    if (!observation) continue;
    attributionAsRecorded[observation.attributionClass] += 1;
    if (
      (observation.attributionClass === "CAUSAL" || observation.attributionClass === "CONTRIBUTORY")
      && observation.attributionEvidenceRefs.length === 0
    ) {
      attributionEvidenceMissing += 1;
    }
    if (observation.confounders.length > 0) withRecordedConfounders += 1;
    if (observation.lessonCandidate?.reviewState === "GOVERNED_REVIEW_REQUIRED") {
      lessonCandidatesAwaitingGovernedReview += 1;
    }
  }

  const actionObservedCount = decisionCohort.filter(actionObservedWithEvidence).length;
  const outcomeObservedCount = decisionCohort.filter((record) => record.outcomeObservation !== null).length;
  const decisionGradeOutcomeCount = decisionCohort.filter(
    (record) => decisionGradeAssessment(record) !== null
  ).length;
  const actionAndDecisionGradeOutcomeObserved = decisionCohort.filter(
    (record) => actionObservedWithEvidence(record) && decisionGradeAssessment(record) !== null
  ).length;

  return freezeDeep({
    decisionCohort: {
      semantics: "DECISIONS_DECIDED_IN_PERIOD_CURRENT_RECORDED_STATE",
      total: decisionCohort.length,
      byClass,
      actionState,
      actionObservedWithEvidence: actionObservedCount,
      actionStateWithoutEvidence: decisionCohort.filter(
        (record) =>
          (record.actionState === "TAKEN" || record.actionState === "REVERSED")
          && record.actionEvidenceRefs.length === 0
      ).length,
      withExpectedOutcomePlan: decisionCohort.filter((record) => record.expectedOutcomes.length > 0).length,
      withoutExpectedOutcomePlan: decisionCohort.filter((record) => record.expectedOutcomes.length === 0).length,
      withOutcomeObservationAsOfReport: outcomeObservedCount,
      withDecisionGradeOutcomeAsOfReport: decisionGradeOutcomeCount,
      withIntegrityFlags: decisionCohort.filter((record) => record.integrityFlags.length > 0).length,
      withMaterialUnresolvedAssumptions: decisionCohort.filter((record) =>
        record.assumptions.some((item) => item.material && item.statement.value == null)
      ).length
    },
    outcomeActivity: {
      semantics: "OUTCOME_OBSERVATIONS_RECORDED_IN_PERIOD",
      observedDecisionCount: outcomeActivity.length,
      decisionGradeAssessmentCount,
      unsupportedOrUnknownAssessmentCount,
      assessment,
      attributionAsRecorded,
      attributionEvidenceMissing,
      withRecordedConfounders,
      lessonCandidatesAwaitingGovernedReview
    },
    closure: {
      semantics: "DECISIONS_DECIDED_IN_PERIOD_AS_OF_REPORT_TIME",
      actionObservedWithEvidence: actionObservedCount,
      outcomeObserved: outcomeObservedCount,
      decisionGradeOutcomeObserved: decisionGradeOutcomeCount,
      actionAndDecisionGradeOutcomeObserved,
      causalOutcomeClaims: "NOT_ESTABLISHED"
    }
  });
}

/**
 * Produces a fail-closed, read-only Company Brain scorecard from canonical
 * DecisionMemory records. Aggregates are emitted only when the caller proves
 * complete snapshot coverage, freshness, provenance, unique canonical decision
 * identity, valid chronology, and unchanged analysis-only source authority.
 */
export function compileCompanyBrainDecisionOutcomeScorecardV1(
  input: CompanyBrainDecisionOutcomeScorecardInputV1
): CompanyBrainDecisionOutcomeScorecardV1 {
  const reasons = new Set<CompanyBrainDecisionOutcomeScorecardReasonV1>();
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  const periodStart = canonicalTimestamp(input?.periodStart);
  const periodEnd = canonicalTimestamp(input?.periodEnd);
  const sourceSnapshotAt = canonicalTimestamp(input?.sourceSnapshotAt);
  const sourceRefs = uniqueStrings(input?.sourceRefs) ?? Object.freeze([]);

  if (!generatedAt) reasons.add("INVALID_REPORT_TIME");
  if (!periodStart || !periodEnd || (periodStart && periodEnd && Date.parse(periodStart) > Date.parse(periodEnd))) {
    reasons.add("INVALID_PERIOD");
  }
  if (generatedAt && periodEnd && Date.parse(periodEnd) > Date.parse(generatedAt)) {
    reasons.add("PERIOD_ENDS_AFTER_REPORT_TIME");
  }
  if (input?.sourceCoverage !== "COMPLETE") reasons.add("SOURCE_COVERAGE_NOT_COMPLETE");
  if (sourceRefs.length === 0) reasons.add("SOURCE_PROVENANCE_MISSING");
  if (
    !Number.isFinite(input?.maximumSourceAgeMs)
    || input.maximumSourceAgeMs <= 0
    || input.maximumSourceAgeMs > MAX_SOURCE_AGE_MS
  ) {
    reasons.add("INVALID_SOURCE_FRESHNESS_POLICY");
  }
  if (!sourceSnapshotAt) reasons.add("SOURCE_SNAPSHOT_INVALID");

  let sourceAgeMs: number | null = null;
  if (generatedAt && sourceSnapshotAt) {
    sourceAgeMs = Date.parse(generatedAt) - Date.parse(sourceSnapshotAt);
    if (sourceAgeMs < 0) reasons.add("SOURCE_SNAPSHOT_IN_FUTURE");
    else if (
      Number.isFinite(input.maximumSourceAgeMs)
      && input.maximumSourceAgeMs > 0
      && sourceAgeMs > input.maximumSourceAgeMs
    ) {
      reasons.add("SOURCE_SNAPSHOT_STALE");
    }
  }

  const records = Array.isArray(input?.records) ? input.records : [];
  if (!Array.isArray(input?.records) || records.length > MAX_RECORDS) {
    reasons.add("RECORD_BOUND_EXCEEDED");
  }

  const recordIds = new Set<string>();
  const decisionIds = new Set<string>();
  const reportMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const periodStartMs = periodStart ? Date.parse(periodStart) : Number.NaN;
  const periodEndMs = periodEnd ? Date.parse(periodEnd) : Number.NaN;

  for (const record of records.slice(0, MAX_RECORDS)) {
    if (!record || record.contractVersion !== "DecisionMemoryV1") {
      reasons.add("INVALID_RECORD_CONTRACT");
      continue;
    }
    if (record.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1) {
      reasons.add("INVALID_RECORD_POLICY");
    }
    if (recordIds.has(record.recordId)) reasons.add("DUPLICATE_RECORD_ID");
    recordIds.add(record.recordId);
    if (decisionIds.has(record.decisionId)) reasons.add("DUPLICATE_DECISION_ID");
    decisionIds.add(record.decisionId);
    if (!sourceAuthorityHolds(record)) reasons.add("SOURCE_AUTHORITY_INVARIANT_FAILED");

    const decidedAt = canonicalTimestamp(record.decidedAt);
    const observedAt = record.outcomeObservation
      ? canonicalTimestamp(record.outcomeObservation.observedAt)
      : null;
    if (
      !decidedAt
      || (generatedAt && Date.parse(decidedAt) > reportMs)
      || (record.outcomeObservation !== null
        && (!observedAt
          || Date.parse(observedAt) < Date.parse(decidedAt)
          || (generatedAt && Date.parse(observedAt) > reportMs)))
    ) {
      reasons.add("INVALID_RECORD_CHRONOLOGY");
    }

    if (
      Number.isFinite(periodStartMs)
      && Number.isFinite(periodEndMs)
      && relevantRecord(record, periodStartMs, periodEndMs)
      && record.sourceRefs.length === 0
    ) {
      reasons.add("RELEVANT_RECORD_PROVENANCE_MISSING");
    }
  }

  const verificationReasons = Object.freeze(
    [...reasons].sort((a, b) => a.localeCompare(b))
  ) as readonly CompanyBrainDecisionOutcomeScorecardReasonV1[];
  const state: CompanyBrainDecisionOutcomeScorecardStateV1 =
    verificationReasons.length === 0 ? "READY" : "VERIFY_SOURCE";

  const metrics = state === "READY" && periodStart && periodEnd
    ? buildMetrics(records, Date.parse(periodStart), Date.parse(periodEnd))
    : null;

  const reportId = stableId([
    COMPANY_BRAIN_DECISION_OUTCOME_SCORECARD_POLICY_VERSION_V1,
    generatedAt ?? String(input?.generatedAt ?? "invalid-generated-at"),
    periodStart ?? String(input?.periodStart ?? "invalid-period-start"),
    periodEnd ?? String(input?.periodEnd ?? "invalid-period-end"),
    sourceSnapshotAt ?? String(input?.sourceSnapshotAt ?? "invalid-source-snapshot"),
    input?.sourceCoverage ?? "UNKNOWN",
    ...sourceRefs,
    ...records.slice(0, MAX_RECORDS).map((record) => record?.recordId ?? "invalid-record")
  ]);

  return freezeDeep({
    contractVersion: COMPANY_BRAIN_DECISION_OUTCOME_SCORECARD_VERSION_V1,
    policyVersion: COMPANY_BRAIN_DECISION_OUTCOME_SCORECARD_POLICY_VERSION_V1,
    reportId,
    state,
    generatedAt: generatedAt ?? String(input?.generatedAt ?? "INVALID"),
    periodStart: periodStart ?? String(input?.periodStart ?? "INVALID"),
    periodEnd: periodEnd ?? String(input?.periodEnd ?? "INVALID"),
    sourceSnapshotAt,
    sourceAgeMs,
    sourceCoverage: input?.sourceCoverage ?? "UNKNOWN",
    sourceRefs,
    verificationReasons,
    metrics,
    causalConclusion: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
