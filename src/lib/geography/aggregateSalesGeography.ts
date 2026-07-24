import { RangeSummary, SalesGeographyLocation, SalesGeographySnapshot } from "@/lib/types/dashboard";

export type SalesGeographyOrder = {
  total?: number | string | null;
  lineItems?: Array<{ name?: string | null; quantity?: number | null; total?: number | string | null }>;
  shipping?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
  billing?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
};

type AggregatedBucket = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  orderCount: number;
  revenue: number;
  units: number;
  products: Map<string, { units: number; revenue: number }>;
};

const PRIVACY_NOTES = [
  "City-level dots only appear after three orders in the window.",
  "Low-volume locations roll up to the state or country to protect buyer privacy."
];

type AggregateOptions = {
  domesticCountry?: string;
  domesticAliases?: string[];
  minCityOrders?: number;
  minStateOrders?: number;
  maxLocations?: number;
  source?: string | null;
  privacyNotes?: string[];
};

const DEFAULT_OPTIONS: Required<AggregateOptions> = {
  domesticCountry: "United States",
  domesticAliases: ["united states", "usa", "us"],
  minCityOrders: 3,
  minStateOrders: 3,
  maxLocations: 40,
  source: "woo",
  privacyNotes: PRIVACY_NOTES
};

export function aggregateSalesGeography(
  range: RangeSummary,
  orders: SalesGeographyOrder[] | null | undefined,
  options?: AggregateOptions
): SalesGeographySnapshot {
  const config = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  if (!orders?.length) {
    return buildSuppressedSalesGeographySnapshot(range, ["No completed Woo orders in this window."], config);
  }

  const cityBuckets = new Map<string, AggregatedBucket>();
  const stateBuckets = new Map<string, AggregatedBucket>();
  const countryBuckets = new Map<string, AggregatedBucket>();

  for (const order of orders) {
    const location = pickLocation(order);
    const revenue = toNumber(order.total) ?? 0;
    const units = totalUnits(order.lineItems);
    const products = buildProductMap(order.lineItems);

    if (!location) {
      addToBucket(countryBuckets, "country:unknown", {
        city: null,
        state: null,
        country: "Unknown",
        orderCount: 1,
        revenue,
        units,
        products
      });
      continue;
    }

    const cityKey = location.city ? `city:${location.city}|${location.state ?? ""}|${location.country ?? ""}` : null;
    const stateKey = location.state ? `state:${location.state}|${location.country ?? ""}` : null;
    const countryKey = `country:${location.country ?? "Unknown"}`;

    if (cityKey) {
      addToBucket(cityBuckets, cityKey, {
        city: location.city,
        state: location.state,
        country: location.country,
        orderCount: 1,
        revenue,
        units,
        products
      });
    } else if (stateKey) {
      addToBucket(stateBuckets, stateKey, {
        city: null,
        state: location.state,
        country: location.country,
        orderCount: 1,
        revenue,
        units,
        products
      });
    } else {
      addToBucket(countryBuckets, countryKey, {
        city: null,
        state: null,
        country: location.country ?? "Unknown",
        orderCount: 1,
        revenue,
        units,
        products
      });
    }
  }

  const stateAccumulator = new Map<string, AggregatedBucket>(stateBuckets);
  const countryAccumulator = new Map<string, AggregatedBucket>(countryBuckets);

  const finalBuckets: Array<{ bucket: AggregatedBucket; level: "city" | "state" | "country" }> = [];

  cityBuckets.forEach((bucket) => {
    if (bucket.orderCount >= config.minCityOrders && bucket.city) {
      finalBuckets.push({ bucket, level: "city" });
    } else {
      const stateKey = bucket.state ? `state:${bucket.state}|${bucket.country ?? ""}` : null;
      if (stateKey) {
        addToBucket(stateAccumulator, stateKey, sanitizeForLevel(bucket, "state"));
      } else {
        const countryKey = `country:${bucket.country ?? "Unknown"}`;
        addToBucket(countryAccumulator, countryKey, sanitizeForLevel(bucket, "country"));
      }
    }
  });

  stateAccumulator.forEach((bucket) => {
    if (bucket.orderCount >= config.minStateOrders && bucket.state) {
      finalBuckets.push({ bucket, level: "state" });
    } else {
      const countryKey = `country:${bucket.country ?? "Unknown"}`;
      addToBucket(countryAccumulator, countryKey, sanitizeForLevel(bucket, "country"));
    }
  });

  countryAccumulator.forEach((bucket) => {
    finalBuckets.push({ bucket, level: "country" });
  });

  if (!finalBuckets.length) {
    return buildSuppressedSalesGeographySnapshot(range, ["All Woo orders for this window were missing location data."], config);
  }

  const locations = finalBuckets
    .map(({ bucket, level }) => toLocation(bucket, level))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, config.maxLocations);

  const summary = buildSummary(locations, config.domesticCountry, config.domesticAliases);

  return {
    range,
    locations,
    summary,
    privacyNotes: config.privacyNotes,
    source: config.source ?? null,
    generatedAt: new Date().toISOString()
  };
}

function pickLocation(order: SalesGeographyOrder) {
  const shipping = order.shipping ?? undefined;
  const billing = order.billing ?? undefined;
  return shipping?.country || shipping?.state || shipping?.city ? shipping : billing;
}

function addToBucket(map: Map<string, AggregatedBucket>, key: string, value: AggregatedBucket) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      city: value.city ?? null,
      state: value.state ?? null,
      country: value.country ?? null,
      orderCount: value.orderCount,
      revenue: value.revenue,
      units: value.units,
      products: new Map(value.products)
    });
    return;
  }
  existing.orderCount += value.orderCount;
  existing.revenue += value.revenue;
  existing.units += value.units;
  value.products.forEach((stats, productName) => {
    const current = existing.products.get(productName) ?? { units: 0, revenue: 0 };
    current.units += stats.units;
    current.revenue += stats.revenue;
    existing.products.set(productName, current);
  });
}

function sanitizeForLevel(bucket: AggregatedBucket, level: "state" | "country"): AggregatedBucket {
  return {
    city: level === "state" ? null : null,
    state: level === "state" ? bucket.state ?? null : null,
    country: bucket.country ?? null,
    orderCount: bucket.orderCount,
    revenue: bucket.revenue,
    units: bucket.units,
    products: new Map(bucket.products)
  };
}

function toLocation(bucket: AggregatedBucket, level: "city" | "state" | "country"): SalesGeographyLocation {
  const topProducts = [...bucket.products.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 3)
    .map(([name, stats]) => ({ name, units: stats.units, revenue: Number(stats.revenue.toFixed(2)) }));

  const label = buildLabel(bucket, level);
  return {
    id: `${level}:${label}`,
    label,
    city: bucket.city ?? null,
    state: bucket.state ?? null,
    country: bucket.country ?? null,
    privacyLevel: level,
    orderCount: bucket.orderCount,
    revenue: Number(bucket.revenue.toFixed(2)),
    units: bucket.units,
    topProducts
  };
}

function buildLabel(bucket: AggregatedBucket, level: "city" | "state" | "country") {
  if (level === "city" && bucket.city) {
    if (bucket.state) {
      return `${bucket.city}, ${bucket.state}`;
    }
    return bucket.city;
  }
  if (level === "state" && bucket.state) {
    return bucket.country ? `${bucket.state}, ${bucket.country}` : bucket.state;
  }
  return bucket.country ?? "Unknown";
}

function buildSummary(locations: SalesGeographyLocation[], domesticCountry: string, aliases: string[]) {
  const totalLocations = locations.length;
  const revenueByCountry = new Map<string, number>();
  const revenueByState = new Map<string, number>();
  const revenueByCity = new Map<string, number>();
  let totalRevenue = 0;
  let domesticRevenue = 0;

  locations.forEach((location) => {
    totalRevenue += location.revenue;
    const countryKey = location.country ?? "Unknown";
    revenueByCountry.set(countryKey, (revenueByCountry.get(countryKey) ?? 0) + location.revenue);
    if (location.state) {
      const stateKey = `${location.state}|${countryKey}`;
      revenueByState.set(stateKey, (revenueByState.get(stateKey) ?? 0) + location.revenue);
    }
    if (location.privacyLevel === "city" && location.label) {
      revenueByCity.set(location.label, (revenueByCity.get(location.label) ?? 0) + location.revenue);
    }
    if (isDomesticCountry(countryKey, domesticCountry, aliases)) {
      domesticRevenue += location.revenue;
    }
  });

  const internationalRevenue = Math.max(0, totalRevenue - domesticRevenue);

  return {
    totalLocations,
    topCountry: pickTopEntry(revenueByCountry),
    topRegion: pickTopEntry(revenueByState),
    topCity: pickTopEntry(revenueByCity),
    domesticRevenue: Number(domesticRevenue.toFixed(2)),
    internationalRevenue: Number(internationalRevenue.toFixed(2))
  };
}

function pickTopEntry(map: Map<string, number>) {
  if (!map.size) return null;
  let topKey: string | null = null;
  let topValue = -Infinity;
  map.forEach((value, key) => {
    if (value > topValue) {
      topValue = value;
      topKey = key;
    }
  });
  if (!topKey) return null;
  return {
    label: topKey,
    revenue: Number(topValue.toFixed(2))
  };
}

export function buildSuppressedSalesGeographySnapshot(
  range: RangeSummary,
  reasons: string[],
  options?: AggregateOptions
): SalesGeographySnapshot {
  const config = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  return {
    range,
    locations: [],
    summary: {
      totalLocations: 0,
      topCountry: null,
      topRegion: null,
      topCity: null,
      domesticRevenue: 0,
      internationalRevenue: 0
    },
    suppressedReasons: reasons,
    privacyNotes: config.privacyNotes,
    source: config.source ?? null,
    generatedAt: new Date().toISOString()
  };
}

function totalUnits(lineItems?: SalesGeographyOrder["lineItems"]): number {
  if (!lineItems?.length) return 0;
  return lineItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

function buildProductMap(lineItems?: SalesGeographyOrder["lineItems"]): Map<string, { units: number; revenue: number }> {
  const map = new Map<string, { units: number; revenue: number }>();
  if (!lineItems?.length) return map;
  for (const item of lineItems) {
    if (!item?.name) continue;
    const current = map.get(item.name) ?? { units: 0, revenue: 0 };
    current.units += item.quantity ?? 0;
    current.revenue += toNumber(item.total) ?? 0;
    map.set(item.name, current);
  }
  return map;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isDomesticCountry(countryKey: string | null, domesticCountry: string, aliases: string[]) {
  const normalizedKey = (countryKey ?? "").trim().toLowerCase();
  if (!normalizedKey) return false;
  const candidates = [domesticCountry, ...aliases].map((value) => value.trim().toLowerCase()).filter(Boolean);
  return candidates.some((candidate) => candidate === normalizedKey);
}
