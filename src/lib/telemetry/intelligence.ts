import type {
  CommerceTelemetry,
  ExecutiveBrief,
  ExecutiveInsightsPayload,
  MetaAdsSnapshot,
  TelemetryHealth,
  TelemetryHealthStatus,
  TelemetryMetadata,
  TelemetrySource,
  TrendComparison
} from "@/lib/types/dashboard";
import type { CommerceTelemetryResult, WooMetricsResult } from "@/lib/supabase/queries";

const BUSINESS_TIMEZONE = "America/Los_Angeles";
const DAY_MS = 24 * 60 * 60 * 1000;
const TELEMETRY_SOURCES: TelemetrySource[] = ["woo", "ga4", "funnelkit", "meta"];

export type DashboardTelemetryIntelligenceArgs = {
  range: { startDate: string; endDate: string };
  now?: Date;
  currentCommerce?: CommerceTelemetryResult | null;
  previousCommerce?: CommerceTelemetryResult | null;
  metaSnapshot?: MetaAdsSnapshot | null;
};

export type DashboardTelemetryIntelligence = {
  metadata: Partial<Record<TelemetrySource, TelemetryMetadata>>;
  health: Partial<Record<TelemetrySource, TelemetryHealth>>;
  executiveInsights: ExecutiveInsightsPayload;
};

type RangeContext = {
  includesPartialDay: boolean;
  includesFutureDates: boolean;
  timezone: string;
  latestCompletedBusinessDate: string | null;
};

type TrendDef = {
  id: string;
  source: TelemetrySource;
  label: string;
  getCurrent: (payload: CommerceTelemetryResult | undefined | null, meta?: MetaAdsSnapshot | null) => number | null;
  getPrevious: (payload: CommerceTelemetryResult | undefined | null, meta?: MetaAdsSnapshot | null) => number | null;
};

const TREND_DEFS: TrendDef[] = [
  {
    id: "woo_revenue",
    source: "woo",
    label: "Woo revenue",
    getCurrent: (data) => numeric(data?.woo?.summary?.revenue),
    getPrevious: (data) => numeric(data?.woo?.summary?.revenue)
  },
  {
    id: "woo_orders",
    source: "woo",
    label: "Woo orders",
    getCurrent: (data) => numeric(data?.woo?.summary?.orders),
    getPrevious: (data) => numeric(data?.woo?.summary?.orders)
  },
  {
    id: "woo_aov",
    source: "woo",
    label: "Woo AOV",
    getCurrent: (data) => numeric(data?.woo?.summary?.avgOrderValue),
    getPrevious: (data) => numeric(data?.woo?.summary?.avgOrderValue)
  },
  {
    id: "ga4_sessions",
    source: "ga4",
    label: "GA4 sessions",
    getCurrent: (data) => numeric(data?.ga4?.summary?.sessions),
    getPrevious: (data) => numeric(data?.ga4?.summary?.sessions)
  },
  {
    id: "ga4_engaged_sessions",
    source: "ga4",
    label: "GA4 engaged sessions",
    getCurrent: (data) => numeric(data?.ga4?.summary?.engagedSessions),
    getPrevious: (data) => numeric(data?.ga4?.summary?.engagedSessions)
  },
  {
    id: "funnel_conversion",
    source: "funnelkit",
    label: "Funnel conversion rate",
    getCurrent: (data) => numeric(data?.funnel?.summary?.conversionRate),
    getPrevious: (data) => numeric(data?.funnel?.summary?.conversionRate)
  },
  {
    id: "funnel_entries",
    source: "funnelkit",
    label: "Funnel entries",
    getCurrent: (data) => numeric(data?.funnel?.summary?.entries),
    getPrevious: (data) => numeric(data?.funnel?.summary?.entries)
  },
  {
    id: "funnel_completions",
    source: "funnelkit",
    label: "Funnel completions",
    getCurrent: (data) => numeric(data?.funnel?.summary?.completions),
    getPrevious: (data) => numeric(data?.funnel?.summary?.completions)
  },
  {
    id: "meta_spend",
    source: "meta",
    label: "Meta spend",
    getCurrent: (_data, meta) => numeric(meta?.summary?.spend),
    getPrevious: (_data, meta) => numeric(meta?.summary?.spend)
  },
  {
    id: "meta_clicks",
    source: "meta",
    label: "Meta clicks",
    getCurrent: (_data, meta) => numeric(meta?.summary?.clicks),
    getPrevious: (_data, meta) => numeric(meta?.summary?.clicks)
  },
  {
    id: "meta_roas",
    source: "meta",
    label: "Meta ROAS",
    getCurrent: (_data, meta) => numeric(meta?.summary?.roas),
    getPrevious: (_data, meta) => numeric(meta?.summary?.roas)
  }
];

export function buildDashboardTelemetryIntelligence(
  args: DashboardTelemetryIntelligenceArgs
): DashboardTelemetryIntelligence {
  const metadata = buildTelemetryMetadataMap({
    range: args.range,
    now: args.now,
    commerce: args.currentCommerce,
    metaSnapshot: args.metaSnapshot
  });
  const health = buildTelemetryHealthMap(metadata);
  const trends = computeTelemetryTrends({
    current: args.currentCommerce,
    previous: args.previousCommerce,
    metaCurrent: args.metaSnapshot,
    metadata
  });
  const brief = buildExecutiveBrief({ range: args.range, metadata, health, trends, now: args.now });
  return {
    metadata,
    health,
    executiveInsights: { brief, trends }
  };
}

type MetadataBuilderArgs = {
  range: { startDate: string; endDate: string };
  now?: Date;
  commerce?: CommerceTelemetryResult | null;
  metaSnapshot?: MetaAdsSnapshot | null;
};

function buildTelemetryMetadataMap(args: MetadataBuilderArgs): Partial<Record<TelemetrySource, TelemetryMetadata>> {
  const context = buildRangeContext(args.range, args.now);
  const map: Partial<Record<TelemetrySource, TelemetryMetadata>> = {};
  map.woo = buildWooMetadata(args.range, context, args.commerce?.wooDetails ?? null, args.commerce?.woo);
  map.ga4 = buildGenericTelemetryMetadata("ga4", args.range, context, args.commerce?.ga4);
  map.funnelkit = buildGenericTelemetryMetadata("funnelkit", args.range, context, args.commerce?.funnel);
  map.meta = buildMetaTelemetryMetadata(args.range, context, args.metaSnapshot);
  return map;
}

function buildRangeContext(range: { startDate: string; endDate: string }, now = new Date()): RangeContext {
  const pacificToday = formatPacificDate(now);
  const includesFutureDates = range.endDate > pacificToday;
  const includesPartialDay = !includesFutureDates && range.endDate === pacificToday;
  let latestCompletedBusinessDate: string | null = range.endDate;
  if (includesFutureDates) {
    latestCompletedBusinessDate = pacificToday;
  } else if (includesPartialDay) {
    latestCompletedBusinessDate = shiftDate(range.endDate, -1);
  }
  return {
    includesPartialDay,
    includesFutureDates,
    timezone: BUSINESS_TIMEZONE,
    latestCompletedBusinessDate
  };
}

function buildWooMetadata(
  range: { startDate: string; endDate: string },
  context: RangeContext,
  details: WooMetricsResult | null | undefined,
  woo: CommerceTelemetry["woo"] | undefined
): TelemetryMetadata {
  const warningCodes = collectRangeWarnings(context);
  const semanticMetadata = details?.metadata ?? null;

  const freshnessStatus = mapFreshnessStatus(semanticMetadata?.matching_data_recency_status, hasSummaryData(woo?.summary));
  const coverageStatus = mapCoverageStatus(semanticMetadata);
  const latestCompleted = semanticMetadata?.latest_completed_requested_business_date ?? context.latestCompletedBusinessDate;
  if (details?.fallbackToLegacy) {
    warningCodes.push("fallback_legacy");
  }
  if (details && details.summarySafe === false) {
    warningCodes.push("semantic_summary_unsafe");
    if (details.unsupportedReason) {
      warningCodes.push(details.unsupportedReason);
    }
  }
  if (freshnessStatus === "no_data") {
    warningCodes.push("no_data");
  }
  return {
    source: "woo",
    requestedStartDate: range.startDate,
    requestedEndDate: range.endDate,
    timezone: BUSINESS_TIMEZONE,
    generatedAt: semanticMetadata?.generated_at ?? null,
    freshnessStatus,
    coverageStatus,
    includesPartialDay: context.includesPartialDay,
    includesFutureDates: context.includesFutureDates,
    latestCompletedBusinessDate: latestCompleted,
    warningCodes: dedupe(warningCodes)
  };
}

function buildGenericTelemetryMetadata(
  source: TelemetrySource,
  range: { startDate: string; endDate: string },
  context: RangeContext,
  payload: CommerceTelemetry["ga4"] | CommerceTelemetry["funnel"] | undefined
): TelemetryMetadata {
  const warningCodes = collectRangeWarnings(context);
  const summary = payload?.summary as Record<string, unknown> | undefined;
  const hasData = hasSummaryData(summary);
  const freshnessStatus: TelemetryMetadata["freshnessStatus"] = hasData ? "fresh" : "no_data";
  if (!hasData) {
    warningCodes.push("no_data");
  }
  return {
    source,
    requestedStartDate: range.startDate,
    requestedEndDate: range.endDate,
    timezone: BUSINESS_TIMEZONE,
    freshnessStatus,
    coverageStatus: "unknown",
    includesPartialDay: context.includesPartialDay,
    includesFutureDates: context.includesFutureDates,
    latestCompletedBusinessDate: context.latestCompletedBusinessDate,
    warningCodes: dedupe(warningCodes)
  };
}

function buildMetaTelemetryMetadata(
  range: { startDate: string; endDate: string },
  context: RangeContext,
  snapshot: MetaAdsSnapshot | null | undefined
): TelemetryMetadata {
  const warningCodes = collectRangeWarnings(context);
  let freshnessStatus: TelemetryMetadata["freshnessStatus"] = "unknown";
  let coverageStatus: TelemetryMetadata["coverageStatus"] = "unknown";
  if (!snapshot) {
    freshnessStatus = "no_data";
    warningCodes.push("no_data");
  } else if (snapshot.status === "LIVE") {
    freshnessStatus = "fresh";
    coverageStatus = "complete";
  } else if (snapshot.status === "PARTIAL") {
    freshnessStatus = "stale";
    coverageStatus = "partial";
    warningCodes.push("meta_partial");
  } else {
    freshnessStatus = "no_data";
    warningCodes.push("meta_fallback");
  }
  return {
    source: "meta",
    requestedStartDate: range.startDate,
    requestedEndDate: range.endDate,
    timezone: BUSINESS_TIMEZONE,
    generatedAt: snapshot?.generatedAt ?? null,
    freshnessStatus,
    coverageStatus,
    includesPartialDay: context.includesPartialDay,
    includesFutureDates: context.includesFutureDates,
    latestCompletedBusinessDate: context.latestCompletedBusinessDate,
    warningCodes: dedupe(warningCodes)
  };
}

function mapFreshnessStatus(
  semanticStatus: string | null | undefined,
  hasData: boolean
): TelemetryMetadata["freshnessStatus"] {
  if (semanticStatus === "fresh") return "fresh";
  if (semanticStatus === "stale") return "stale";
  if (semanticStatus === "no_data") return "no_data";
  return hasData ? "fresh" : "unknown";
}

function mapCoverageStatus(metadata: WooMetricsResult["metadata"]): TelemetryMetadata["coverageStatus"] {
  const coverage = metadata?.coverage;
  if (!coverage) return "unknown";
  const requested = coverage.requested_day_count ?? null;
  const matched = coverage.days_with_matching_orders ?? null;
  if (requested != null && matched != null && requested > 0) {
    if (matched >= requested) return "complete";
    return "partial";
  }
  return "unknown";
}

function collectRangeWarnings(context: RangeContext) {
  const codes: string[] = [];
  if (context.includesPartialDay) codes.push("partial_day");
  if (context.includesFutureDates) codes.push("future_dates");
  return codes;
}

function dedupe(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)));
}

function hasSummaryData(summary: Record<string, unknown> | undefined): boolean {
  if (!summary || typeof summary !== "object") return false;
  return Object.values(summary).some((value) => typeof value === "number" && Number.isFinite(value));
}

function formatPacificDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function shiftDate(dateStr: string, days: number) {
  const base = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(base)) return dateStr;
  const shifted = new Date(base + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildTelemetryHealthMap(metadata: Partial<Record<TelemetrySource, TelemetryMetadata>>) {
  const result: Partial<Record<TelemetrySource, TelemetryHealth>> = {};
  TELEMETRY_SOURCES.forEach((source) => {
    const entry = metadata[source];
    result[source] = evaluateTelemetryHealth(entry, source);
  });
  return result;
}

function evaluateTelemetryHealth(metadata: TelemetryMetadata | undefined, source: TelemetrySource): TelemetryHealth {
  if (!metadata) {
    return {
      source,
      status: "unknown",
      reasons: ["metadata_unavailable"],
      warningCodes: []
    };
  }
  const reasons: string[] = [];
  const warningCodes = new Set(metadata.warningCodes ?? []);
  let severity: 0 | 1 | 2 | 3 = 0;
  if (metadata.freshnessStatus === "no_data") {
    severity = 2;
    reasons.push("no_data");
  } else if (metadata.freshnessStatus === "stale") {
    severity = Math.max(severity, 1) as 0 | 1 | 2 | 3;
    reasons.push("stale_data");
  } else if (metadata.freshnessStatus === "unknown") {
    severity = Math.max(severity, 3) as 0 | 1 | 2 | 3;
    reasons.push("freshness_unknown");
  }
  if (metadata.coverageStatus === "partial") {
    severity = Math.max(severity, 1) as 0 | 1 | 2 | 3;
    reasons.push("coverage_partial");
  }
  if (warningCodes.has("future_dates")) {
    severity = Math.max(severity, 1) as 0 | 1 | 2 | 3;
    reasons.push("future_dates_present");
  }
  const status = severityToStatus(severity);
  if (status === "healthy") {
    return {
      source,
      status,
      reasons: [],
      warningCodes: dedupe(Array.from(warningCodes))
    };
  }
  return {
    source,
    status,
    reasons: dedupe(reasons),
    warningCodes: dedupe(Array.from(warningCodes))
  };
}

function severityToStatus(value: 0 | 1 | 2 | 3): TelemetryHealthStatus {
  if (value === 2) return "critical";
  if (value === 1) return "warning";
  if (value === 0) return "healthy";
  return "unknown";
}

type TrendComputationArgs = {
  current?: CommerceTelemetryResult | null;
  previous?: CommerceTelemetryResult | null;
  metaCurrent?: MetaAdsSnapshot | null;
  metaPrevious?: MetaAdsSnapshot | null;
  metadata?: Partial<Record<TelemetrySource, TelemetryMetadata>>;
};

function computeTelemetryTrends(args: TrendComputationArgs): TrendComparison[] {
  const results: TrendComparison[] = [];
  for (const def of TREND_DEFS) {
    const currentValue = def.getCurrent(args.current, args.metaCurrent);
    const previousValue = def.getPrevious(args.previous, args.metaPrevious);
    if (currentValue == null && previousValue == null) continue;
    const absoluteChange = currentValue != null && previousValue != null ? currentValue - previousValue : null;
    const percentChange = computePercentChange(absoluteChange, previousValue);
    const direction = computeDirection(absoluteChange);
    const magnitude = computeMagnitude(percentChange, absoluteChange);
    const anomaly = percentChange != null ? Math.abs(percentChange) >= 40 : false;
    const caveats: string[] = [];
    if (previousValue == null) caveats.push("no_previous_period");
    const meta = args.metadata?.[def.source];
    if (meta && meta.freshnessStatus === "no_data") caveats.push("data_unavailable");
    results.push({
      id: def.id,
      source: def.source,
      metric: def.id,
      label: def.label,
      currentValue,
      previousValue,
      absoluteChange,
      percentChange,
      direction,
      magnitude,
      anomaly,
      caveat: caveats.length ? caveats.join(";") : undefined
    });
  }

  return results.sort((a, b) => {
    const anomalyRank = Number(b.anomaly) - Number(a.anomaly);
    if (anomalyRank !== 0) return anomalyRank;
    const magRank = magnitudeRank(b.magnitude) - magnitudeRank(a.magnitude);
    if (magRank !== 0) return magRank;
    const percentRank = (Math.abs(b.percentChange ?? 0) || Math.abs(b.absoluteChange ?? 0)) -
      (Math.abs(a.percentChange ?? 0) || Math.abs(a.absoluteChange ?? 0));
    if (percentRank !== 0) return percentRank;
    return a.label.localeCompare(b.label);
  });
}

function computePercentChange(absoluteChange: number | null, previous: number | null): number | null {
  if (absoluteChange == null || previous == null || Math.abs(previous) < 1e-9) return null;
  return (absoluteChange / Math.abs(previous)) * 100;
}

function computeDirection(change: number | null): "up" | "down" | "flat" {
  if (change == null || Math.abs(change) < 1e-9) return "flat";
  return change > 0 ? "up" : "down";
}

function computeMagnitude(percentChange: number | null, absoluteChange: number | null): "minor" | "moderate" | "major" {
  if (percentChange == null || !Number.isFinite(percentChange)) {
    if (absoluteChange == null || Math.abs(absoluteChange) < 1e-3) return "minor";
    return Math.abs(absoluteChange) >= 1000 ? "major" : "moderate";
  }
  const abs = Math.abs(percentChange);
  if (abs >= 25) return "major";
  if (abs >= 10) return "moderate";
  if (abs >= 3) return "minor";
  return "minor";
}

function magnitudeRank(magnitude: "minor" | "moderate" | "major") {
  if (magnitude === "major") return 3;
  if (magnitude === "moderate") return 2;
  return 1;
}

function buildExecutiveBrief(args: {
  range: { startDate: string; endDate: string };
  metadata: Partial<Record<TelemetrySource, TelemetryMetadata>>;
  health: Partial<Record<TelemetrySource, TelemetryHealth>>;
  trends: TrendComparison[];
  now?: Date;
}): ExecutiveBrief | null {
  const context = buildRangeContext(args.range, args.now);
  const warnings = TELEMETRY_SOURCES.flatMap((source) =>
    args.health?.[source]?.status === "critical" ? args.health[source]?.reasons ?? [] : []
  );
  const topChanges = args.trends.slice(0, 3);
  const sourceFreshness = TELEMETRY_SOURCES.map((source) => {
    const health = args.health?.[source];
    const metadata = args.metadata?.[source];
    return {
      source,
      status: health?.status ?? "unknown",
      summary: describeFreshness(metadata)
    };
  });
  const attention = warnings[0] ?? deriveAttentionLine(topChanges);
  return {
    pacificWindow: {
      startDate: args.range.startDate,
      endDate: args.range.endDate,
      includesPartialDay: context.includesPartialDay
    },
    warnings,
    topChanges,
    sourceFreshness,
    attention
  };
}

function describeFreshness(metadata: TelemetryMetadata | undefined) {
  if (!metadata) return "unknown";
  const freshness = metadata.freshnessStatus ?? "unknown";
  if (freshness === "fresh") return "fresh";
  if (freshness === "stale") return "stale";
  if (freshness === "no_data") return "no data";
  return "unknown";
}

function deriveAttentionLine(trends: TrendComparison[]) {
  const negative = trends.find((trend) => trend.direction === "down" && trend.magnitude !== "minor");
  if (!negative) return null;
  const change = negative.percentChange != null ? `${negative.percentChange >= 0 ? "+" : ""}${negative.percentChange.toFixed(1)}%` : "";
  return `${negative.label} ${negative.direction === "down" ? "down" : "up"} ${change}`.trim();
}
