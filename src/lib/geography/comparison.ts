import { SalesGeographyComparison, SalesGeographyDelta, SalesGeographyLocation, SalesGeographySnapshot } from "@/lib/types/dashboard";

const MIN_REVENUE_DELTA = 50; // USD
const MIN_PERCENT_DELTA = 15; // %

export function buildSalesGeographyComparison(
  current?: SalesGeographySnapshot | null,
  previous?: SalesGeographySnapshot | null
): SalesGeographyComparison | null {
  if (!current || !previous) return null;
  if (current.suppressedReasons?.length || previous.suppressedReasons?.length) return null;

  const previousMap = new Map(previous.locations.map((location) => [location.id, location]));
  const newLocations: SalesGeographyDelta[] = [];
  const risingLocations: SalesGeographyDelta[] = [];
  const coolingLocations: SalesGeographyDelta[] = [];

  for (const location of current.locations) {
    const prev = previousMap.get(location.id);
    if (!prev) {
      newLocations.push(toDelta(location, null, "new"));
      continue;
    }

    const delta = toDelta(location, prev, "rising");
    const { revenueDelta, revenueDeltaPercent } = delta;
    if (isRising(revenueDelta, revenueDeltaPercent)) {
      delta.direction = "rising";
      risingLocations.push(delta);
    } else if (isCooling(revenueDelta, revenueDeltaPercent)) {
      delta.direction = "cooling";
      coolingLocations.push(delta);
    }
    previousMap.delete(location.id);
  }

  previousMap.forEach((location) => {
    const delta = toDelta(
      {
        ...location,
        revenue: 0,
        orderCount: 0
      },
      location,
      "cooling"
    );
    if (isCooling(delta.revenueDelta, delta.revenueDeltaPercent)) {
      coolingLocations.push(delta);
    }
  });

  const domesticDelta = computeDelta(current.summary?.domesticRevenue, previous.summary?.domesticRevenue);
  const internationalDelta = computeDelta(current.summary?.internationalRevenue, previous.summary?.internationalRevenue);

  const summary: string[] = [];
  if (domesticDelta && Math.abs(domesticDelta) >= MIN_REVENUE_DELTA) {
    summary.push(`Domestic revenue ${formatCurrencyDelta(domesticDelta)} vs previous 7d.`);
  }
  if (internationalDelta && Math.abs(internationalDelta) >= MIN_REVENUE_DELTA) {
    summary.push(`International revenue ${formatCurrencyDelta(internationalDelta)} vs previous 7d.`);
  }
  if (!summary.length && !newLocations.length && !risingLocations.length && !coolingLocations.length) {
    summary.push("No significant geography shifts vs previous 7d.");
  }

  return {
    currentRange: current.range,
    previousRange: previous.range,
    newLocations,
    risingLocations,
    coolingLocations,
    domesticDelta,
    internationalDelta,
    summary
  } satisfies SalesGeographyComparison;
}

function toDelta(
  current: SalesGeographyLocation,
  previous: SalesGeographyLocation | null,
  direction: SalesGeographyDelta["direction"]
): SalesGeographyDelta {
  const previousRevenue = previous?.revenue ?? 0;
  const revenueDelta = current.revenue - previousRevenue;
  const revenueDeltaPercent = previousRevenue
    ? Number(((revenueDelta / previousRevenue) * 100).toFixed(2))
    : previousRevenue === 0 && current.revenue > 0
    ? 100
    : null;

  return {
    id: current.id,
    label: current.label,
    privacyLevel: current.privacyLevel,
    currentRevenue: current.revenue,
    previousRevenue,
    revenueDelta,
    revenueDeltaPercent,
    currentOrders: current.orderCount,
    previousOrders: previous?.orderCount ?? 0,
    direction
  } satisfies SalesGeographyDelta;
}

function isRising(delta: number, percent: number | null) {
  if (delta <= 0) return false;
  return delta >= MIN_REVENUE_DELTA && (percent == null || percent >= MIN_PERCENT_DELTA);
}

function isCooling(delta: number, percent: number | null) {
  if (delta >= 0) return false;
  return Math.abs(delta) >= MIN_REVENUE_DELTA && (percent == null || Math.abs(percent) >= MIN_PERCENT_DELTA);
}

function computeDelta(current?: number | null, previous?: number | null) {
  if (current == null && previous == null) return null;
  return (current ?? 0) - (previous ?? 0);
}

function formatCurrencyDelta(value: number) {
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const absolute = formatter.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${absolute}`;
}
