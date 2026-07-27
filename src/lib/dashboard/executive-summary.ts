import type { DashboardOverviewResponse, PerformanceBaselineMetric } from "@/lib/types/dashboard";

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

