#!/usr/bin/env tsx
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import fs from "node:fs/promises";
import path from "node:path";
const websiteDryRunPath = path.resolve("dashboard/data/website/latest.dry-run.json");
const SUPABASE_SCHEMA = "exec_dashboard";
import type {
  DashboardOverviewResponse,
  MetaAdsSnapshot,
  FunnelSummary,
  FunnelTimeseriesPoint,
  MarketingCommandInsight,
  MarketingCommandMetricDelta,
  MarketingCommandProductMomentum,
  PromotionPlanner,
  PromotionRecommendation,
  CollectorRadar,
  CollectorRecommendation,
  CollectorRadarSegment,
  RangeSummary,
  ProductMomentumEntry,
  SalesGeographySnapshot
} from "../src/lib/types/dashboard";
import { clampFreshnessHours } from "../src/lib/insights/helpers";
import { evaluateInsights } from "../src/lib/insights/marketingRules";
import {
  aggregateSalesGeography,
  buildSuppressedSalesGeographySnapshot,
  type SalesGeographyOrder
} from "../src/lib/geography/aggregateSalesGeography";
import { buildSalesGeographyComparison } from "../src/lib/geography/comparison";

type OverviewResponse = DashboardOverviewResponse;

type MarketingAction = { title: string; detail: string; metric: string; priority: number };

type MarketingCommandPayload = {
  generatedAt: string;
  status: "LIVE" | "PARTIAL";
  range?: RangeSummary;
  priorRange?: RangeSummary;
  summary: string[];
  whatChanged: string[];
  whatMatters: string[];
  actions: Array<{ title: string; detail: string; metric: string }>;
  risks: string[];
  monitorTomorrow: string[];
  topConnectedInsights?: MarketingCommandInsight[];
  suppressedInsights?: MarketingCommandInsight[];
  wooRangeSummaries?: Record<string, WooRangeSummaryEntry>;
  comparisonSummary?: string[];
  metricDeltas?: MarketingCommandMetricDelta[];
  productMomentum?: MarketingCommandProductMomentum;
  promotionPlanner?: PromotionPlanner | null;
  collectorRadar?: CollectorRadar | null;
  confidenceSummary?: {
    high: number;
    medium: number;
    low: number;
  };
  sourceFreshnessSummary?: Array<{ source: string; hoursSince: number | null; stale: boolean; thresholdHours: number }>;
  insightBasis?: {
    current: RangeSummary;
    previous: RangeSummary;
  };
  salesGeography?: SalesGeographySnapshot | null;
};

type WooRangeSummaryEntry = {
  label: string;
  startDate: string;
  endDate: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
};

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run") || process.env.MARKETING_COMMAND_DRY_RUN === "1";

const DASHBOARD_API_URL = process.env.MARKETING_DASHBOARD_URL ?? "https://keegan-dashboard.fly.dev/api/dashboard/overview";
const DASHBOARD_RANGE_PRESET = process.env.MARKETING_RANGE_PRESET ?? "7d";
const DASHBOARD_ADMIN_TOKEN = process.env.DASHBOARD_ADMIN_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DASHBOARD_ADMIN_TOKEN) {
  console.error("DASHBOARD_ADMIN_TOKEN is required");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const PROMOTION_WINDOWS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "365d", days: 365 },
  { label: "lifetime", days: 3650 }
] as const;

const WOO_BASELINE_WINDOWS = [
  { label: "7d", kind: "days" as const, days: 7 },
  { label: "30d", kind: "days" as const, days: 30 },
  { label: "90d", kind: "days" as const, days: 90 },
  { label: "365d", kind: "days" as const, days: 365 },
  { label: "ytd", kind: "ytd" as const },
  { label: "lifetime", kind: "lifetime" as const }
];

const WOO_BASE_URL = process.env.WOO_BASE_URL?.replace(/\/$/, "");
const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY;
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET;
const wooClientEnabled = Boolean(WOO_BASE_URL && WOO_CONSUMER_KEY && WOO_CONSUMER_SECRET);
const LIFETIME_START_DATE = "2017-01-01";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function hoursSince(dateIso?: string | null): number | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / 36e5;
}

function hoursSinceDateOnly(dateString?: string | null): number | null {
  if (!dateString) return null;
  // interpret as UTC date
  return hoursSince(`${dateString}T23:59:59Z`);
}

const ISO_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" };

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computeWindowBounds(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(days, 1) - 1));
  return { startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
}

function computeBaselineBounds(window: (typeof WOO_BASELINE_WINDOWS)[number]) {
  if (window.kind === "days") {
    return computeWindowBounds(window.days ?? 7);
  }
  const endDate = formatIsoDate(new Date());
  if (window.kind === "ytd") {
    const start = new Date();
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
    return { startDate: formatIsoDate(start), endDate };
  }
  return { startDate: LIFETIME_START_DATE, endDate };
}

async function loadWooRangeSummaries(): Promise<Record<string, WooRangeSummaryEntry>> {
  const summaries: Record<string, WooRangeSummaryEntry> = {};
  for (const window of WOO_BASELINE_WINDOWS) {
    try {
      const bounds = computeBaselineBounds(window);
      const { data, error } = await supabase.rpc("get_woo_metrics", {
        start_date: bounds.startDate,
        end_date: bounds.endDate
      });
      if (error) {
        console.warn(`[marketing-command] Failed to load Woo summary for ${window.label}:`, error.message ?? error);
        continue;
      }
      const summary = ((data ?? {}) as { summary?: { orders?: number; revenue?: number; avgOrderValue?: number } }).summary ?? {};
      const orders = Number(summary.orders ?? 0);
      const revenue = Number(summary.revenue ?? 0);
      const avgOrderValue = Number(summary.avgOrderValue ?? (orders ? revenue / orders : 0));
      summaries[window.label] = {
        label: window.label,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        revenue,
        orders,
        avgOrderValue: orders ? avgOrderValue : 0
      };
    } catch (error) {
      console.warn(`[marketing-command] Unexpected error loading Woo summary for ${window.label}:`, error instanceof Error ? error.message : error);
    }
  }
  return summaries;
}

type RangeOverride = {
  preset?: string;
  startDate?: string;
  endDate?: string;
};

async function fetchOverview(rangeOverride?: RangeOverride, inputPayload?: OverviewResponse): Promise<OverviewResponse> {
  if (DRY_RUN && inputPayload) return inputPayload;
  const params = new URLSearchParams();
  const preset = rangeOverride?.preset ?? DASHBOARD_RANGE_PRESET;
  params.set("range", preset);
  if (preset === "custom" && rangeOverride?.startDate && rangeOverride?.endDate) {
    params.set("start", rangeOverride.startDate);
    params.set("end", rangeOverride.endDate);
  }
  const connector = DASHBOARD_API_URL.includes("?") ? "&" : "?";
  const res = await fetch(`${DASHBOARD_API_URL}${connector}${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${DASHBOARD_ADMIN_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to load dashboard overview (${res.status} ${res.statusText})`);
  }
  return (await res.json()) as OverviewResponse;
}

function toRangeSummary(range?: { preset: string; startDate: string; endDate: string } | null): RangeSummary | undefined {
  if (!range) return undefined;
  return {
    preset: range.preset as RangeSummary["preset"],
    startDate: range.startDate,
    endDate: range.endDate
  };
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computePreviousRange(range?: RangeSummary): RangeSummary | undefined {
  if (!range) return undefined;
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDate}T00:00:00.000Z`);
  const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (diffDays - 1));
  return {
    preset: "custom",
    startDate: formatDateOnly(prevStart),
    endDate: formatDateOnly(prevEnd)
  };
}

type MetricDeltaSpec = {
  metric: string;
  label: string;
  unit?: string | null;
  currentValue: number | null;
  previousValue: number | null;
};

function buildMetricDeltaEntry(spec: MetricDeltaSpec): MarketingCommandMetricDelta {
  const { metric, label, unit, currentValue, previousValue } = spec;
  const absoluteChange = currentValue != null && previousValue != null ? currentValue - previousValue : null;
  const percentChange =
    absoluteChange != null && previousValue != null && previousValue !== 0 ? (absoluteChange / previousValue) * 100 : null;
  const roundedPercent = percentChange != null ? Number(percentChange.toFixed(2)) : null;
  const roundedAbsolute = absoluteChange != null ? Number(absoluteChange.toFixed(2)) : null;
  const direction = roundedAbsolute == null ? undefined : roundedAbsolute >= 0 ? "up" : "down";
  return {
    metric,
    label,
    unit: unit ?? null,
    currentValue,
    previousValue,
    absoluteChange: roundedAbsolute,
    percentChange: roundedPercent,
    direction
  };
}

function describeDelta(delta: MarketingCommandMetricDelta) {
  if (delta.percentChange == null || delta.direction == null) return `${delta.label} moved but data is incomplete.`;
  const magnitude = Math.abs(delta.percentChange);
  const trend = delta.direction === "up" ? "up" : "down";
  return `${delta.label} ${trend} ${percentFormatter.format(magnitude)}% vs previous 7d.`;
}

function buildComparisonSummary(metricDeltas: MarketingCommandMetricDelta[]) {
  const notable = metricDeltas
    .filter((delta) => delta.percentChange != null && Math.abs(delta.percentChange) >= 5)
    .sort((a, b) => Math.abs((b.percentChange ?? 0)) - Math.abs((a.percentChange ?? 0)))
    .slice(0, 3);
  return notable.map((delta) => describeDelta(delta));
}

type ProductTopEntry = {
  name?: string | null;
  units?: number | string | null;
  revenue?: number | string | null;
  productId?: number | string | null;
  variationId?: number | string | null;
  sku?: string | null;
  orderCount?: number | string | null;
  averageUnitRevenue?: number | string | null;
  rank?: number | string | null;
};

type NormalizedProduct = {
  key: string;
  name: string;
  revenue: number | null;
  units: number | null;
  rank: number;
  productId?: number | null;
  variationId?: number | null;
  sku?: string | null;
};

type AggregatedProductStats = NormalizedProduct & {
  stats: Record<string, { revenue: number; units: number }>;
  lastSoldDate?: string | null;
};

type AggregatedCollector = {
  key: string;
  displayName: string;
  maskedEmail?: string | null;
  totalSpend: number;
  orderCount: number;
  firstOrderDate?: string | null;
  lastOrderDate?: string | null;
  products: Set<string>;
  recentSpend: number;
  recentOrderCount: number;
};

const COLLECTOR_SEGMENT_LABELS: Record<CollectorRadarSegment, string> = {
  TOP_COLLECTOR: "Top Collector",
  REPEAT_BUYER: "Repeat Buyer",
  LAPSED_COLLECTOR: "Lapsed Collector",
  RECENT_HIGH_VALUE: "Recent High-Value",
  NURTURE_OPPORTUNITY: "Nurture Opportunity"
};

function normalizeProductList(list?: ProductTopEntry[] | null): NormalizedProduct[] {
  if (!list?.length) return [];
  return list.map((product, index) => ({
    key: buildProductKey(product, index),
    name: product.name ?? `Product ${index + 1}`,
    revenue: toNumber(product.revenue),
    units: toNumber(product.units),
    rank: Number(product.rank ?? index + 1),
    productId: product.productId != null ? Number(product.productId) : null,
    variationId: product.variationId != null ? Number(product.variationId) : null,
    sku: product.sku ?? null
  }));
}

function buildProductKey(product: ProductTopEntry, index: number) {
  if (product.productId != null) {
    return `prod:${product.productId}:${product.variationId ?? 0}`;
  }
  if (product.sku) {
    return `sku:${product.sku.toLowerCase()}`;
  }
  return `name:${normalizeName(product.name ?? `product-${index}`)}`;
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function buildProductMomentum(current?: ProductTopEntry[] | null, previous?: ProductTopEntry[] | null): MarketingCommandProductMomentum {
  const suppressedReasons: string[] = [];
  const currentList = normalizeProductList(current);
  const previousList = normalizeProductList(previous);
  if (!currentList.length) suppressedReasons.push("Missing current Woo product telemetry.");
  if (!previousList.length) suppressedReasons.push("Missing previous Woo product telemetry.");
  if (suppressedReasons.length) {
    return {
      winners: [],
      laggards: [],
      newBreakouts: [],
      concentration: null,
      suppressedReasons
    };
  }

  const prevMap = new Map(previousList.map((product) => [product.key, product]));
  const deltas = currentList.map((product) => {
    const prev = prevMap.get(product.key);
    const revenueDelta = product.revenue != null && prev?.revenue != null ? product.revenue - prev.revenue : product.revenue ?? null;
    const revenueDeltaPercent =
      revenueDelta != null && prev?.revenue && prev.revenue !== 0
        ? Number(((revenueDelta / prev.revenue) * 100).toFixed(2))
        : prev?.revenue ? 0 : product.revenue != null ? 100 : null;
    const unitsDelta = product.units != null && prev?.units != null ? product.units - prev.units : product.units ?? null;
    const unitsDeltaPercent =
      unitsDelta != null && prev?.units && prev.units !== 0 ? Number(((unitsDelta / prev.units) * 100).toFixed(2)) : null;
    const rankChange = prev?.rank != null ? prev.rank - product.rank : null;
    return {
      name: product.name,
      currentRevenue: product.revenue,
      previousRevenue: prev?.revenue ?? null,
      revenueDelta: revenueDelta != null ? Number(revenueDelta.toFixed(2)) : null,
      revenueDeltaPercent,
      currentUnits: product.units,
      previousUnits: prev?.units ?? null,
      unitsDelta: unitsDelta != null ? Number(unitsDelta.toFixed(2)) : null,
      unitsDeltaPercent,
      rankChange,
      productId: product.productId ?? null,
      variationId: product.variationId ?? null,
      sku: product.sku ?? null,
      currentRank: product.rank,
      previousRank: prev?.rank ?? null
    } satisfies ProductMomentumEntry;
  });

  const winners = deltas
    .filter((entry) => (entry.revenueDeltaPercent ?? 0) >= 15 && (entry.revenueDelta ?? 0) > 25)
    .map((entry) => ({ ...entry, status: "winner" as const }))
    .sort((a, b) => (b.revenueDelta ?? 0) - (a.revenueDelta ?? 0))
    .slice(0, 3);

  const laggards = deltas
    .filter((entry) => (entry.revenueDeltaPercent ?? 0) <= -15 && (entry.revenueDelta ?? 0) < -25)
    .map((entry) => ({ ...entry, status: "laggard" as const }))
    .sort((a, b) => (a.revenueDelta ?? 0) - (b.revenueDelta ?? 0))
    .slice(0, 3);

  const newBreakouts = deltas
    .filter((entry) => (entry.previousRevenue ?? 0) === 0 && (entry.currentRevenue ?? 0) >= 100)
    .map((entry) => ({ ...entry, status: "breakout" as const }))
    .slice(0, 3);

  const totalRevenue = currentList.reduce((sum, item) => sum + (item.revenue ?? 0), 0);
  const topProduct = currentList[0];
  const concentration =
    topProduct && totalRevenue > 0 && topProduct.revenue != null
      ? {
          topProduct: topProduct.name,
          sharePercent: Number(((topProduct.revenue / totalRevenue) * 100).toFixed(2)),
          revenue: topProduct.revenue
        }
      : null;

  return {
    winners,
    laggards,
    newBreakouts,
    concentration,
    suppressedReasons: suppressedReasons.length ? suppressedReasons : undefined
  };
}

type PromotionPlannerArgs = {
  aggregatedProducts: AggregatedProductStats[];
  productMomentum?: MarketingCommandProductMomentum;
};

async function fetchWooProductsForWindow(window: (typeof PROMOTION_WINDOWS)[number]) {
  const { startDate, endDate } = computeWindowBounds(window.days);
  const { data, error } = await supabase.rpc("get_woo_metrics", { start_date: startDate, end_date: endDate });
  if (error) throw error;
  const rawProducts = ((data ?? {}) as { products?: ProductTopEntry[] }).products ?? [];
  const normalized = normalizeProductList(rawProducts);
  return { label: window.label, endDate, products: normalized };
}

async function loadPromotionProductStats(): Promise<AggregatedProductStats[]> {
  const map = new Map<string, AggregatedProductStats>();
  const windowResults = await Promise.all(
    PROMOTION_WINDOWS.map(async (window) => {
      try {
        return await fetchWooProductsForWindow(window);
      } catch (error) {
        console.warn(`[marketing-command] Failed to load Woo product stats for ${window.label}:`, error instanceof Error ? error.message : error);
        return null;
      }
    })
  );

  for (const result of windowResults) {
    if (!result) continue;
    const { label, endDate, products } = result;
    products.forEach((product) => {
      if (!product.key) return;
      const existing = map.get(product.key) ?? {
        ...product,
        stats: {},
        lastSoldDate: null
      };
      existing.stats[label] = {
        revenue: product.revenue ?? 0,
        units: product.units ?? 0
      };
      if (!existing.lastSoldDate || endDate > existing.lastSoldDate) {
        existing.lastSoldDate = endDate;
      }
      map.set(product.key, existing);
    });
  }

  return Array.from(map.values());
}

function buildPromotionPlannerFallback(products: ProductTopEntry[] | null | undefined): AggregatedProductStats[] {
  const normalized = normalizeProductList(products);
  const todayIso = formatIsoDate(new Date());
  return normalized.map((product) => ({
    ...product,
    stats: {
      "7d": { revenue: product.revenue ?? 0, units: product.units ?? 0 }
    },
    lastSoldDate: todayIso
  }));
}

function buildPromotionPlannerData({ aggregatedProducts, productMomentum }: PromotionPlannerArgs): PromotionPlanner {
  const recommendations: PromotionRecommendation[] = [];
  const used = new Set<string>();
  const usedProducts = new Set<string>();

  const pushRec = (rec: PromotionRecommendation, { allowDuplicateProduct = false }: { allowDuplicateProduct?: boolean } = {}) => {
    if (!rec.productName) return;
    const key = `${rec.category}:${rec.productName}`;
    if (used.has(key)) return;
    if (!allowDuplicateProduct) {
      const normalized = rec.productName.trim().toLowerCase();
      if (usedProducts.has(normalized)) return;
      usedProducts.add(normalized);
    }
    recommendations.push(rec);
    used.add(key);
  };

  const sortByRange = (rangeLabel: string) =>
    aggregatedProducts
      .filter((product) => product.stats[rangeLabel]?.revenue)
      .sort((a, b) => (b.stats[rangeLabel]?.revenue ?? 0) - (a.stats[rangeLabel]?.revenue ?? 0));

  const calcAovForRange = (product: AggregatedProductStats, rangeLabel: string) => {
    const stat = product.stats[rangeLabel];
    if (!stat || !stat.units) return null;
    return stat.units > 0 ? stat.revenue / stat.units : null;
  };

  const topProduct = sortByRange("7d")[0];
  if (topProduct) {
    pushRec({
      category: "PROMOTE_NOW",
      productName: topProduct.name,
      reason: `${topProduct.name} drove ${currencyFormatter.format(topProduct.stats["7d"]?.revenue ?? 0)} in the current 7d window (short-window signal).`,
      supportingMetric: buildSupportingMetric(topProduct.stats, ["7d", "30d", "90d"]),
      suggestedAction: "Feature in Instagram story + email hero today.",
      suggestedChannel: "Instagram + Email",
      confidence: "high",
      revenue7d: topProduct.stats["7d"]?.revenue ?? null,
      revenue30d: topProduct.stats["30d"]?.revenue ?? null,
      units7d: topProduct.stats["7d"]?.units ?? null,
      lastSoldDate: topProduct.lastSoldDate ?? null
    });
  }

  const reliableSeller = sortByRange("30d").find((product) => !usedProducts.has(product.name.trim().toLowerCase()));
  if (reliableSeller) {
    pushRec({
      category: "RELIABLE_SELLER",
      productName: reliableSeller.name,
      reason: `${reliableSeller.name} remains a steady seller (${currencyFormatter.format(reliableSeller.stats["30d"]?.revenue ?? 0)} in 30d).`,
      supportingMetric: buildSupportingMetric(reliableSeller.stats, ["30d", "90d", "365d"]),
      suggestedAction: "Keep in evergreen rotation (site hero + email footer).",
      suggestedChannel: "Site hero + Email",
      confidence: "medium",
      revenue7d: reliableSeller.stats["7d"]?.revenue ?? null,
      revenue30d: reliableSeller.stats["30d"]?.revenue ?? null,
      units7d: reliableSeller.stats["7d"]?.units ?? null,
      lastSoldDate: reliableSeller.lastSoldDate ?? null
    });
  }

  const winnerEntry = productMomentum?.winners?.find((entry) => entry.name);
  if (winnerEntry?.name) {
    const agg = findAggregatedProduct(aggregatedProducts, winnerEntry.name);
    pushRec({
      category: "RISING_MOMENTUM",
      productName: winnerEntry.name,
      reason:
        winnerEntry.revenueDeltaPercent != null
          ? `${winnerEntry.name} revenue up ${percentFormatter.format(winnerEntry.revenueDeltaPercent)}% vs previous window.`
          : `${winnerEntry.name} is accelerating week over week.`,
      supportingMetric: buildMomentumMetric(winnerEntry),
      suggestedAction: "Spin up Meta retargeting creative + IG carousel around this piece.",
      suggestedChannel: "Meta retargeting + Instagram",
      confidence: "high",
      revenue7d: agg?.stats["7d"]?.revenue ?? winnerEntry.currentRevenue ?? null,
      revenue30d: agg?.stats["30d"]?.revenue ?? winnerEntry.previousRevenue ?? null,
      units7d: agg?.stats["7d"]?.units ?? winnerEntry.currentUnits ?? null,
      momentumPercent: winnerEntry.revenueDeltaPercent ?? null,
      lastSoldDate: agg?.lastSoldDate ?? null
    });
  }

  const laggardEntry = productMomentum?.laggards?.find((entry) => entry.name);
  if (laggardEntry?.name) {
    const agg = findAggregatedProduct(aggregatedProducts, laggardEntry.name);
    pushRec({
      category: "COOLING_OFF",
      productName: laggardEntry.name,
      reason:
        laggardEntry.revenueDeltaPercent != null
          ? `${laggardEntry.name} revenue slipped ${percentFormatter.format(laggardEntry.revenueDeltaPercent)}% vs prior.`
          : `${laggardEntry.name} is cooling off week over week.`,
      supportingMetric: buildMomentumMetric(laggardEntry),
      suggestedAction: "Refresh the product page, add urgency, or bundle with a hotter SKU.",
      suggestedChannel: "Site update + Email",
      confidence: "medium",
      revenue7d: agg?.stats["7d"]?.revenue ?? laggardEntry.currentRevenue ?? null,
      revenue30d: agg?.stats["30d"]?.revenue ?? laggardEntry.previousRevenue ?? null,
      units7d: agg?.stats["7d"]?.units ?? laggardEntry.currentUnits ?? null,
      momentumPercent: laggardEntry.revenueDeltaPercent ?? null,
      lastSoldDate: agg?.lastSoldDate ?? null
    });
  }

  const breakoutEntry = productMomentum?.newBreakouts?.find((entry) => entry.name);
  if (breakoutEntry?.name) {
    const agg = findAggregatedProduct(aggregatedProducts, breakoutEntry.name);
    pushRec({
      category: "HIDDEN_OPPORTUNITY",
      productName: breakoutEntry.name,
      reason: `${breakoutEntry.name} sold ${currencyFormatter.format(breakoutEntry.currentRevenue ?? 0)} with little prior history.`,
      supportingMetric: buildSupportingMetric(agg?.stats ?? { "7d": { revenue: breakoutEntry.currentRevenue ?? 0, units: breakoutEntry.currentUnits ?? 0 } }, ["7d", "30d"]),
      suggestedAction: "Introduce it in collector outreach + social proof posts.",
      suggestedChannel: "Collector outreach + Instagram",
      confidence: "medium",
      revenue7d: agg?.stats["7d"]?.revenue ?? breakoutEntry.currentRevenue ?? null,
      revenue30d: agg?.stats["30d"]?.revenue ?? breakoutEntry.previousRevenue ?? null,
      units7d: agg?.stats["7d"]?.units ?? breakoutEntry.currentUnits ?? null,
      lastSoldDate: agg?.lastSoldDate ?? null
    });
  }

  const historicalAnchor = sortByRange("365d").find((product) => !usedProducts.has(product.name.trim().toLowerCase()));
  if (historicalAnchor) {
    pushRec({
      category: "HISTORICAL_ANCHOR",
      productName: historicalAnchor.name,
      reason: `${historicalAnchor.name} generated ${currencyFormatter.format(historicalAnchor.stats["365d"]?.revenue ?? 0)} over the past year.`,
      supportingMetric: buildSupportingMetric(historicalAnchor.stats, ["365d", "lifetime"]),
      suggestedAction: "Use as reliable anchor in premium offers + collector outreach.",
      suggestedChannel: "Collectors + Site hero",
      confidence: "high",
      revenue7d: historicalAnchor.stats["7d"]?.revenue ?? null,
      revenue30d: historicalAnchor.stats["30d"]?.revenue ?? null,
      units7d: historicalAnchor.stats["7d"]?.units ?? null,
      lastSoldDate: historicalAnchor.lastSoldDate ?? null
    });
  }

  const highAovCandidate = sortByRange("365d").filter((product) => calcAovForRange(product, "365d") ?? 0).sort((a, b) => (calcAovForRange(b, "365d") ?? 0) - (calcAovForRange(a, "365d") ?? 0))[0];
  if (highAovCandidate) {
    const aov365 = calcAovForRange(highAovCandidate, "365d");
    pushRec({
      category: "HIGH_AOV_ANCHOR",
      productName: highAovCandidate.name,
      reason: `${highAovCandidate.name} maintains high AOV (${aov365 ? currencyFormatter.format(aov365) : "n/a"}) across the last year.`,
      supportingMetric: buildSupportingMetric(highAovCandidate.stats, ["365d", "90d"]),
      suggestedAction: "Feature in premium bundle / high-touch outreach.",
      suggestedChannel: "Collectors + Meta high-AOV",
      confidence: "medium",
      revenue7d: highAovCandidate.stats["7d"]?.revenue ?? null,
      revenue30d: highAovCandidate.stats["30d"]?.revenue ?? null,
      units7d: highAovCandidate.stats["7d"]?.units ?? null,
      lastSoldDate: highAovCandidate.lastSoldDate ?? null
    });
  }

  const lifetimeHero = sortByRange("lifetime").find((product) => !usedProducts.has(product.name.trim().toLowerCase()));
  if (lifetimeHero) {
    pushRec({
      category: "COLLECTOR_FAVORITE",
      productName: lifetimeHero.name,
      reason: `${lifetimeHero.name} is a lifetime hero (${currencyFormatter.format(lifetimeHero.stats["lifetime"]?.revenue ?? 0)} lifetime).`,
      supportingMetric: buildSupportingMetric(lifetimeHero.stats, ["lifetime", "365d"]),
      suggestedAction: "Reintroduce to lapsed collectors or bundle with new drops.",
      suggestedChannel: "Collector outreach",
      confidence: "medium",
      revenue7d: lifetimeHero.stats["7d"]?.revenue ?? null,
      revenue30d: lifetimeHero.stats["30d"]?.revenue ?? null,
      units7d: lifetimeHero.stats["7d"]?.units ?? null,
      lastSoldDate: lifetimeHero.lastSoldDate ?? null
    });
  }

  pushRec(
    {
      category: "TRAFFIC_GAP",
      productName: "GA4 product traffic",
      reason: "GA4 item-level traffic mapping not connected – 'Traffic but no sales' insight locked.",
      supportingMetric: undefined,
      suggestedAction: "Add GA4 item_id mapping so we can surface high-traffic SKUs.",
      suggestedChannel: "Analytics",
      confidence: "low",
      directional: false
    },
    { allowDuplicateProduct: true }
  );

  return {
    generatedAt: new Date().toISOString(),
    trafficInsightsAvailable: false,
    recommendations
  };
}

function findAggregatedProduct(products: AggregatedProductStats[], name?: string | null) {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  return products.find((product) => product.name.trim().toLowerCase() === target) ?? null;
}

function buildSupportingMetric(stats: Record<string, { revenue: number; units: number }> = {}, ranges: string[]) {
  const parts: string[] = [];
  for (const label of ranges) {
    const rangeStats = stats[label];
    if (!rangeStats) continue;
    const revenuePart = `${label} ${currencyFormatter.format(rangeStats.revenue ?? 0)}`;
    const unitPart = typeof rangeStats.units === "number" ? ` · ${rangeStats.units} units` : "";
    parts.push(`${revenuePart}${unitPart}`);
  }
  return parts.length ? parts.join(" | ") : undefined;
}

function formatWooRangeLine(label: string, summary?: WooRangeSummaryEntry) {
  if (!summary) return null;
  const aov = summary.orders > 0 ? currencyFormatter.format(summary.avgOrderValue) : currencyFormatter.format(0);
  return `${label}: ${currencyFormatter.format(summary.revenue)} on ${summary.orders} orders (AOV ${aov})`;
}

function buildMomentumMetric(entry: ProductMomentumEntry) {
  if (entry.revenueDeltaPercent != null) return `Δ ${percentFormatter.format(entry.revenueDeltaPercent)}%`;
  if (entry.revenueDelta != null) return `Δ ${currencyFormatter.format(entry.revenueDelta)}`;
  return undefined;
}

async function loadCollectorRadar(): Promise<CollectorRadar | null> {
  const connectionString = process.env.SUPABASE_DB_DSN;
  if (!connectionString) {
    console.warn("[marketing-command] SUPABASE_DB_DSN missing; collector radar disabled.");
    return null;
  }
  let PoolCtor: typeof import("pg").Pool;
  try {
    ({ Pool: PoolCtor } = await import("pg"));
  } catch (error) {
    console.warn("[marketing-command] pg dependency missing; collector radar disabled.");
    return null;
  }
  const pool = new PoolCtor({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false }
  });
  try {
    const ordersQuery = await pool.query(
      `select order_id, total, currency, completed_at, created_at, status, customer_email
         from ${SUPABASE_SCHEMA}.raw_woocommerce_orders
        where coalesce(status, '') not in ('trash','refunded','cancelled','failed')`
    );
    const orders = ordersQuery.rows as Array<{
      order_id: number;
      total: number;
      currency: string | null;
      completed_at: string | null;
      created_at: string | null;
      status: string | null;
      customer_email: string | null;
    }>;
    if (!orders.length) return null;

    const orderIds = orders.map((order) => order.order_id);
    const itemsQuery = await pool.query(
      `select order_id, product_name
         from ${SUPABASE_SCHEMA}.raw_woocommerce_order_items
        where order_id = any($1::int[])`,
      [orderIds]
    );
    const items = itemsQuery.rows as Array<{ order_id: number; product_name: string | null }>;
    const itemsByOrder = new Map<number, string[]>();
    items.forEach((row) => {
      const list = itemsByOrder.get(row.order_id) ?? [];
      if (row.product_name) list.push(row.product_name);
      itemsByOrder.set(row.order_id, list);
    });

    const collectorMap = new Map<string, AggregatedCollector>();
    const recentCutoff = new Date();
    recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 365);
    const recentCutoffMs = recentCutoff.getTime();
    for (const order of orders) {
      const email = typeof order.customer_email === "string" ? order.customer_email.trim().toLowerCase() : null;
      const key = email && email.length ? `email:${email}` : `order:${order.order_id}`;
      const masked = email ? maskEmail(email) : null;
      const displayName = masked ?? `Buyer #${order.order_id}`;
      const entry = collectorMap.get(key) ?? {
        key,
        displayName,
        maskedEmail: masked,
        totalSpend: 0,
        orderCount: 0,
        firstOrderDate: null,
        lastOrderDate: null,
        products: new Set<string>(),
        recentSpend: 0,
        recentOrderCount: 0
      };
      const amount = Number(order.total ?? 0) || 0;
      entry.totalSpend += amount;
      entry.orderCount += 1;
      const completedAt = order.completed_at ?? order.created_at ?? null;
      const completedTime = completedAt ? new Date(completedAt).getTime() : null;
      if (completedAt) {
        if (!entry.lastOrderDate || completedAt > entry.lastOrderDate) entry.lastOrderDate = completedAt;
        if (!entry.firstOrderDate || completedAt < entry.firstOrderDate) entry.firstOrderDate = completedAt;
      }
      if (completedTime && completedTime >= recentCutoffMs) {
        entry.recentSpend += amount;
        entry.recentOrderCount += 1;
      }
      (itemsByOrder.get(order.order_id) ?? []).forEach((name) => {
        if (!name) return;
        entry.products.add(name);
      });
      collectorMap.set(key, entry);
    }

    const aggregated = Array.from(collectorMap.values()).sort((a, b) => b.totalSpend - a.totalSpend);
    const recommendations = buildCollectorRecommendations(aggregated);
    if (!recommendations.length) return null;

    return {
      generatedAt: new Date().toISOString(),
      segments: recommendations
    };
  } finally {
    await pool.end();
  }
}

function buildCollectorRecommendations(collectors: AggregatedCollector[]): CollectorRecommendation[] {
  const recs: CollectorRecommendation[] = [];
  const usedKeys = new Set<string>();
  const segmentCounts: Record<CollectorRadarSegment, number> = {
    TOP_COLLECTOR: 0,
    REPEAT_BUYER: 0,
    LAPSED_COLLECTOR: 0,
    RECENT_HIGH_VALUE: 0,
    NURTURE_OPPORTUNITY: 0
  };

  const daysSince = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null);

  const push = (
    segment: CollectorRadarSegment,
    collector: AggregatedCollector,
    reason: string,
    action: string,
    confidence: CollectorRecommendation["confidence"],
    lookbackLabel: string
  ) => {
    const key = `${segment}:${collector.key}`;
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    segmentCounts[segment] += 1;
    const safeLabel = `${COLLECTOR_SEGMENT_LABELS[segment]} ${segmentCounts[segment]}`;
    recs.push({
      segment,
      displayName: safeLabel,
      maskedEmail: collector.maskedEmail,
      totalSpend: Number(collector.totalSpend.toFixed(0)),
      orderCount: collector.orderCount,
      lastOrderDate: collector.lastOrderDate ?? null,
      daysSinceLastOrder: daysSince(collector.lastOrderDate),
      products: Array.from(collector.products).slice(0, 5),
      lookbackLabel,
      reason,
      suggestedAction: action,
      confidence
    });
  };

  const topCollectors = collectors.slice(0, 3);
  topCollectors.forEach((collector) =>
    push(
      "TOP_COLLECTOR",
      collector,
      `Lifetime ${currencyFormatter.format(collector.totalSpend)} across ${collector.orderCount} orders · ${collector.recentOrderCount ? `${currencyFormatter.format(collector.recentSpend)} in last 365d` : "No purchases in last 365d"}.`,
      "Send a personal note + early access preview.",
      "high",
      "lifetime"
    )
  );

  const repeatBuyers = collectors.filter((collector) => collector.orderCount >= 2 && (daysSince(collector.lastOrderDate) ?? Infinity) <= 120).slice(0, 3);
  repeatBuyers.forEach((collector) =>
    push(
      "REPEAT_BUYER",
      collector,
      `${collector.orderCount} lifetime orders (${currencyFormatter.format(collector.totalSpend)}) · last purchase ${formatRelative(daysSince(collector.lastOrderDate))}.`,
      "Offer a related piece or limited variant directly.",
      "high",
      "365d"
    )
  );

  const recentHighValue = collectors
    .filter((collector) => (daysSince(collector.lastOrderDate) ?? Infinity) <= 30 && collector.totalSpend >= 200)
    .slice(0, 2);
  recentHighValue.forEach((collector) =>
    push(
      "RECENT_HIGH_VALUE",
      collector,
      `Spent ${currencyFormatter.format(collector.recentSpend)} in the last 30 days (${currencyFormatter.format(collector.totalSpend)} lifetime).`,
      "Send behind-the-scenes content or invite to next drop.",
      "medium",
      "365d"
    )
  );

  const lapsed = collectors.filter((collector) => collector.orderCount >= 2 && (daysSince(collector.lastOrderDate) ?? 0) > 120).slice(0, 3);
  lapsed.forEach((collector) =>
    push(
      "LAPSED_COLLECTOR",
      collector,
      `Lifetime ${currencyFormatter.format(collector.totalSpend)} · lapsed ${daysSince(collector.lastOrderDate) ?? 0} days.`,
      "Send a personal check-in with a relevant new piece.",
      "medium",
      "lifetime"
    )
  );

  const nurture = collectors.filter((collector) => collector.orderCount === 1 && (daysSince(collector.lastOrderDate) ?? Infinity) <= 45).slice(0, 2);
  nurture.forEach((collector) =>
    push(
      "NURTURE_OPPORTUNITY",
      collector,
      "New buyer within 45d — perfect time for a follow-up story.",
      "Invite them to the next release announcement or collector list.",
      "medium",
      "365d"
    )
  );

  return recs.slice(0, 6);
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return `${maskSegment(user)}`;
  const domainParts = domain.split(".");
  const domainName = domainParts.shift() ?? "";
  const tld = domainParts.join(".");
  const maskedDomain = maskSegment(domainName);
  const maskedUser = maskSegment(user);
  return tld ? `${maskedUser}@${maskedDomain}.${tld}` : `${maskedUser}@${maskedDomain}`;
}

function formatRelative(days?: number | null) {
  if (days == null) return "recently";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function maskSegment(value: string) {
  if (!value) return "***";
  if (value.length === 1) return `${value[0]}***`;
  return `${value[0]}***${value.slice(-1)}`;
}

async function buildPayload(
  current: OverviewResponse,
  previous?: OverviewResponse | null,
  overrides?: ProductWindowOverrides,
  salesGeography?: SalesGeographySnapshot | null
): Promise<MarketingCommandPayload> {
  const wooRangeSummaries = await loadWooRangeSummaries();
  const website = current.websiteConversion ?? null;
  const prevWebsite = previous?.websiteConversion ?? null;
  const meta = current.metaAds ?? null;
  const prevMeta = previous?.metaAds ?? null;
  const funnel = current.commerceTelemetry?.funnel ?? null;
  const prevFunnel = previous?.commerceTelemetry?.funnel ?? null;
  const rangeInfo = toRangeSummary(current.range);
  const previousRange = toRangeSummary(previous?.range);

  const summary: string[] = [];
  const whatChanged: string[] = [];
  const whatMatters: string[] = [];
  const risks: string[] = [];
  const monitorTomorrow: string[] = [];
  const actionCandidates: MarketingAction[] = [];

  const websiteSessions = toNumber(website?.ga4?.sessions);
  const previousWebsiteSessions = toNumber(prevWebsite?.ga4?.sessions);
  const viewItemEvents = toNumber(website?.ga4?.viewItemEvents);
  const previousViewItemEvents = toNumber(prevWebsite?.ga4?.viewItemEvents);
  const addToCartEvents = toNumber(website?.ga4?.addToCartEvents);
  const previousAddToCart = toNumber(prevWebsite?.ga4?.addToCartEvents);
  const beginCheckoutEvents = toNumber(website?.ga4?.beginCheckoutEvents);
  const previousBeginCheckout = toNumber(prevWebsite?.ga4?.beginCheckoutEvents);
  const websitePurchases = toNumber(website?.ga4?.ecommercePurchases);
  const previousWebsitePurchases = toNumber(prevWebsite?.ga4?.ecommercePurchases);
  const gaRevenue = toNumber(website?.ga4?.purchaseRevenue);
  const previousGaRevenue = toNumber(prevWebsite?.ga4?.purchaseRevenue);

  const wooRevenue = toNumber(website?.wooCommerce?.totalRevenue);
  const previousWooRevenue = toNumber(prevWebsite?.wooCommerce?.totalRevenue);
  const wooOrders = toNumber(website?.wooCommerce?.orderCount);
  const previousWooOrders = toNumber(prevWebsite?.wooCommerce?.orderCount);
  const wooAov = toNumber(website?.wooCommerce?.averageOrderValue);
  const previousWooAov = toNumber(prevWebsite?.wooCommerce?.averageOrderValue);
  const wooSummary7 = wooRangeSummaries["7d"];
  const wooSummary30 = wooRangeSummaries["30d"];
  const wooSummary90 = wooRangeSummaries["90d"];
  const wooSummary365 = wooRangeSummaries["365d"];
  const wooSummaryYtd = wooRangeSummaries["ytd"];
  const wooSummaryLifetime = wooRangeSummaries["lifetime"];

  const metaSummary: Partial<MetaAdsSnapshot["summary"]> = meta?.summary ?? {};
  const prevMetaSummary: Partial<MetaAdsSnapshot["summary"]> = prevMeta?.summary ?? {};
  const metaSpend = toNumber(metaSummary.spend);
  const prevMetaSpend = toNumber(prevMetaSummary.spend);
  const metaImpressions = toNumber(metaSummary.impressions);
  const prevMetaImpressions = toNumber(prevMetaSummary.impressions);
  const metaClicks = toNumber(metaSummary.clicks);
  const prevMetaClicks = toNumber(prevMetaSummary.clicks);
  const metaPurchases = toNumber(metaSummary.purchases);
  const prevMetaPurchases = toNumber(prevMetaSummary.purchases);
  const metaPurchaseValue = toNumber(metaSummary.purchaseValue);
  const prevMetaPurchaseValue = toNumber(prevMetaSummary.purchaseValue);
  const metaRoas = toNumber(metaSummary.roas);
  const prevMetaRoas = toNumber(prevMetaSummary.roas);
  const metaCtr = metaImpressions && metaImpressions > 0 && metaClicks != null ? (metaClicks / metaImpressions) * 100 : null;
  const prevMetaCtr = prevMetaImpressions && prevMetaImpressions > 0 && prevMetaClicks != null ? (prevMetaClicks / prevMetaImpressions) * 100 : null;
  const metaCpc = metaSpend != null && metaClicks && metaClicks > 0 ? metaSpend / metaClicks : null;
  const prevMetaCpc = prevMetaSpend != null && prevMetaClicks && prevMetaClicks > 0 ? prevMetaSpend / prevMetaClicks : null;

  const funnelSeries: FunnelTimeseriesPoint[] = funnel?.timeseries ?? [];
  const funnelSummary: Partial<FunnelSummary> = funnel?.summary ?? {};
  const prevFunnelSummary: Partial<FunnelSummary> = prevFunnel?.summary ?? {};
  const funnelEntries = toNumber(funnelSummary.entries);
  const prevFunnelEntries = toNumber(prevFunnelSummary.entries);
  const funnelCompletions = toNumber(funnelSummary.completions);
  const prevFunnelCompletions = toNumber(prevFunnelSummary.completions);
  const funnelConversionRate =
    toNumber(funnelSummary.conversionRate) ?? (funnelEntries && funnelEntries > 0 && funnelCompletions != null ? (funnelCompletions / funnelEntries) * 100 : null);
  const prevFunnelConversionRate =
    toNumber(prevFunnelSummary.conversionRate) ??
    (prevFunnelEntries && prevFunnelEntries > 0 && prevFunnelCompletions != null ? (prevFunnelCompletions / prevFunnelEntries) * 100 : null);

  const websiteConversionRate = websiteSessions && websiteSessions > 0 && websitePurchases != null ? (websitePurchases / websiteSessions) * 100 : null;
  const addToCartRate = websiteSessions && websiteSessions > 0 && addToCartEvents != null ? (addToCartEvents / websiteSessions) * 100 : null;

  if (websiteConversionRate != null && websiteSessions) {
    summary.push(
      `Website: ${numberFormatter.format(websiteConversionRate)}% CVR (${websitePurchases ?? 0} purchases / ${numberFormatter.format(websiteSessions)} sessions)`
    );
    whatChanged.push(
      `Traffic ${numberFormatter.format(websiteSessions)} sessions with ${websitePurchases ?? 0} purchases (${numberFormatter.format(websiteConversionRate)}% CVR)`
    );
  } else {
    whatChanged.push("Website conversion baseline needed (missing GA4 sessions or purchases).");
  }

  if (wooSummary7) {
    summary.push(`Woo short-window ${formatWooRangeLine("7d", wooSummary7)}`);
  } else if (wooRevenue != null) {
    summary.push(`WooCommerce: ${currencyFormatter.format(wooRevenue)} revenue on ${wooOrders ?? 0} orders.`);
  }

  if (wooSummary30) {
    summary.push(`Woo 30d ${formatWooRangeLine("30d", wooSummary30)}`);
  }

  if (wooSummary365) {
    summary.push(`Woo 365d baseline ${formatWooRangeLine("365d", wooSummary365)}`);
  }

  if (metaSpend != null) {
    summary.push(
      `Meta: ${currencyFormatter.format(metaSpend)} spend → ${metaPurchases ?? 0} purchases (ROAS ${metaRoas != null ? metaRoas.toFixed(2) : "—"}).`
    );
    whatChanged.push(
      `Meta performance: ${metaPurchases ?? 0} purchases on ${currencyFormatter.format(metaSpend)} spend (${metaRoas != null ? metaRoas.toFixed(2) : "—"} ROAS).`
    );
  } else {
    whatChanged.push("Meta snapshot unavailable (baseline needed).");
  }

  if (funnelEntries != null && funnelCompletions != null) {
    const funnelCvr = funnelEntries > 0 ? (funnelCompletions / funnelEntries) * 100 : null;
    summary.push(
      `Funnel: ${numberFormatter.format(funnelEntries)} entries → ${numberFormatter.format(funnelCompletions)} completions (${funnelCvr != null ? numberFormatter.format(funnelCvr) : "0"}% CVR).`
    );
  }

  if (wooSummary30 && wooSummary365) {
    whatMatters.push(
      `Woo trajectory: 7d ${wooSummary7 ? currencyFormatter.format(wooSummary7.revenue) : "—"} vs 30d ${currencyFormatter.format(wooSummary30.revenue)} vs 365d baseline ${currencyFormatter.format(wooSummary365.revenue)}.`
    );
  }

  if (wooSummary90 && wooSummary365) {
    whatMatters.push(
      `90d revenue ${currencyFormatter.format(wooSummary90.revenue)} compared to 365d ${currencyFormatter.format(wooSummary365.revenue)} (AOV ${currencyFormatter.format(wooSummary90.avgOrderValue || 0)} vs ${currencyFormatter.format(wooSummary365.avgOrderValue || 0)}).`
    );
  }

  if (wooSummaryLifetime) {
    whatMatters.push(
      `Lifetime Woo revenue ${currencyFormatter.format(wooSummaryLifetime.revenue)} across ${wooSummaryLifetime.orders} orders (AOV ${currencyFormatter.format(wooSummaryLifetime.avgOrderValue || 0)}).`
    );
  }

  const metricDeltaSpecs: MetricDeltaSpec[] = [
    { metric: "sessions", label: "Sessions", currentValue: websiteSessions, previousValue: previousWebsiteSessions },
    { metric: "view_item", label: "Product views", currentValue: viewItemEvents, previousValue: previousViewItemEvents },
    { metric: "add_to_cart", label: "Add to cart", currentValue: addToCartEvents, previousValue: previousAddToCart },
    { metric: "begin_checkout", label: "Begin checkout", currentValue: beginCheckoutEvents, previousValue: previousBeginCheckout },
    { metric: "ga_purchases", label: "GA4 purchases", currentValue: websitePurchases, previousValue: previousWebsitePurchases },
    { metric: "ga_revenue", label: "GA4 revenue", unit: "usd", currentValue: gaRevenue, previousValue: previousGaRevenue },
    { metric: "woo_orders", label: "Woo orders", currentValue: wooOrders, previousValue: previousWooOrders },
    { metric: "woo_revenue", label: "Woo revenue", unit: "usd", currentValue: wooRevenue, previousValue: previousWooRevenue },
    { metric: "woo_aov", label: "Average order value", unit: "usd", currentValue: wooAov, previousValue: previousWooAov },
    { metric: "meta_spend", label: "Meta spend", unit: "usd", currentValue: metaSpend, previousValue: prevMetaSpend },
    { metric: "meta_impressions", label: "Meta impressions", currentValue: metaImpressions, previousValue: prevMetaImpressions },
    { metric: "meta_clicks", label: "Meta clicks", currentValue: metaClicks, previousValue: prevMetaClicks },
    { metric: "meta_ctr", label: "Meta CTR", unit: "percent", currentValue: metaCtr, previousValue: prevMetaCtr },
    { metric: "meta_cpc", label: "Meta CPC", unit: "usd", currentValue: metaCpc, previousValue: prevMetaCpc },
    { metric: "meta_purchases", label: "Meta purchases", currentValue: metaPurchases, previousValue: prevMetaPurchases },
    { metric: "meta_purchase_value", label: "Meta purchase value", unit: "usd", currentValue: metaPurchaseValue, previousValue: prevMetaPurchaseValue },
    { metric: "meta_roas", label: "Meta ROAS", currentValue: metaRoas, previousValue: prevMetaRoas },
    { metric: "funnel_cvr", label: "Funnel conversion", unit: "percent", currentValue: funnelConversionRate, previousValue: prevFunnelConversionRate }
  ];

  const metricDeltas = metricDeltaSpecs.map(buildMetricDeltaEntry);
  const comparisonSummary = buildComparisonSummary(metricDeltas);
  const fallbackCurrentProducts = website?.wooCommerce?.topProducts ?? [];
  const fallbackPreviousProducts = prevWebsite?.wooCommerce?.topProducts ?? [];
  const productMomentum = buildProductMomentum(
    overrides?.currentProductsOverride ?? fallbackCurrentProducts,
    overrides?.previousProductsOverride ?? fallbackPreviousProducts
  );
  let aggregatedPromotionProducts: AggregatedProductStats[] = [];
  try {
    aggregatedPromotionProducts = await loadPromotionProductStats();
  } catch (error) {
    console.warn("[marketing-command] Promotion planner Supabase fetch failed:", error instanceof Error ? error.message : error);
  }
  if (!aggregatedPromotionProducts.length) {
    aggregatedPromotionProducts = buildPromotionPlannerFallback(overrides?.currentProductsOverride ?? fallbackCurrentProducts);
  }
  const promotionPlanner = buildPromotionPlannerData({
    aggregatedProducts: aggregatedPromotionProducts,
    productMomentum
  });

  let collectorRadar: CollectorRadar | null = null;
  try {
    collectorRadar = await loadCollectorRadar();
  } catch (error) {
    console.warn("[marketing-command] Collector radar unavailable:", error instanceof Error ? error.message : error);
  }

  // Freshness checks with clamp
  const websiteFreshHours = clampFreshnessHours(hoursSince(website?.generatedAt));
  const metaFreshHours = clampFreshnessHours(hoursSince(meta?.generatedAt));
  const funnelFreshHours = clampFreshnessHours(hoursSinceDateOnly(funnelSeries.at(-1)?.date));
  const websiteStale = websiteFreshHours == null || websiteFreshHours > 24;
  const metaStale = metaFreshHours == null || metaFreshHours > 24;
  const funnelStale = funnelFreshHours == null || funnelFreshHours > 48;

  if (websiteStale) risks.push("Website snapshot older than 24h – rerun website agent before acting.");
  if (metaStale) risks.push("Meta snapshot older than 24h – rerun meta agent before acting.");
  if (funnelStale) risks.push("Funnel telemetry older than 48h.");

  if (wooOrders != null && websitePurchases != null && wooOrders + websitePurchases > 0) {
    const diffRatio = Math.abs(wooOrders - websitePurchases) / Math.max(wooOrders, websitePurchases);
    if (diffRatio > 0.15) {
      risks.push(`Woo vs GA4 purchases differ (${wooOrders} Woo vs ${websitePurchases} GA4). Investigate instrumentation before scaling.`);
    }
  }

  const metaCampaignCount = meta?.campaigns?.length ?? 0;
  if (metaCampaignCount <= 1) {
    risks.push("Only one Meta campaign active – rotate creative to avoid fatigue.");
  }

  if (!websiteStale && addToCartRate != null && addToCartRate < 8) {
    actionCandidates.push({
      title: "Tighten product pitch",
      detail: `Add-to-cart rate only ${percentFormatter.format(addToCartRate)}% (${addToCartEvents ?? 0} ATCs / ${websiteSessions ?? 0} sessions).`,
      metric: "add_to_cart_rate",
      priority: 1
    });
    whatMatters.push("Add-to-cart rate is below 8%; landing page needs tightening.");
    monitorTomorrow.push("Hit 10% add-to-cart rate.");
  }

  if (!websiteStale && websiteConversionRate != null && websiteConversionRate < 3) {
    actionCandidates.push({
      title: "Improve checkout conversion",
      detail: `Tracked CVR is ${numberFormatter.format(websiteConversionRate)}% (${websitePurchases ?? 0} GA4 purchases / ${websiteSessions ?? 0} sessions). Investigate Woo vs GA4 mismatch (${wooOrders ?? "?"} Woo orders).`,
      metric: "conversion_rate",
      priority: 2
    });
    whatMatters.push("Tracked conversion rate is under target and GA4 undercounts vs Woo; instrument checkout before scaling.");
    monitorTomorrow.push("Improve tracked conversion rate + reconcile Woo vs GA4 purchases.");
  }

  if (!metaStale && metaSpend != null && metaPurchases != null) {
    if (metaPurchases < 3) {
      actionCandidates.push({
        title: "Test new Meta creative",
        detail: `${metaPurchases} purchases on ${currencyFormatter.format(metaSpend)} spend – volume too low to scale.`,
        metric: "meta_purchases",
        priority: 3
      });
      whatMatters.push("Meta volume is thin; creative refresh needed before budget changes.");
      monitorTomorrow.push("Meta purchases ≥ 3");
    } else if (metaRoas != null && metaRoas > 2.5) {
      actionCandidates.push({
        title: "Nudge Meta budget",
        detail: `ROAS ${metaRoas.toFixed(2)} on ${currencyFormatter.format(metaSpend)} spend. Consider incremental budget only after creative refresh.`,
        metric: "meta_roas",
        priority: 4
      });
    } else if (metaRoas != null && metaRoas < 1) {
      actionCandidates.push({
        title: "Pause underperforming Meta spend",
        detail: `ROAS ${metaRoas.toFixed(2)} – protect margin until creative is refreshed.`,
        metric: "meta_roas",
        priority: 2
      });
    }
  }

  const latestFunnel = funnelSeries.at(-1);
  const latestEntries = toNumber(latestFunnel?.entries);
  const latestCompletions = toNumber(latestFunnel?.completions);
  if (!funnelStale && latestEntries && latestEntries > 0 && latestCompletions != null) {
    const latestCvr = (latestCompletions / latestEntries) * 100;
    if (latestCvr < 5) {
      actionCandidates.push({
        title: "Fix checkout step",
        detail: `Funnel step on ${latestFunnel?.date ?? "recent"} converted ${latestCompletions}/${latestEntries} (${percentFormatter.format(latestCvr)}%).`,
        metric: "funnel_conversion",
        priority: 2
      });
      whatMatters.push("Funnel drop-off exceeds 95% on the latest step.");
      monitorTomorrow.push("Funnel step conversion ≥ 8%.");
    }
  }

  const bestSeller = website?.wooCommerce?.topProducts?.[0];
  if (!websiteStale && bestSeller) {
    actionCandidates.push({
      title: `Promote ${bestSeller.name}`,
      detail: `${bestSeller.units ?? 0} units sold; add to today’s email/social plan.`,
      metric: "top_product",
      priority: 4
    });
  }

  if (risks.length === 0) {
    monitorTomorrow.push("Confirm data freshness stays <24h.");
  }

  const actions = actionCandidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map(({ title, detail, metric }) => ({ title, detail, metric }));

  if (actions.length === 0) {
    whatMatters.push("Data is available but no pressing actions met the thresholds today.");
  }

  const status: "LIVE" | "PARTIAL" = websiteStale || metaStale || funnelStale ? "PARTIAL" : "LIVE";

  const { top: topConnectedInsights, suppressed: suppressedInsights } = evaluateInsights({
    range: rangeInfo,
    website,
    meta,
    funnel,
    previousWebsite: prevWebsite,
    previousMeta: prevMeta,
    previousFunnel: prevFunnel,
    metricDeltas,
    productMomentum,
    salesGeography
  });

  const confidenceSummary = {
    high: topConnectedInsights.filter((insight) => insight.confidence === "HIGH").length,
    medium: topConnectedInsights.filter((insight) => insight.confidence === "MEDIUM").length,
    low: topConnectedInsights.filter((insight) => insight.confidence === "LOW").length
  } satisfies MarketingCommandPayload["confidenceSummary"];

  const sourceFreshnessSummary = [
    { source: "Website", hoursSince: websiteFreshHours, stale: websiteStale, thresholdHours: 24 },
    { source: "Meta", hoursSince: metaFreshHours, stale: metaStale, thresholdHours: 24 },
    { source: "Funnel", hoursSince: funnelFreshHours, stale: funnelStale, thresholdHours: 48 }
  ] satisfies NonNullable<MarketingCommandPayload["sourceFreshnessSummary"]>;

  const priorRange = previousRange ?? (rangeInfo ? computePreviousRange(rangeInfo) : undefined);
  const insightBasis = rangeInfo && priorRange ? { current: rangeInfo, previous: priorRange } : undefined;

  return {
    generatedAt: new Date().toISOString(),
    status,
    range: rangeInfo,
    priorRange,
    summary,
    whatChanged,
    whatMatters,
    actions,
    risks,
    monitorTomorrow,
    topConnectedInsights,
    suppressedInsights,
    wooRangeSummaries: Object.keys(wooRangeSummaries).length ? wooRangeSummaries : undefined,
    comparisonSummary: comparisonSummary.length ? comparisonSummary : undefined,
    metricDeltas,
    productMomentum,
    promotionPlanner,
    collectorRadar,
    confidenceSummary,
    sourceFreshnessSummary,
    insightBasis,
    salesGeography
  };
}

async function persistSnapshot(payload: MarketingCommandPayload) {
  const { error } = await supabase.from("dashboard_snapshots").upsert({
    key: "marketing_command",
    payload,
    mode: payload.status,
    generated_at: payload.generatedAt,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function main() {
  try {
    const localWebsiteSnapshotPath = path.resolve("dashboard/data/website/latest.json");
    let localOverride: OverviewResponse | null = null;
    if (DRY_RUN) {
      try {
        const websiteSnapshotRaw = await fs.readFile(websiteDryRunPath, "utf8");
        const websiteSnapshot = JSON.parse(websiteSnapshotRaw);
        const liveOverview = await fetchOverview();
        localOverride = {
          ...liveOverview,
          websiteConversion: websiteSnapshot
        } as OverviewResponse;
      } catch {
        console.warn("[marketing-command] DRY RUN could not read dry-run website snapshot; falling back to live overview");
      }
    }
    const overview = await fetchOverview(undefined, localOverride ?? undefined);
    const currentRange = toRangeSummary(overview.range);
    const fallbackPreviousRange = computePreviousRange(currentRange);
    if (!wooClientEnabled) {
      console.warn("[marketing-command] Woo credentials missing; using snapshot product data only.");
    }
    let previousOverview: OverviewResponse | null = null;

    if (fallbackPreviousRange) {
      try {
        previousOverview = await fetchOverview({
          preset: "custom",
          startDate: fallbackPreviousRange.startDate,
          endDate: fallbackPreviousRange.endDate
        });
      } catch (error) {
        console.warn("Failed to fetch previous range overview", error);
      }
    }

    const { productOverrides, currentSalesGeography, previousSalesGeography } = await fetchWooTelemetry(
      currentRange,
      fallbackPreviousRange ?? undefined
    );
    const comparison = buildSalesGeographyComparison(currentSalesGeography, previousSalesGeography);
    const mergedSalesGeography = currentSalesGeography ? { ...currentSalesGeography, comparison } : currentSalesGeography;
    const payload = await buildPayload(overview, previousOverview, productOverrides, mergedSalesGeography);
    if (DRY_RUN) {
      console.log("[marketing-command] DRY RUN summary", JSON.stringify(payload, null, 2));
      return;
    }
    await persistSnapshot(payload);
    console.log("marketing_command snapshot updated", JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error("Failed to run marketing command", error);
    process.exit(1);
  }
}

void main();
type WooOrder = {
  date_completed_gmt?: string;
  date_completed?: string;
  date_created_gmt?: string;
  date_created?: string;
  total?: string | number;
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
  line_items?: Array<{
    name?: string;
    product_id?: number;
    variation_id?: number;
    sku?: string;
    quantity?: number;
    total?: string | number;
  }>;
};

type ProductWindowOverrides = {
  currentProductsOverride?: ProductTopEntry[] | null;
  previousProductsOverride?: ProductTopEntry[] | null;
};

type WooTelemetryResult = {
  productOverrides: ProductWindowOverrides;
  currentSalesGeography?: SalesGeographySnapshot | null;
  previousSalesGeography?: SalesGeographySnapshot | null;
};

async function fetchWooTelemetry(range?: RangeSummary, previousRange?: RangeSummary): Promise<WooTelemetryResult> {
  if (!range) return { productOverrides: {} };
  if (!wooClientEnabled) {
    return {
      productOverrides: {},
      currentSalesGeography: buildSuppressedSalesGeographySnapshot(range, ["Woo credentials missing for geography."], { source: "woo" })
    };
  }
  try {
    const [currentOrders, previousOrders] = await Promise.all([
      fetchWooOrdersForRange(range),
      previousRange ? fetchWooOrdersForRange(previousRange) : Promise.resolve(null)
    ]);
    const productOverrides: ProductWindowOverrides = {
      currentProductsOverride: buildProductStatsFromOrders(currentOrders) ?? undefined,
      previousProductsOverride: buildProductStatsFromOrders(previousOrders) ?? undefined
    };
    const geographyOrders = mapWooOrdersToGeographyOrders(currentOrders);
    const previousGeographyOrders = mapWooOrdersToGeographyOrders(previousOrders);
    const currentSnapshot = aggregateSalesGeography(range, geographyOrders, { source: "woo" });
    const previousSnapshot = previousRange
      ? aggregateSalesGeography(previousRange, previousGeographyOrders, { source: "woo" })
      : null;
    return {
      productOverrides,
      currentSalesGeography: currentSnapshot,
      previousSalesGeography: previousSnapshot ?? null
    };
  } catch (error) {
    console.warn(
      "[marketing-command] Woo telemetry unavailable:",
      error instanceof Error ? error.message : error
    );
    return {
      productOverrides: {},
      currentSalesGeography: buildSuppressedSalesGeographySnapshot(range, ["Woo geography unavailable (API error)."], { source: "woo" })
    };
  }
}

async function fetchWooOrdersForRange(range: RangeSummary): Promise<WooOrder[] | null> {
  if (!wooClientEnabled) return null;
  const after = `${range.startDate}T00:00:00Z`;
  const before = `${range.endDate}T23:59:59Z`;
  const authHeader = `Basic ${Buffer.from(`${WOO_CONSUMER_KEY}:${WOO_CONSUMER_SECRET}`).toString("base64")}`;
  const perPage = 100;
  const maxPages = 10;
  const orders: WooOrder[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      status: "completed",
      orderby: "date",
      order: "desc",
      after,
      before,
      page: page.toString()
    });
    const response = await fetch(`${WOO_BASE_URL}/wp-json/wc/v3/orders?${params.toString()}`, {
      headers: { Authorization: authHeader }
    });
    if (!response.ok) {
      throw new Error(`WooCommerce API failed (${response.status} ${response.statusText})`);
    }
    const chunk = (await response.json()) as WooOrder[];
    orders.push(...chunk);
    if (chunk.length < perPage) break;
  }

  const startDate = new Date(after);
  const endDate = new Date(before);
  return orders.filter((order) => {
    const completedIso = order.date_completed_gmt ?? order.date_completed ?? order.date_created_gmt ?? order.date_created;
    if (!completedIso) return false;
    const completed = new Date(completedIso);
    return completed >= startDate && completed <= endDate;
  });
}

function buildProductStatsFromOrders(orders?: WooOrder[] | null): ProductTopEntry[] | null {
  if (!orders?.length) return null;
  const productMap = new Map<
    string,
    {
      name: string;
      productId?: number | null;
      variationId?: number | null;
      sku?: string | null;
      units: number;
      revenue: number;
      orderCount: number;
    }
  >();

  for (const order of orders) {
    const lineItems = order.line_items ?? [];
    for (const item of lineItems) {
      if (!item?.name) continue;
      const key = buildProductKey(
        {
          productId: item.product_id,
          variationId: item.variation_id,
          sku: item.sku,
          name: item.name
        },
        productMap.size
      );
      const current = productMap.get(key) ?? {
        name: item.name,
        productId: item.product_id ?? null,
        variationId: item.variation_id ?? null,
        sku: item.sku ?? null,
        units: 0,
        revenue: 0,
        orderCount: 0
      };
      current.units += item.quantity ?? 0;
      current.revenue += toNumber(item.total) ?? 0;
      current.orderCount += 1;
      productMap.set(key, current);
    }
  }

  return [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((entry, idx) => ({
      name: entry.name,
      revenue: Number(entry.revenue.toFixed(2)),
      units: entry.units,
      productId: entry.productId,
      variationId: entry.variationId,
      sku: entry.sku,
      orderCount: entry.orderCount,
      averageUnitRevenue: entry.units ? Number((entry.revenue / entry.units).toFixed(2)) : null,
      rank: idx + 1
    }))
    .slice(0, 25);
}

function mapWooOrdersToGeographyOrders(orders?: WooOrder[] | null): SalesGeographyOrder[] | null {
  if (!orders?.length) return null;
  return orders.map((order) => ({
    total: order.total,
    lineItems: (order.line_items ?? []).map((item) => ({
      name: item?.name ?? undefined,
      quantity: item?.quantity ?? undefined,
      total: item?.total ?? undefined
    })),
    shipping: sanitizeWooLocation(order.shipping),
    billing: sanitizeWooLocation(order.billing)
  }));
}

function sanitizeWooLocation(
  location?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null
): { city: string | null; state: string | null; country: string | null } | null {
  if (!location) return null;
  const city = location.city?.trim() || null;
  const state = location.state?.trim() || null;
  const country = location.country?.trim() || null;
  if (!city && !state && !country) return null;
  return { city, state, country };
}
