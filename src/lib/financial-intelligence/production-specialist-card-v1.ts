import type {
  SpecialistCommandCenterCardV1,
  SpecialistCommandCenterFreshnessV1
} from "@/lib/executive-home/specialist-command-center";
import type {
  DashboardOverviewResponse,
  PerformanceBaselineMetric
} from "@/lib/types/dashboard";

const UNSUPPORTED_FINANCIAL_FIELDS =
  "Cash, direct costs, contribution, margin, profitability, runway, receivables, and forecasts remain UNKNOWN.";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCompleteCurrentMetric(metric: PerformanceBaselineMetric): boolean {
  return (
    isFiniteNumber(metric.current) &&
    metric.currentCompleteness === "complete" &&
    metric.currentQualifier !== "at_least"
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} through ${endDate}`;
}

function observedAt(timestamp: string): string | null {
  return Number.isNaN(Date.parse(timestamp)) ? null : timestamp;
}

function revenueChange(
  metric: PerformanceBaselineMetric,
  currentLabel: string
): string | null {
  if (
    metric.previousCompleteness !== "complete" ||
    !isFiniteNumber(metric.previous) ||
    !isFiniteNumber(metric.deltaPercent)
  ) {
    return null;
  }

  if (metric.deltaPercent === 0) {
    return `Revenue held at ${currentLabel} versus the complete comparison range.`;
  }

  const direction = metric.deltaPercent > 0 ? "increased" : "decreased";
  return `Revenue ${direction} ${Math.abs(metric.deltaPercent * 100).toFixed(1)}% to ${currentLabel} versus the complete comparison range.`;
}

/**
 * Projects only directly supported financial facts from the canonical dashboard
 * request. It deliberately does not infer cash, profit, margin, or runway from
 * revenue or order telemetry.
 */
export function buildFinancialProductionSpecialistCardV1(
  data: DashboardOverviewResponse
): SpecialistCommandCenterCardV1 | null {
  if (data.dataMode !== "LIVE_DATA" && data.dataMode !== "PARTIAL_LIVE_DATA") {
    return null;
  }

  const baseline = data.performanceBaseline;
  const revenue = baseline?.metrics.revenue;
  if (!baseline || !revenue || !isCompleteCurrentMetric(revenue)) {
    return null;
  }

  const currentRevenue = revenue.current;
  if (!isFiniteNumber(currentRevenue)) {
    return null;
  }

  const currentLabel = formatCurrency(currentRevenue);
  const rangeLabel = formatRange(baseline.range.startDate, baseline.range.endDate);
  const orders = baseline.metrics.orders;
  const knownOrders = isCompleteCurrentMetric(orders)
    ? ` Complete order count: ${orders.current}.`
    : "";
  const change = revenueChange(revenue, currentLabel);
  const freshness: SpecialistCommandCenterFreshnessV1 = "UNKNOWN";

  return {
    id: "financial",
    title: "Financial",
    what_changed:
      change ?? `Complete selected-range revenue is ${currentLabel} for ${rangeLabel}.`,
    why_it_matters:
      `The canonical performance baseline directly supports ${currentLabel} of revenue for ${rangeLabel}.${knownOrders} No broader economics are inferred from it.`,
    next_best_action:
      "Review direct cost, margin, cash, and receivables evidence before making a financial decision.",
    confidence: data.dataMode === "LIVE_DATA" ? "HIGH" : "MEDIUM",
    truth_state: "KNOWN",
    evidence_freshness: freshness,
    evidence_context: {
      source_label: "Canonical dashboard performance baseline",
      freshness_detail:
        "The dashboard request timestamp is retained, but source-age freshness is UNKNOWN until the financial source publishes an explicit freshness contract.",
      truth_detail:
        "Revenue is complete for the selected range; unsupported financial fields remain UNKNOWN.",
      last_updated: observedAt(data.timestamp)
    },
    material_gap_or_risk: UNSUPPORTED_FINANCIAL_FIELDS,
    detail_href: "/data-evidence",
    evidence:
      `performanceBaseline.metrics.revenue.current=${currentRevenue}; completeness=complete; range=${rangeLabel}`,
    source: "DASHBOARD_OVERVIEW_PERFORMANCE_BASELINE",
    source_mode: "PRODUCTION"
  };
}
