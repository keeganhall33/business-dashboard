import type { SocialHistoryWindowV1, SocialMetricKeyV1 } from "./social-canonical-v1";
import {
  compileSocialLiveProviderRunV1,
  toSocialProviderNormalizationContextV1,
  type SocialLiveProviderRunV1
} from "./social-live-provider-run-v1";
import {
  compileSocialProviderMetricNormalizationV1,
  type SocialProviderMetricMappingV1,
  type SocialProviderMetricNormalizationV1
} from "./social-provider-metric-normalization-v1";

export const YOUTUBE_ANALYTICS_REPORTS_ENDPOINT_V1 = "https://youtubeanalytics.googleapis.com/v2/reports";
export const YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1 = Object.freeze([
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
] as const);

export const YOUTUBE_ANALYTICS_SUPPORTED_METRICS_V1 = Object.freeze([
  "VIEWS",
  "WATCH_TIME_SECONDS",
  "LIKES",
  "COMMENTS",
  "SHARES"
] as const satisfies readonly SocialMetricKeyV1[]);

const YOUTUBE_METRIC_DEFINITION_EVIDENCE_V1 = "https://developers.google.com/youtube/analytics/metrics";
const YOUTUBE_REPORT_QUERY_EVIDENCE_V1 = "https://developers.google.com/youtube/analytics/reference/reports/query";
const DAY_MS = 86_400_000;
const MAX_RESPONSE_BYTES = 250_000;

type SupportedCanonicalMetricV1 = (typeof YOUTUBE_ANALYTICS_SUPPORTED_METRICS_V1)[number];
type ProviderMetricKeyV1 = "views" | "estimatedMinutesWatched" | "likes" | "comments" | "shares";

const METRIC_BINDINGS: Readonly<Record<SupportedCanonicalMetricV1, SocialProviderMetricMappingV1>> = Object.freeze({
  VIEWS: Object.freeze({
    providerMetricKey: "views",
    canonicalMetricKey: "VIEWS",
    nativeUnit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    providerDefinitionId: "youtube-analytics:v2:views",
    definitionEvidenceRefs: Object.freeze([YOUTUBE_METRIC_DEFINITION_EVIDENCE_V1])
  }),
  WATCH_TIME_SECONDS: Object.freeze({
    providerMetricKey: "estimatedMinutesWatched",
    canonicalMetricKey: "WATCH_TIME_SECONDS",
    nativeUnit: "MINUTES",
    aggregation: "PERIOD_TOTAL",
    providerDefinitionId: "youtube-analytics:v2:estimatedMinutesWatched",
    definitionEvidenceRefs: Object.freeze([YOUTUBE_METRIC_DEFINITION_EVIDENCE_V1])
  }),
  LIKES: Object.freeze({
    providerMetricKey: "likes",
    canonicalMetricKey: "LIKES",
    nativeUnit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    providerDefinitionId: "youtube-analytics:v2:likes",
    definitionEvidenceRefs: Object.freeze([YOUTUBE_METRIC_DEFINITION_EVIDENCE_V1])
  }),
  COMMENTS: Object.freeze({
    providerMetricKey: "comments",
    canonicalMetricKey: "COMMENTS",
    nativeUnit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    providerDefinitionId: "youtube-analytics:v2:comments",
    definitionEvidenceRefs: Object.freeze([YOUTUBE_METRIC_DEFINITION_EVIDENCE_V1])
  }),
  SHARES: Object.freeze({
    providerMetricKey: "shares",
    canonicalMetricKey: "SHARES",
    nativeUnit: "COUNT",
    aggregation: "PERIOD_TOTAL",
    providerDefinitionId: "youtube-analytics:v2:shares",
    definitionEvidenceRefs: Object.freeze([YOUTUBE_METRIC_DEFINITION_EVIDENCE_V1])
  })
});

export type YouTubeAnalyticsAuthorizedFetchV1 = (
  url: string,
  init: { method: "GET"; headers: { accept: "application/json" } }
) => Promise<{
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export type YouTubeAnalyticsEvidenceRecordV1 =
  | {
      kind: "REQUEST";
      provider: "YOUTUBE_ANALYTICS";
      runId: string;
      capturedAt: string;
      method: "GET";
      url: string;
      documentationRef: string;
    }
  | {
      kind: "RESPONSE";
      provider: "YOUTUBE_ANALYTICS";
      runId: string;
      capturedAt: string;
      status: number;
      body: unknown;
    };

export type YouTubeAnalyticsEvidenceSinkV1 = (
  record: YouTubeAnalyticsEvidenceRecordV1
) => string | Promise<string>;

export type RunYouTubeAnalyticsChannelReportInputV1 = {
  connectorId: string;
  runId: string;
  periodId: string;
  window: SocialHistoryWindowV1;
  startDate: string;
  endDate: string;
  requestedMetricKeys?: readonly SupportedCanonicalMetricV1[];
  previousSuccessfulSyncAt?: string | null;
  grantedYouTubeScopes: readonly string[];
};

export type YouTubeAnalyticsSafeRequestV1 = {
  method: "GET";
  url: string;
  ids: "channel==MINE";
  dimensions: "day";
  metrics: readonly ProviderMetricKeyV1[];
  startDate: string;
  endDate: string;
  requiredScopes: typeof YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1;
};

export type YouTubeAnalyticsChannelLiveRunV1 = {
  contractVersion: "YouTubeAnalyticsChannelLiveRunV1";
  provider: "YOUTUBE_ANALYTICS";
  platform: "YOUTUBE";
  connectorId: string;
  runId: string;
  request: YouTubeAnalyticsSafeRequestV1;
  httpStatus: number | null;
  requestedStartDate: string;
  requestedEndDate: string;
  observedStartDate: string | null;
  observedEndDate: string | null;
  completeRequestedDailyCoverage: boolean;
  providerRun: SocialLiveProviderRunV1;
  normalization: SocialProviderMetricNormalizationV1 | null;
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  authorizationBoundary: "READ_ONLY_REQUIRED_SCOPES_ONLY";
  providerWritesPerformed: false;
  causalAttributionClaimed: false;
};

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function requireDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid UTC calendar date`);
  }
  return value;
}

function requireClockDate(clock: () => Date, field: string): string {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${field} clock value must be a valid Date`);
  return value.toISOString();
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function inclusiveDayCount(startDate: string, endDate: string): number {
  return Math.floor((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / DAY_MS) + 1;
}

function validateNamedWindow(window: SocialHistoryWindowV1, startDate: string, endDate: string): void {
  const days = inclusiveDayCount(startDate, endDate);
  if (days <= 0) throw new Error("startDate cannot be after endDate");
  if (window === "7D" && days !== 7) throw new Error("7D YouTube report must span exactly 7 inclusive UTC dates");
  if (window === "30D" && days !== 30) throw new Error("30D YouTube report must span exactly 30 inclusive UTC dates");
  if (window === "90D" && days !== 90) throw new Error("90D YouTube report must span exactly 90 inclusive UTC dates");
  if (window === "12M" && days !== 365 && days !== 366) throw new Error("12M YouTube report must span exactly 365 or 366 inclusive UTC dates");
}

function normalizeScopes(scopes: readonly string[]): readonly string[] {
  if (!Array.isArray(scopes)) throw new Error("grantedYouTubeScopes must be an array");
  const normalized = [...new Set(scopes.map((scope) => requireNonEmpty(scope, "grantedYouTubeScopes[]")))].sort();
  const required = [...YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1].sort();
  if (normalized.length !== required.length || normalized.some((scope, index) => scope !== required[index])) {
    throw new Error("YouTube Analytics live runner requires exactly the documented read-only YouTube scopes and no broader YouTube authority");
  }
  return normalized;
}

function normalizeRequestedMetrics(values?: readonly SupportedCanonicalMetricV1[]): readonly SupportedCanonicalMetricV1[] {
  const requested = values ?? YOUTUBE_ANALYTICS_SUPPORTED_METRICS_V1;
  if (!Array.isArray(requested) || requested.length === 0) throw new Error("requestedMetricKeys must contain at least one supported metric");
  const supported = new Set<string>(YOUTUBE_ANALYTICS_SUPPORTED_METRICS_V1);
  const normalized: SupportedCanonicalMetricV1[] = [];
  for (const metric of requested) {
    if (!supported.has(metric)) throw new Error(`unsupported YouTube Analytics canonical metric: ${String(metric)}`);
    if (!normalized.includes(metric)) normalized.push(metric);
  }
  return normalized;
}

function safeEvidenceRef(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field);
  if (/^bearer\s+/i.test(normalized) || /(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)\s*[:=]/i.test(normalized)) {
    throw new Error(`${field} must not contain credential material`);
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) throw new Error(`${field} must not contain embedded credentials`);
    for (const key of ["access_token", "token", "api_key", "apikey", "signature", "secret"]) {
      if (parsed.searchParams.has(key)) throw new Error(`${field} must not contain credential query parameters`);
    }
  } catch (error) {
    if (error instanceof Error && /credential/.test(error.message)) throw error;
  }
  return normalized;
}

function buildSafeRequest(
  startDate: string,
  endDate: string,
  metrics: readonly ProviderMetricKeyV1[]
): YouTubeAnalyticsSafeRequestV1 {
  const url = new URL(YOUTUBE_ANALYTICS_REPORTS_ENDPOINT_V1);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("metrics", metrics.join(","));
  url.searchParams.set("dimensions", "day");
  return freeze({
    method: "GET",
    url: url.toString(),
    ids: "channel==MINE",
    dimensions: "day",
    metrics: [...metrics],
    startDate,
    endDate,
    requiredScopes: YOUTUBE_ANALYTICS_REQUIRED_SCOPES_V1
  });
}

function parseRetryAfter(response: { headers?: { get(name: string): string | null } }, retrievedAt: string): string | null {
  const raw = response.headers?.get("retry-after")?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return new Date(Date.parse(retrievedAt) + Number(raw) * 1000).toISOString();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) || parsed < Date.parse(retrievedAt) ? null : new Date(parsed).toISOString();
}

function responseSizeWithinBound(body: unknown): boolean {
  try {
    return JSON.stringify(body).length <= MAX_RESPONSE_BYTES;
  } catch {
    return false;
  }
}

function failedProviderRun(input: {
  connectorId: string;
  runId: string;
  startedAt: string;
  retrievedAt: string;
  requestedMetricKeys: readonly SupportedCanonicalMetricV1[];
  window: SocialHistoryWindowV1;
  previousSuccessfulSyncAt?: string | null;
  reason: "RATE_LIMIT" | "PROVIDER_ERROR" | "NETWORK_ERROR";
  retryAfterAt?: string | null;
  limitation: string;
}): SocialLiveProviderRunV1 {
  return compileSocialLiveProviderRunV1(
    {
      platform: "YOUTUBE",
      connectorId: input.connectorId,
      runId: input.runId,
      sourceKind: "OFFICIAL_API",
      authorizationState: "AUTHORIZED",
      readOnly: true,
      externalAccessPerformed: true,
      writesPerformed: false,
      startedAt: input.startedAt,
      retrievedAt: input.retrievedAt,
      previousSuccessfulSyncAt: input.previousSuccessfulSyncAt,
      requestedMetricKeys: input.requestedMetricKeys,
      requestedWindows: [input.window],
      pages: [],
      runState: "FAILED",
      paginationExhausted: false,
      interruptionReason: input.reason,
      retryAfterAt: input.retryAfterAt ?? null,
      limitations: [input.limitation]
    },
    input.retrievedAt
  );
}

function result(input: Omit<YouTubeAnalyticsChannelLiveRunV1, "contractVersion" | "provider" | "platform" | "authorizationBoundary" | "providerWritesPerformed" | "causalAttributionClaimed">): YouTubeAnalyticsChannelLiveRunV1 {
  return freeze({
    contractVersion: "YouTubeAnalyticsChannelLiveRunV1",
    provider: "YOUTUBE_ANALYTICS",
    platform: "YOUTUBE",
    ...input,
    authorizationBoundary: "READ_ONLY_REQUIRED_SCOPES_ONLY",
    providerWritesPerformed: false,
    causalAttributionClaimed: false
  });
}

function parseDailyRows(
  body: unknown,
  providerMetrics: readonly ProviderMetricKeyV1[],
  startDate: string,
  endDate: string
): {
  observedStartDate: string | null;
  observedEndDate: string | null;
  complete: boolean;
  totals: Readonly<Record<ProviderMetricKeyV1, number>> | null;
  rowCount: number;
  limitation: string | null;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("YouTube Analytics response must be an object");
  const record = body as { columnHeaders?: unknown; rows?: unknown };
  if (!Array.isArray(record.columnHeaders)) throw new Error("YouTube Analytics response is missing columnHeaders");
  const headers = record.columnHeaders.map((header, index) => {
    if (!header || typeof header !== "object" || Array.isArray(header)) throw new Error(`columnHeaders[${index}] must be an object`);
    return requireNonEmpty(String((header as { name?: unknown }).name ?? ""), `columnHeaders[${index}].name`);
  });
  const expectedHeaders = ["day", ...providerMetrics];
  if (headers.length !== expectedHeaders.length || expectedHeaders.some((header) => !headers.includes(header))) {
    throw new Error("YouTube Analytics response columns do not exactly match the requested day dimension and metrics");
  }
  const dayIndex = headers.indexOf("day");
  const metricIndexes = new Map<ProviderMetricKeyV1, number>(providerMetrics.map((metric) => [metric, headers.indexOf(metric)]));
  const rows = record.rows == null ? [] : record.rows;
  if (!Array.isArray(rows)) throw new Error("YouTube Analytics rows must be an array when present");
  const expectedDays = inclusiveDayCount(startDate, endDate);
  if (rows.length > expectedDays) throw new Error("YouTube Analytics returned more daily rows than the requested window contains");

  const byDay = new Map<string, Readonly<Record<ProviderMetricKeyV1, number>>>();
  for (const [rowIndex, rawRow] of rows.entries()) {
    if (!Array.isArray(rawRow) || rawRow.length !== headers.length) throw new Error(`rows[${rowIndex}] does not match the response columns`);
    const day = requireDate(String(rawRow[dayIndex] ?? ""), `rows[${rowIndex}].day`);
    if (day < startDate || day > endDate) throw new Error(`rows[${rowIndex}].day falls outside the requested window`);
    if (byDay.has(day)) throw new Error(`duplicate YouTube Analytics day row: ${day}`);
    const values = {} as Record<ProviderMetricKeyV1, number>;
    for (const metric of providerMetrics) {
      const value = rawRow[metricIndexes.get(metric) ?? -1];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`rows[${rowIndex}].${metric} must be a finite non-negative number`);
      }
      if (metric !== "estimatedMinutesWatched" && !Number.isInteger(value)) {
        throw new Error(`rows[${rowIndex}].${metric} must be an integer count`);
      }
      values[metric] = value;
    }
    byDay.set(day, freeze(values));
  }

  const days = [...byDay.keys()].sort();
  const observedStartDate = days[0] ?? null;
  const observedEndDate = days.at(-1) ?? null;
  let missingDate: string | null = null;
  for (let offset = 0; offset < expectedDays; offset += 1) {
    const day = addDays(startDate, offset);
    if (!byDay.has(day)) {
      missingDate = day;
      break;
    }
  }
  if (missingDate) {
    return {
      observedStartDate,
      observedEndDate,
      complete: false,
      totals: null,
      rowCount: rows.length,
      limitation: `YouTube Analytics daily coverage is incomplete; ${missingDate} has no evidenced row, so period totals remain UNKNOWN.`
    };
  }

  const totals = {} as Record<ProviderMetricKeyV1, number>;
  for (const metric of providerMetrics) {
    totals[metric] = [...byDay.values()].reduce((sum, values) => sum + values[metric], 0);
  }
  return {
    observedStartDate,
    observedEndDate,
    complete: true,
    totals: freeze(totals),
    rowCount: rows.length,
    limitation: null
  };
}

export async function runYouTubeAnalyticsChannelReportV1(
  input: RunYouTubeAnalyticsChannelReportInputV1,
  authorizedFetch: YouTubeAnalyticsAuthorizedFetchV1,
  evidenceSink: YouTubeAnalyticsEvidenceSinkV1,
  clock: () => Date = () => new Date()
): Promise<YouTubeAnalyticsChannelLiveRunV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (typeof authorizedFetch !== "function") throw new Error("authorizedFetch is required");
  if (typeof evidenceSink !== "function") throw new Error("evidenceSink is required");
  normalizeScopes(input.grantedYouTubeScopes);
  const connectorId = requireNonEmpty(input.connectorId, "connectorId");
  const runId = requireNonEmpty(input.runId, "runId");
  const periodId = requireNonEmpty(input.periodId, "periodId");
  const startDate = requireDate(input.startDate, "startDate");
  const endDate = requireDate(input.endDate, "endDate");
  validateNamedWindow(input.window, startDate, endDate);
  const requestedMetricKeys = normalizeRequestedMetrics(input.requestedMetricKeys);
  const bindings = requestedMetricKeys.map((metric) => METRIC_BINDINGS[metric]);
  const providerMetrics = bindings.map((binding) => binding.providerMetricKey as ProviderMetricKeyV1);
  const startedAt = requireClockDate(clock, "startedAt");
  const currentUtcDate = startedAt.slice(0, 10);
  if (endDate >= currentUtcDate) {
    throw new Error("YouTube Analytics endDate must be before the current UTC date so incomplete current-day data cannot be treated as final");
  }
  const request = buildSafeRequest(startDate, endDate, providerMetrics);
  const requestEvidenceRef = safeEvidenceRef(
    await evidenceSink({
      kind: "REQUEST",
      provider: "YOUTUBE_ANALYTICS",
      runId,
      capturedAt: startedAt,
      method: "GET",
      url: request.url,
      documentationRef: YOUTUBE_REPORT_QUERY_EVIDENCE_V1
    }),
    "requestEvidenceRef"
  );

  let response: Awaited<ReturnType<YouTubeAnalyticsAuthorizedFetchV1>>;
  try {
    response = await authorizedFetch(request.url, { method: "GET", headers: { accept: "application/json" } });
  } catch {
    const retrievedAt = requireClockDate(clock, "retrievedAt");
    const limitation = "Authorized YouTube Analytics fetch failed before a usable provider response was obtained.";
    return result({
      connectorId,
      runId,
      request,
      httpStatus: null,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      observedStartDate: null,
      observedEndDate: null,
      completeRequestedDailyCoverage: false,
      providerRun: failedProviderRun({
        connectorId,
        runId,
        startedAt,
        retrievedAt,
        requestedMetricKeys,
        window: input.window,
        previousSuccessfulSyncAt: input.previousSuccessfulSyncAt,
        reason: "NETWORK_ERROR",
        limitation
      }),
      normalization: null,
      evidenceRefs: [requestEvidenceRef],
      limitations: [limitation]
    });
  }

  let body: unknown = null;
  let parsed = true;
  try {
    body = await response.json();
  } catch {
    parsed = false;
  }
  const retrievedAt = requireClockDate(clock, "retrievedAt");
  if (!parsed || !responseSizeWithinBound(body)) {
    const limitation = parsed
      ? `YouTube Analytics response exceeded the ${MAX_RESPONSE_BYTES}-byte bounded evidence limit.`
      : "YouTube Analytics returned a response body that could not be parsed as JSON.";
    return result({
      connectorId,
      runId,
      request,
      httpStatus: response.status,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      observedStartDate: null,
      observedEndDate: null,
      completeRequestedDailyCoverage: false,
      providerRun: failedProviderRun({
        connectorId,
        runId,
        startedAt,
        retrievedAt,
        requestedMetricKeys,
        window: input.window,
        previousSuccessfulSyncAt: input.previousSuccessfulSyncAt,
        reason: response.status === 429 ? "RATE_LIMIT" : "PROVIDER_ERROR",
        retryAfterAt: response.status === 429 ? parseRetryAfter(response, retrievedAt) : null,
        limitation
      }),
      normalization: null,
      evidenceRefs: [requestEvidenceRef],
      limitations: [limitation]
    });
  }

  const responseEvidenceRef = safeEvidenceRef(
    await evidenceSink({
      kind: "RESPONSE",
      provider: "YOUTUBE_ANALYTICS",
      runId,
      capturedAt: retrievedAt,
      status: response.status,
      body
    }),
    "responseEvidenceRef"
  );
  const evidenceRefs = [...new Set([requestEvidenceRef, responseEvidenceRef])].sort();

  if (response.status < 200 || response.status >= 300) {
    const limitation = `YouTube Analytics returned HTTP ${response.status}; no provider values were admitted into canonical social truth.`;
    return result({
      connectorId,
      runId,
      request,
      httpStatus: response.status,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      observedStartDate: null,
      observedEndDate: null,
      completeRequestedDailyCoverage: false,
      providerRun: failedProviderRun({
        connectorId,
        runId,
        startedAt,
        retrievedAt,
        requestedMetricKeys,
        window: input.window,
        previousSuccessfulSyncAt: input.previousSuccessfulSyncAt,
        reason: response.status === 429 ? "RATE_LIMIT" : "PROVIDER_ERROR",
        retryAfterAt: response.status === 429 ? parseRetryAfter(response, retrievedAt) : null,
        limitation
      }),
      normalization: null,
      evidenceRefs,
      limitations: [limitation]
    });
  }

  let daily;
  try {
    daily = parseDailyRows(body, providerMetrics, startDate, endDate);
  } catch {
    const limitation = "YouTube Analytics returned a successful HTTP response whose report schema or metric values failed strict validation.";
    return result({
      connectorId,
      runId,
      request,
      httpStatus: response.status,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      observedStartDate: null,
      observedEndDate: null,
      completeRequestedDailyCoverage: false,
      providerRun: failedProviderRun({
        connectorId,
        runId,
        startedAt,
        retrievedAt,
        requestedMetricKeys,
        window: input.window,
        previousSuccessfulSyncAt: input.previousSuccessfulSyncAt,
        reason: "PROVIDER_ERROR",
        limitation
      }),
      normalization: null,
      evidenceRefs,
      limitations: [limitation]
    });
  }

  if (!daily.complete || !daily.totals) {
    const limitation = daily.limitation ?? "YouTube Analytics daily coverage is incomplete; canonical period totals remain UNKNOWN.";
    const providerRun = compileSocialLiveProviderRunV1(
      {
        platform: "YOUTUBE",
        connectorId,
        runId,
        sourceKind: "OFFICIAL_API",
        authorizationState: "AUTHORIZED",
        readOnly: true,
        externalAccessPerformed: true,
        writesPerformed: false,
        startedAt,
        retrievedAt,
        previousSuccessfulSyncAt: input.previousSuccessfulSyncAt,
        requestedMetricKeys,
        requestedWindows: [input.window],
        pages: [{ pageIndex: 0, capturedAt: retrievedAt, itemCount: daily.rowCount, evidenceRefs: [responseEvidenceRef] }],
        runState: "PARTIAL",
        paginationExhausted: false,
        interruptionReason: "OTHER",
        limitations: [limitation]
      },
      retrievedAt
    );
    return result({
      connectorId,
      runId,
      request,
      httpStatus: response.status,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      observedStartDate: daily.observedStartDate,
      observedEndDate: daily.observedEndDate,
      completeRequestedDailyCoverage: false,
      providerRun,
      normalization: null,
      evidenceRefs,
      limitations: [limitation]
    });
  }

  const providerRun = compileSocialLiveProviderRunV1(
    {
      platform: "YOUTUBE",
      connectorId,
      runId,
      sourceKind: "OFFICIAL_API",
      authorizationState: "AUTHORIZED",
      readOnly: true,
      externalAccessPerformed: true,
      writesPerformed: false,
      startedAt,
      retrievedAt,
      previousSuccessfulSyncAt: input.previousSuccessfulSyncAt,
      requestedMetricKeys,
      requestedWindows: [input.window],
      pages: [{ pageIndex: 0, capturedAt: retrievedAt, itemCount: daily.rowCount, evidenceRefs: [responseEvidenceRef] }],
      runState: "COMPLETE",
      paginationExhausted: true,
      limitations: []
    },
    retrievedAt
  );
  const normalization = compileSocialProviderMetricNormalizationV1(
    {
      ...toSocialProviderNormalizationContextV1(providerRun),
      periodId,
      window: input.window,
      periodStartAt: `${startDate}T00:00:00.000Z`,
      periodEndAt: `${addDays(endDate, 1)}T00:00:00.000Z`,
      mappings: bindings,
      observations: bindings.map((binding) => ({
        providerMetricKey: binding.providerMetricKey,
        value: daily.totals?.[binding.providerMetricKey as ProviderMetricKeyV1] ?? null,
        capturedAt: retrievedAt,
        evidenceRefs: [responseEvidenceRef]
      }))
    },
    retrievedAt
  );

  return result({
    connectorId,
    runId,
    request,
    httpStatus: response.status,
    requestedStartDate: startDate,
    requestedEndDate: endDate,
    observedStartDate: daily.observedStartDate,
    observedEndDate: daily.observedEndDate,
    completeRequestedDailyCoverage: true,
    providerRun,
    normalization,
    evidenceRefs,
    limitations: []
  });
}
