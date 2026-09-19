import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionAttributionClassV1,
  type DecisionExpectedRangeV1,
  type DecisionMemoryClassV1,
  type DecisionMemoryRecordV1
} from "./decision-memory-v1";
import {
  compileDecisionMemoryBriefV1,
  type DecisionMemoryBriefV1
} from "./decision-memory-brief-v1";

export const COMPANY_BRAIN_OUTCOME_CALIBRATION_REVIEW_VERSION_V1 =
  "CompanyBrainOutcomeCalibrationReviewV1" as const;
export const COMPANY_BRAIN_OUTCOME_CALIBRATION_REVIEW_POLICY_VERSION_V1 =
  "company_brain_outcome_calibration_review_v1.0.0" as const;

const MAX_RECORDS = 1_000;
const MAX_OUTCOMES = 5_000;
const MAX_REFS = 5_000;

export type CompanyBrainCalibrationRelationV1 =
  | "WITHIN_EXPECTED_RANGE"
  | "OVERLAPS_EXPECTED_RANGE"
  | "BELOW_EXPECTED_RANGE"
  | "ABOVE_EXPECTED_RANGE"
  | "NOT_COMPARABLE";

export type CompanyBrainCalibrationLaneV1 =
  | "REVIEW_CALIBRATION"
  | "WAIT_FOR_WINDOW_END"
  | "WAIT_FOR_RECORDED_OUTCOME"
  | "VERIFY_CALIBRATION_EVIDENCE";

export type CompanyBrainCalibrationReasonV1 =
  | "CALIBRATION_WINDOW_COMPLETE"
  | "CALIBRATION_WINDOW_STILL_OPEN"
  | "NO_RECORDED_OUTCOME_OBSERVATION"
  | "EXPECTED_OUTCOME_NOT_OBSERVED"
  | "EXPECTED_RANGE_NOT_DECISION_GRADE"
  | "OBSERVED_RANGE_NOT_DECISION_GRADE"
  | "METRIC_REF_MISMATCH"
  | "RANGE_UNIT_MISMATCH";

export type CompanyBrainOutcomeCalibrationItemV1 = Readonly<{
  itemId: string;
  sourceRecordId: string;
  decisionId: string;
  decisionClass: DecisionMemoryClassV1;
  outcomeId: string;
  metricRef: string | null;
  evaluationWindowEndsAt: string | null;
  observedAt: string | null;
  lane: CompanyBrainCalibrationLaneV1;
  reasonCodes: readonly CompanyBrainCalibrationReasonV1[];
  relation: CompanyBrainCalibrationRelationV1;
  expectedRange: DecisionExpectedRangeV1 | null;
  observedRange: DecisionExpectedRangeV1 | null;
  recordedAttributionClass: DecisionAttributionClassV1;
  confounderCount: number;
  expectedEvidenceRefs: readonly string[];
  observedEvidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  successOrFailure: null;
}>;

export type CompanyBrainCalibrationSourceHealthV1 = Readonly<{
  sourceRecordId: string | null;
  decisionId: string | null;
  accepted: boolean;
  briefState: DecisionMemoryBriefV1["state"] | null;
  verificationReasons: readonly string[];
}>;

export type CompanyBrainOutcomeCalibrationReviewV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_OUTCOME_CALIBRATION_REVIEW_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_OUTCOME_CALIBRATION_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  state: "READY" | "VERIFY_SOURCE";
  generatedAt: string;
  sourceHealth: readonly CompanyBrainCalibrationSourceHealthV1[];
  verificationReasons: readonly string[];
  calibrationReady: readonly CompanyBrainOutcomeCalibrationItemV1[];
  waitingWindow: readonly CompanyBrainOutcomeCalibrationItemV1[];
  waitingOutcome: readonly CompanyBrainOutcomeCalibrationItemV1[];
  verificationRequired: readonly CompanyBrainOutcomeCalibrationItemV1[];
  summary: Readonly<{
    suppliedRecords: number;
    acceptedRecords: number;
    rejectedRecords: number;
    expectedOutcomes: number;
    calibrationReady: number;
    waitingWindow: number;
    waitingOutcome: number;
    verificationRequired: number;
    withinExpectedRange: number;
    overlapsExpectedRange: number;
    belowExpectedRange: number;
    aboveExpectedRange: number;
    pricingCalibrationReady: number;
    negotiationCalibrationReady: number;
  }>;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  sourceDecisionIds: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    calibrationPolicyMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainOutcomeCalibrationReviewInputV1 = Readonly<{
  records: readonly DecisionMemoryRecordV1[];
  generatedAt: string;
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
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  calibrationPolicyMutationAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This review compares recorded expected and observed numeric ranges only; it does not create or mutate Decision Memory, measurement, learning, or calibration policy truth.",
  "Range position is forecast-calibration evidence, not a success/failure judgment and not evidence that the recorded action caused the observation.",
  "Attribution class and confounder count are carried exactly from Decision Memory and are never converted into confidence, causality, or monetary value.",
  "An early observation cannot become calibration-ready before its recorded evaluation window ends. This prevents partial-window peeking from being treated as completed learning.",
  "Missing, unsupported, metric-mismatched, or unit-mismatched ranges remain waiting or verification work; UNKNOWN is never converted to zero.",
  "No learning promotion, policy mutation, reallocation, pricing change, negotiation action, campaign/experiment execution, external action, or approval bypass is authorized."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString() === normalized ? normalized : null;
}

function uniqueStrings(values: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(values) || values.length > maximum) return null;
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
  return `company-brain-calibration:${createHash("sha256")
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

function rangeIsDecisionGrade(
  bound: DecisionMemoryRecordV1["expectedOutcomes"][number]["expectedRange"]
  | DecisionMemoryRecordV1["outcomeObservation"]["outcomes"][number]["observedRange"]
  | null
  | undefined
): bound is NonNullable<typeof bound> & { value: DecisionExpectedRangeV1 } {
  return Boolean(
    bound
    && bound.state === "KNOWN"
    && bound.value
    && Number.isFinite(bound.value.min)
    && Number.isFinite(bound.value.max)
    && bound.value.max >= bound.value.min
    && text(bound.value.unit)
    && Array.isArray(bound.evidenceRefs)
    && bound.evidenceRefs.length > 0
    && uniqueStrings(bound.evidenceRefs)
  );
}

function relation(
  expected: DecisionExpectedRangeV1,
  observed: DecisionExpectedRangeV1
): CompanyBrainCalibrationRelationV1 {
  if (observed.max < expected.min) return "BELOW_EXPECTED_RANGE";
  if (observed.min > expected.max) return "ABOVE_EXPECTED_RANGE";
  if (observed.min >= expected.min && observed.max <= expected.max) {
    return "WITHIN_EXPECTED_RANGE";
  }
  return "OVERLAPS_EXPECTED_RANGE";
}

function validateRecord(
  record: DecisionMemoryRecordV1,
  generatedAt: string
): {
  accepted: boolean;
  sourceRecordId: string | null;
  decisionId: string | null;
  brief: DecisionMemoryBriefV1 | null;
  reasons: readonly string[];
} {
  const reasons = new Set<string>();
  const sourceRecordId = text(record?.recordId);
  const decisionId = text(record?.decisionId);

  if (record?.contractVersion !== "DecisionMemoryV1") reasons.add("CONTRACT_INVALID");
  if (record?.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1) reasons.add("POLICY_INVALID");
  if (!sourceRecordId) reasons.add("RECORD_ID_INVALID");
  if (!decisionId) reasons.add("DECISION_ID_INVALID");
  if (!canonicalTimestamp(record?.decidedAt)) reasons.add("DECIDED_AT_INVALID");
  if (!exactAuthority(record?.actionAuthority)) reasons.add("AUTHORITY_WIDENED");
  if (!Array.isArray(record?.expectedOutcomes) || record.expectedOutcomes.length > MAX_OUTCOMES) {
    reasons.add("EXPECTED_OUTCOMES_INVALID");
  }
  if (!uniqueStrings(record?.sourceRefs)) reasons.add("SOURCE_REFS_INVALID");

  let brief: DecisionMemoryBriefV1 | null = null;
  if (reasons.size === 0) {
    try {
      brief = compileDecisionMemoryBriefV1({ record, generatedAt });
    } catch {
      reasons.add("DECISION_BRIEF_COMPILATION_FAILED");
    }
  }
  if (brief?.state === "VERIFY_INTEGRITY" || brief?.state === "VERIFY_LINEAGE") {
    reasons.add(`DECISION_BRIEF_${brief.state}`);
  }

  const expectedIds = Array.isArray(record?.expectedOutcomes)
    ? record.expectedOutcomes.map((outcome) => text(outcome.outcomeId))
    : [];
  if (expectedIds.some((value) => value == null)) reasons.add("EXPECTED_OUTCOME_ID_INVALID");
  if (new Set(expectedIds).size !== expectedIds.length) reasons.add("DUPLICATE_EXPECTED_OUTCOME_ID");

  if (record?.outcomeObservation) {
    if (!canonicalTimestamp(record.outcomeObservation.observedAt)) reasons.add("OBSERVED_AT_INVALID");
    if (!Array.isArray(record.outcomeObservation.outcomes) || record.outcomeObservation.outcomes.length > MAX_OUTCOMES) {
      reasons.add("OBSERVED_OUTCOMES_INVALID");
    } else {
      const observedIds = record.outcomeObservation.outcomes.map((outcome) => text(outcome.outcomeId));
      if (observedIds.some((value) => value == null)) reasons.add("OBSERVED_OUTCOME_ID_INVALID");
      if (new Set(observedIds).size !== observedIds.length) reasons.add("DUPLICATE_OBSERVED_OUTCOME_ID");
    }
    if (!uniqueStrings(record.outcomeObservation.sourceRefs)) reasons.add("OUTCOME_SOURCE_REFS_INVALID");
  }

  return {
    accepted: reasons.size === 0 && brief != null,
    sourceRecordId,
    decisionId,
    brief,
    reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)))
  };
}

function itemForExpectedOutcome(args: {
  record: DecisionMemoryRecordV1;
  expected: DecisionMemoryRecordV1["expectedOutcomes"][number];
  generatedAt: string;
}): CompanyBrainOutcomeCalibrationItemV1 {
  const { record, expected, generatedAt } = args;
  const observation = record.outcomeObservation;
  const observed = observation?.outcomes.find((candidate) => candidate.outcomeId === expected.outcomeId);
  const reasons: CompanyBrainCalibrationReasonV1[] = [];
  let lane: CompanyBrainCalibrationLaneV1;
  let calibrationRelation: CompanyBrainCalibrationRelationV1 = "NOT_COMPARABLE";

  const expectedGrade = rangeIsDecisionGrade(expected.expectedRange);
  const observedGrade = rangeIsDecisionGrade(observed?.observedRange);
  const expectedRange = expectedGrade ? { ...expected.expectedRange.value } : null;
  const observedRange = observedGrade ? { ...observed.observedRange.value } : null;
  const expectedRefs = expectedGrade
    ? Object.freeze([...(uniqueStrings(expected.expectedRange.evidenceRefs) ?? [])])
    : Object.freeze([] as string[]);
  const observedRefs = observedGrade
    ? Object.freeze([...(uniqueStrings(observed.observedRange.evidenceRefs) ?? [])])
    : Object.freeze([] as string[]);

  if (!observation) {
    lane = "WAIT_FOR_RECORDED_OUTCOME";
    reasons.push("NO_RECORDED_OUTCOME_OBSERVATION");
  } else if (!observed) {
    lane = "WAIT_FOR_RECORDED_OUTCOME";
    reasons.push("EXPECTED_OUTCOME_NOT_OBSERVED");
  } else if (!expectedGrade || !observedGrade) {
    lane = "VERIFY_CALIBRATION_EVIDENCE";
    if (!expectedGrade) reasons.push("EXPECTED_RANGE_NOT_DECISION_GRADE");
    if (!observedGrade) reasons.push("OBSERVED_RANGE_NOT_DECISION_GRADE");
  } else if ((expected.metricRef ?? null) !== (observed.metricRef ?? null)) {
    lane = "VERIFY_CALIBRATION_EVIDENCE";
    reasons.push("METRIC_REF_MISMATCH");
  } else if (expected.expectedRange.value.unit.trim() !== observed.observedRange.value.unit.trim()) {
    lane = "VERIFY_CALIBRATION_EVIDENCE";
    reasons.push("RANGE_UNIT_MISMATCH");
  } else {
    calibrationRelation = relation(expected.expectedRange.value, observed.observedRange.value);
    const windowEnd = expected.evaluationWindowEndsAt;
    const windowOpen = windowEnd != null && Date.parse(windowEnd) > Date.parse(generatedAt);
    lane = windowOpen ? "WAIT_FOR_WINDOW_END" : "REVIEW_CALIBRATION";
    reasons.push(windowOpen ? "CALIBRATION_WINDOW_STILL_OPEN" : "CALIBRATION_WINDOW_COMPLETE");
  }

  const sourceRefs = Object.freeze([
    ...new Set([
      ...record.sourceRefs,
      ...(observation?.sourceRefs ?? [])
    ])
  ].sort((a, b) => a.localeCompare(b)));

  return deepFreeze({
    itemId: stableId([
      record.recordId,
      record.decisionId,
      expected.outcomeId,
      lane,
      calibrationRelation
    ]),
    sourceRecordId: record.recordId,
    decisionId: record.decisionId,
    decisionClass: record.decisionClass,
    outcomeId: expected.outcomeId,
    metricRef: expected.metricRef,
    evaluationWindowEndsAt: expected.evaluationWindowEndsAt,
    observedAt: observation?.observedAt ?? null,
    lane,
    reasonCodes: Object.freeze([...new Set(reasons)].sort((a, b) => a.localeCompare(b))),
    relation: calibrationRelation,
    expectedRange,
    observedRange,
    recordedAttributionClass: observation?.attributionClass ?? "UNKNOWN",
    confounderCount: observation?.confounders.length ?? 0,
    expectedEvidenceRefs: expectedRefs,
    observedEvidenceRefs: observedRefs,
    sourceRefs,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    successOrFailure: null
  }) as CompanyBrainOutcomeCalibrationItemV1;
}

function sortItems(
  items: readonly CompanyBrainOutcomeCalibrationItemV1[]
): readonly CompanyBrainOutcomeCalibrationItemV1[] {
  return Object.freeze([...items].sort((a, b) => {
    const decision = a.decisionId.localeCompare(b.decisionId);
    if (decision !== 0) return decision;
    return a.outcomeId.localeCompare(b.outcomeId);
  }));
}

/**
 * Reviews recorded forecast ranges against observed ranges without converting
 * calibration evidence into causal, success/failure, confidence, or action truth.
 */
export function compileCompanyBrainOutcomeCalibrationReviewV1(
  input: CompanyBrainOutcomeCalibrationReviewInputV1
): CompanyBrainOutcomeCalibrationReviewV1 {
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("COMPANY_BRAIN_CALIBRATION_INVALID_GENERATED_AT");
  if (!Array.isArray(input?.records) || input.records.length > MAX_RECORDS) {
    throw new Error("COMPANY_BRAIN_CALIBRATION_RECORD_BOUNDS_EXCEEDED");
  }

  const sourceHealth: CompanyBrainCalibrationSourceHealthV1[] = [];
  const verificationReasons = new Set<string>();
  const acceptedRecords: DecisionMemoryRecordV1[] = [];
  const seenRecordIds = new Set<string>();
  const seenDecisionIds = new Set<string>();

  input.records.forEach((record) => {
    const health = validateRecord(record, generatedAt);
    const reasons = new Set(health.reasons);
    if (health.sourceRecordId && seenRecordIds.has(health.sourceRecordId)) reasons.add("DUPLICATE_SOURCE_RECORD_ID");
    if (health.decisionId && seenDecisionIds.has(health.decisionId)) reasons.add("DUPLICATE_DECISION_ID");
    if (health.sourceRecordId) seenRecordIds.add(health.sourceRecordId);
    if (health.decisionId) seenDecisionIds.add(health.decisionId);

    const accepted = health.accepted && reasons.size === 0;
    if (accepted) acceptedRecords.push(record);
    for (const reason of reasons) {
      verificationReasons.add(`${health.decisionId ?? health.sourceRecordId ?? "unknown-source"}:${reason}`);
    }
    sourceHealth.push(Object.freeze({
      sourceRecordId: health.sourceRecordId,
      decisionId: health.decisionId,
      accepted,
      briefState: health.brief?.state ?? null,
      verificationReasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)))
    }));
  });

  const items = acceptedRecords.flatMap((record) =>
    record.expectedOutcomes.map((expected) => itemForExpectedOutcome({ record, expected, generatedAt }))
  );
  if (items.length > MAX_OUTCOMES) verificationReasons.add("CALIBRATION_ITEM_BOUNDS_EXCEEDED");

  const calibrationReady = sortItems(items.filter((item) => item.lane === "REVIEW_CALIBRATION"));
  const waitingWindow = sortItems(items.filter((item) => item.lane === "WAIT_FOR_WINDOW_END"));
  const waitingOutcome = sortItems(items.filter((item) => item.lane === "WAIT_FOR_RECORDED_OUTCOME"));
  const verificationRequired = sortItems(items.filter((item) => item.lane === "VERIFY_CALIBRATION_EVIDENCE"));
  const allItems = [...calibrationReady, ...waitingWindow, ...waitingOutcome, ...verificationRequired];

  const orderedSourceHealth = Object.freeze([...sourceHealth].sort((a, b) => {
    const left = a.decisionId ?? a.sourceRecordId ?? "";
    const right = b.decisionId ?? b.sourceRecordId ?? "";
    return left.localeCompare(right) || (a.sourceRecordId ?? "").localeCompare(b.sourceRecordId ?? "");
  }));
  const evidenceRefs = Object.freeze([
    ...new Set(allItems.flatMap((item) => [
      ...item.expectedEvidenceRefs,
      ...item.observedEvidenceRefs
    ]))
  ].sort((a, b) => a.localeCompare(b)));
  const sourceRefs = Object.freeze([
    ...new Set(allItems.flatMap((item) => item.sourceRefs))
  ].sort((a, b) => a.localeCompare(b)));
  const sourceDecisionIds = Object.freeze([
    ...new Set(acceptedRecords.map((record) => record.decisionId))
  ].sort((a, b) => a.localeCompare(b)));
  const orderedVerificationReasons = Object.freeze(
    [...verificationReasons].sort((a, b) => a.localeCompare(b))
  );

  const output: CompanyBrainOutcomeCalibrationReviewV1 = {
    contractVersion: COMPANY_BRAIN_OUTCOME_CALIBRATION_REVIEW_VERSION_V1,
    policyVersion: COMPANY_BRAIN_OUTCOME_CALIBRATION_REVIEW_POLICY_VERSION_V1,
    reviewId: stableId([
      generatedAt,
      ...orderedSourceHealth.map((health) =>
        `${health.sourceRecordId ?? "missing"}:${health.accepted ? "accepted" : "rejected"}`
      ),
      ...allItems.map((item) => item.itemId).sort((a, b) => a.localeCompare(b)),
      ...orderedVerificationReasons
    ]),
    state: orderedVerificationReasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    generatedAt,
    sourceHealth: orderedSourceHealth,
    verificationReasons: orderedVerificationReasons,
    calibrationReady,
    waitingWindow,
    waitingOutcome,
    verificationRequired,
    summary: Object.freeze({
      suppliedRecords: input.records.length,
      acceptedRecords: orderedSourceHealth.filter((health) => health.accepted).length,
      rejectedRecords: orderedSourceHealth.filter((health) => !health.accepted).length,
      expectedOutcomes: allItems.length,
      calibrationReady: calibrationReady.length,
      waitingWindow: waitingWindow.length,
      waitingOutcome: waitingOutcome.length,
      verificationRequired: verificationRequired.length,
      withinExpectedRange: calibrationReady.filter((item) => item.relation === "WITHIN_EXPECTED_RANGE").length,
      overlapsExpectedRange: calibrationReady.filter((item) => item.relation === "OVERLAPS_EXPECTED_RANGE").length,
      belowExpectedRange: calibrationReady.filter((item) => item.relation === "BELOW_EXPECTED_RANGE").length,
      aboveExpectedRange: calibrationReady.filter((item) => item.relation === "ABOVE_EXPECTED_RANGE").length,
      pricingCalibrationReady: calibrationReady.filter((item) => item.decisionClass === "PRICING").length,
      negotiationCalibrationReady: calibrationReady.filter((item) => item.decisionClass === "NEGOTIATION").length
    }),
    evidenceRefs,
    sourceRefs,
    sourceDecisionIds,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  };

  return deepFreeze(output) as CompanyBrainOutcomeCalibrationReviewV1;
}
