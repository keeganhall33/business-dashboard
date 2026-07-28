import { formatPacificIsoDate } from "@/lib/date/pacific";

export type RecentOrderFallbackRow = {
  id?: string | number | null;
  status: string | null;
  total: number | null;
  date_paid?: string | null;
  date_paid_gmt?: string | null;
  date?: string | null;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function derivePacificIsoDay(rawDate: string): string | null {
  // If the source is already a YYYY-MM-DD date, treat it as a calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatPacificIsoDate(parsed);
}

export function deriveWooSummaryFromRecentOrders(params: {
  range: { startDate: string; endDate: string };
  recentOrders: RecentOrderFallbackRow[];
}) {
  const eligibleStatuses = new Set(["completed", "processing"]);
  const start = params.range.startDate;
  const end = params.range.endDate;

  const seenIds = new Set<string | number>();

  const included = params.recentOrders
    .map((order) => {
      const status = (order.status ?? "").toLowerCase();
      const total = typeof order.total === "number" && Number.isFinite(order.total) ? order.total : null;

      const rawDate = order.date_paid_gmt ?? order.date_paid ?? order.date ?? null;
      const isoDay = rawDate ? derivePacificIsoDay(String(rawDate)) : null;

      const inWindow = isoDay != null && isoDay >= start && isoDay <= end;
      const eligible = eligibleStatuses.has(status);

      const id = order.id;
      const stableId = typeof id === "string" || typeof id === "number" ? id : null;
      const isDuplicate = stableId != null && seenIds.has(stableId);
      if (stableId != null) seenIds.add(stableId);

      return { eligible, inWindow, total, stableId, isDuplicate };
    })
    // Conservative handling: ignore rows without a stable identifier so duplicates can't inflate revenue.
    .filter((o) => o.eligible && o.inWindow && o.total != null && !o.isDuplicate && o.stableId != null);

  if (included.length === 0) return null;

  const revenue = roundCurrency(included.reduce((sum, o) => sum + (o.total ?? 0), 0));
  const orders = included.length;

  return {
    revenue,
    orders,
    items: orders,
    avgOrderValue: orders > 0 ? revenue / orders : null,
    hasData: true,
    source: "snapshot_recent_orders" as const,
    note: "Selected-range Woo telemetry was unavailable; derived from latest snapshot recent orders." as const,
    completeness: "partial" as const,
    comparisonAvailable: false as const,
    asOf: null
  };
}
