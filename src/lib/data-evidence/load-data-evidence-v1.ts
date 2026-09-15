import "@/lib/server-only";

import { getCommerceTelemetry, getDashboardSnapshots, getScheduledJobsWithLatestRuns } from "@/lib/supabase/queries";
import type {
  DataEvidenceSchedulerV1,
  DataEvidenceSourceRowV1,
  DataEvidenceTruthStateV1,
  ExecutiveDataEvidenceViewV1
} from "@/lib/data-evidence/executive-data-evidence-v1";
import type { TelemetrySource } from "@/lib/types/dashboard";

const SOURCE_COPY: Record<TelemetrySource, { label: string; businessUse: string }> = {
  woo: { label: "WooCommerce", businessUse: "Revenue, orders, and products" },
  ga4: { label: "Google Analytics 4", businessUse: "Website traffic and behavior" },
  funnelkit: { label: "FunnelKit", businessUse: "Checkout conversion" },
  meta: { label: "Meta Ads", businessUse: "Advertising spend and return" }
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("DATA_STATUS_TIMEOUT")), milliseconds);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function summaryFrom(value: unknown): Record<string, unknown> | null {
  return object(object(value)?.summary);
}

function sourceRow(
  source: TelemetrySource,
  summary: Record<string, unknown> | null,
  fallbackGeneratedAt: string | null = null
): DataEvidenceSourceRowV1 {
  const freshness = text(summary?.freshness)?.toLowerCase() ?? null;
  const coverage = text(summary?.completeness)?.toLowerCase() ?? null;
  const lastVerifiedAt = text(summary?.sourceAsOf) ?? text(summary?.asOf) ?? fallbackGeneratedAt;
  let truthState: DataEvidenceTruthStateV1 = "UNKNOWN";
  if (!summary && !fallbackGeneratedAt) truthState = "UNAVAILABLE";
  else if (freshness === "stale") truthState = "STALE";
  else if (freshness === "degraded") truthState = "WARNING";
  else if (freshness === "unavailable" || freshness === "no_data") truthState = "UNAVAILABLE";
  else if (coverage === "partial") truthState = "PARTIAL";
  else if (freshness === "fresh" || fallbackGeneratedAt) truthState = "LIVE";

  const warnings: string[] = [];
  if (truthState === "STALE") warnings.push("Data has not refreshed recently.");
  if (truthState === "WARNING") warnings.push("Data is delayed but still available.");
  if (truthState === "PARTIAL") warnings.push("The selected period is not fully covered.");
  if (truthState === "UNAVAILABLE") warnings.push("No current source data was returned.");

  const copy = SOURCE_COPY[source];
  return {
    source,
    label: copy.label,
    freshness: freshness === "fresh" ? "fresh" : freshness === "stale" ? "stale" : freshness === "unavailable" || freshness === "no_data" ? "no_data" : "unknown",
    coverage: coverage === "complete" ? "complete" : coverage === "partial" ? "partial" : "unknown",
    health: truthState === "LIVE" ? "healthy" : truthState === "STALE" ? "critical" : truthState === "WARNING" || truthState === "PARTIAL" ? "warning" : "unknown",
    accessStatus: summary || fallbackGeneratedAt ? "CONNECTED" : "NEEDS ATTENTION",
    lastVerifiedAt,
    generatedAt: fallbackGeneratedAt,
    warnings,
    truthState,
    businessUse: copy.businessUse,
    nextAction: truthState === "LIVE" ? null : truthState === "PARTIAL" ? "Refresh the missing dates before relying on comparisons." : `Refresh the ${copy.label} connection.`
  };
}

type ScheduledJobLike = {
  is_active?: boolean;
  updated_at?: string | null;
  latestRun?: { status?: string | null; started_at?: string | null } | null;
};

function schedulerFrom(rows: readonly ScheduledJobLike[] | null): DataEvidenceSchedulerV1 {
  if (!rows) return { state: "UNKNOWN", cronEnabled: null, jobCount: null, failingCount: null, missingTelemetryCount: null, lastUpdatedAt: null };
  const active = rows.filter((row) => row.is_active !== false);
  const failingCount = active.filter((row) => row.latestRun?.status === "failed").length;
  const missingTelemetryCount = active.filter((row) => !row.latestRun?.started_at).length;
  const timestamps = active.flatMap((row) => [row.latestRun?.started_at, row.updated_at]).filter((value): value is string => Boolean(value)).sort().reverse();
  return {
    state: failingCount > 0 ? "CRITICAL" : missingTelemetryCount > 0 ? "WARNING" : active.length ? "LIVE" : "UNAVAILABLE",
    cronEnabled: active.length > 0,
    jobCount: active.length,
    failingCount,
    missingTelemetryCount,
    lastUpdatedAt: timestamps[0] ?? null
  };
}

export async function loadExecutiveDataEvidenceViewV1(): Promise<ExecutiveDataEvidenceViewV1> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);
  const [commerceResult, snapshotsResult, jobsResult] = await Promise.allSettled([
    within(getCommerceTelemetry({ startDate: dateOnly(start), endDate: dateOnly(now) }), 5_000),
    within(getDashboardSnapshots(["meta"]), 5_000),
    within(getScheduledJobsWithLatestRuns(), 5_000)
  ]);

  const commerce = commerceResult.status === "fulfilled" ? commerceResult.value : null;
  const snapshots = snapshotsResult.status === "fulfilled" ? snapshotsResult.value : [];
  const meta = snapshots.find((snapshot) => snapshot.key === "meta") ?? null;
  const metaPayload = object(meta?.payload);
  const metaSummary = object(metaPayload?.summary) ?? metaPayload;
  const metaGeneratedAt = text(metaPayload?.generatedAt) ?? meta?.generated_at ?? meta?.updated_at ?? null;

  const sourceRows = [
    sourceRow("woo", summaryFrom(commerce?.woo)),
    sourceRow("ga4", summaryFrom(commerce?.ga4)),
    sourceRow("funnelkit", summaryFrom(commerce?.funnel)),
    sourceRow("meta", metaSummary, metaGeneratedAt)
  ];
  const scheduler = schedulerFrom(jobsResult.status === "fulfilled" ? jobsResult.value as ScheduledJobLike[] : null);
  const attention = sourceRows.filter((row) => row.truthState !== "LIVE");
  const overallState: DataEvidenceTruthStateV1 = scheduler.state === "CRITICAL"
    ? "CRITICAL"
    : attention.length || scheduler.state !== "LIVE"
      ? "WARNING"
      : "LIVE";
  const counts = {
    sourceCount: sourceRows.length,
    liveCount: sourceRows.filter((row) => row.truthState === "LIVE").length,
    partialCount: sourceRows.filter((row) => row.truthState === "PARTIAL").length,
    staleCount: sourceRows.filter((row) => row.truthState === "STALE").length,
    unavailableCount: sourceRows.filter((row) => row.truthState === "UNAVAILABLE").length,
    warningCount: sourceRows.filter((row) => row.truthState === "WARNING").length,
    criticalCount: 0,
    unknownCount: sourceRows.filter((row) => row.truthState === "UNKNOWN").length
  };

  return {
    overallState,
    dataMode: counts.liveCount === sourceRows.length ? "LIVE_DATA" : counts.liveCount ? "PARTIAL_LIVE_DATA" : "UNAVAILABLE",
    generatedAt: now.toISOString(),
    sourceRows,
    scheduler,
    verificationGaps: [
      ...attention.map((row) => `${row.label}: ${row.nextAction ?? "Review this connection."}`),
      ...(scheduler.state === "LIVE" ? [] : [scheduler.state === "CRITICAL" ? "One or more scheduled data refreshes are failing." : "Some scheduled refreshes have not reported a successful run."])
    ],
    counts
  };
}
