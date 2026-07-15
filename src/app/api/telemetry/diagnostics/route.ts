import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { buildDashboardTelemetryIntelligence } from "@/lib/telemetry/intelligence";
import {
  getCommerceTelemetry,
  getDashboardSnapshots,
  getOpenAlerts,
  getScheduledJobsWithLatestRuns,
  listTelemetryHealthEvents,
  resolveWooMetricsMode
} from "@/lib/supabase/queries";
import { getDeploymentVersion } from "@/lib/version";
import type { MetaAdsSnapshot } from "@/lib/types/dashboard";

export async function GET(request: Request) {
  const auth = enforceDashboardAuth(request);
  if (auth) return auth;

  try {
    const range = buildTrailingRange(7);
    const previousRange = buildPreviousRange(range);

    const [currentCommerce, previousCommerce, snapshots, recentEvents, alerts, schedulerJobs] = await Promise.all([
      getCommerceTelemetry(range, { tolerateErrors: true }),
      getCommerceTelemetry(previousRange, { tolerateErrors: true }),
      getDashboardSnapshots(["meta"]),
      listTelemetryHealthEvents({ limit: 50 }),
      getOpenAlerts(),
      getScheduledJobsWithLatestRuns({ activeOnly: false })
    ]);

    const metaSnapshot = (snapshots.find((row) => row.key === "meta")?.payload as MetaAdsSnapshot | null | undefined) ?? null;
    const intelligence = buildDashboardTelemetryIntelligence({
      range,
      currentCommerce,
      previousCommerce,
      metaSnapshot
    });

    const telemetryAlerts = alerts.filter((alert) => alert.alert_type === "telemetry_health");
    const telemetryJob = (schedulerJobs as Array<Record<string, unknown>>).find(
      (job) => (job.job_key as string | undefined) === "telemetry-health-monitor"
    ) ?? null;

    return ok({
      ok: true,
      range,
      telemetryMetadata: intelligence.metadata,
      telemetryHealth: intelligence.health,
      executiveInsights: intelligence.executiveInsights,
      recentEvents,
      alerts: telemetryAlerts,
      schedulerJob: telemetryJob,
      deploymentVersion: getDeploymentVersion(),
      wooMetricsMode: resolveWooMetricsMode(process.env.WOO_METRICS_MODE),
      commerceErrors: currentCommerce.errors ?? null
    });
  } catch (error) {
    return serverError("Failed to load telemetry diagnostics", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function buildTrailingRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, days) - 1));
  return {
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(end)
  };
}

function buildPreviousRange(range: { startDate: string; endDate: string }) {
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
