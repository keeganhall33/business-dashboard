import type {
  DashboardOverviewResponse,
  DataSourceAccessEntry,
  SchedulerSummary,
  TelemetryHealth,
  TelemetryMetadata,
  TelemetrySource
} from "@/lib/types/dashboard";

export type DataEvidenceTruthStateV1 =
  | "LIVE"
  | "PARTIAL"
  | "STALE"
  | "UNAVAILABLE"
  | "WARNING"
  | "CRITICAL"
  | "UNKNOWN";

export type DataEvidenceSourceRowV1 = {
  source: TelemetrySource;
  label: string;
  freshness: TelemetryMetadata["freshnessStatus"] | "unknown";
  coverage: TelemetryMetadata["coverageStatus"] | "unknown";
  health: TelemetryHealth["status"] | "unknown";
  accessStatus: string;
  lastVerifiedAt: string | null;
  generatedAt: string | null;
  warnings: readonly string[];
  truthState: DataEvidenceTruthStateV1;
};

export type DataEvidenceSchedulerV1 = {
  state: DataEvidenceTruthStateV1;
  cronEnabled: boolean | null;
  jobCount: number | null;
  failingCount: number | null;
  missingTelemetryCount: number | null;
  lastUpdatedAt: string | null;
};

export type ExecutiveDataEvidenceViewV1 = {
  overallState: DataEvidenceTruthStateV1;
  dataMode: DashboardOverviewResponse["dataMode"] | "UNKNOWN";
  generatedAt: string | null;
  sourceRows: readonly DataEvidenceSourceRowV1[];
  scheduler: DataEvidenceSchedulerV1;
  verificationGaps: readonly string[];
  counts: {
    sourceCount: number;
    liveCount: number;
    partialCount: number;
    staleCount: number;
    unavailableCount: number;
    warningCount: number;
    criticalCount: number;
    unknownCount: number;
  };
};

const SOURCE_ORDER: readonly TelemetrySource[] = ["woo", "ga4", "funnelkit", "meta"];
const SOURCE_LABELS: Record<TelemetrySource, string> = {
  woo: "WooCommerce",
  ga4: "Google Analytics 4",
  funnelkit: "FunnelKit",
  meta: "Meta Ads"
};
const SOURCE_ACCESS_ALIASES: Record<TelemetrySource, readonly string[]> = {
  woo: ["woocommerce", "woo"],
  ga4: ["google analytics 4", "google analytics", "ga4"],
  funnelkit: ["funnelkit"],
  meta: ["meta ads", "meta", "facebook ads"]
};

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeStatus(value: unknown): string {
  if (typeof value !== "string") return "UNKNOWN";
  const text = value.trim();
  if (!text) return "UNKNOWN";
  if (text.length > 48) return "UNKNOWN";
  if (/op:\/\/|password|secret|token|credential|@/i.test(text)) return "UNKNOWN";
  if (!/^[A-Za-z0-9 _./:-]+$/.test(text)) return "UNKNOWN";
  return text.toUpperCase();
}

function accessForSource(
  source: TelemetrySource,
  entries: readonly DataSourceAccessEntry[] | undefined
): DataSourceAccessEntry | null {
  if (!Array.isArray(entries)) return null;
  const aliases = SOURCE_ACCESS_ALIASES[source];
  return entries.find((entry) => {
    const name = normalized(entry.name ?? "");
    return aliases.some((alias) => name === normalized(alias));
  }) ?? null;
}

function warningCodes(
  metadata: TelemetryMetadata | undefined,
  health: TelemetryHealth | undefined
): string[] {
  const codes = [...(metadata?.warningCodes ?? []), ...(health?.warningCodes ?? [])]
    .filter((code) => typeof code === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(code));
  if (health?.status === "warning" && codes.length === 0) codes.push("SOURCE_HEALTH_WARNING");
  if (health?.status === "critical" && codes.length === 0) codes.push("SOURCE_HEALTH_CRITICAL");
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b));
}

function sourceTruthState(
  metadata: TelemetryMetadata | undefined,
  health: TelemetryHealth | undefined,
  access: DataSourceAccessEntry | null
): DataEvidenceTruthStateV1 {
  if (health?.status === "critical") return "CRITICAL";
  if (metadata?.freshnessStatus === "stale") return "STALE";
  if (health?.status === "warning") return "WARNING";
  if (metadata?.freshnessStatus === "no_data") return "UNAVAILABLE";
  if (metadata?.coverageStatus === "partial") return "PARTIAL";
  if (metadata?.freshnessStatus === "fresh" && metadata.coverageStatus === "complete" && health?.status === "healthy") {
    return "LIVE";
  }
  if (!metadata && !health && !access) return "UNKNOWN";
  return "UNKNOWN";
}

function schedulerProjection(summary: SchedulerSummary | undefined): DataEvidenceSchedulerV1 {
  if (!summary) {
    return {
      state: "UNKNOWN",
      cronEnabled: null,
      jobCount: null,
      failingCount: null,
      missingTelemetryCount: null,
      lastUpdatedAt: null
    };
  }
  let state: DataEvidenceTruthStateV1 = "UNKNOWN";
  if (summary.status === "BROKEN") state = "CRITICAL";
  else if (summary.status === "PARTIAL" || summary.failingCount > 0 || summary.missingTelemetryCount > 0) state = "WARNING";
  else if (summary.status === "LIVE" && summary.cronEnabled) state = "LIVE";
  else if (!summary.cronEnabled) state = "UNAVAILABLE";

  return {
    state,
    cronEnabled: summary.cronEnabled,
    jobCount: summary.jobCount,
    failingCount: summary.failingCount,
    missingTelemetryCount: summary.missingTelemetryCount,
    lastUpdatedAt: summary.lastUpdatedAt
  };
}

function overallState(
  overview: DashboardOverviewResponse,
  rows: readonly DataEvidenceSourceRowV1[],
  scheduler: DataEvidenceSchedulerV1
): DataEvidenceTruthStateV1 {
  if (overview.dataMode === "UNAVAILABLE") return "UNAVAILABLE";
  if (rows.some((row) => row.truthState === "CRITICAL") || scheduler.state === "CRITICAL") return "CRITICAL";
  if (rows.some((row) => row.truthState === "WARNING") || scheduler.state === "WARNING") return "WARNING";
  if (rows.some((row) => row.truthState === "STALE")) return "STALE";
  if (overview.dataMode === "PARTIAL_LIVE_DATA" || rows.some((row) => row.truthState === "PARTIAL")) return "PARTIAL";
  if (overview.dataMode === "LIVE_DATA" && rows.every((row) => row.truthState === "LIVE") && scheduler.state === "LIVE") return "LIVE";
  return "UNKNOWN";
}

function buildVerificationGaps(
  overview: DashboardOverviewResponse,
  rows: readonly DataEvidenceSourceRowV1[],
  scheduler: DataEvidenceSchedulerV1
): string[] {
  const gaps: string[] = [];
  if (!overview.dataMode || overview.dataMode === "SEED_DATA") {
    gaps.push("Production data mode is not proven live for this request.");
  } else if (overview.dataMode === "PARTIAL_LIVE_DATA") {
    gaps.push("The dashboard reports partial live data; missing coverage requires verification.");
  } else if (overview.dataMode === "UNAVAILABLE") {
    gaps.push("The dashboard overview is unavailable; source state requires verification.");
  }

  for (const row of rows) {
    if (row.truthState === "LIVE") continue;
    if (row.truthState === "PARTIAL") gaps.push(`${row.label}: coverage is partial.`);
    else if (row.truthState === "STALE") gaps.push(`${row.label}: telemetry is stale.`);
    else if (row.truthState === "UNAVAILABLE") gaps.push(`${row.label}: no telemetry data is available for the requested range.`);
    else if (row.truthState === "WARNING") gaps.push(`${row.label}: source health reports a warning.`);
    else if (row.truthState === "CRITICAL") gaps.push(`${row.label}: source health reports a critical condition.`);
    else gaps.push(`${row.label}: live coverage or health is not proven.`);
  }

  if (scheduler.state !== "LIVE") {
    if (scheduler.state === "CRITICAL") gaps.push("Scheduler telemetry reports a critical condition.");
    else if (scheduler.state === "WARNING") gaps.push("Scheduler or ingestion telemetry is partial or failing.");
    else if (scheduler.state === "UNAVAILABLE") gaps.push("Scheduler execution is not enabled or available.");
    else gaps.push("Scheduler or ingestion health is not proven.");
  }

  return [...new Set(gaps)];
}

export function buildExecutiveDataEvidenceViewV1(
  overview: DashboardOverviewResponse
): ExecutiveDataEvidenceViewV1 {
  if (!overview || typeof overview !== "object") {
    throw new Error("DATA_EVIDENCE_OVERVIEW_REQUIRED");
  }

  const sourceRows = SOURCE_ORDER.map((source): DataEvidenceSourceRowV1 => {
    const metadata = overview.telemetryMetadata?.[source];
    const health = overview.telemetryHealth?.[source];
    const access = accessForSource(source, overview.dataSourceAccess);
    return {
      source,
      label: SOURCE_LABELS[source],
      freshness: metadata?.freshnessStatus ?? "unknown",
      coverage: metadata?.coverageStatus ?? "unknown",
      health: health?.status ?? "unknown",
      accessStatus: safeStatus(access?.status),
      lastVerifiedAt: access?.lastVerified ?? null,
      generatedAt: metadata?.generatedAt ?? null,
      warnings: warningCodes(metadata, health),
      truthState: sourceTruthState(metadata, health, access)
    };
  });

  const scheduler = schedulerProjection(overview.schedulerSummary);
  const state = overallState(overview, sourceRows, scheduler);
  const counts = {
    sourceCount: sourceRows.length,
    liveCount: sourceRows.filter((row) => row.truthState === "LIVE").length,
    partialCount: sourceRows.filter((row) => row.truthState === "PARTIAL").length,
    staleCount: sourceRows.filter((row) => row.truthState === "STALE").length,
    unavailableCount: sourceRows.filter((row) => row.truthState === "UNAVAILABLE").length,
    warningCount: sourceRows.filter((row) => row.truthState === "WARNING").length,
    criticalCount: sourceRows.filter((row) => row.truthState === "CRITICAL").length,
    unknownCount: sourceRows.filter((row) => row.truthState === "UNKNOWN").length
  };

  return {
    overallState: state,
    dataMode: overview.dataMode ?? "UNKNOWN",
    generatedAt: overview.timestamp ?? null,
    sourceRows,
    scheduler,
    verificationGaps: buildVerificationGaps(overview, sourceRows, scheduler),
    counts
  };
}

export function buildUnavailableDataEvidenceViewV1(): ExecutiveDataEvidenceViewV1 {
  const sourceRows: DataEvidenceSourceRowV1[] = SOURCE_ORDER.map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    freshness: "unknown",
    coverage: "unknown",
    health: "unknown",
    accessStatus: "UNKNOWN",
    lastVerifiedAt: null,
    generatedAt: null,
    warnings: [],
    truthState: "UNKNOWN"
  }));
  return {
    overallState: "UNAVAILABLE",
    dataMode: "UNAVAILABLE",
    generatedAt: null,
    sourceRows,
    scheduler: schedulerProjection(undefined),
    verificationGaps: ["Dashboard overview could not be loaded; source state requires verification."],
    counts: {
      sourceCount: sourceRows.length,
      liveCount: 0,
      partialCount: 0,
      staleCount: 0,
      unavailableCount: 0,
      warningCount: 0,
      criticalCount: 0,
      unknownCount: sourceRows.length
    }
  };
}
