import type { RevenueDecisionPacketV1 } from "@/lib/intelligence/production-revenue-loop/decision-packet-v1";

export const REVENUE_OBSERVED_OUTCOME_VERSION = "REVENUE_OBSERVED_OUTCOME_V1" as const;
export const REVENUE_OUTCOME_LEARNING_VERSION = "REVENUE_OUTCOME_LEARNING_V1" as const;

export type RevenueOutcomeAttributionConfidenceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type RevenueOutcomeTruthStateV1 = "CURRENT" | "PARTIAL" | "STALE" | "UNKNOWN" | "CONFLICTED";
export type RevenueOutcomeActionStateV1 = "TAKEN" | "NOT_TAKEN" | "PENDING" | "UNKNOWN";

export type SupportedRevenueOutcomeV1 = {
  version: typeof REVENUE_OBSERVED_OUTCOME_VERSION;
  observationId: string;
  recommendationId: string;
  actionId: string;
  actionState: RevenueOutcomeActionStateV1;
  observedAt: string;
  evaluationWindow: { startDate: string; endDate: string };
  metric: string;
  baseline: number | null;
  observedValue: number | null;
  statement: string;
  truthState: RevenueOutcomeTruthStateV1;
  evidenceRefs: string[];
  attributionConfidence: RevenueOutcomeAttributionConfidenceV1;
  confounders: string[];
};

export type RevenueOutcomeLearningRecordV1 = {
  version: typeof REVENUE_OUTCOME_LEARNING_VERSION;
  id: string;
  recommendationId: string;
  actionId: string;
  decisionGeneratedAt: string;
  hypothesis: string;
  actionDescription: string;
  actionState: "TAKEN";
  measurement: {
    metric: string;
    baseline: number;
    observedValue: number;
    evaluationWindow: { startDate: string; endDate: string };
    observedAt: string;
    timingState: "ON_TIME" | "LATE";
  };
  outcome: {
    statement: string;
    truthState: "CURRENT" | "PARTIAL";
    evidenceRefs: readonly string[];
    attributionConfidence: RevenueOutcomeAttributionConfidenceV1;
    confounders: readonly string[];
  };
  causalClaim: {
    state: "CORRELATION_ONLY" | "UNKNOWN";
    statement: string;
  };
  lesson: {
    state: "CANDIDATE_ONLY";
    statement: string;
  };
  traceability: {
    packetVersion: RevenueDecisionPacketV1["version"];
    packetReasonCode: string;
    packetEvidenceRefs: readonly string[];
    observationId: string;
  };
  governance: {
    singleObservation: true;
    policyUpdateAllowed: false;
    promotionAllowed: false;
    externalMutationPerformed: false;
  };
};

export type RevenueOutcomeAttachmentReasonV1 =
  | "OUTCOME_ATTACHED"
  | "INVALID_INPUT"
  | "DECISION_PACKET_NOT_READY"
  | "RECOMMENDATION_ID_MISMATCH"
  | "ACTION_ID_MISSING"
  | "ACTION_NOT_TAKEN"
  | "BASELINE_UNAVAILABLE"
  | "BASELINE_MISMATCH"
  | "METRIC_MISMATCH"
  | "EVALUATION_WINDOW_MISMATCH"
  | "OBSERVATION_TOO_EARLY"
  | "OUTCOME_EVIDENCE_UNSUPPORTED"
  | "UNSUPPORTED_CAUSAL_LANGUAGE";

export type RevenueOutcomeAttachmentResultV1 =
  | {
      status: "OUTCOME_READY";
      reasonCode: "OUTCOME_ATTACHED";
      record: RevenueOutcomeLearningRecordV1;
    }
  | {
      status: "REJECTED";
      reasonCode: Exclude<RevenueOutcomeAttachmentReasonV1, "OUTCOME_ATTACHED">;
      record: null;
    };

const ATTRIBUTION = new Set<RevenueOutcomeAttributionConfidenceV1>([
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNKNOWN"
]);
const ACTION_STATES = new Set<RevenueOutcomeActionStateV1>([
  "TAKEN",
  "NOT_TAKEN",
  "PENDING",
  "UNKNOWN"
]);
const TRUTH_STATES = new Set<RevenueOutcomeTruthStateV1>([
  "CURRENT",
  "PARTIAL",
  "STALE",
  "UNKNOWN",
  "CONFLICTED"
]);
const CAUSAL_LANGUAGE = /\b(caus(?:e|ed|es|ing)|because of|resulted in|drove|driven by|attributable to)\b/i;

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function date(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

function validDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function validWindow(value: unknown): value is { startDate: string; endDate: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const window = value as { startDate?: unknown; endDate?: unknown };
  return Boolean(
    validDateOnly(window.startDate) &&
      validDateOnly(window.endDate) &&
      Date.parse(`${window.endDate}T00:00:00.000Z`) >= Date.parse(`${window.startDate}T00:00:00.000Z`)
  );
}

function validStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

function validOutcome(value: unknown): value is SupportedRevenueOutcomeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const outcome = value as Partial<SupportedRevenueOutcomeV1>;
  return Boolean(
    outcome.version === REVENUE_OBSERVED_OUTCOME_VERSION &&
      text(outcome.observationId) &&
      text(outcome.recommendationId) &&
      typeof outcome.actionId === "string" &&
      ACTION_STATES.has(outcome.actionState as RevenueOutcomeActionStateV1) &&
      Number.isFinite(date(outcome.observedAt)) &&
      validWindow(outcome.evaluationWindow) &&
      text(outcome.metric) &&
      (outcome.baseline === null || finiteNumber(outcome.baseline)) &&
      (outcome.observedValue === null || finiteNumber(outcome.observedValue)) &&
      text(outcome.statement) &&
      TRUTH_STATES.has(outcome.truthState as RevenueOutcomeTruthStateV1) &&
      validStringList(outcome.evidenceRefs) &&
      ATTRIBUTION.has(outcome.attributionConfidence as RevenueOutcomeAttributionConfidenceV1) &&
      validStringList(outcome.confounders)
  );
}

function reject(reasonCode: Exclude<RevenueOutcomeAttachmentReasonV1, "OUTCOME_ATTACHED">): RevenueOutcomeAttachmentResultV1 {
  return Object.freeze({ status: "REJECTED", reasonCode, record: null });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function stableId(values: readonly string[]): string {
  let hash = 2166136261;
  for (const character of values.join("\u001f")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `revenue-outcome-learning:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sameWindow(
  left: { startDate: string; endDate: string },
  right: { startDate: string; endDate: string }
): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

/**
 * Attaches one supported, already-observed result to one canonical revenue
 * decision packet. This is a pure projection seam. It does not read, persist,
 * execute, promote, or update learning policy.
 */
export function attachObservedRevenueOutcomeV1(input: {
  decisionPacket: RevenueDecisionPacketV1;
  observedOutcome: SupportedRevenueOutcomeV1;
}): RevenueOutcomeAttachmentResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input) || !validOutcome(input.observedOutcome)) {
    return reject("INVALID_INPUT");
  }

  const { decisionPacket: packet, observedOutcome: outcome } = input;
  if (!packet || packet.version !== "REVENUE_DECISION_PACKET_V1" || packet.status !== "READY_FOR_DECISION") {
    return reject("DECISION_PACKET_NOT_READY");
  }
  if (outcome.recommendationId !== packet.recommendedAction.id) return reject("RECOMMENDATION_ID_MISMATCH");
  if (!text(outcome.actionId)) return reject("ACTION_ID_MISSING");
  if (outcome.actionState !== "TAKEN") return reject("ACTION_NOT_TAKEN");
  if (!finiteNumber(packet.measurement.baseline)) return reject("BASELINE_UNAVAILABLE");
  if (outcome.baseline !== packet.measurement.baseline) return reject("BASELINE_MISMATCH");
  if (outcome.metric !== packet.measurement.metric) return reject("METRIC_MISMATCH");
  if (!packet.measurement.evaluationWindow || !sameWindow(outcome.evaluationWindow, packet.measurement.evaluationWindow)) {
    return reject("EVALUATION_WINDOW_MISMATCH");
  }

  const evaluationEnd = Date.parse(`${packet.measurement.evaluationWindow.endDate}T00:00:00.000Z`);
  const observedAt = date(outcome.observedAt);
  if (observedAt < evaluationEnd) return reject("OBSERVATION_TOO_EARLY");
  if (
    outcome.observedValue === null ||
    outcome.evidenceRefs.length === 0 ||
    !["CURRENT", "PARTIAL"].includes(outcome.truthState)
  ) {
    return reject("OUTCOME_EVIDENCE_UNSUPPORTED");
  }
  if (CAUSAL_LANGUAGE.test(outcome.statement)) return reject("UNSUPPORTED_CAUSAL_LANGUAGE");

  const packetEvidenceRefs = packet.sourceCoverage
    .flatMap((source) => source.evidenceRefs.map((ref) => `${source.source}:${ref}`))
    .sort();
  const evidenceRefs = [...new Set(outcome.evidenceRefs)].sort();
  const confounders = [...new Set(outcome.confounders)];
  const timingState = outcome.observedAt.slice(0, 10) === packet.measurement.evaluationWindow.endDate ? "ON_TIME" : "LATE";
  const causalState = outcome.attributionConfidence === "UNKNOWN" ? "UNKNOWN" : "CORRELATION_ONLY";
  const causalStatement = causalState === "UNKNOWN"
    ? "Causality is UNKNOWN because attribution is unresolved."
    : "The result is correlated with the recorded action window, not proven to have been caused by the action.";
  const limitation = confounders.length
    ? ` Known confounders: ${confounders.join("; ")}.`
    : " No known confounders were supplied, which does not establish causality.";

  const record: RevenueOutcomeLearningRecordV1 = {
    version: REVENUE_OUTCOME_LEARNING_VERSION,
    id: stableId([outcome.recommendationId, outcome.actionId, outcome.observationId]),
    recommendationId: outcome.recommendationId,
    actionId: outcome.actionId,
    decisionGeneratedAt: packet.generatedAt,
    hypothesis: packet.primaryDriver.statement,
    actionDescription: packet.recommendedAction.description,
    actionState: "TAKEN",
    measurement: {
      metric: outcome.metric,
      baseline: packet.measurement.baseline,
      observedValue: outcome.observedValue,
      evaluationWindow: { ...packet.measurement.evaluationWindow },
      observedAt: outcome.observedAt,
      timingState
    },
    outcome: {
      statement: outcome.statement,
      truthState: outcome.truthState as "CURRENT" | "PARTIAL",
      evidenceRefs,
      attributionConfidence: outcome.attributionConfidence,
      confounders
    },
    causalClaim: { state: causalState, statement: causalStatement },
    lesson: {
      state: "CANDIDATE_ONLY",
      statement: `${outcome.statement} This is one bounded observation and may support a lesson candidate, but it cannot promote policy or prove causation.${limitation}`
    },
    traceability: {
      packetVersion: packet.version,
      packetReasonCode: packet.reasonCode,
      packetEvidenceRefs,
      observationId: outcome.observationId
    },
    governance: {
      singleObservation: true,
      policyUpdateAllowed: false,
      promotionAllowed: false,
      externalMutationPerformed: false
    }
  };

  return deepFreeze({ status: "OUTCOME_READY", reasonCode: "OUTCOME_ATTACHED", record });
}
