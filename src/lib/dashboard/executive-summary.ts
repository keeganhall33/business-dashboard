import type { DashboardOverviewResponse, PerformanceBaselineMetric } from "@/lib/types/dashboard";

export const EXECUTIVE_MATERIALITY_THRESHOLD = 0.1; // 10%

export type ExecutiveMetric = {
  label: string;
  unit: PerformanceBaselineMetric["unit"];
  current: number | null;
  previous: number | null;
  delta: number | null;
  deltaPercent: number | null;
};

export type ExecutiveSummary = {
  rangeLabel: string;
  comparisonLabel: string;
  metrics: {
    revenue: ExecutiveMetric;
    orders: ExecutiveMetric;
    aov: ExecutiveMetric;
    sessions: ExecutiveMetric;
    purchaseConversion: ExecutiveMetric;
    funnelCompletion: ExecutiveMetric;
  };
};

export type ExecutiveMovement = {
  key: keyof ExecutiveSummary["metrics"];
  label: string;
  deltaPercent: number;
};

function metric(label: string, unit: PerformanceBaselineMetric["unit"], m: PerformanceBaselineMetric): ExecutiveMetric {
  return {
    label,
    unit,
    current: m.current,
    previous: m.previous,
    delta: m.delta,
    deltaPercent: m.deltaPercent
  };
}

export function buildExecutiveSummary(data: DashboardOverviewResponse): ExecutiveSummary | null {
  const baseline = data.performanceBaseline;
  if (!baseline) return null;

  const rangeLabel = `${baseline.range.startDate} → ${baseline.range.endDate}`;
  const comparisonLabel = `${baseline.previousRange.startDate} → ${baseline.previousRange.endDate}`;

  return {
    rangeLabel,
    comparisonLabel,
    metrics: {
      revenue: metric("Revenue", "currency", baseline.metrics.revenue),
      orders: metric("Orders", "count", baseline.metrics.orders),
      aov: metric("AOV", "currency", baseline.metrics.avgOrderValue),
      sessions: metric("Sessions", "count", baseline.metrics.sessions),
      purchaseConversion: metric("Purchase conversion", "percent", baseline.metrics.purchaseConversionRate),
      funnelCompletion: metric("Funnel completion", "percent", baseline.metrics.funnelCompletionRate)
    }
  };
}

export function getMaterialMovements(summary: ExecutiveSummary, threshold = EXECUTIVE_MATERIALITY_THRESHOLD): ExecutiveMovement[] {
  const entries = Object.entries(summary.metrics) as Array<[
    keyof ExecutiveSummary["metrics"],
    ExecutiveSummary["metrics"][keyof ExecutiveSummary["metrics"]]
  ]>;

  return entries
    .map(([key, metric]) => ({ key, label: metric.label, deltaPercent: metric.deltaPercent }))
    .filter((m): m is ExecutiveMovement => typeof m.deltaPercent === "number" && Number.isFinite(m.deltaPercent))
    .filter((m) => Math.abs(m.deltaPercent) >= threshold)
    .sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent));
}
