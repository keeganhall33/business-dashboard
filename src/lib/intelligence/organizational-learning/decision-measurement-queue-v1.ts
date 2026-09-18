import type { DecisionMemoryRecordV1 } from "./decision-memory-v1";

export const DECISION_MEASUREMENT_QUEUE_VERSION_V1 = "DecisionMeasurementQueueV1" as const;
export const DECISION_MEASUREMENT_QUEUE_POLICY_VERSION_V1 =
  "decision_measurement_queue_v1.0.0" as const;

export type DecisionMeasurementQueueStateV1 =
  | "WAITING_ACTION"
  | "WAITING_WINDOW"
  | "DUE"
  | "OVERDUE"
  | "COMPLETE"
  | "NO_MEASUREMENT_PLAN"
  | "VERIFY_RECORD";

export type DecisionMeasurementQueueReasonV1 =
  | "ACTION_NOT_OBSERVED"
  | "ACTION_EVIDENCE_MISSING"
  | "WINDOW_NOT_ENDED"
  | "MEASUREMENT_DUE"
  | "MEASUREMENT_OVERDUE"
  | "ALL_EXPECTED_OUTCOMES_OBSERVED"
  | "NO_EXPECTED_OUTCOMES"
  | "DECISION_INTEGRITY_FLAGS"
  | "INVALID_DECISION_CHRONOLOGY"
  | "INVALID_OUTCOME_PLAN"
  | "INVALID_OBSERVATION_CHRONOLOGY"
  | "OBSERVED_OUTCOME_ID_MISMATCH";

export type DecisionMeasurementQueueItemV1 = Readonly<{
  decisionId: string;
  decisionClass: DecisionMemoryRecordV1["decisionClass"];
  state: DecisionMeasurementQueueStateV1;
  reasonCodes: readonly DecisionMeasurementQueueReasonV1[];
  decidedAt: string;
  actionState: DecisionMemoryRecordV1["actionState"];
  expectedOutcomeIds: readonly string[];
  observedOutcomeIds: readonly string[];
  pendingOutcomeIds: readonly string[];
  nextMeasurementAt: string | null;
  overdueOutcomeIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY";
}>;

export type DecisionMeasurementQueueV1 = Readonly<{
  contractVersion: typeof DECISION_MEASUREMENT_QUEUE_VERSION_V1;
  policyVersion: typeof DECISION_MEASUREMENT_QUEUE_POLICY_VERSION_V1;
  generatedAt: string;
  overdueGraceMs: number;
  items: readonly DecisionMeasurementQueueItemV1[];
  summary: Readonly<{
    total: number;
    waitingAction: number;
    waitingWindow: number;
    due: number;
    overdue: number;
    complete: number;
    noMeasurementPlan: number;
    verifyRecord: number;
  }>;
  limitations: readonly string[];
  authority: Readonly<{
    persistenceAllowed: false;
    measurementExecutionAllowed: false;
    portfolioMutationAllowed: false;
    reallocationAllowed: false;
    policyPromotionAllowed: false;
    pricingChangeAllowed: false;
    negotiationActionAllowed: false;
    campaignExecutionAllowed: false;
    experimentExecutionAllowed: false;
    externalActionAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

export class DecisionMeasurementQueueError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionMeasurementQueueError";
  }
}

const LIMITATIONS = Object.freeze([
  "A due or overdue measurement window means only that expected outcome evidence is scheduled to be collected; it does not imply success, failure, causality, or business impact.",
  "Outcome coverage counts an observation only after that expected outcome's recorded evaluation window has ended; an earlier observation is not silently treated as final measurement.",
  "A COMPLETE item means every expected outcome id has an observed counterpart after its recorded evaluation window; it does not establish decision-grade assessment, attribution quality, reusable learning, or a reallocation instruction.",
  "This queue never invents confidence, monetary value, attribution, outcomes, or missing evidence and grants no persistence, execution, reallocation, pricing, negotiation, campaign, experiment, external-action, or approval authority."
] as const);

const AUTHORITY = Object.freeze({
  persistenceAllowed: false,
  measurementExecutionAllowed: false,
  portfolioMutationAllowed: false,
  reallocationAllowed: false,
  policyPromotionAllowed: false,
  pricingChangeAllowed: false,
  negotiationActionAllowed: false,
  campaignExecutionAllowed: false,
  experimentExecutionAllowed: false,
  externalActionAllowed: false,
  approvalBypassAllowed: false
} as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === value ? value : null;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DecisionMeasurementQueueError(
      "INVALID_POLICY",
      `${label} must be a finite non-negative number`
    );
  }
  return value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function refsForRecord(record: DecisionMemoryRecordV1): string[] {
  return uniqueSorted([
    ...record.actionEvidenceRefs,
    ...record.expectedOutcomes.flatMap((outcome) => [
      ...outcome.description.evidenceRefs,
      ...outcome.expectedRange.evidenceRefs
    ]),
    ...(record.outcomeObservation?.outcomes.flatMap((outcome) => [
      ...outcome.description.evidenceRefs,
      ...outcome.observedRange.evidenceRefs
    ]) ?? []),
    ...(record.outcomeObservation?.assessment.evidenceRefs ?? []),
    ...(record.outcomeObservation?.attributionEvidenceRefs ?? [])
  ]);
}

function sourceRefsForRecord(record: DecisionMemoryRecordV1): string[] {
  return uniqueSorted([
    ...record.sourceRefs,
    ...(record.outcomeObservation?.sourceRefs ?? [])
  ]);
}

function verifyItem(
  record: DecisionMemoryRecordV1,
  reasons: readonly DecisionMeasurementQueueReasonV1[]
): DecisionMeasurementQueueItemV1 {
  const expectedOutcomeIds = uniqueSorted(record.expectedOutcomes.map((outcome) => outcome.outcomeId));
  const observedOutcomeIds = uniqueSorted(
    record.outcomeObservation?.outcomes.map((outcome) => outcome.outcomeId) ?? []
  );
  return {
    decisionId: record.decisionId,
    decisionClass: record.decisionClass,
    state: "VERIFY_RECORD",
    reasonCodes: uniqueSorted(reasons) as DecisionMeasurementQueueReasonV1[],
    decidedAt: record.decidedAt,
    actionState: record.actionState,
    expectedOutcomeIds,
    observedOutcomeIds,
    pendingOutcomeIds: expectedOutcomeIds.filter((id) => !observedOutcomeIds.includes(id)),
    nextMeasurementAt: null,
    overdueOutcomeIds: [],
    evidenceRefs: refsForRecord(record),
    sourceRefs: sourceRefsForRecord(record),
    causalInterpretation: "NOT_ESTABLISHED",
    outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY"
  };
}

function compileItem(
  record: DecisionMemoryRecordV1,
  generatedAtMs: number,
  overdueGraceMs: number
): DecisionMeasurementQueueItemV1 {
  if (!record || record.contractVersion !== "DecisionMemoryV1") {
    throw new DecisionMeasurementQueueError(
      "INVALID_RECORD",
      "Only canonical DecisionMemoryV1 records may enter the measurement queue"
    );
  }

  const decidedAt = canonicalTimestamp(record.decidedAt);
  if (!decidedAt || Date.parse(decidedAt) > generatedAtMs) {
    return verifyItem(record, ["INVALID_DECISION_CHRONOLOGY"]);
  }

  if (record.integrityFlags.length > 0) {
    return verifyItem(record, ["DECISION_INTEGRITY_FLAGS"]);
  }

  if (record.actionState !== "TAKEN" && record.actionState !== "REVERSED") {
    const expectedOutcomeIds = uniqueSorted(record.expectedOutcomes.map((outcome) => outcome.outcomeId));
    return {
      decisionId: record.decisionId,
      decisionClass: record.decisionClass,
      state: "WAITING_ACTION",
      reasonCodes: ["ACTION_NOT_OBSERVED"],
      decidedAt,
      actionState: record.actionState,
      expectedOutcomeIds,
      observedOutcomeIds: [],
      pendingOutcomeIds: expectedOutcomeIds,
      nextMeasurementAt: null,
      overdueOutcomeIds: [],
      evidenceRefs: refsForRecord(record),
      sourceRefs: sourceRefsForRecord(record),
      causalInterpretation: "NOT_ESTABLISHED",
      outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY"
    };
  }

  if (record.actionEvidenceRefs.length === 0) {
    return verifyItem(record, ["ACTION_EVIDENCE_MISSING"]);
  }

  if (record.expectedOutcomes.length === 0) {
    return {
      decisionId: record.decisionId,
      decisionClass: record.decisionClass,
      state: "NO_MEASUREMENT_PLAN",
      reasonCodes: ["NO_EXPECTED_OUTCOMES"],
      decidedAt,
      actionState: record.actionState,
      expectedOutcomeIds: [],
      observedOutcomeIds: uniqueSorted(
        record.outcomeObservation?.outcomes.map((outcome) => outcome.outcomeId) ?? []
      ),
      pendingOutcomeIds: [],
      nextMeasurementAt: null,
      overdueOutcomeIds: [],
      evidenceRefs: refsForRecord(record),
      sourceRefs: sourceRefsForRecord(record),
      causalInterpretation: "NOT_ESTABLISHED",
      outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY"
    };
  }

  const outcomeIds = record.expectedOutcomes.map((outcome) => outcome.outcomeId.trim());
  if (
    outcomeIds.some((id) => !id) ||
    new Set(outcomeIds).size !== outcomeIds.length ||
    record.expectedOutcomes.some((outcome) => {
      const window = canonicalTimestamp(outcome.evaluationWindowEndsAt);
      return !window || Date.parse(window) < Date.parse(decidedAt);
    })
  ) {
    return verifyItem(record, ["INVALID_OUTCOME_PLAN"]);
  }

  const observation = record.outcomeObservation;
  const observedAt = observation ? canonicalTimestamp(observation.observedAt) : null;
  if (
    observation &&
    (!observedAt || Date.parse(observedAt) < Date.parse(decidedAt) || Date.parse(observedAt) > generatedAtMs)
  ) {
    return verifyItem(record, ["INVALID_OBSERVATION_CHRONOLOGY"]);
  }

  const expectedOutcomeIds = uniqueSorted(outcomeIds);
  const rawObservedOutcomeIds = observation?.outcomes.map((outcome) => outcome.outcomeId.trim()) ?? [];
  if (
    rawObservedOutcomeIds.some((id) => !id) ||
    new Set(rawObservedOutcomeIds).size !== rawObservedOutcomeIds.length ||
    rawObservedOutcomeIds.some((id) => !expectedOutcomeIds.includes(id))
  ) {
    return verifyItem(record, ["OBSERVED_OUTCOME_ID_MISMATCH"]);
  }

  const windowsByOutcome = new Map(
    record.expectedOutcomes.map((outcome) => [
      outcome.outcomeId,
      canonicalTimestamp(outcome.evaluationWindowEndsAt) as string
    ])
  );
  const observedOutcomeIds = uniqueSorted(
    observedAt
      ? rawObservedOutcomeIds.filter(
          (outcomeId) => Date.parse(observedAt) >= Date.parse(windowsByOutcome.get(outcomeId)!)
        )
      : []
  );
  const pendingOutcomeIds = expectedOutcomeIds.filter((id) => !observedOutcomeIds.includes(id));

  if (pendingOutcomeIds.length === 0) {
    return {
      decisionId: record.decisionId,
      decisionClass: record.decisionClass,
      state: "COMPLETE",
      reasonCodes: ["ALL_EXPECTED_OUTCOMES_OBSERVED"],
      decidedAt,
      actionState: record.actionState,
      expectedOutcomeIds,
      observedOutcomeIds,
      pendingOutcomeIds: [],
      nextMeasurementAt: null,
      overdueOutcomeIds: [],
      evidenceRefs: refsForRecord(record),
      sourceRefs: sourceRefsForRecord(record),
      causalInterpretation: "NOT_ESTABLISHED",
      outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY"
    };
  }

  const pendingWindows = pendingOutcomeIds
    .map((outcomeId) => ({ outcomeId, at: windowsByOutcome.get(outcomeId)! }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.outcomeId.localeCompare(b.outcomeId));

  const dueOutcomeIds = pendingWindows
    .filter((item) => Date.parse(item.at) <= generatedAtMs)
    .map((item) => item.outcomeId);
  const overdueOutcomeIds = pendingWindows
    .filter((item) => generatedAtMs - Date.parse(item.at) > overdueGraceMs)
    .map((item) => item.outcomeId);

  let state: DecisionMeasurementQueueStateV1;
  let reasonCodes: DecisionMeasurementQueueReasonV1[];
  if (overdueOutcomeIds.length > 0) {
    state = "OVERDUE";
    reasonCodes = ["MEASUREMENT_OVERDUE"];
  } else if (dueOutcomeIds.length > 0) {
    state = "DUE";
    reasonCodes = ["MEASUREMENT_DUE"];
  } else {
    state = "WAITING_WINDOW";
    reasonCodes = ["WINDOW_NOT_ENDED"];
  }

  return {
    decisionId: record.decisionId,
    decisionClass: record.decisionClass,
    state,
    reasonCodes,
    decidedAt,
    actionState: record.actionState,
    expectedOutcomeIds,
    observedOutcomeIds,
    pendingOutcomeIds,
    nextMeasurementAt: pendingWindows[0]?.at ?? null,
    overdueOutcomeIds,
    evidenceRefs: refsForRecord(record),
    sourceRefs: sourceRefsForRecord(record),
    causalInterpretation: "NOT_ESTABLISHED",
    outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY"
  };
}

/**
 * Builds an internal measurement-attention queue from canonical DecisionMemoryV1
 * records. It answers only whether expected outcome evidence is not yet observed
 * after its recorded evaluation window and whether that window has arrived. It
 * never interprets a missing observation as a negative outcome and never grants
 * measurement or execution authority.
 */
export function compileDecisionMeasurementQueueV1(input: {
  records: readonly DecisionMemoryRecordV1[];
  generatedAt: string;
  overdueGraceMs: number;
}): DecisionMeasurementQueueV1 {
  const generatedAt = canonicalTimestamp(input.generatedAt);
  if (!generatedAt) {
    throw new DecisionMeasurementQueueError(
      "INVALID_GENERATED_AT",
      "generatedAt must be a canonical UTC ISO timestamp"
    );
  }
  const generatedAtMs = Date.parse(generatedAt);
  const overdueGraceMs = finiteNonNegative(input.overdueGraceMs, "overdueGraceMs");

  if (!Array.isArray(input.records) || input.records.length > 1_000) {
    throw new DecisionMeasurementQueueError(
      "BOUNDS_EXCEEDED",
      "records must contain at most 1000 canonical decision records"
    );
  }

  const decisionIds = input.records.map((record) => record?.decisionId?.trim()).filter(Boolean) as string[];
  if (decisionIds.length !== input.records.length || new Set(decisionIds).size !== decisionIds.length) {
    throw new DecisionMeasurementQueueError(
      "DUPLICATE_OR_MISSING_DECISION_ID",
      "Decision ids must be present and unique within one measurement queue"
    );
  }

  const items = input.records
    .map((record) => compileItem(record, generatedAtMs, overdueGraceMs))
    .sort((a, b) => {
      const stateRank: Record<DecisionMeasurementQueueStateV1, number> = {
        OVERDUE: 0,
        DUE: 1,
        VERIFY_RECORD: 2,
        WAITING_WINDOW: 3,
        WAITING_ACTION: 4,
        NO_MEASUREMENT_PLAN: 5,
        COMPLETE: 6
      };
      return stateRank[a.state] - stateRank[b.state] || a.decisionId.localeCompare(b.decisionId);
    });

  const count = (state: DecisionMeasurementQueueStateV1): number =>
    items.filter((item) => item.state === state).length;

  return deepFreeze({
    contractVersion: DECISION_MEASUREMENT_QUEUE_VERSION_V1,
    policyVersion: DECISION_MEASUREMENT_QUEUE_POLICY_VERSION_V1,
    generatedAt,
    overdueGraceMs,
    items,
    summary: {
      total: items.length,
      waitingAction: count("WAITING_ACTION"),
      waitingWindow: count("WAITING_WINDOW"),
      due: count("DUE"),
      overdue: count("OVERDUE"),
      complete: count("COMPLETE"),
      noMeasurementPlan: count("NO_MEASUREMENT_PLAN"),
      verifyRecord: count("VERIFY_RECORD")
    },
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
