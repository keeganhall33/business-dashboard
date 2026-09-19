import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionAttributionClassV1,
  type DecisionMemoryClassV1,
  type DecisionMemoryRecordV1,
  type DecisionExpectedRangeV1
} from "./decision-memory-v1";

export const DECISION_OUTCOME_CALIBRATION_CONTRACT_VERSION_V1 =
  "DecisionOutcomeCalibrationReviewV1" as const;
export const DECISION_OUTCOME_CALIBRATION_POLICY_VERSION_V1 =
  "decision_outcome_calibration_review_v1.0.0" as const;

const MAX_TARGETS = 100;

export type DecisionOutcomeRangeComparisonV1 =
  | "BELOW_EXPECTED_RANGE"
  | "OVERLAPS_EXPECTED_RANGE"
  | "ABOVE_EXPECTED_RANGE";

export type DecisionOutcomeCalibrationTargetV1 = {
  record: DecisionMemoryRecordV1;
  outcomeId: string;
};

export type DecisionOutcomeCalibrationComparisonV1 = {
  decisionId: string;
  recordId: string;
  decisionClass: DecisionMemoryClassV1;
  outcomeId: string;
  metricRef: string;
  unit: string;
  expectedRange: DecisionExpectedRangeV1;
  observedRange: DecisionExpectedRangeV1;
  comparison: DecisionOutcomeRangeComparisonV1;
  observedAt: string;
  attributionClass: DecisionAttributionClassV1;
  confounderIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalLearningAllowed: false;
};

export type DecisionOutcomeCalibrationBlockV1 = {
  decisionId: string;
  recordId: string;
  outcomeId: string;
  disposition: "WAIT" | "VERIFY";
  reasons: readonly string[];
};

export type DecisionOutcomeCalibrationSignalV1 = {
  decisionClass: DecisionMemoryClassV1;
  metricRef: string;
  unit: string;
  distinctDecisionCount: number;
  signal:
    | "REPEATED_BELOW_RANGE"
    | "REPEATED_OVERLAP"
    | "REPEATED_ABOVE_RANGE"
    | "MIXED_DIRECTION";
  decisionIds: readonly string[];
  causalClaimAllowed: false;
  confidenceInferred: false;
  policyPromotionAuthorized: false;
};

export type DecisionOutcomeCalibrationReviewV1 = {
  contractVersion: typeof DECISION_OUTCOME_CALIBRATION_CONTRACT_VERSION_V1;
  policyVersion: typeof DECISION_OUTCOME_CALIBRATION_POLICY_VERSION_V1;
  reviewId: string;
  generatedAt: string;
  status: "READY" | "WAITING_FOR_OUTCOMES" | "VERIFY_SOURCE";
  comparisons: readonly DecisionOutcomeCalibrationComparisonV1[];
  blocked: readonly DecisionOutcomeCalibrationBlockV1[];
  summary: null | {
    targetsReviewed: number;
    belowExpectedRange: number;
    overlappingExpectedRange: number;
    aboveExpectedRange: number;
  };
  recurringSignals: readonly DecisionOutcomeCalibrationSignalV1[];
  authority: {
    mutateDecisionMemory: false;
    mutateConfidence: false;
    inferCausality: false;
    inferMonetaryValue: false;
    changeAllocation: false;
    changePrice: false;
    changeSpend: false;
    promotePolicy: false;
    externalAction: false;
    approvalBypass: false;
  };
};

export class DecisionOutcomeCalibrationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionOutcomeCalibrationError";
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionOutcomeCalibrationError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = text(value, label);
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) {
    throw new DecisionOutcomeCalibrationError(
      "INVALID_TIMESTAMP",
      `${label} must be a canonical ISO timestamp`
    );
  }
  return normalized;
}

function refs(values: readonly string[], label: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || values.length > 100 || (!allowEmpty && values.length === 0)) {
    throw new DecisionOutcomeCalibrationError(
      "INVALID_REFS",
      `${label} must be ${allowEmpty ? "a bounded" : "a non-empty bounded"} list`
    );
  }
  const normalized = values.map((value) => text(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new DecisionOutcomeCalibrationError("DUPLICATE_REF", `${label} contains duplicates`);
  }
  return normalized.slice().sort((a, b) => a.localeCompare(b));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function compareRanges(
  expected: DecisionExpectedRangeV1,
  observed: DecisionExpectedRangeV1
): DecisionOutcomeRangeComparisonV1 {
  if (observed.max < expected.min) return "BELOW_EXPECTED_RANGE";
  if (observed.min > expected.max) return "ABOVE_EXPECTED_RANGE";
  return "OVERLAPS_EXPECTED_RANGE";
}

function compareTarget(
  target: DecisionOutcomeCalibrationTargetV1,
  generatedAt: string
): { comparison: DecisionOutcomeCalibrationComparisonV1 | null; block: DecisionOutcomeCalibrationBlockV1 | null } {
  const record = target.record;
  if (!record || record.contractVersion !== "DecisionMemoryV1") {
    throw new DecisionOutcomeCalibrationError("INVALID_RECORD", "target record must be DecisionMemoryV1");
  }
  const outcomeId = text(target.outcomeId, `${record.decisionId}.outcomeId`);
  const reasons = new Set<string>();
  const waitReasons = new Set<string>();

  if (record.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1) reasons.add("DECISION_MEMORY_POLICY_MISMATCH");
  if (record.sourceRefs.length === 0) reasons.add("DECISION_SOURCE_PROVENANCE_REQUIRED");
  if (record.actionState !== "TAKEN" && record.actionState !== "REVERSED") {
    waitReasons.add("ACTION_NOT_EXECUTED");
  } else if (record.actionEvidenceRefs.length === 0) {
    reasons.add("ACTION_EVIDENCE_REQUIRED");
  }

  const expectedMatches = record.expectedOutcomes.filter((outcome) => outcome.outcomeId === outcomeId);
  if (expectedMatches.length !== 1) {
    reasons.add(expectedMatches.length === 0 ? "EXPECTED_OUTCOME_MISSING" : "EXPECTED_OUTCOME_DUPLICATED");
  }
  const expected = expectedMatches[0] ?? null;

  const observation = record.outcomeObservation;
  if (!observation) {
    waitReasons.add("OUTCOME_OBSERVATION_MISSING");
  } else {
    const observedAt = timestamp(observation.observedAt, `${record.decisionId}.outcomeObservation.observedAt`);
    if (Date.parse(observedAt) > Date.parse(generatedAt)) reasons.add("OUTCOME_OBSERVATION_FROM_FUTURE");
    if (observation.sourceRefs.length === 0) reasons.add("OUTCOME_SOURCE_PROVENANCE_REQUIRED");
  }

  const observedMatches = observation?.outcomes.filter((outcome) => outcome.outcomeId === outcomeId) ?? [];
  if (observation && observedMatches.length !== 1) {
    if (observedMatches.length === 0) waitReasons.add("TARGET_OUTCOME_NOT_MEASURED");
    else reasons.add("OBSERVED_OUTCOME_DUPLICATED");
  }
  const observed = observedMatches[0] ?? null;

  if (expected) {
    if (expected.expectedRange.state !== "KNOWN" || expected.expectedRange.value == null) {
      reasons.add(`EXPECTED_RANGE_${expected.expectedRange.state}`);
    } else if (expected.expectedRange.evidenceRefs.length === 0) {
      reasons.add("EXPECTED_RANGE_EVIDENCE_REQUIRED");
    }
    if (!expected.metricRef) reasons.add("EXPECTED_METRIC_IDENTITY_REQUIRED");
    if (!expected.evaluationWindowEndsAt) {
      reasons.add("EVALUATION_WINDOW_END_REQUIRED");
    } else if (observation && Date.parse(observation.observedAt) < Date.parse(expected.evaluationWindowEndsAt)) {
      waitReasons.add("EVALUATION_WINDOW_NOT_MATURE");
    }
  }

  if (observed) {
    if (observed.observedRange.state !== "KNOWN" || observed.observedRange.value == null) {
      reasons.add(`OBSERVED_RANGE_${observed.observedRange.state}`);
    } else if (observed.observedRange.evidenceRefs.length === 0) {
      reasons.add("OBSERVED_RANGE_EVIDENCE_REQUIRED");
    }
    if (!observed.metricRef) reasons.add("OBSERVED_METRIC_IDENTITY_REQUIRED");
  }

  if (expected?.metricRef && observed?.metricRef && expected.metricRef !== observed.metricRef) {
    reasons.add("METRIC_IDENTITY_MISMATCH");
  }
  if (
    expected?.expectedRange.value &&
    observed?.observedRange.value &&
    expected.expectedRange.value.unit !== observed.observedRange.value.unit
  ) {
    reasons.add("UNIT_MISMATCH");
  }

  const decisionId = text(record.decisionId, "record.decisionId");
  const recordId = text(record.recordId, `${decisionId}.recordId`);

  if (reasons.size > 0 || waitReasons.size > 0 || !expected || !observed || !observation) {
    return {
      comparison: null,
      block: {
        decisionId,
        recordId,
        outcomeId,
        disposition: reasons.size > 0 ? "VERIFY" : "WAIT",
        reasons: [...reasons, ...waitReasons].sort((a, b) => a.localeCompare(b))
      }
    };
  }

  const expectedRange = expected.expectedRange.value!;
  const observedRange = observed.observedRange.value!;
  const metricRef = expected.metricRef!;
  const evidenceRefs = refs(
    [...expected.expectedRange.evidenceRefs, ...observed.observedRange.evidenceRefs],
    `${decisionId}.${outcomeId}.calibrationEvidence`
  );
  const sourceRefs = refs(
    [...new Set([...record.sourceRefs, ...observation.sourceRefs])],
    `${decisionId}.${outcomeId}.sourceRefs`
  );

  return {
    comparison: {
      decisionId,
      recordId,
      decisionClass: record.decisionClass,
      outcomeId,
      metricRef,
      unit: expectedRange.unit,
      expectedRange: structuredClone(expectedRange),
      observedRange: structuredClone(observedRange),
      comparison: compareRanges(expectedRange, observedRange),
      observedAt: observation.observedAt,
      attributionClass: observation.attributionClass,
      confounderIds: observation.confounders.map((confounder) => confounder.confounderId).sort((a, b) => a.localeCompare(b)),
      evidenceRefs,
      sourceRefs,
      causalLearningAllowed: false
    },
    block: null
  };
}

function recurringSignals(
  comparisons: readonly DecisionOutcomeCalibrationComparisonV1[],
  minimumDistinctDecisions: number
): DecisionOutcomeCalibrationSignalV1[] {
  const groups = new Map<string, DecisionOutcomeCalibrationComparisonV1[]>();
  for (const comparison of comparisons) {
    const key = `${comparison.decisionClass}\u0000${comparison.metricRef}\u0000${comparison.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), comparison]);
  }

  const signals: DecisionOutcomeCalibrationSignalV1[] = [];
  for (const group of groups.values()) {
    const decisionIds = [...new Set(group.map((comparison) => comparison.decisionId))].sort((a, b) => a.localeCompare(b));
    if (decisionIds.length < minimumDistinctDecisions) continue;

    const directionsByDecision = new Map<string, Set<DecisionOutcomeRangeComparisonV1>>();
    for (const comparison of group) {
      const directions = directionsByDecision.get(comparison.decisionId) ?? new Set<DecisionOutcomeRangeComparisonV1>();
      directions.add(comparison.comparison);
      directionsByDecision.set(comparison.decisionId, directions);
    }
    const directionSet = new Set<DecisionOutcomeRangeComparisonV1>();
    let mixedWithinDecision = false;
    for (const directions of directionsByDecision.values()) {
      if (directions.size !== 1) mixedWithinDecision = true;
      for (const direction of directions) directionSet.add(direction);
    }

    let signal: DecisionOutcomeCalibrationSignalV1["signal"] = "MIXED_DIRECTION";
    if (!mixedWithinDecision && directionSet.size === 1) {
      const onlyDirection = [...directionSet][0]!;
      signal = onlyDirection === "BELOW_EXPECTED_RANGE"
        ? "REPEATED_BELOW_RANGE"
        : onlyDirection === "ABOVE_EXPECTED_RANGE"
          ? "REPEATED_ABOVE_RANGE"
          : "REPEATED_OVERLAP";
    }

    const first = group[0]!;
    signals.push({
      decisionClass: first.decisionClass,
      metricRef: first.metricRef,
      unit: first.unit,
      distinctDecisionCount: decisionIds.length,
      signal,
      decisionIds,
      causalClaimAllowed: false,
      confidenceInferred: false,
      policyPromotionAuthorized: false
    });
  }

  return signals.sort((a, b) =>
    `${a.decisionClass}:${a.metricRef}:${a.unit}`.localeCompare(`${b.decisionClass}:${b.metricRef}:${b.unit}`)
  );
}

export function reviewDecisionOutcomeCalibrationV1(input: {
  targets: readonly DecisionOutcomeCalibrationTargetV1[];
  generatedAt: string;
  minimumDistinctDecisions: number;
}): Readonly<DecisionOutcomeCalibrationReviewV1> {
  if (!Array.isArray(input.targets) || input.targets.length > MAX_TARGETS) {
    throw new DecisionOutcomeCalibrationError("TARGET_BOUND", `at most ${MAX_TARGETS} targets may be reviewed`);
  }
  if (
    !Number.isInteger(input.minimumDistinctDecisions) ||
    input.minimumDistinctDecisions < 2 ||
    input.minimumDistinctDecisions > 20
  ) {
    throw new DecisionOutcomeCalibrationError(
      "INVALID_RECURRENCE_THRESHOLD",
      "minimumDistinctDecisions must be an integer between 2 and 20"
    );
  }
  const generatedAt = timestamp(input.generatedAt, "generatedAt");
  const seen = new Set<string>();
  const comparisons: DecisionOutcomeCalibrationComparisonV1[] = [];
  const blocked: DecisionOutcomeCalibrationBlockV1[] = [];

  for (const target of structuredClone(input.targets) as DecisionOutcomeCalibrationTargetV1[]) {
    const recordId = text(target.record?.recordId, "target.record.recordId");
    const outcomeId = text(target.outcomeId, `${recordId}.outcomeId`);
    const identity = `${recordId}\u0000${outcomeId}`;
    if (seen.has(identity)) {
      throw new DecisionOutcomeCalibrationError("DUPLICATE_TARGET", `duplicate calibration target ${recordId}/${outcomeId}`);
    }
    seen.add(identity);
    const reviewed = compareTarget({ record: target.record, outcomeId }, generatedAt);
    if (reviewed.comparison) comparisons.push(reviewed.comparison);
    if (reviewed.block) blocked.push(reviewed.block);
  }

  comparisons.sort((a, b) => `${a.decisionId}:${a.outcomeId}`.localeCompare(`${b.decisionId}:${b.outcomeId}`));
  blocked.sort((a, b) => `${a.decisionId}:${a.outcomeId}`.localeCompare(`${b.decisionId}:${b.outcomeId}`));

  const hasVerification = blocked.some((entry) => entry.disposition === "VERIFY");
  const status: DecisionOutcomeCalibrationReviewV1["status"] = hasVerification
    ? "VERIFY_SOURCE"
    : blocked.length > 0
      ? "WAITING_FOR_OUTCOMES"
      : "READY";
  const summary = status === "READY"
    ? {
        targetsReviewed: comparisons.length,
        belowExpectedRange: comparisons.filter((entry) => entry.comparison === "BELOW_EXPECTED_RANGE").length,
        overlappingExpectedRange: comparisons.filter((entry) => entry.comparison === "OVERLAPS_EXPECTED_RANGE").length,
        aboveExpectedRange: comparisons.filter((entry) => entry.comparison === "ABOVE_EXPECTED_RANGE").length
      }
    : null;
  const signals = status === "READY"
    ? recurringSignals(comparisons, input.minimumDistinctDecisions)
    : [];
  const identity = canonical({
    policyVersion: DECISION_OUTCOME_CALIBRATION_POLICY_VERSION_V1,
    generatedAt,
    minimumDistinctDecisions: input.minimumDistinctDecisions,
    comparisons,
    blocked,
    status
  });

  return freeze({
    contractVersion: DECISION_OUTCOME_CALIBRATION_CONTRACT_VERSION_V1,
    policyVersion: DECISION_OUTCOME_CALIBRATION_POLICY_VERSION_V1,
    reviewId: `decision-outcome-calibration:${createHash("sha256")
      .update(JSON.stringify(identity))
      .digest("hex")
      .slice(0, 24)}`,
    generatedAt,
    status,
    comparisons,
    blocked,
    summary,
    recurringSignals: signals,
    authority: {
      mutateDecisionMemory: false,
      mutateConfidence: false,
      inferCausality: false,
      inferMonetaryValue: false,
      changeAllocation: false,
      changePrice: false,
      changeSpend: false,
      promotePolicy: false,
      externalAction: false,
      approvalBypass: false
    }
  });
}
