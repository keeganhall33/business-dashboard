type ScoreboardMetricRow = {
  metric_key: string;
  metric_name: string | null;
  current_value: unknown;
  target_value: unknown;
  unit: string | null;
  stats?: { average?: number | null; min?: number | null; max?: number | null; changePercent?: number | null } | null;
  history?: Array<{ measured_at: string | null; value: number | null }> | null;
};
function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function statusFromGap(current: number | null, target: number | null): "healthy" | "warning" | "critical" {
  if (current == null || target == null || !Number.isFinite(current) || !Number.isFinite(target) || target === 0) return "warning";
  const ratio = current / target;
  if (ratio >= 0.95) return "healthy";
  if (ratio >= 0.75) return "warning";
  return "critical";
}

export type RevenueEngineMetric = {
  metricKey: string;
  metricName: string | null;
  currentValue: number | null;
  targetValue: number | null;
  status: "healthy" | "warning" | "critical";
  unit: string | null;
  history: Array<{ measuredAt: string | null; value: number | null }> | null;
  stats:
    | {
        average: number | null;
        min: number | null;
        max: number | null;
        changePercent: number | null;
      }
    | null;
};

export function buildRevenueEngineMetrics(params: {
  metricByKey: Map<string, ScoreboardMetricRow>;
  commerceTelemetry: unknown;
}): RevenueEngineMetric[] {
  const { metricByKey, commerceTelemetry } = params;

  const metrics: RevenueEngineMetric[] = ["monthly_revenue", "aov", "revenue_per_visitor", "conversion_rate"]
    .map((key) => metricByKey.get(key))
    .filter((m): m is ScoreboardMetricRow => Boolean(m))
    .map((m) => ({
      metricKey: m.metric_key,
      metricName: m.metric_key === "conversion_rate" ? "Purchase conversion" : m.metric_name,
      currentValue: toNumber(m.current_value),
      targetValue: toNumber(m.target_value),
      status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
      unit: m.unit ?? null,
      history: (m.history ?? null)
        ? (m.history ?? []).map((h) => ({ measuredAt: h.measured_at, value: h.value }))
        : null,
      stats: (m.stats ?? null)
        ? {
            average: m.stats?.average ?? null,
            min: m.stats?.min ?? null,
            max: m.stats?.max ?? null,
            changePercent: m.stats?.changePercent ?? null
          }
        : null
    }));

  const funnelCompletionRate = toNumber(
    (commerceTelemetry as unknown as { funnel?: { summary?: { conversionRate?: unknown } } })?.funnel?.summary?.conversionRate
  );
  if (funnelCompletionRate != null) {
    metrics.push({
      metricKey: "funnel_completion_rate",
      metricName: "Funnel completion",
      currentValue: funnelCompletionRate,
      targetValue: null,
      status: "warning",
      unit: "percent",
      history: null,
      stats: null
    });
  }

  return metrics;
}
