import { createScoreboardMetricReading, getCommerceTelemetry } from "@/lib/supabase/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { withJobRun } from "./jobLogger";

const DEFAULT_LOOKBACK_DAYS = 30;
const DUP_WINDOW_HOURS = 6;

export type ScoreboardRefreshOptions = {
  range?: { startDate: string; endDate: string };
  dryRun?: boolean;
};

type MetricComputation = {
  metricKey: string;
  value: number | null;
  details?: Record<string, unknown>;
};

type RefreshResult = {
  range: { startDate: string; endDate: string };
  computed: MetricComputation[];
  inserted: string[];
  skipped: Array<{ metricKey: string; reason: string }>;
};

export async function runScoreboardRefresh(options: ScoreboardRefreshOptions = {}) {
  const { dryRun = false } = options;

  if (dryRun) {
    return performRefresh({ ...options, dryRun: true });
  }

  return withJobRun({
    jobKey: "scoreboard-refresh",
    fn: () => performRefresh(options),
    summarize: (result) => ({
      summary: `metrics: ${result.inserted.length} inserted, ${result.skipped.length} skipped`,
      detailsJson: result
    })
  });
}

async function performRefresh(options: ScoreboardRefreshOptions): Promise<RefreshResult> {
  const range = options.range ?? buildDefaultRange();
  const telemetry = await getCommerceTelemetry(range);
  const supabase = getSupabaseServerClient();

  const wooSummary = (telemetry.woo?.summary ?? {}) as Record<string, unknown>;
  const gaSummary = (telemetry.ga4?.summary ?? {}) as Record<string, unknown>;

  const wooRevenue = toNumber(wooSummary.revenue);
  const wooOrders = toNumber(wooSummary.orders);
  const wooAov = toNumber(wooSummary.avgOrderValue);
  const gaSessions = toNumber(gaSummary.sessions);

  const conversionRate = computeRatio(wooOrders, gaSessions, 100);
  const revenuePerVisitor = computeRatio(wooRevenue, gaSessions, 1);

  const metrics: MetricComputation[] = [
    {
      metricKey: "monthly_revenue",
      value: wooRevenue,
      details: { revenue: wooRevenue }
    },
    {
      metricKey: "aov",
      value: wooAov,
      details: { revenue: wooRevenue, orders: wooOrders }
    },
    {
      metricKey: "conversion_rate",
      value: conversionRate,
      details: { orders: wooOrders, sessions: gaSessions }
    },
    {
      metricKey: "revenue_per_visitor",
      value: revenuePerVisitor,
      details: { revenue: wooRevenue, sessions: gaSessions }
    }
  ];

  const now = new Date();
  const recentSinceIso = new Date(now.getTime() - DUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const inserted: string[] = [];
  const skipped: Array<{ metricKey: string; reason: string }> = [];

  for (const metric of metrics) {
    if (metric.value == null || Number.isNaN(metric.value)) {
      skipped.push({ metricKey: metric.metricKey, reason: "value-null" });
      continue;
    }

    const hasRecent = await hasRecentScoreboardRefreshReading(supabase, metric.metricKey, recentSinceIso);
    if (hasRecent) {
      skipped.push({ metricKey: metric.metricKey, reason: "recent-reading" });
      continue;
    }

    if (options.dryRun) {
      inserted.push(metric.metricKey);
      continue;
    }

    await createScoreboardMetricReading({
      metricKey: metric.metricKey,
      currentValue: metric.value,
      measuredAtIso: now.toISOString(),
      source: "scoreboard_refresh"
    });
    inserted.push(metric.metricKey);
  }

  return {
    range,
    computed: metrics,
    inserted,
    skipped
  };
}

function buildDefaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - (DEFAULT_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000);
  return {
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(end)
  };
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function computeRatio(numerator: number | null, denominator: number | null, multiplier: number) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return (numerator / denominator) * multiplier;
}


async function hasRecentScoreboardRefreshReading(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  metricKey: string,
  sinceIso: string
) {
  const { data, error } = await supabase
    .from("scoreboard_metric_readings")
    .select("id")
    .eq("metric_key", metricKey)
    .eq("source", "scoreboard_refresh")
    .gte("measured_at", sinceIso)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
