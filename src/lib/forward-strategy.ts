import type { DashboardOverviewResponse, ExecutiveInsightsPayload, HeaderMetric } from "@/lib/types/dashboard";

function findMetric(metrics: HeaderMetric[], predicate: (metric: HeaderMetric) => boolean) {
  return metrics.find(predicate);
}

export function buildForwardActions(
  data: DashboardOverviewResponse,
  totalDays: number,
  elapsedDays: number
): Array<{
  id: string;
  category: string;
  title: string;
  reason: string;
  expectedImpact: string;
  evidence: string;
  urgency: string;
  confidence: "high" | "medium" | "low";
}> {
  const actions: Array<{
    id: string;
    category: string;
    title: string;
    reason: string;
    expectedImpact: string;
    evidence: string;
    urgency: string;
    confidence: "high" | "medium" | "low";
  }> = [];

  const revenueMetric = findMetric(
    data.headerMetrics,
    (metric) => metric.metricKey.toLowerCase().includes("revenue") || metric.metricName.toLowerCase().includes("revenue")
  );
  const currentRevenue = revenueMetric?.currentValue ?? data.websiteConversion?.wooCommerce?.grossOrderRevenue ?? 0;
  const revenueTarget = revenueMetric?.targetValue ?? null;
  const paceRevenue = elapsedDays > 0 ? (currentRevenue / Math.max(elapsedDays, 1)) * totalDays : currentRevenue;
  if (revenueTarget != null) {
    const gap = revenueTarget - paceRevenue;
    if (gap > 0) {
      actions.push({
        id: "forward-revenue",
        category: "Revenue",
        title: "Close the revenue gap",
        reason: `Pace is tracking $${Math.round(gap).toLocaleString()} behind target for this window`,
        expectedImpact: `+$${Math.round(gap).toLocaleString()} if closed`,
        evidence: revenueMetric ? `${revenueMetric.metricName}` : "Woo revenue pace",
        urgency: "This week",
        confidence: "high"
      });
    }
  }

  const telemetryIssues = Object.values(data.telemetryHealth ?? {}).filter((entry) => entry && entry.status !== "healthy");
  telemetryIssues.slice(0, 1).forEach((issue) => {
    if (!issue) return;
    actions.push({
      id: `forward-telemetry-${issue.source}`,
      category: "Data",
      title: `Fix ${issue.source.toUpperCase()} telemetry`,
      reason: issue.reasons?.[0] ?? "Data coverage risk",
      expectedImpact: "Protect decision accuracy",
      evidence: issue.warningCodes?.join(", ") ?? issue.source,
      urgency: "Today",
      confidence: issue.status === "critical" ? "high" : "medium"
    });
  });

  const actionableInsight = data.executiveInsights?.trends?.find((trend) => trend.direction === "down" && trend.magnitude !== "minor");
  if (actionableInsight) {
    actions.push({
      id: `forward-insight-${actionableInsight.id}`,
      category: actionableInsight.source.toUpperCase(),
      title: `Stabilize ${actionableInsight.label}`,
      reason: describeTrend(actionableInsight),
      expectedImpact: "Recover funnel health",
      evidence: actionableInsight.metric,
      urgency: "This week",
      confidence: actionableInsight.magnitude === "major" ? "high" : "medium"
    });
  }

  return actions.slice(0, 3);
}

export function describeTrend(trend: NonNullable<ExecutiveInsightsPayload>["trends"][number]) {
  const percent = typeof trend.percentChange === "number" ? `${trend.percentChange.toFixed(1)}%` : null;
  const direction = trend.direction === "down" ? "declined" : trend.direction === "up" ? "grew" : "held steady";
  const parts = [percent, direction].filter(Boolean).join(" ");
  return parts ? `${trend.label} ${parts}` : trend.label;
}
