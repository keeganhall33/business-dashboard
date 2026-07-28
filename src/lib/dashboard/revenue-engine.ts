export type ScoreboardMetricRow = {
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

export type RevenueEngineCompleteness = "complete" | "partial" | "unknown";
export type RevenueEngineMetricQualifier = "at_least";

export type RevenueEngineMetric = {
  metricKey: string;
  metricName: string | null;
  currentValue: number | null;
  targetValue: number | null;
  currentQualifier?: RevenueEngineMetricQualifier;
  currentCompleteness?: RevenueEngineCompleteness;
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

function normalizeCompleteness(value: unknown): RevenueEngineCompleteness | null {
  if (value === "complete" || value === "partial" || value === "unknown") return value;
  return null;
}

function normalizeHistory(history: ScoreboardMetricRow["history"]): RevenueEngineMetric["history"] {
  const rows = (history ?? []).map((h) => ({ measuredAt: h.measured_at, value: h.value }));
  const numeric = rows.filter((h) => typeof h.value === "number" && Number.isFinite(h.value));
  return numeric.length >= 2 ? numeric : null;
}

export function buildRevenueEngineMetrics(params: {
  metricByKey: Map<string, ScoreboardMetricRow>;
  commerceTelemetry: unknown;
}): RevenueEngineMetric[] {
  const { metricByKey, commerceTelemetry } = params;

  const wooSummary = (commerceTelemetry as { woo?: { summary?: { revenue?: unknown; orders?: unknown; completeness?: unknown } } })?.woo?.summary;

  const gaSessions = toNumber((commerceTelemetry as { ga4?: { summary?: { sessions?: unknown } } })?.ga4?.summary?.sessions);

  const wooRevenue = toNumber(wooSummary?.revenue);
  const wooOrders = toNumber(wooSummary?.orders);
  const completeness = normalizeCompleteness(wooSummary?.completeness);

  const commerceCompleteness: RevenueEngineCompleteness | null =
    completeness ?? (wooRevenue != null || wooOrders != null ? "unknown" : null);

  const commerceIncomplete = commerceCompleteness != null && commerceCompleteness !== "complete";

  const metricRow = (key: string) => metricByKey.get(key) ?? null;

  const revenueTarget = toNumber(metricRow("monthly_revenue")?.target_value);
  const ordersTarget = toNumber(metricRow("orders")?.target_value);
  const rpvTarget = toNumber(metricRow("revenue_per_visitor")?.target_value);
  const purchaseConversionTarget = toNumber(metricRow("purchase_conversion_rate")?.target_value);

  const purchaseConversion =
    wooOrders != null && gaSessions != null && gaSessions > 0 ? (wooOrders / gaSessions) * 100 : null;

  const revenuePerVisitor =
    wooRevenue != null && gaSessions != null && gaSessions > 0 ? wooRevenue / gaSessions : null;

  const metrics: RevenueEngineMetric[] = [];

  // Revenue
  metrics.push({
    metricKey: "monthly_revenue",
    metricName: "Revenue",
    currentValue: wooRevenue,
    targetValue: commerceIncomplete ? null : revenueTarget,
    ...(commerceCompleteness === "partial" ? { currentQualifier: "at_least" as const } : null),
    ...(commerceIncomplete ? { currentCompleteness: commerceCompleteness! } : null),
    status: commerceIncomplete ? "warning" : statusFromGap(wooRevenue, revenueTarget),
    unit: "usd",
    history: null,
    stats: null
  });

  // Orders
  metrics.push({
    metricKey: "orders",
    metricName: "Orders",
    currentValue: wooOrders,
    targetValue: commerceIncomplete ? null : ordersTarget,
    ...(commerceCompleteness === "partial" ? { currentQualifier: "at_least" as const } : null),
    ...(commerceIncomplete ? { currentCompleteness: commerceCompleteness! } : null),
    status: commerceIncomplete ? "warning" : statusFromGap(wooOrders, ordersTarget),
    unit: "count",
    history: null,
    stats: null
  });

  // AOV
  metrics.push({
    metricKey: "aov",
    metricName: "Average Order Value",
    currentValue: commerceIncomplete ? null : toNumber(metricRow("aov")?.current_value) ?? null,
    targetValue: commerceIncomplete ? null : toNumber(metricRow("aov")?.target_value) ?? null,
    ...(commerceIncomplete ? { currentCompleteness: commerceCompleteness! } : null),
    status: commerceIncomplete ? "warning" : statusFromGap(toNumber(metricRow("aov")?.current_value), toNumber(metricRow("aov")?.target_value)),
    unit: "usd",
    history: normalizeHistory(metricRow("aov")?.history ?? null),
    stats: (metricRow("aov")?.stats ?? null)
      ? {
          average: metricRow("aov")?.stats?.average ?? null,
          min: metricRow("aov")?.stats?.min ?? null,
          max: metricRow("aov")?.stats?.max ?? null,
          changePercent: metricRow("aov")?.stats?.changePercent ?? null
        }
      : null
  });

  // Revenue per visitor
  metrics.push({
    metricKey: "revenue_per_visitor",
    metricName: "Revenue per visitor",
    currentValue: revenuePerVisitor,
    targetValue: commerceIncomplete ? null : rpvTarget,
    ...(commerceCompleteness === "partial" ? { currentQualifier: "at_least" as const } : null),
    ...(commerceIncomplete ? { currentCompleteness: commerceCompleteness! } : null),
    status: commerceIncomplete ? "warning" : statusFromGap(revenuePerVisitor, rpvTarget),
    unit: "usd",
    history: normalizeHistory(metricRow("revenue_per_visitor")?.history ?? null),
    stats: (metricRow("revenue_per_visitor")?.stats ?? null)
      ? {
          average: metricRow("revenue_per_visitor")?.stats?.average ?? null,
          min: metricRow("revenue_per_visitor")?.stats?.min ?? null,
          max: metricRow("revenue_per_visitor")?.stats?.max ?? null,
          changePercent: metricRow("revenue_per_visitor")?.stats?.changePercent ?? null
        }
      : null
  });

  // Purchase conversion
  metrics.push({
    metricKey: "purchase_conversion_rate",
    metricName: "Purchase conversion",
    currentValue: purchaseConversion,
    targetValue: commerceIncomplete ? null : purchaseConversionTarget,
    ...(commerceIncomplete ? { currentCompleteness: commerceCompleteness! } : null),
    status: commerceIncomplete ? "warning" : statusFromGap(purchaseConversion, purchaseConversionTarget),
    unit: "percent",
    history: normalizeHistory(metricRow("purchase_conversion_rate")?.history ?? null),
    stats: (metricRow("purchase_conversion_rate")?.stats ?? null)
      ? {
          average: metricRow("purchase_conversion_rate")?.stats?.average ?? null,
          min: metricRow("purchase_conversion_rate")?.stats?.min ?? null,
          max: metricRow("purchase_conversion_rate")?.stats?.max ?? null,
          changePercent: metricRow("purchase_conversion_rate")?.stats?.changePercent ?? null
        }
      : null
  });

  // Funnel completion (FunnelKit)
  const funnelCompletionRate = toNumber((commerceTelemetry as { funnel?: { summary?: { conversionRate?: unknown } } })?.funnel?.summary?.conversionRate);
  if (funnelCompletionRate != null) {
    metrics.push({
      metricKey: "funnel_completion_rate",
      metricName: "Funnel completion",
      currentValue: funnelCompletionRate,
      targetValue: null,
      status: "warning",
      unit: "percent",
      history: normalizeHistory(metricRow("funnel_completion_rate")?.history ?? null),
      stats: null
    });
  }

  return metrics;
}
