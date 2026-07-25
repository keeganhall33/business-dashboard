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
  if (!current || !previous) return null;

  const previousRange = computePreviousInclusiveDateRange(params.range);
  if (!previousRange) return null;

  const revenueCurrent = toFiniteNumber(current.woo?.summary?.revenue);
  const revenuePrevious = toFiniteNumber(previous.woo?.summary?.revenue);

  const ordersCurrent = toFiniteNumber(current.woo?.summary?.orders);
  const ordersPrevious = toFiniteNumber(previous.woo?.summary?.orders);

  const aovCurrent = computeAov({
    direct: current.woo?.summary?.avgOrderValue,
    revenue: revenueCurrent,
    orders: ordersCurrent
  });
  const aovPrevious = computeAov({
    direct: previous.woo?.summary?.avgOrderValue,
    revenue: revenuePrevious,
    orders: ordersPrevious
  });

  const sessionsCurrent = toFiniteNumber(current.ga4?.summary?.sessions);
  const sessionsPrevious = toFiniteNumber(previous.ga4?.summary?.sessions);

  // FunnelKit conversionRate is already in 0–100 scale (percent).
  const conversionCurrent = toFiniteNumber(current.funnel?.summary?.conversionRate);
  const conversionPrevious = toFiniteNumber(previous.funnel?.summary?.conversionRate);

  return {
    range: {
      preset: params.range.preset,
      startDate: params.range.startDate,
      endDate: params.range.endDate
    },
    previousRange,
    metrics: {
      revenue: metric({ id: "revenue", unit: "currency", current: revenueCurrent, previous: revenuePrevious }),
      orders: metric({ id: "orders", unit: "count", current: ordersCurrent, previous: ordersPrevious }),
      avgOrderValue: metric({ id: "avg_order_value", unit: "currency", current: aovCurrent, previous: aovPrevious }),
      sessions: metric({ id: "sessions", unit: "count", current: sessionsCurrent, previous: sessionsPrevious }),
      conversionRate: metric({ id: "conversion_rate", unit: "percent", current: conversionCurrent, previous: conversionPrevious })
    }
  };
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

function metric(params: {
  id: PerformanceBaselineMetric["id"];
  unit: PerformanceBaselineMetric["unit"];
  current: number | null;
  previous: number | null;
}): PerformanceBaselineMetric {
  const { current, previous } = params;
  const delta = current != null && previous != null ? current - previous : null;
  const deltaPercent =
    delta != null && previous != null && previous !== 0
      ? delta / previous
      : null;

  return {
    id: params.id,
    unit: params.unit,
    current,
    previous,
    delta,
    deltaPercent
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
