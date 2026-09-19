import {
  CLARITY_DATA_EXPORT_REQUEST_PLAN_VERSION,
  type ClarityDataExportRequestPlanV1,
} from "./data-export-request-plan-v1";
import {
  gateClarityLiveExportV1,
  type ClarityLiveExportGateResultV1,
  type ClarityLiveMetricObservationV1,
  type ClarityLiveUtcWindowV1,
} from "./live-export-gate-v1";
import type { ClarityEvidenceTruthState } from "./view-model-v1";

export const CLARITY_DATA_EXPORT_RESPONSE_ADAPTER_VERSION =
  "CLARITY_DATA_EXPORT_RESPONSE_ADAPTER_V1" as const;

export type ClarityDataExportResponseAdapterReasonV1 =
  | "ADAPTED"
  | "PLAN_NOT_READY"
  | "INVALID_FETCH_CONTEXT"
  | "INVALID_RESPONSE"
  | "TRAFFIC_FIELD_INVALID"
  | "TRAFFIC_DIMENSION_VALUE_MISSING"
  | "DIMENSIONAL_PERIOD_AGGREGATION_WITHHELD"
  | "PROVIDER_METRIC_UNMAPPED";

export type ClarityTrafficRowV1 = Readonly<{
  rowIndex: number;
  dimensions: Readonly<Record<string, string | null>>;
  totalSessionCount: number | null;
  totalBotSessionCount: number | null;
  distinctUserCount: number | null;
  pagesPerSession: number | null;
  evidenceRef: string;
}>;

export type ClarityDataExportResponseAdapterInputV1 = Readonly<{
  plan: ClarityDataExportRequestPlanV1;
  responseJson: unknown;
  sourceTruth: ClarityEvidenceTruthState;
  observedWindow: ClarityLiveUtcWindowV1;
  fetchedAt: string;
  now: string;
  maxAgeHours: number;
  evidenceRef: string;
}>;

export type ClarityDataExportResponseAdapterResultV1 = Readonly<{
  version: typeof CLARITY_DATA_EXPORT_RESPONSE_ADAPTER_VERSION;
  adapterState: "ADAPTED" | "REJECTED";
  reasonCodes: readonly ClarityDataExportResponseAdapterReasonV1[];
  effectiveSourceTruth: ClarityEvidenceTruthState;
  providerMetricNames: readonly string[];
  unmappedProviderMetricNames: readonly string[];
  trafficRows: readonly ClarityTrafficRowV1[];
  periodAggregationWithheld: boolean;
  gateResult: ClarityLiveExportGateResultV1 | null;
  evidenceRefs: readonly string[];
  authority: Readonly<{
    networkCallPerformed: false;
    credentialAccessPerformed: false;
    persistencePerformed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
  }>;
}>;

type ProviderMetricBlock = {
  metricName: string;
  information: readonly Record<string, unknown>[];
};

const MAX_PROVIDER_METRIC_BLOCKS = 100;
const MAX_PROVIDER_ROWS_PER_METRIC = 1_000;
const MAX_PROVIDER_ROW_KEYS = 64;
const ALLOWED_SOURCE_TRUTHS = new Set<ClarityEvidenceTruthState>([
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "UNAVAILABLE",
]);
const SECRET_LIKE_REF =
  /(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validWindow(value: unknown): value is ClarityLiveUtcWindowV1 {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "startAt" && key !== "endAt")) return false;
  const startAt = value.startAt;
  const endAt = value.endAt;
  return Boolean(
    canonicalInstant(startAt) &&
      canonicalInstant(endAt) &&
      Date.parse(endAt as string) > Date.parse(startAt as string),
  );
}

function validEvidenceRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 240 &&
    !/[\r\n]/.test(value) &&
    !SECRET_LIKE_REF.test(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseNonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hasInvalidNumericCell(row: Record<string, unknown>, key: string): boolean {
  return key in row && row[key] != null && parseNonNegativeNumber(row[key]) === null;
}

function normalizedMetricName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseProviderResponse(value: unknown): ProviderMetricBlock[] | null {
  if (!Array.isArray(value) || value.length > MAX_PROVIDER_METRIC_BLOCKS) return null;

  const blocks: ProviderMetricBlock[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) return null;
    if (
      typeof entry.metricName !== "string" ||
      entry.metricName.trim().length === 0 ||
      entry.metricName.length > 120 ||
      !Array.isArray(entry.information) ||
      entry.information.length > MAX_PROVIDER_ROWS_PER_METRIC
    ) {
      return null;
    }

    const rows: Record<string, unknown>[] = [];
    for (const row of entry.information) {
      if (!isPlainObject(row) || Object.keys(row).length > MAX_PROVIDER_ROW_KEYS) return null;
      rows.push(row);
    }
    blocks.push({ metricName: entry.metricName.trim(), information: rows });
  }
  return blocks;
}

function rejected(
  input: Partial<ClarityDataExportResponseAdapterInputV1>,
  reason: ClarityDataExportResponseAdapterReasonV1,
): ClarityDataExportResponseAdapterResultV1 {
  const sourceTruth = ALLOWED_SOURCE_TRUTHS.has(input.sourceTruth as ClarityEvidenceTruthState)
    ? (input.sourceTruth as ClarityEvidenceTruthState)
    : "UNKNOWN";
  return deepFreeze({
    version: CLARITY_DATA_EXPORT_RESPONSE_ADAPTER_VERSION,
    adapterState: "REJECTED" as const,
    reasonCodes: [reason],
    effectiveSourceTruth: sourceTruth,
    providerMetricNames: [],
    unmappedProviderMetricNames: [],
    trafficRows: [],
    periodAggregationWithheld: false,
    gateResult: null,
    evidenceRefs: validEvidenceRef(input.evidenceRef) ? [input.evidenceRef.trim()] : [],
    authority: {
      networkCallPerformed: false as const,
      credentialAccessPerformed: false as const,
      persistencePerformed: false as const,
      externalMutationAllowed: false as const,
      metaWriteAllowed: false as const,
    },
  });
}

function validReadyPlan(plan: ClarityDataExportRequestPlanV1): boolean {
  return Boolean(
    plan &&
      plan.version === CLARITY_DATA_EXPORT_REQUEST_PLAN_VERSION &&
      plan.status === "READY" &&
      plan.reasonCode === "REQUEST_READY" &&
      plan.requestUrl &&
      plan.requestedAt &&
      plan.expectedUtcWindow &&
      plan.lookbackDays &&
      [1, 2, 3].includes(plan.lookbackDays) &&
      plan.providerLimits.maximumRows === MAX_PROVIDER_ROWS_PER_METRIC &&
      plan.providerLimits.maximumLookbackDays === 3 &&
      plan.providerLimits.paginationSupported === false &&
      plan.providerLimits.responseTimezone === "UTC" &&
      plan.handoff.responseMustPassLiveExportGate === true &&
      plan.authority.networkCallPerformed === false &&
      plan.authority.credentialAccessPerformed === false &&
      plan.authority.persistencePerformed === false &&
      plan.authority.externalMutationAllowed === false,
  );
}

function dimensionValue(row: Record<string, unknown>, dimension: string): string | null {
  const value = row[dimension];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Converts one already-fetched Microsoft Clarity Data Export API response into
 * the existing live-export gate contract without guessing undocumented metric
 * semantics or aggregating dimension rows into fake period totals.
 *
 * This adapter intentionally performs no network access, credential access,
 * persistence, or external mutation. The caller must provide the exact READY
 * request plan, observed fetch window, fetch timestamp, source truth, and a
 * non-secret evidence reference from the authorized connector runtime.
 */
export function adaptClarityDataExportResponseV1(
  input: ClarityDataExportResponseAdapterInputV1,
): ClarityDataExportResponseAdapterResultV1 {
  if (!input || !validReadyPlan(input.plan)) return rejected(input ?? {}, "PLAN_NOT_READY");
  if (
    !canonicalInstant(input.fetchedAt) ||
    !canonicalInstant(input.now) ||
    Date.parse(input.fetchedAt) > Date.parse(input.now) ||
    !validWindow(input.observedWindow) ||
    !Number.isFinite(input.maxAgeHours) ||
    input.maxAgeHours < 0 ||
    !validEvidenceRef(input.evidenceRef) ||
    !ALLOWED_SOURCE_TRUTHS.has(input.sourceTruth)
  ) {
    return rejected(input, "INVALID_FETCH_CONTEXT");
  }

  const blocks = parseProviderResponse(input.responseJson);
  if (!blocks) return rejected(input, "INVALID_RESPONSE");

  const reasons = new Set<ClarityDataExportResponseAdapterReasonV1>();
  const providerMetricNames = [...new Set(blocks.map((block) => block.metricName))].sort((a, b) =>
    a.localeCompare(b),
  );
  const unmappedProviderMetricNames = [...new Set(
    blocks
      .filter((block) => normalizedMetricName(block.metricName) !== "traffic")
      .map((block) => block.metricName),
  )].sort((a, b) => a.localeCompare(b));
  if (unmappedProviderMetricNames.length > 0) reasons.add("PROVIDER_METRIC_UNMAPPED");

  const trafficBlocks = blocks.filter((block) => normalizedMetricName(block.metricName) === "traffic");
  const trafficRows: ClarityTrafficRowV1[] = [];
  const observations: ClarityLiveMetricObservationV1[] = [];
  let trafficRowIssue = false;

  for (const block of trafficBlocks) {
    block.information.forEach((row, rowIndex) => {
      const dimensions: Record<string, string | null> = {};
      for (const dimension of input.plan.dimensions) {
        dimensions[dimension] = dimensionValue(row, dimension);
        if (dimensions[dimension] === null) {
          reasons.add("TRAFFIC_DIMENSION_VALUE_MISSING");
          trafficRowIssue = true;
        }
      }

      const invalidNumericField = [
        "totalSessionCount",
        "totalBotSessionCount",
        "distantUserCount",
        "PagesPerSessionPercentage",
      ].some((key) => hasInvalidNumericCell(row, key));
      if (invalidNumericField) {
        reasons.add("TRAFFIC_FIELD_INVALID");
        trafficRowIssue = true;
      }

      const trafficRow: ClarityTrafficRowV1 = {
        rowIndex,
        dimensions,
        totalSessionCount: parseNonNegativeNumber(row.totalSessionCount),
        totalBotSessionCount: parseNonNegativeNumber(row.totalBotSessionCount),
        distinctUserCount: parseNonNegativeNumber(row.distantUserCount),
        pagesPerSession: parseNonNegativeNumber(row.PagesPerSessionPercentage),
        evidenceRef: input.evidenceRef.trim(),
      };
      trafficRows.push(trafficRow);
    });
  }

  const dimensional = input.plan.dimensions.length > 0;
  if (dimensional && trafficRows.length > 0) {
    reasons.add("DIMENSIONAL_PERIOD_AGGREGATION_WITHHELD");
  }

  if (!dimensional && trafficRows.length === 1) {
    const row = trafficRows[0];
    if (row.totalSessionCount != null) {
      observations.push({
        providerMetric: "Traffic.totalSessionCount",
        canonicalMetric: "sessions",
        semantic: "SESSION_COUNT",
        value: row.totalSessionCount,
        evidenceRef: row.evidenceRef,
      });
    }
    if (row.distinctUserCount != null) {
      observations.push({
        providerMetric: "Traffic.distantUserCount",
        canonicalMetric: "uniqueUsers",
        semantic: "DISTINCT_USER_COUNT",
        value: row.distinctUserCount,
        evidenceRef: row.evidenceRef,
      });
    }
    if (row.pagesPerSession != null) {
      observations.push({
        providerMetric: "Traffic.PagesPerSessionPercentage",
        canonicalMetric: "pagesPerSession",
        semantic: "AVERAGE_PER_SESSION",
        value: row.pagesPerSession,
        evidenceRef: row.evidenceRef,
      });
    }
  } else if (!dimensional && trafficRows.length > 1) {
    // Multiple undimensioned Traffic rows cannot be reconciled safely without
    // provider-specific row identity. Preserve the rows but withhold totals.
    reasons.add("DIMENSIONAL_PERIOD_AGGREGATION_WITHHELD");
    trafficRowIssue = true;
  }

  const maxInformationRows = blocks.reduce(
    (maximum, block) => Math.max(maximum, block.information.length),
    0,
  );
  const rowLimitReached = blocks.some(
    (block) => block.information.length === MAX_PROVIDER_ROWS_PER_METRIC,
  );
  const effectiveSourceTruth: ClarityEvidenceTruthState =
    input.sourceTruth === "COMPLETE" && trafficRowIssue ? "PARTIAL" : input.sourceTruth;

  const gateResult = gateClarityLiveExportV1({
    source: "MICROSOFT_CLARITY_DATA_EXPORT_API",
    sourceTruth: effectiveSourceTruth,
    lookbackDays: input.plan.lookbackDays as 1 | 2 | 3,
    requestedWindow: input.plan.expectedUtcWindow as ClarityLiveUtcWindowV1,
    observedWindow: input.observedWindow,
    extractedAt: input.fetchedAt,
    now: input.now,
    maxAgeHours: input.maxAgeHours,
    dimensions: [...input.plan.dimensions],
    responseRows: maxInformationRows,
    rowLimitReached,
    evidenceRefs: [input.evidenceRef.trim()],
    metrics: observations,
  });

  if (reasons.size === 0) reasons.add("ADAPTED");

  return deepFreeze({
    version: CLARITY_DATA_EXPORT_RESPONSE_ADAPTER_VERSION,
    adapterState: "ADAPTED" as const,
    reasonCodes: [...reasons],
    effectiveSourceTruth,
    providerMetricNames,
    unmappedProviderMetricNames,
    trafficRows,
    periodAggregationWithheld: reasons.has("DIMENSIONAL_PERIOD_AGGREGATION_WITHHELD"),
    gateResult,
    evidenceRefs: [input.evidenceRef.trim()],
    authority: {
      networkCallPerformed: false as const,
      credentialAccessPerformed: false as const,
      persistencePerformed: false as const,
      externalMutationAllowed: false as const,
      metaWriteAllowed: false as const,
    },
  });
}
