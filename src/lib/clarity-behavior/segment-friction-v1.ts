import type {
  ClarityDateRangeV1,
  ClarityEvidenceTruthState,
} from "./view-model-v1";

export const CLARITY_SEGMENT_FRICTION_VERSION = "CLARITY_SEGMENT_FRICTION_V1" as const;
export const MIN_CLARITY_SEGMENT_SESSIONS_FOR_ALERT = 20 as const;

export type ClaritySegmentDimensionV1 = "PAGE" | "DEVICE" | "BROWSER" | "TRAFFIC_SOURCE";
export type ClaritySegmentSeverityV1 = "CRITICAL" | "HIGH" | "NONE" | "LOW_SAMPLE";

export type ClaritySegmentCountsV1 = {
  sessions: number;
  deadClickSessions: number | null;
  quickBackSessions: number | null;
};

export type ClaritySegmentObservationV1 = {
  dimension: ClaritySegmentDimensionV1;
  segmentRef: string;
  label: string;
  current: ClaritySegmentCountsV1;
  prior: ClaritySegmentCountsV1;
  evidenceRefs: string[];
};

export type ClaritySegmentFrictionInputV1 = {
  source: "MICROSOFT_CLARITY_DATA_EXPORT_API";
  sourceTruth: ClarityEvidenceTruthState;
  currentRange: ClarityDateRangeV1;
  priorRange: ClarityDateRangeV1;
  observedCurrentRange: ClarityDateRangeV1;
  observedPriorRange: ClarityDateRangeV1;
  extractedAt: string;
  completeThrough: string;
  evaluatedAt: string;
  maxAgeHours: number;
  coverageComplete: boolean;
  rows: ClaritySegmentObservationV1[];
};

export type ClaritySegmentMetricRateV1 = {
  current: number | null;
  prior: number | null;
  delta: number | null;
  regression2x: boolean;
};

export type ClaritySegmentFrictionEntryV1 = {
  rank: number;
  dimension: ClaritySegmentDimensionV1;
  segmentRef: string;
  label: string;
  sampleState: "SUFFICIENT" | "LOW_SAMPLE";
  severity: ClaritySegmentSeverityV1;
  currentSessions: number;
  priorSessions: number;
  deadClickRate: ClaritySegmentMetricRateV1;
  quickBackRate: ClaritySegmentMetricRateV1;
  facts: readonly string[];
  nextStep:
    | "REVIEW_SUPPORTING_RECORDINGS_AND_SEGMENTS"
    | "GATHER_MORE_OBSERVATIONS"
    | "NO_ACTION";
  evidenceRefs: readonly string[];
};

export type ClaritySegmentFrictionResultV1 = {
  version: typeof CLARITY_SEGMENT_FRICTION_VERSION;
  state: "READY" | "WITHHELD";
  reasonCode:
    | "SEGMENT_FRICTION_READY"
    | "INVALID_INPUT"
    | "SOURCE_NOT_COMPLETE"
    | "COVERAGE_INCOMPLETE"
    | "RANGE_MISMATCH"
    | "STALE_EVIDENCE"
    | "FUTURE_EVIDENCE"
    | "INCOMPLETE_CURRENT_RANGE";
  currentRange: Readonly<ClarityDateRangeV1>;
  priorRange: Readonly<ClarityDateRangeV1>;
  leaderboard: readonly ClaritySegmentFrictionEntryV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  authority: {
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    causalClaimAllowed: false;
    revenueAttributionAllowed: false;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DIMENSIONS = new Set<ClaritySegmentDimensionV1>([
  "PAGE",
  "DEVICE",
  "BROWSER",
  "TRAFFIC_SOURCE",
]);
const SEVERITY_RANK: Record<ClaritySegmentSeverityV1, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NONE: 2,
  LOW_SAMPLE: 3,
};

function calendarDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function validRange(value: unknown): value is ClarityDateRangeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const range = value as Partial<ClarityDateRangeV1>;
  const start = calendarDate(range.startDate);
  const end = calendarDate(range.endDate);
  return start !== null && end !== null && start <= end;
}

function rangeDays(range: ClarityDateRangeV1): number {
  return ((calendarDate(range.endDate) as number) - (calendarDate(range.startDate) as number)) / DAY_MS + 1;
}

function sameRange(left: ClarityDateRangeV1, right: ClarityDateRangeV1): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

function validIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function finiteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validAffectedCount(value: unknown, sessions: number): value is number | null {
  return value === null || (finiteCount(value) && value <= sessions);
}

function safeRef(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 240) return false;
  return !/(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i.test(value);
}

function validLabel(dimension: ClaritySegmentDimensionV1, value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 120) return false;
  if (dimension === "PAGE") {
    return value.startsWith("/") && !value.includes("?") && !value.includes("#") && !value.includes("://");
  }
  return true;
}

function validRow(row: ClaritySegmentObservationV1): boolean {
  return Boolean(
    row &&
      DIMENSIONS.has(row.dimension) &&
      typeof row.segmentRef === "string" &&
      row.segmentRef.trim().length > 0 &&
      row.segmentRef.length <= 160 &&
      validLabel(row.dimension, row.label) &&
      row.current &&
      finiteCount(row.current.sessions) &&
      validAffectedCount(row.current.deadClickSessions, row.current.sessions) &&
      validAffectedCount(row.current.quickBackSessions, row.current.sessions) &&
      row.prior &&
      finiteCount(row.prior.sessions) &&
      validAffectedCount(row.prior.deadClickSessions, row.prior.sessions) &&
      validAffectedCount(row.prior.quickBackSessions, row.prior.sessions) &&
      Array.isArray(row.evidenceRefs) &&
      row.evidenceRefs.length > 0 &&
      row.evidenceRefs.length <= 12 &&
      row.evidenceRefs.every(safeRef)
  );
}

function rate(affected: number | null, sessions: number): number | null {
  if (affected === null || sessions <= 0) return null;
  return affected / sessions;
}

function metricRate(currentAffected: number | null, currentSessions: number, priorAffected: number | null, priorSessions: number): ClaritySegmentMetricRateV1 {
  const current = rate(currentAffected, currentSessions);
  const prior = rate(priorAffected, priorSessions);
  return {
    current,
    prior,
    delta: current === null || prior === null ? null : current - prior,
    regression2x: current !== null && prior !== null && prior > 0 && current / prior >= 2,
  };
}

function fixedPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildEntry(row: ClaritySegmentObservationV1): Omit<ClaritySegmentFrictionEntryV1, "rank"> {
  const deadClickRate = metricRate(
    row.current.deadClickSessions,
    row.current.sessions,
    row.prior.deadClickSessions,
    row.prior.sessions,
  );
  const quickBackRate = metricRate(
    row.current.quickBackSessions,
    row.current.sessions,
    row.prior.quickBackSessions,
    row.prior.sessions,
  );
  const sampleState = row.current.sessions >= MIN_CLARITY_SEGMENT_SESSIONS_FOR_ALERT
    && row.prior.sessions >= MIN_CLARITY_SEGMENT_SESSIONS_FOR_ALERT
    ? "SUFFICIENT" as const
    : "LOW_SAMPLE" as const;

  let severity: ClaritySegmentSeverityV1 = "NONE";
  const facts: string[] = [];

  if (sampleState === "LOW_SAMPLE") {
    severity = "LOW_SAMPLE";
    facts.push(`Only ${row.current.sessions} current and ${row.prior.sessions} prior sessions are evidenced for this segment; alert classification is withheld.`);
  } else {
    if (deadClickRate.current !== null && deadClickRate.current > 0.10) {
      severity = "CRITICAL";
      facts.push(`Dead-click sessions are ${fixedPercent(deadClickRate.current)} of current sessions, above the 10% critical friction threshold.`);
    }
    if (deadClickRate.regression2x) {
      severity = "CRITICAL";
      facts.push(`Dead-click rate is at least 2× the matched prior period (${fixedPercent(deadClickRate.current as number)} vs ${fixedPercent(deadClickRate.prior as number)}).`);
    }
    if (quickBackRate.current !== null && quickBackRate.current > 0.12) {
      if (severity !== "CRITICAL") severity = "HIGH";
      facts.push(`Quick-back sessions are ${fixedPercent(quickBackRate.current)} of current sessions, above the 12% high-friction threshold.`);
    }
  }

  return {
    dimension: row.dimension,
    segmentRef: row.segmentRef,
    label: row.label,
    sampleState,
    severity,
    currentSessions: row.current.sessions,
    priorSessions: row.prior.sessions,
    deadClickRate,
    quickBackRate,
    facts,
    nextStep: severity === "CRITICAL" || severity === "HIGH"
      ? "REVIEW_SUPPORTING_RECORDINGS_AND_SEGMENTS"
      : severity === "LOW_SAMPLE"
        ? "GATHER_MORE_OBSERVATIONS"
        : "NO_ACTION",
    evidenceRefs: [...new Set(row.evidenceRefs)].sort(),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function withheld(input: Partial<ClaritySegmentFrictionInputV1>, reasonCode: Exclude<ClaritySegmentFrictionResultV1["reasonCode"], "SEGMENT_FRICTION_READY">): ClaritySegmentFrictionResultV1 {
  const currentRange = validRange(input.currentRange)
    ? { ...input.currentRange }
    : { startDate: "UNKNOWN", endDate: "UNKNOWN" };
  const priorRange = validRange(input.priorRange)
    ? { ...input.priorRange }
    : { startDate: "UNKNOWN", endDate: "UNKNOWN" };
  return deepFreeze({
    version: CLARITY_SEGMENT_FRICTION_VERSION,
    state: "WITHHELD",
    reasonCode,
    currentRange,
    priorRange,
    leaderboard: [],
    evidenceRefs: [],
    limitations: [
      "Segment friction is withheld until complete, current, range-matched evidence is available.",
      "No missing or partial segment evidence is converted to zero, confidence, causality, revenue attribution, or expected impact.",
    ],
    authority: {
      externalMutationAllowed: false,
      metaWriteAllowed: false,
      causalClaimAllowed: false,
      revenueAttributionAllowed: false,
    },
  });
}

/**
 * Builds a deterministic, evidence-bounded Clarity friction leaderboard across
 * page/device/browser/source segments. Ranking is descriptive only. It never
 * claims a segment caused conversion or revenue movement and never authorizes
 * a site or paid-media mutation.
 */
export function buildClaritySegmentFrictionV1(input: ClaritySegmentFrictionInputV1): ClaritySegmentFrictionResultV1 {
  if (
    !input ||
    input.source !== "MICROSOFT_CLARITY_DATA_EXPORT_API" ||
    !validRange(input.currentRange) ||
    !validRange(input.priorRange) ||
    !validRange(input.observedCurrentRange) ||
    !validRange(input.observedPriorRange) ||
    !validIsoInstant(input.extractedAt) ||
    !validIsoInstant(input.evaluatedAt) ||
    calendarDate(input.completeThrough) === null ||
    typeof input.maxAgeHours !== "number" ||
    !Number.isFinite(input.maxAgeHours) ||
    input.maxAgeHours <= 0 ||
    typeof input.coverageComplete !== "boolean" ||
    !Array.isArray(input.rows) ||
    input.rows.length > 500 ||
    input.rows.some((row) => !validRow(row))
  ) {
    return withheld(input ?? {}, "INVALID_INPUT");
  }

  if (input.sourceTruth !== "COMPLETE") return withheld(input, "SOURCE_NOT_COMPLETE");
  if (!input.coverageComplete) return withheld(input, "COVERAGE_INCOMPLETE");

  const currentStart = calendarDate(input.currentRange.startDate) as number;
  const currentEnd = calendarDate(input.currentRange.endDate) as number;
  const priorStart = calendarDate(input.priorRange.startDate) as number;
  const priorEnd = calendarDate(input.priorRange.endDate) as number;
  if (
    !sameRange(input.currentRange, input.observedCurrentRange) ||
    !sameRange(input.priorRange, input.observedPriorRange) ||
    rangeDays(input.currentRange) !== rangeDays(input.priorRange) ||
    priorEnd + DAY_MS !== currentStart ||
    priorStart > priorEnd ||
    currentStart > currentEnd
  ) {
    return withheld(input, "RANGE_MISMATCH");
  }

  const extractedAt = Date.parse(input.extractedAt);
  const evaluatedAt = Date.parse(input.evaluatedAt);
  if (extractedAt > evaluatedAt) return withheld(input, "FUTURE_EVIDENCE");
  if (evaluatedAt - extractedAt > input.maxAgeHours * 60 * 60 * 1000) {
    return withheld(input, "STALE_EVIDENCE");
  }

  const completeThrough = calendarDate(input.completeThrough) as number;
  const extractionDate = calendarDate(new Date(extractedAt).toISOString().slice(0, 10)) as number;
  if (completeThrough < currentEnd || completeThrough > extractionDate) {
    return withheld(input, "INCOMPLETE_CURRENT_RANGE");
  }

  const identities = new Set<string>();
  for (const row of input.rows) {
    const identity = `${row.dimension}\u0000${row.segmentRef}`;
    if (identities.has(identity)) return withheld(input, "INVALID_INPUT");
    identities.add(identity);
  }

  const built = input.rows.map(buildEntry);
  built.sort((left, right) => {
    const severity = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    if (severity !== 0) return severity;
    const leftRate = Math.max(left.deadClickRate.current ?? -1, left.quickBackRate.current ?? -1);
    const rightRate = Math.max(right.deadClickRate.current ?? -1, right.quickBackRate.current ?? -1);
    if (leftRate !== rightRate) return rightRate - leftRate;
    const dimension = left.dimension.localeCompare(right.dimension);
    if (dimension !== 0) return dimension;
    return left.segmentRef.localeCompare(right.segmentRef);
  });

  const leaderboard = built.map((entry, index) => ({ rank: index + 1, ...entry }));
  const evidenceRefs = [...new Set(input.rows.flatMap((row) => row.evidenceRefs))].sort();

  return deepFreeze({
    version: CLARITY_SEGMENT_FRICTION_VERSION,
    state: "READY",
    reasonCode: "SEGMENT_FRICTION_READY",
    currentRange: { ...input.currentRange },
    priorRange: { ...input.priorRange },
    leaderboard,
    evidenceRefs,
    limitations: [
      "Leaderboard order reflects observed friction thresholds and rates only; it does not establish causal impact on conversion or revenue.",
      `Segments with fewer than ${MIN_CLARITY_SEGMENT_SESSIONS_FOR_ALERT} evidenced sessions in either matched period are classified LOW_SAMPLE rather than alerted.`,
      "No expected lift, monetary value, confidence score, Meta attribution, or production action is inferred from segment ranking.",
    ],
    authority: {
      externalMutationAllowed: false,
      metaWriteAllowed: false,
      causalClaimAllowed: false,
      revenueAttributionAllowed: false,
    },
  });
}
