import type {
  CommerceTelemetry,
  PerformanceBaselineMetric,
  PerformanceBaselineSnapshot,
  RangePreset
} from "@/lib/types/dashboard";

type Range = {
  preset: RangePreset;
  startDate: string; // YYYY-MM-DD (UTC)
  endDate: string; // YYYY-MM-DD (UTC)
};

export function buildPerformanceBaselineSnapshot(params: {
  range: Range;
  currentTelemetry: CommerceTelemetry | null;
  previousTelemetry: CommerceTelemetry | null;
}): PerformanceBaselineSnapshot | null {
  const current = params.currentTelemetry;
  const previous = params.previousTelemetry;
  if (!current) return null;

  const previousRange =
    params.range.preset === "year_to_date"
      ? computePriorYearDateRange({ startDate: params.range.startDate, endDate: params.range.endDate })
      : computePreviousInclusiveDateRange(params.range);
  if (!previousRange) return null;

  // YTD comparisons must use the prior-year equivalent window. If we do not have
  // a compatible prior-year telemetry input, suppress comparisons rather than
  // comparing against an arbitrary equal-length prior window.
  const previousComparable = params.range.preset === "year_to_date" ? null : previous;

  const wooCompletenessCurrent = normalizeCompleteness(current.woo?.summary?.completeness);
  const wooCompletenessPrevious = normalizeCompleteness(previousComparable?.woo?.summary?.completeness);

  const revenueCurrent = toFiniteNumber(current.woo?.summary?.revenue);
  const revenuePrevious = toFiniteNumber(previousComparable?.woo?.summary?.revenue);

  const ordersCurrent = toFiniteNumber(current.woo?.summary?.orders);
  const ordersPrevious = toFiniteNumber(previousComparable?.woo?.summary?.orders);

  const aovCurrent =
    wooCompletenessCurrent === "complete"
      ? computeAov({
          direct: current.woo?.summary?.avgOrderValue,
          revenue: revenueCurrent,
          orders: ordersCurrent
        })
      : null;
  const aovPrevious =
    wooCompletenessPrevious === "complete"
      ? computeAov({
          direct: previousComparable?.woo?.summary?.avgOrderValue,
          revenue: revenuePrevious,
          orders: ordersPrevious
        })
      : null;

  const sessionsCurrent = toFiniteNumber(current.ga4?.summary?.sessions);
  const sessionsPrevious = toFiniteNumber(previousComparable?.ga4?.summary?.sessions);

  const purchaseConversionCurrent =
    ordersCurrent != null && sessionsCurrent != null && sessionsCurrent > 0
      ? (ordersCurrent / sessionsCurrent) * 100
      : null;
  const purchaseConversionPrevious =
    ordersPrevious != null && sessionsPrevious != null && sessionsPrevious > 0
      ? (ordersPrevious / sessionsPrevious) * 100
      : null;

  // FunnelKit conversionRate is already in 0–100 scale (percent).
  const funnelCompletionCurrent = toFiniteNumber(current.funnel?.summary?.conversionRate);
  const funnelCompletionPrevious = toFiniteNumber(previousComparable?.funnel?.summary?.conversionRate);

  const currentQualifier = wooCompletenessCurrent === "partial" ? ("at_least" as const) : undefined;

  return {
    range: {
      preset: params.range.preset,
      startDate: params.range.startDate,
      endDate: params.range.endDate
    },
    previousRange,
    metrics: {
      revenue: metric({
        id: "revenue",
        unit: "currency",
        current: revenueCurrent,
        previous: revenuePrevious,
        currentCompleteness: wooCompletenessCurrent,
        previousCompleteness: wooCompletenessPrevious,
        currentQualifier
      }),
      orders: metric({
        id: "orders",
        unit: "count",
        current: ordersCurrent,
        previous: ordersPrevious,
        currentCompleteness: wooCompletenessCurrent,
        previousCompleteness: wooCompletenessPrevious,
        currentQualifier
      }),
      avgOrderValue: metric({
        id: "avg_order_value",
        unit: "currency",
        current: aovCurrent,
        previous: aovPrevious,
        currentCompleteness: wooCompletenessCurrent,
        previousCompleteness: wooCompletenessPrevious
      }),
      sessions: metric({ id: "sessions", unit: "count", current: sessionsCurrent, previous: sessionsPrevious }),
      purchaseConversionRate: metric({
        id: "purchase_conversion_rate",
        unit: "percent",
        current: purchaseConversionCurrent,
        previous: purchaseConversionPrevious,
        currentCompleteness: wooCompletenessCurrent,
        previousCompleteness: wooCompletenessPrevious
      }),
      funnelCompletionRate: metric({
        id: "funnel_completion_rate",
        unit: "percent",
        current: funnelCompletionCurrent,
        previous: funnelCompletionPrevious
      })
    }
  };
}

function normalizeCompleteness(value: unknown): "complete" | "partial" | "unknown" {
  if (value === "complete" || value === "partial" || value === "unknown") return value;
  // If the source doesn't provide an explicit completeness marker, we cannot treat
  // the totals as proven complete.
  if (value == null) return "unknown";
  return "unknown";
}

export function computePreviousInclusiveDateRange(range: { startDate: string; endDate: string }): { startDate: string; endDate: string } | null {
  const start = parseUtcDate(range.startDate);
  const end = parseUtcDate(range.endDate);
  if (!start || !end) return null;

  const durationDays = daysBetweenInclusive(start, end);
  if (durationDays <= 0) return null;

  const prevEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 1));
  const prevStart = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth(), prevEnd.getUTCDate() - (durationDays - 1)));

  return {
    startDate: formatUtcDate(prevStart),
    endDate: formatUtcDate(prevEnd)
  };
}

function computePriorYearDateRange(range: { startDate: string; endDate: string }): { startDate: string; endDate: string } | null {
  const start = parseUtcDate(range.startDate);
  const end = parseUtcDate(range.endDate);
  if (!start || !end) return null;

  const prevStart = new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), start.getUTCDate()));
  const prevEnd = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate()));
  return {
    startDate: formatUtcDate(prevStart),
    endDate: formatUtcDate(prevEnd)
  };
}

function metric(params: {
  id: PerformanceBaselineMetric["id"];
  unit: PerformanceBaselineMetric["unit"];
  current: number | null;
  previous: number | null;
  currentQualifier?: PerformanceBaselineMetric["currentQualifier"];
  currentCompleteness?: PerformanceBaselineMetric["currentCompleteness"];
  previousCompleteness?: PerformanceBaselineMetric["previousCompleteness"];
}): PerformanceBaselineMetric {
  const { current, previous } = params;

  const comparisonAllowed =
    current != null &&
    previous != null &&
    (params.currentCompleteness ?? "complete") === "complete" &&
    (params.previousCompleteness ?? "complete") === "complete";

  const delta = comparisonAllowed ? current - previous : null;
  const deltaPercent =
    comparisonAllowed && delta != null && previous != null && previous !== 0
      ? delta / previous
      : null;

  return {
    id: params.id,
    unit: params.unit,
    current,
    previous,
    delta,
    deltaPercent,
    ...(params.currentQualifier ? { currentQualifier: params.currentQualifier } : null),
    ...(params.currentCompleteness ? { currentCompleteness: params.currentCompleteness } : null),
    ...(params.previousCompleteness ? { previousCompleteness: params.previousCompleteness } : null)
  };
}

function computeAov(params: { direct: unknown; revenue: number | null; orders: number | null }): number | null {
  const direct = toFiniteNumber(params.direct);
  if (direct != null) return direct;

  const revenue = params.revenue;
  const orders = params.orders;
  if (revenue == null || orders == null) return null;
  if (orders <= 0) return null;
  return revenue / orders;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseUtcDate(value: string): Date | null {
  if (!value) return null;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = value.split("-").map((part) => Number(part));
  if (!y || !mo || !d) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  // Reject impossible calendar dates like 2026-02-30 that overflow into the next month.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function formatUtcDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((endMs - startMs) / dayMs) + 1;
}
