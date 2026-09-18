import type {
  ClarityEvidenceTruthState,
  ClarityPeriodMetricsV1,
} from "./view-model-v1";

export const CLARITY_LIVE_EXPORT_GATE_VERSION = "CLARITY_LIVE_EXPORT_GATE_V1" as const;
export const CLARITY_DATA_EXPORT_MAX_LOOKBACK_DAYS = 3 as const;
export const CLARITY_DATA_EXPORT_MAX_DIMENSIONS = 3 as const;
export const CLARITY_DATA_EXPORT_ROW_LIMIT = 1_000 as const;
export const CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY = 10 as const;

export type ClarityLiveExportGateStateV1 =
  | "ACCEPTED_FOR_HISTORY"
  | "PARTIAL_ONLY"
  | "REJECTED";

export type ClarityLiveMetricSemanticV1 =
  | "SESSION_COUNT"
  | "DISTINCT_USER_COUNT"
  | "AVERAGE_PER_SESSION"
  | "PERCENT"
  | "SECONDS"
  | "SESSION_AFFECTED_COUNT"
  | "INTERACTION_COUNT";

export type ClarityCanonicalMetricV1 = keyof ClarityPeriodMetricsV1;

export interface ClarityLiveMetricObservationV1 {
  providerMetric: string;
  canonicalMetric: ClarityCanonicalMetricV1;
  semantic: ClarityLiveMetricSemanticV1;
  value: number | null;
  evidenceRef: string;
}

export interface ClarityLiveUtcWindowV1 {
  startAt: string;
  endAt: string;
}

export interface ClarityLiveExportInputV1 {
  source: "MICROSOFT_CLARITY_DATA_EXPORT_API";
  sourceTruth: ClarityEvidenceTruthState;
  lookbackDays: number;
  requestedWindow: ClarityLiveUtcWindowV1;
  observedWindow: ClarityLiveUtcWindowV1;
  extractedAt: string;
  now: string;
  maxAgeHours: number;
  dimensions: string[];
  responseRows: number;
  rowLimitReached: boolean;
  evidenceRefs: string[];
  metrics: ClarityLiveMetricObservationV1[];
}

export type ClarityLiveExportReasonCodeV1 =
  | "ACCEPTED"
  | "INVALID_INPUT"
  | "UNSUPPORTED_LOOKBACK"
  | "UNSUPPORTED_DIMENSION"
  | "TOO_MANY_DIMENSIONS"
  | "WINDOW_DURATION_MISMATCH"
  | "OBSERVED_WINDOW_MISMATCH"
  | "SOURCE_PARTIAL"
  | "SOURCE_UNKNOWN"
  | "SOURCE_STALE"
  | "SOURCE_CONFLICTED"
  | "SOURCE_UNAVAILABLE"
  | "EXTRACTION_STALE"
  | "ROW_LIMIT_MAY_TRUNCATE"
  | "MISSING_PROVENANCE"
  | "METRIC_VALUE_UNKNOWN"
  | "METRIC_VALUE_INVALID"
  | "METRIC_SEMANTIC_MISMATCH"
  | "EVENT_COUNT_NOT_SESSION_COUNT"
  | "CONFLICTING_METRIC_OBSERVATIONS"
  | "PERIOD_PROJECTION_INCOMPLETE";

export interface ClarityUnprojectedMetricV1 {
  providerMetric: string;
  canonicalMetric: string;
  semantic: string;
  value: number | null;
  evidenceRef: string;
  reasonCode:
    | "METRIC_VALUE_UNKNOWN"
    | "METRIC_VALUE_INVALID"
    | "METRIC_SEMANTIC_MISMATCH"
    | "EVENT_COUNT_NOT_SESSION_COUNT";
}

export interface ClarityLiveExportGateResultV1 {
  version: typeof CLARITY_LIVE_EXPORT_GATE_VERSION;
  gateState: ClarityLiveExportGateStateV1;
  sourceTruth: ClarityEvidenceTruthState;
  reasonCodes: readonly ClarityLiveExportReasonCodeV1[];
  requestedWindow: Readonly<ClarityLiveUtcWindowV1>;
  observedWindow: Readonly<ClarityLiveUtcWindowV1>;
  extractedAt: string;
  coverage: {
    lookbackDays: number;
    utcRequired: true;
    maxSupportedLookbackDays: typeof CLARITY_DATA_EXPORT_MAX_LOOKBACK_DAYS;
    maxDimensions: typeof CLARITY_DATA_EXPORT_MAX_DIMENSIONS;
    rowLimit: typeof CLARITY_DATA_EXPORT_ROW_LIMIT;
    paginationSupported: false;
    maxRequestsPerProjectPerDay: typeof CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY;
    dimensions: readonly string[];
    responseRows: number;
    rowLimitReached: boolean;
  };
  projectedMetrics: Readonly<ClarityPeriodMetricsV1>;
  unprojectedMetrics: readonly Readonly<ClarityUnprojectedMetricV1>[];
  periodProjectionComplete: boolean;
  evidenceRefs: readonly string[];
  safeNextStep: string;
  authority: {
    networkCallPerformed: false;
    credentialAccessPerformed: false;
    persistencePerformed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "source",
  "sourceTruth",
  "lookbackDays",
  "requestedWindow",
  "observedWindow",
  "extractedAt",
  "now",
  "maxAgeHours",
  "dimensions",
  "responseRows",
  "rowLimitReached",
  "evidenceRefs",
  "metrics",
]);
const ALLOWED_WINDOW_KEYS = new Set(["startAt", "endAt"]);
const ALLOWED_METRIC_KEYS = new Set([
  "providerMetric",
  "canonicalMetric",
  "semantic",
  "value",
  "evidenceRef",
]);
const SUPPORTED_DIMENSIONS = new Set([
  "Browser",
  "Device",
  "Country/Region",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
]);
const SOURCE_TRUTHS = new Set<ClarityEvidenceTruthState>([
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "UNAVAILABLE",
]);
const SEMANTICS = new Set<ClarityLiveMetricSemanticV1>([
  "SESSION_COUNT",
  "DISTINCT_USER_COUNT",
  "AVERAGE_PER_SESSION",
  "PERCENT",
  "SECONDS",
  "SESSION_AFFECTED_COUNT",
  "INTERACTION_COUNT",
]);
const CANONICAL_METRICS = new Set<ClarityCanonicalMetricV1>([
  "sessions",
  "uniqueUsers",
  "pagesPerSession",
  "scrollDepthPercent",
  "activeTimeSeconds",
  "rageClickSessions",
  "deadClickSessions",
  "excessiveScrollSessions",
  "quickBackSessions",
  "purchaseSessions",
]);
const REQUIRED_SEMANTIC: Record<ClarityCanonicalMetricV1, ClarityLiveMetricSemanticV1> = {
  sessions: "SESSION_COUNT",
  uniqueUsers: "DISTINCT_USER_COUNT",
  pagesPerSession: "AVERAGE_PER_SESSION",
  scrollDepthPercent: "PERCENT",
  activeTimeSeconds: "SECONDS",
  rageClickSessions: "SESSION_AFFECTED_COUNT",
  deadClickSessions: "SESSION_AFFECTED_COUNT",
  excessiveScrollSessions: "SESSION_AFFECTED_COUNT",
  quickBackSessions: "SESSION_AFFECTED_COUNT",
  purchaseSessions: "SESSION_AFFECTED_COUNT",
};
const CORE_PERIOD_METRICS: readonly ClarityCanonicalMetricV1[] = [
  "sessions",
  "uniqueUsers",
  "pagesPerSession",
  "scrollDepthPercent",
  "activeTimeSeconds",
  "deadClickSessions",
  "quickBackSessions",
];
const PROVIDER_EVENT_COUNTS = new Set([
  "dead click count",
  "rage click count",
  "quickback click",
  "quick back click",
  "excessive scroll",
]);

function strictKeys(value: unknown, allowed: ReadonlySet<string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value as Record<string, unknown>).every((key) => allowed.has(key));
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validUtcInstant(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function validWindow(value: unknown): value is ClarityLiveUtcWindowV1 {
  if (!strictKeys(value, ALLOWED_WINDOW_KEYS)) return false;
  const window = value as Partial<ClarityLiveUtcWindowV1>;
  return Boolean(
    validUtcInstant(window.startAt) &&
      validUtcInstant(window.endAt) &&
      Date.parse(window.endAt as string) > Date.parse(window.startAt as string),
  );
}

function sameWindow(left: ClarityLiveUtcWindowV1, right: ClarityLiveUtcWindowV1): boolean {
  return Date.parse(left.startAt) === Date.parse(right.startAt)
    && Date.parse(left.endAt) === Date.parse(right.endAt);
}

function durationMatches(window: ClarityLiveUtcWindowV1, lookbackDays: number): boolean {
  return Date.parse(window.endAt) - Date.parse(window.startAt) === lookbackDays * DAY_MS;
}

function normalizedProviderMetric(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function validEvidenceRef(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 240;
}

function isValidMetricObservation(value: unknown): value is ClarityLiveMetricObservationV1 {
  if (!strictKeys(value, ALLOWED_METRIC_KEYS)) return false;
  const observation = value as Partial<ClarityLiveMetricObservationV1>;
  return Boolean(
    typeof observation.providerMetric === "string" &&
      observation.providerMetric.trim().length > 0 &&
      observation.providerMetric.length <= 120 &&
      typeof observation.canonicalMetric === "string" &&
      CANONICAL_METRICS.has(observation.canonicalMetric as ClarityCanonicalMetricV1) &&
      typeof observation.semantic === "string" &&
      SEMANTICS.has(observation.semantic as ClarityLiveMetricSemanticV1) &&
      (observation.value === null || finiteNonNegative(observation.value)) &&
      validEvidenceRef(observation.evidenceRef)
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function baseResult(
  input: Partial<ClarityLiveExportInputV1>,
  gateState: ClarityLiveExportGateStateV1,
  reasonCodes: ClarityLiveExportReasonCodeV1[],
  safeNextStep: string,
  projectedMetrics: ClarityPeriodMetricsV1 = {},
  unprojectedMetrics: ClarityUnprojectedMetricV1[] = [],
): ClarityLiveExportGateResultV1 {
  const requestedWindow = validWindow(input.requestedWindow)
    ? { ...input.requestedWindow }
    : { startAt: "UNKNOWN", endAt: "UNKNOWN" };
  const observedWindow = validWindow(input.observedWindow)
    ? { ...input.observedWindow }
    : { startAt: "UNKNOWN", endAt: "UNKNOWN" };
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? [...new Set(input.evidenceRefs.filter(validEvidenceRef))].sort()
    : [];
  const dimensions = Array.isArray(input.dimensions)
    ? [...input.dimensions].filter((value): value is string => typeof value === "string").sort()
    : [];
  const periodProjectionComplete = CORE_PERIOD_METRICS.every(
    (metricName) => typeof projectedMetrics[metricName] === "number",
  );

  return deepFreeze({
    version: CLARITY_LIVE_EXPORT_GATE_VERSION,
    gateState,
    sourceTruth: SOURCE_TRUTHS.has(input.sourceTruth as ClarityEvidenceTruthState)
      ? input.sourceTruth as ClarityEvidenceTruthState
      : "UNKNOWN",
    reasonCodes: [...new Set(reasonCodes)],
    requestedWindow,
    observedWindow,
    extractedAt: validUtcInstant(input.extractedAt) ? input.extractedAt : "UNKNOWN",
    coverage: {
      lookbackDays: finiteNonNegative(input.lookbackDays) ? input.lookbackDays : 0,
      utcRequired: true,
      maxSupportedLookbackDays: CLARITY_DATA_EXPORT_MAX_LOOKBACK_DAYS,
      maxDimensions: CLARITY_DATA_EXPORT_MAX_DIMENSIONS,
      rowLimit: CLARITY_DATA_EXPORT_ROW_LIMIT,
      paginationSupported: false,
      maxRequestsPerProjectPerDay: CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY,
      dimensions,
      responseRows: finiteNonNegative(input.responseRows) ? input.responseRows : 0,
      rowLimitReached: input.rowLimitReached === true,
    },
    projectedMetrics: { ...projectedMetrics },
    unprojectedMetrics: unprojectedMetrics.map((metric) => ({ ...metric })),
    periodProjectionComplete,
    evidenceRefs,
    safeNextStep,
    authority: {
      networkCallPerformed: false,
      credentialAccessPerformed: false,
      persistencePerformed: false,
      externalMutationAllowed: false,
      metaWriteAllowed: false,
    },
  });
}

function reject(
  input: Partial<ClarityLiveExportInputV1>,
  reasonCode: ClarityLiveExportReasonCodeV1,
  safeNextStep: string,
): ClarityLiveExportGateResultV1 {
  return baseResult(input, "REJECTED", [reasonCode], safeNextStep);
}

/**
 * Validates one already-fetched Microsoft Clarity Data Export API snapshot.
 *
 * This boundary intentionally performs no fetch, secret read, persistence, or
 * external mutation. It only decides whether the supplied live export can be
 * retained as bounded evidence and which explicitly compatible metrics may be
 * projected toward the existing Clarity behavioral model.
 */
export function gateClarityLiveExportV1(input: ClarityLiveExportInputV1): ClarityLiveExportGateResultV1 {
  if (!strictKeys(input, ALLOWED_TOP_LEVEL_KEYS)) {
    return reject(input ?? {}, "INVALID_INPUT", "Discard the malformed snapshot and recollect it through the bounded Clarity connector contract.");
  }
  if (
    input.source !== "MICROSOFT_CLARITY_DATA_EXPORT_API" ||
    !SOURCE_TRUTHS.has(input.sourceTruth) ||
    !validWindow(input.requestedWindow) ||
    !validWindow(input.observedWindow) ||
    !validUtcInstant(input.extractedAt) ||
    !validUtcInstant(input.now) ||
    !finiteNonNegative(input.maxAgeHours) ||
    !Number.isInteger(input.responseRows) ||
    input.responseRows < 0 ||
    input.responseRows > CLARITY_DATA_EXPORT_ROW_LIMIT ||
    typeof input.rowLimitReached !== "boolean" ||
    !Array.isArray(input.dimensions) ||
    !Array.isArray(input.evidenceRefs) ||
    !Array.isArray(input.metrics) ||
    input.metrics.length > 50 ||
    input.evidenceRefs.length > 20 ||
    !input.evidenceRefs.every(validEvidenceRef) ||
    !input.metrics.every(isValidMetricObservation)
  ) {
    return reject(input, "INVALID_INPUT", "Discard the malformed snapshot and recollect it through the bounded Clarity connector contract.");
  }

  if (![1, 2, 3].includes(input.lookbackDays) || !Number.isInteger(input.lookbackDays)) {
    return reject(input, "UNSUPPORTED_LOOKBACK", "Collect supported 1-, 2-, or 3-day Clarity exports and retain them incrementally for longer history.");
  }
  if (input.dimensions.length > CLARITY_DATA_EXPORT_MAX_DIMENSIONS) {
    return reject(input, "TOO_MANY_DIMENSIONS", "Recollect using no more than three supported Clarity dimensions.");
  }
  if (input.dimensions.some((dimension) => !SUPPORTED_DIMENSIONS.has(dimension))) {
    return reject(input, "UNSUPPORTED_DIMENSION", "Recollect using only dimensions documented by the Clarity Data Export API.");
  }
  if (!durationMatches(input.requestedWindow, input.lookbackDays) || !durationMatches(input.observedWindow, input.lookbackDays)) {
    return reject(input, "WINDOW_DURATION_MISMATCH", "Recollect with an explicit UTC window whose duration exactly matches the requested 1-3 day lookback.");
  }
  if (!sameWindow(input.requestedWindow, input.observedWindow)) {
    return reject(input, "OBSERVED_WINDOW_MISMATCH", "Keep the export as non-decision evidence only and recollect the exact requested UTC window.");
  }
  if (Date.parse(input.extractedAt) > Date.parse(input.now)) {
    return reject(input, "INVALID_INPUT", "Correct the extraction clock/provenance before accepting this snapshot.");
  }
  if (Date.parse(input.now) - Date.parse(input.extractedAt) > input.maxAgeHours * 60 * 60 * 1_000) {
    return reject(input, "EXTRACTION_STALE", "Recollect a fresh Clarity export before using behavioral evidence in a decision.");
  }
  if (input.evidenceRefs.length === 0) {
    return reject(input, "MISSING_PROVENANCE", "Attach a bounded provider/export evidence reference before retaining the snapshot.");
  }
  const evidenceSet = new Set(input.evidenceRefs);
  if (input.metrics.some((metric) => !evidenceSet.has(metric.evidenceRef))) {
    return reject(input, "MISSING_PROVENANCE", "Attach every projected metric to an evidence reference carried by this exact export.");
  }

  if (input.sourceTruth === "CONFLICTED") {
    return reject(input, "SOURCE_CONFLICTED", "Reconcile the conflicting Clarity evidence before using or accumulating this snapshot.");
  }
  if (input.sourceTruth === "UNAVAILABLE") {
    return reject(input, "SOURCE_UNAVAILABLE", "Keep Clarity unavailable and allow WooCommerce, GA4, Meta, and checkout evidence to continue independently.");
  }
  if (input.sourceTruth === "STALE") {
    return reject(input, "SOURCE_STALE", "Recollect Clarity rather than promoting stale provider evidence.");
  }

  const reasons: ClarityLiveExportReasonCodeV1[] = [];
  let gateState: ClarityLiveExportGateStateV1 = "ACCEPTED_FOR_HISTORY";
  if (input.sourceTruth === "PARTIAL") {
    gateState = "PARTIAL_ONLY";
    reasons.push("SOURCE_PARTIAL");
  } else if (input.sourceTruth === "UNKNOWN") {
    gateState = "PARTIAL_ONLY";
    reasons.push("SOURCE_UNKNOWN");
  }
  if (input.rowLimitReached || input.responseRows === CLARITY_DATA_EXPORT_ROW_LIMIT) {
    gateState = "PARTIAL_ONLY";
    reasons.push("ROW_LIMIT_MAY_TRUNCATE");
  }

  const projectedMetrics: ClarityPeriodMetricsV1 = {};
  const unprojectedMetrics: ClarityUnprojectedMetricV1[] = [];
  const seenCanonical = new Map<ClarityCanonicalMetricV1, number>();

  for (const observation of input.metrics) {
    if (observation.value === null) {
      reasons.push("METRIC_VALUE_UNKNOWN");
      unprojectedMetrics.push({ ...observation, reasonCode: "METRIC_VALUE_UNKNOWN" });
      continue;
    }
    if (!finiteNonNegative(observation.value)) {
      gateState = "PARTIAL_ONLY";
      reasons.push("METRIC_VALUE_INVALID");
      unprojectedMetrics.push({ ...observation, reasonCode: "METRIC_VALUE_INVALID" });
      continue;
    }

    const prior = seenCanonical.get(observation.canonicalMetric);
    if (prior !== undefined && prior !== observation.value) {
      return baseResult(
        input,
        "REJECTED",
        ["CONFLICTING_METRIC_OBSERVATIONS"],
        "Reconcile the conflicting metric observations from the same export before projection.",
        {},
        [],
      );
    }

    const expectedSemantic = REQUIRED_SEMANTIC[observation.canonicalMetric];
    const isProviderEventCount = PROVIDER_EVENT_COUNTS.has(normalizedProviderMetric(observation.providerMetric));
    const targetsAffectedSessions = expectedSemantic === "SESSION_AFFECTED_COUNT";

    if (isProviderEventCount && targetsAffectedSessions) {
      reasons.push("EVENT_COUNT_NOT_SESSION_COUNT");
      unprojectedMetrics.push({ ...observation, reasonCode: "EVENT_COUNT_NOT_SESSION_COUNT" });
      continue;
    }
    if (observation.semantic !== expectedSemantic) {
      reasons.push("METRIC_SEMANTIC_MISMATCH");
      unprojectedMetrics.push({ ...observation, reasonCode: "METRIC_SEMANTIC_MISMATCH" });
      continue;
    }

    seenCanonical.set(observation.canonicalMetric, observation.value);
    projectedMetrics[observation.canonicalMetric] = observation.value;
  }

  const periodProjectionComplete = CORE_PERIOD_METRICS.every(
    (metricName) => typeof projectedMetrics[metricName] === "number",
  );
  if (!periodProjectionComplete) reasons.push("PERIOD_PROJECTION_INCOMPLETE");
  if (reasons.length === 0) reasons.push("ACCEPTED");

  const safeNextStep = gateState === "PARTIAL_ONLY"
    ? "Retain only as partial evidence; recollect or narrow the export before behavioral decisions, without blocking other revenue sources."
    : periodProjectionComplete
      ? "Persist the immutable bounded snapshot, pair it with an exact comparison-period snapshot, then run the existing Clarity behavior model."
      : "Persist the bounded raw snapshot, but collect the missing session-scoped metrics before promoting Clarity friction evidence to decision-grade behavior intelligence.";

  return baseResult(input, gateState, reasons, safeNextStep, projectedMetrics, unprojectedMetrics);
}
