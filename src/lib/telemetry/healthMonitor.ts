import { buildDashboardTelemetryIntelligence } from "./intelligence.ts";
import type { TelemetryHealthEventInput } from "../supabase/queries.ts";
import {
  deleteOldTelemetryHealthEvents,
  deleteSystemState,
  getCommerceTelemetry,
  getDashboardSnapshots,
  getOpenAlerts,
  getSystemState,
  insertTelemetryHealthEvents,
  upsertSystemState
} from "../supabase/queries.ts";
import type { CommerceTelemetryResult } from "../supabase/queries.ts";
import type { TelemetryHealth, TelemetryMetadata, TelemetrySource, MetaAdsSnapshot } from "../types/dashboard.ts";
import { makeAlertDedupeKey, createOrUpdateAlert, resolveAlertByKey, type AlertSeverity } from "../scheduler/alerting.ts";
import { getDeploymentVersion } from "../version.ts";

const DEFAULT_RANGE_DAYS = 7;
const EVENT_RETENTION_DAYS = 45;
const LATENCY_WARN_THRESHOLD_MS = 4000;
const INCIDENT_STATE_PREFIX = "telemetry_incident";
const TELEMETRY_ALERT_TYPE = "telemetry_health";
const SOURCES: TelemetrySource[] = ["woo", "ga4", "funnelkit", "meta"];

export type TelemetryHealthMonitorSummary = {
  insertedEvents: number;
  alertsCreatedOrUpdated: number;
  alertsResolved: number;
};

type Range = { startDate: string; endDate: string };

type IntelligencePayload = ReturnType<typeof buildDashboardTelemetryIntelligence>;

type IncidentState = {
  firstObserved: string;
  consecutive: number;
  latestObserved: string;
};

export async function performTelemetryHealthCheck(rangeDays = DEFAULT_RANGE_DAYS): Promise<TelemetryHealthMonitorSummary> {
  const range = buildTrailingRange(rangeDays);
  const previousRange = buildPreviousRange(range);

  const [currentCommerce, previousCommerce, snapshots] = await Promise.all([
    getCommerceTelemetry(range, { tolerateErrors: true }),
    getCommerceTelemetry(previousRange, { tolerateErrors: true }),
    getDashboardSnapshots(["meta"])
  ]);

  const metaSnapshot = (snapshots.find((row) => row.key === "meta")?.payload as MetaAdsSnapshot | null | undefined) ?? null;
  const intelligence = buildDashboardTelemetryIntelligence({
    range,
    currentCommerce,
    previousCommerce,
    metaSnapshot
  });

  const observedAt = new Date().toISOString();
  const deploymentVersion = getDeploymentVersion();

  const events = buildHealthEvents({
    observedAt,
    range,
    intelligence,
    commerce: currentCommerce,
    deploymentVersion
  });

  if (events.length) {
    await insertTelemetryHealthEvents(events);
    await deleteOldTelemetryHealthEvents(EVENT_RETENTION_DAYS);
  }

  const { createdOrUpdated, resolved } = await evaluateTelemetryAlerts({
    observedAt,
    intelligence,
    commerce: currentCommerce,
    deploymentVersion
  });

  return {
    insertedEvents: events.length,
    alertsCreatedOrUpdated: createdOrUpdated,
    alertsResolved: resolved
  };
}

function buildTrailingRange(days: number): Range {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, days) - 1));
  return {
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(end)
  };
}

function buildPreviousRange(range: Range): Range {
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDate}T00:00:00.000Z`);
  const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (durationDays - 1) * 86400000);
  return {
    startDate: formatIsoDate(prevStart),
    endDate: formatIsoDate(prevEnd)
  };
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

type EventBuilderArgs = {
  observedAt: string;
  range: Range;
  intelligence: IntelligencePayload;
  commerce: CommerceTelemetryResult;
  deploymentVersion: string | null;
};

export function buildHealthEvents(args: EventBuilderArgs): TelemetryHealthEventInput[] {
  const { metadata, health } = args.intelligence;
  const events: TelemetryHealthEventInput[] = [];
  const latencies: Partial<Record<TelemetrySource, number | null>> = {
    woo: args.commerce.wooLatencyMs ?? null,
    ga4: args.commerce.ga4LatencyMs ?? null,
    funnelkit: args.commerce.funnelLatencyMs ?? null,
    meta: null
  };

  for (const source of SOURCES) {
    const meta = metadata?.[source];
    if (!meta) continue;
    const sourceHealth = health?.[source];
    events.push({
      source,
      observedAt: args.observedAt,
      requestedStartDate: args.range.startDate,
      requestedEndDate: args.range.endDate,
      healthStatus: sourceHealth?.status ?? "unknown",
      freshnessStatus: meta.freshnessStatus ?? "unknown",
      coverageStatus: meta.coverageStatus ?? "unknown",
      warningCodes: meta.warningCodes ?? [],
      fallback: source === "woo" ? Boolean(args.commerce.wooDetails?.fallbackToLegacy) : false,
      latencyMs: latencies[source] ?? null,
      deploymentVersion: args.deploymentVersion,
      metadata: {
        includesPartialDay: meta.includesPartialDay,
        includesFutureDates: meta.includesFutureDates,
        latestCompletedBusinessDate: meta.latestCompletedBusinessDate ?? null
      }
    });
  }

  return events;
}

type AlertEvaluationArgs = {
  observedAt: string;
  intelligence: IntelligencePayload;
  commerce: CommerceTelemetryResult;
  deploymentVersion: string | null;
};

type IncidentDescriptor = {
  source: TelemetrySource;
  reason: string;
  severity: AlertSeverity;
  detail: string;
};

async function evaluateTelemetryAlerts(args: AlertEvaluationArgs) {
  const incidents = deriveIncidents(args);
  const activeKeys = new Set<string>();
  let createdOrUpdated = 0;
  let resolved = 0;

  for (const incident of incidents) {
    const dedupeKey = makeAlertDedupeKey(["telemetry", incident.source, incident.reason]);
    activeKeys.add(dedupeKey);
    const state = await recordIncidentState(dedupeKey, args.observedAt);
    const summary = buildIncidentSummary({ incident, state, observedAt: args.observedAt });
    const result = await createOrUpdateAlert({
      alertType: TELEMETRY_ALERT_TYPE,
      severity: incident.severity,
      title: `Telemetry ${incident.source.toUpperCase()} ${incident.reason}`,
      summary,
      dedupeKey
    });
    if (result.action !== "unchanged") {
      createdOrUpdated++;
    }
  }

  const openAlerts = await getOpenAlerts();
  for (const alert of openAlerts) {
    if (alert.alert_type !== TELEMETRY_ALERT_TYPE) continue;
    const dedupeKey = alert.dedupe_key as string;
    if (activeKeys.has(dedupeKey)) continue;
    await resolveAlertByKey(dedupeKey);
    await deleteSystemState(buildIncidentStateKey(dedupeKey));
    resolved++;
  }

  return { createdOrUpdated, resolved };
}

export function buildIncidentSummary(input: { incident: IncidentDescriptor; state: IncidentState; observedAt: string }) {
  return [
    `reason=${input.incident.reason}`,
    `source=${input.incident.source}`,
    `first=${input.state.firstObserved}`,
    `latest=${input.observedAt}`,
    `consecutive=${input.state.consecutive}`,
    `detail=${input.incident.detail}`
  ].join("; ");
}

async function recordIncidentState(dedupeKey: string, observedAt: string): Promise<IncidentState> {
  const key = buildIncidentStateKey(dedupeKey);
  const existing = await getSystemState(key);
  const firstObserved = (existing?.value_json as Record<string, unknown> | undefined)?.firstObserved;
  const consecutive = (existing?.value_json as Record<string, unknown> | undefined)?.consecutive;
  const nextState: IncidentState = {
    firstObserved: typeof firstObserved === "string" && firstObserved.length ? firstObserved : observedAt,
    latestObserved: observedAt,
    consecutive: typeof consecutive === "number" ? consecutive + 1 : 1
  };
  await upsertSystemState(key, nextState);
  return nextState;
}

function buildIncidentStateKey(dedupeKey: string) {
  return `${INCIDENT_STATE_PREFIX}:${dedupeKey}`;
}

function deriveIncidents(args: AlertEvaluationArgs): IncidentDescriptor[] {
  const incidents: IncidentDescriptor[] = [];
  const { metadata, health } = args.intelligence;
  for (const source of SOURCES) {
    const meta = metadata?.[source];
    if (!meta) continue;
    const sourceHealth = health?.[source];
    incidents.push(...evaluateIncidentsForSource({
      source,
      meta,
      health: sourceHealth,
      commerce: args.commerce,
      observedAt: args.observedAt
    }));
  }
  return incidents;
}

type IncidentEvalInput = {
  source: TelemetrySource;
  meta: TelemetryMetadata | undefined;
  health: TelemetryHealth | undefined;
  commerce: CommerceTelemetryResult;
  observedAt: string;
};

export function evaluateIncidentsForSource(input: IncidentEvalInput): IncidentDescriptor[] {
  const incidents: IncidentDescriptor[] = [];
  const freshness = input.meta?.freshnessStatus ?? "unknown";
  const coverage = input.meta?.coverageStatus ?? "unknown";
  const warningCodes = new Set(input.meta?.warningCodes ?? []);
  const errors = input.commerce.errors ?? {};
  const latency = getLatencyForSource(input.source, input.commerce);

  if (freshness === "no_data") {
    incidents.push(makeIncident(input.source, "no_data", "critical", "Source returned no data."));
  } else if (freshness === "stale") {
    incidents.push(makeIncident(input.source, "stale_data", "high", "Source data is stale."));
  } else if (freshness === "unknown") {
    incidents.push(makeIncident(input.source, "freshness_unknown", "medium", "Freshness could not be verified."));
  }

  if (coverage === "partial") {
    incidents.push(makeIncident(input.source, "coverage_partial", "medium", "Partial day coverage detected."));
  }

  if (input.source === "woo" && input.commerce.wooDetails?.fallbackToLegacy) {
    incidents.push(makeIncident(input.source, "semantic_fallback", "critical", "Semantic RPC fell back to legacy data."));
  }

  if (warningCodes.has("future_dates")) {
    incidents.push(makeIncident(input.source, "future_dates", "medium", "Future dates present in range."));
  }
  if (warningCodes.has("semantic_summary_unsafe") || warningCodes.has("multiple_currencies")) {
    incidents.push(makeIncident(input.source, "semantic_warning", "medium", "Semantic adapter flagged unsafe data."));
  }

  if (errors[input.source]) {
    incidents.push(makeIncident(input.source, "rpc_error", "critical", errors[input.source] ?? "RPC error"));
  }

  if (latency != null && latency >= LATENCY_WARN_THRESHOLD_MS) {
    incidents.push(makeIncident(input.source, "latency_regression", "medium", `Latency ${latency}ms exceeds threshold.`));
  }

  const healthStatus = input.health?.status;
  if (healthStatus === "critical" && incidents.every((incident) => incident.reason !== "health_critical")) {
    incidents.push(makeIncident(input.source, "health_critical", "critical", "Source health classified as critical."));
  }

  return incidents;
}

function makeIncident(source: TelemetrySource, reason: string, severity: AlertSeverity, detail: string): IncidentDescriptor {
  return { source, reason, severity, detail };
}

function getLatencyForSource(source: TelemetrySource, commerce: CommerceTelemetryResult) {
  if (source === "woo") return commerce.wooLatencyMs ?? null;
  if (source === "ga4") return commerce.ga4LatencyMs ?? null;
  if (source === "funnelkit") return commerce.funnelLatencyMs ?? null;
  return null;
}
