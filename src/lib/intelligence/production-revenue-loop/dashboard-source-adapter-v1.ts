import type {
  DashboardOverviewResponse,
  TelemetryHealth,
  TelemetryMetadata,
  TelemetrySource
} from "@/lib/types/dashboard";

import type {
  RevenueDecisionPacketInputV1,
  RevenueMetricsV1,
  RevenueSourceObservationV1,
  RevenueSourceV1,
  RevenueTruthStateV1
} from "@/lib/intelligence/production-revenue-loop/decision-packet-v1";

export type RevenueDashboardSourceAdapterInputV1 = {
  generatedAt: string;
  currentRange: { startDate: string; endDate: string };
  comparisonRange: { startDate: string; endDate: string };
  current: DashboardOverviewResponse;
  previous: DashboardOverviewResponse;
};

export type RevenueDashboardSourceAdapterResultV1 =
  | {
      status: "ADAPTED";
      reasonCode: "CANONICAL_SNAPSHOTS_ADAPTED";
      input: RevenueDecisionPacketInputV1;
      warnings: readonly string[];
    }
  | {
      status: "UNAVAILABLE";
      reasonCode: "SEED_DATA_FORBIDDEN" | "SOURCE_SNAPSHOT_UNAVAILABLE" | "RANGE_MISMATCH" | "INVALID_GENERATED_AT";
      input: null;
      warnings: readonly string[];
    };

const SOURCES: readonly RevenueSourceV1[] = ["WOO", "GA4", "META"];
const SOURCE_KEYS: Record<RevenueSourceV1, TelemetrySource> = {
  WOO: "woo",
  GA4: "ga4",
  META: "meta"
};
const TRUTH_RANK: Record<RevenueTruthStateV1, number> = {
  CURRENT: 0,
  PARTIAL: 1,
  UNKNOWN: 2,
  STALE: 3,
  CONFLICTED: 4
};

const emptyMetrics = (): RevenueMetricsV1 => ({
  revenueCents: null,
  orders: null,
  averageOrderValueCents: null,
  sessions: null,
  spendCents: null,
  attributedPurchaseValueCents: null
});

function validDateTime(value: string | null | undefined): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function dateOnlyValue(value: string | null | undefined): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : Number.NaN;
}

function sameRange(snapshot: DashboardOverviewResponse, expected: { startDate: string; endDate: string }): boolean {
  return snapshot.range?.startDate === expected.startDate && snapshot.range?.endDate === expected.endDate;
}

function cents(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

function count(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function conflict(metadata: TelemetryMetadata | undefined, health: TelemetryHealth | undefined): boolean {
  const values = [...(metadata?.warningCodes ?? []), ...(health?.warningCodes ?? []), ...(health?.reasons ?? [])];
  return values.some((value) => value.toUpperCase().includes("CONFLICT"));
}

function metadataRangeTruth(
  metadata: TelemetryMetadata,
  expected: { startDate: string; endDate: string }
): RevenueTruthStateV1 | null {
  if (
    metadata.requestedStartDate !== expected.startDate ||
    metadata.requestedEndDate !== expected.endDate
  ) {
    return "CONFLICTED";
  }
  if (metadata.generatedAt != null && !validDateTime(metadata.generatedAt)) return "CONFLICTED";
  if (metadata.includesFutureDates || metadata.includesPartialDay) return "PARTIAL";

  if (metadata.latestCompletedBusinessDate != null) {
    const completed = dateOnlyValue(metadata.latestCompletedBusinessDate);
    const expectedEnd = dateOnlyValue(expected.endDate);
    if (!Number.isFinite(completed) || !Number.isFinite(expectedEnd)) return "CONFLICTED";
    if (completed < expectedEnd) return "PARTIAL";
  }
  return null;
}

function snapshotTruth(
  source: RevenueSourceV1,
  snapshot: DashboardOverviewResponse,
  expected: { startDate: string; endDate: string }
): RevenueTruthStateV1 {
  const key = SOURCE_KEYS[source];
  const metadata = snapshot.telemetryMetadata?.[key];
  const health = snapshot.telemetryHealth?.[key];
  if (conflict(metadata, health)) return "CONFLICTED";
  if (!metadata) return "UNKNOWN";

  const rangeTruth = metadataRangeTruth(metadata, expected);
  if (rangeTruth === "CONFLICTED") return "CONFLICTED";
  if (metadata.freshnessStatus === "stale") return "STALE";
  if (metadata.freshnessStatus === "no_data" || metadata.freshnessStatus === "unknown") return "UNKNOWN";
  if (metadata.coverageStatus === "unknown" || health?.status === "critical" || health?.status === "unknown") return "UNKNOWN";

  if (source === "WOO") {
    const summary = snapshot.commerceTelemetry?.woo?.summary;
    if (!summary || summary.hasData === false || summary.completeness === "unknown") return "UNKNOWN";
    if (summary.completeness === "partial") return "PARTIAL";
  }
  if (source === "GA4" && !snapshot.commerceTelemetry?.ga4?.summary) return "UNKNOWN";
  if (source === "META") {
    if (!snapshot.metaAds || snapshot.metaAds.status === "BROKEN" || snapshot.metaAds.status === "FALLBACK") return "UNKNOWN";
    if (snapshot.metaAds.status === "PARTIAL") return "PARTIAL";
  }

  if (
    rangeTruth === "PARTIAL" ||
    snapshot.dataMode === "PARTIAL_LIVE_DATA" ||
    metadata.coverageStatus === "partial" ||
    health?.status === "warning"
  ) {
    return "PARTIAL";
  }
  return "CURRENT";
}

function worstTruth(...states: RevenueTruthStateV1[]): RevenueTruthStateV1 {
  return [...states].sort((left, right) => TRUTH_RANK[right] - TRUTH_RANK[left])[0] ?? "UNKNOWN";
}

function sourceExists(source: RevenueSourceV1, snapshot: DashboardOverviewResponse): boolean {
  if (source === "WOO") return Boolean(snapshot.commerceTelemetry?.woo?.summary);
  if (source === "GA4") return Boolean(snapshot.commerceTelemetry?.ga4?.summary);
  return Boolean(snapshot.metaAds?.summary);
}

function observedAt(source: RevenueSourceV1, current: DashboardOverviewResponse, previous: DashboardOverviewResponse): string {
  const key = SOURCE_KEYS[source];
  const candidates = [
    current.telemetryMetadata?.[key]?.generatedAt,
    source === "META" ? current.metaAds?.generatedAt : null,
    current.timestamp,
    previous.telemetryMetadata?.[key]?.generatedAt,
    source === "META" ? previous.metaAds?.generatedAt : null,
    previous.timestamp
  ].filter(validDateTime).sort();
  return candidates.at(-1) ?? "1970-01-01T00:00:00.000Z";
}

function metrics(source: RevenueSourceV1, snapshot: DashboardOverviewResponse): RevenueMetricsV1 {
  const result = emptyMetrics();
  if (source === "WOO") {
    const summary = snapshot.commerceTelemetry?.woo?.summary;
    result.revenueCents = cents(summary?.revenue);
    result.orders = count(summary?.orders);
    result.averageOrderValueCents = cents(summary?.avgOrderValue);
  } else if (source === "GA4") {
    result.sessions = count(snapshot.commerceTelemetry?.ga4?.summary.sessions);
  } else {
    result.spendCents = cents(snapshot.metaAds?.summary.spend);
    result.attributedPurchaseValueCents = cents(snapshot.metaAds?.summary.purchaseValue);
  }
  return result;
}

function evidenceRefs(
  source: RevenueSourceV1,
  input: RevenueDashboardSourceAdapterInputV1
): string[] {
  const key = SOURCE_KEYS[source];
  const refs: string[] = [];
  if (sourceExists(source, input.current)) refs.push(`dashboard:${key}:${input.currentRange.startDate}:${input.currentRange.endDate}`);
  if (sourceExists(source, input.previous)) refs.push(`dashboard:${key}:${input.comparisonRange.startDate}:${input.comparisonRange.endDate}`);
  return refs.sort();
}

function freezeInput(input: RevenueDecisionPacketInputV1): RevenueDecisionPacketInputV1 {
  Object.freeze(input.currentRange);
  Object.freeze(input.comparisonRange);
  input.observations.forEach((observation) => {
    Object.freeze(observation.current);
    Object.freeze(observation.previous);
    Object.freeze(observation.evidenceRefs);
    Object.freeze(observation);
  });
  Object.freeze(input.observations);
  return Object.freeze(input);
}

function unavailable(
  reasonCode: Exclude<RevenueDashboardSourceAdapterResultV1, { status: "ADAPTED" }>["reasonCode"],
  warnings: string[]
): RevenueDashboardSourceAdapterResultV1 {
  Object.freeze(warnings);
  return Object.freeze({ status: "UNAVAILABLE", reasonCode, input: null, warnings });
}

export function adaptDashboardRevenueSourcesV1(
  value: RevenueDashboardSourceAdapterInputV1
): RevenueDashboardSourceAdapterResultV1 {
  if (!validDateTime(value.generatedAt)) return unavailable("INVALID_GENERATED_AT", ["Adapter generation time is invalid."]);
  if (value.current.dataMode === "SEED_DATA" || value.previous.dataMode === "SEED_DATA") {
    return unavailable("SEED_DATA_FORBIDDEN", ["Fixture or seed business truth cannot enter the production revenue loop."]);
  }
  if (value.current.dataMode === "UNAVAILABLE" || value.previous.dataMode === "UNAVAILABLE" || !value.current.ok || !value.previous.ok) {
    return unavailable("SOURCE_SNAPSHOT_UNAVAILABLE", ["Both canonical dashboard snapshots must be available."]);
  }
  if (!sameRange(value.current, value.currentRange) || !sameRange(value.previous, value.comparisonRange)) {
    return unavailable("RANGE_MISMATCH", ["Snapshot ranges do not match the requested decision periods."]);
  }

  const observations: RevenueSourceObservationV1[] = SOURCES.map((source) => ({
    source,
    truthState: worstTruth(
      snapshotTruth(source, value.current, value.currentRange),
      snapshotTruth(source, value.previous, value.comparisonRange)
    ),
    observedAt: observedAt(source, value.current, value.previous),
    current: metrics(source, value.current),
    previous: metrics(source, value.previous),
    evidenceRefs: evidenceRefs(source, value)
  }));
  const warnings = observations
    .filter((observation) => observation.truthState !== "CURRENT")
    .map((observation) => `${observation.source} source truth is ${observation.truthState}.`);
  const input = freezeInput({
    generatedAt: value.generatedAt,
    currentRange: { ...value.currentRange },
    comparisonRange: { ...value.comparisonRange },
    observations
  });
  Object.freeze(warnings);
  return Object.freeze({ status: "ADAPTED", reasonCode: "CANONICAL_SNAPSHOTS_ADAPTED", input, warnings });
}
