#!/usr/bin/env tsx
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { createClient } from "@supabase/supabase-js";

const GA4_CREDENTIALS_JSON = process.env.GA4_CREDENTIALS_JSON;
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const WOO_BASE_URL = process.env.WOO_BASE_URL?.replace(/\/$/, "");
const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY;
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET;

if (!GA4_CREDENTIALS_JSON || !GA4_PROPERTY_ID) {
  console.error("GA4 credentials and property id are required");
  process.exit(1);
}

if (!WOO_BASE_URL || !WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET) {
  console.error("WooCommerce credentials missing in .env.website");
  process.exit(1);
}

const PROPERTY = `properties/${GA4_PROPERTY_ID.trim()}`;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;
const client = new BetaAnalyticsDataClient({ credentials: JSON.parse(GA4_CREDENTIALS_JSON) });

const RANGES = [
  { label: "7d", startDate: "7daysAgo", endDate: "today" },
  { label: "30d", startDate: "30daysAgo", endDate: "today" }
] as const;

type RangeLabel = (typeof RANGES)[number]["label"];

type ItemMetrics = {
  itemName: string;
  itemId: string | null;
  range: RangeLabel;
  itemsViewed: number;
  itemsAddedToCart: number;
  itemsCheckedOut: number;
  itemsPurchased: number;
  itemRevenue: number;
};

type WooProductMeta = {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: number | null;
  status: string | null;
  image?: string | null;
};

type WooOrderAggregate = {
  productId: number | null;
  name: string;
  sku: string | null;
  units: number;
  revenue: number;
};

type WooLineItem = {
  product_id?: number;
  variation_id?: number;
  sku?: string | null;
  name?: string | null;
  quantity?: number | null;
  total?: string | number | null;
};

type ProductRow = {
  productId: number | null;
  productName: string;
  slug: string | null;
  url: string | null;
  price: number | null;
  image: string | null;
  classification: string;
  summary: string;
  recommendedAction: string;
  confidence: "high" | "medium" | "low";
  instrumentationGap?: boolean;
  tags?: string[];
  ranges: Array<{
    range: RangeLabel;
    label: string;
    source: string;
    confidence: "high" | "medium" | "low";
    gaViewItem?: number | null;
    gaAddToCart?: number | null;
    gaViewToCartRate?: number | null;
    gaItemsCheckedOut?: number | null;
    gaItemsPurchased?: number | null;
    itemRevenue?: number | null;
    wooUnits?: number | null;
    wooRevenue?: number | null;
    wooAov?: number | null;
  }>;
};

type Snapshot = {
  generatedAt: string;
  supportedRanges: RangeLabel[];
  rows: ProductRow[];
  instrumentationChecklist: Array<{ label: string; status: "ready" | "todo" | "blocked"; detail?: string }>;
  notes?: string[];
};

async function fetchGaItems(range: (typeof RANGES)[number]): Promise<ItemMetrics[]> {
  const [response] = await client.runReport({
    property: PROPERTY,
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: [{ name: "itemId" }, { name: "itemName" }],
    metrics: [
      { name: "itemsViewed" },
      { name: "itemsAddedToCart" },
      { name: "itemsCheckedOut" },
      { name: "itemsPurchased" },
      { name: "itemRevenue" }
    ],
    orderBys: [{ metric: { metricName: "itemsViewed" }, desc: true }],
    limit: 500
  });

  return (response.rows ?? []).map((row) => {
    const itemId = row.dimensionValues?.[0]?.value ?? null;
    const itemName = row.dimensionValues?.[1]?.value ?? "Unnamed";
    const [itemsViewed, itemsAdded, itemsChecked, itemsPurchased, itemRevenue] = row.metricValues ?? [];
    return {
      itemName,
      itemId,
      range: range.label,
      itemsViewed: toNumber(itemsViewed?.value) ?? 0,
      itemsAddedToCart: toNumber(itemsAdded?.value) ?? 0,
      itemsCheckedOut: toNumber(itemsChecked?.value) ?? 0,
      itemsPurchased: toNumber(itemsPurchased?.value) ?? 0,
      itemRevenue: toNumber(itemRevenue?.value) ?? 0
    };
  });
}

async function fetchWooProducts(): Promise<WooProductMeta[]> {
  const perPage = 100;
  let page = 1;
  const products: WooProductMeta[] = [];
  while (true) {
    const url = new URL(`${WOO_BASE_URL}/wp-json/wc/v3/products`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("status", "publish");
    const res = await wooFetch(url.toString());
    const chunk = (await res.json()) as any[];
    products.push(
      ...chunk.map((product) => ({
        id: Number(product.id),
        name: product.name ?? `Product ${product.id}`,
        slug: product.slug ?? null,
        permalink: product.permalink ?? null,
        price: product.price != null ? Number(product.price) : null,
        status: product.status ?? null,
        image: product.images?.[0]?.src ?? null
      }))
    );
    if (chunk.length < perPage) break;
    page += 1;
  }
  return products;
}

async function fetchWooOrders(range: { startDate: string; endDate: string }): Promise<WooOrderAggregate[]> {
  const after = `${range.startDate}T00:00:00Z`;
  const before = `${range.endDate}T23:59:59Z`;
  const perPage = 100;
  let page = 1;
  const aggregates = new Map<string, WooOrderAggregate>();
  while (page <= 10) {
    const params = new URLSearchParams({
      status: "completed",
      orderby: "date",
      order: "desc",
      per_page: perPage.toString(),
      page: String(page),
      after,
      before
    });
    const res = await wooFetch(`${WOO_BASE_URL}/wp-json/wc/v3/orders?${params.toString()}`);
    if (!res.ok) break;
    const orders = (await res.json()) as any[];
    orders.forEach((order) => {
      (order.line_items as WooLineItem[] | undefined ?? []).forEach((item) => {
        const productId = item.product_id ?? null;
        const key = String(productId ?? item.name ?? `${page}-${Math.random()}`);
        const current = aggregates.get(key) ?? {
          productId,
          name: item.name ?? "Unknown product",
          sku: item.sku ?? null,
          units: 0,
          revenue: 0
        };
        current.units += Number(item.quantity ?? 0);
        current.revenue += Number(item.total ?? 0);
        aggregates.set(key, current);
      });
    });
    if (orders.length < perPage) break;
    page += 1;
  }
  return [...aggregates.values()];
}

async function wooFetch(url: string) {
  const authHeader = `Basic ${Buffer.from(`${WOO_CONSUMER_KEY}:${WOO_CONSUMER_SECRET}`).toString("base64")}`;
  return fetch(url, { headers: { Authorization: authHeader } });
}

function toNumber(value?: string | number | null) {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function calculateRate(value?: number | null, total?: number | null) {
  if (value == null || total == null || total === 0) return null;
  return value / total;
}

function mergeData({ gaItems, wooProducts, wooOrders }: { gaItems: ItemMetrics[]; wooProducts: WooProductMeta[]; wooOrders: Record<RangeLabel, WooOrderAggregate[]> }) {
  const rows = new Map<string, ProductRow>();
  const productMetaById = new Map<number, WooProductMeta>();
  wooProducts.forEach((product) => productMetaById.set(product.id, product));

  gaItems.forEach((item) => {
    const key = item.itemId ?? item.itemName;
    const existing = rows.get(key) ?? createEmptyRow(item, productMetaById);
    updateRange(existing, item.range, {
      gaViewItem: item.itemsViewed,
      gaAddToCart: item.itemsAddedToCart,
      gaItemsCheckedOut: item.itemsCheckedOut,
      gaItemsPurchased: item.itemsPurchased,
      itemRevenue: item.itemRevenue
    });
    rows.set(key, existing);
  });

  (Object.entries(wooOrders) as Array<[RangeLabel, WooOrderAggregate[]]>).forEach(([rangeLabel, aggregates]) => {
    aggregates.forEach((aggregate) => {
      const key = aggregate.productId != null ? String(aggregate.productId) : aggregate.name;
      const existing = rows.get(key) ?? createEmptyRow({ itemId: aggregate.productId != null ? String(aggregate.productId) : null, itemName: aggregate.name, range: rangeLabel, itemsViewed: 0, itemsAddedToCart: 0, itemsCheckedOut: 0, itemsPurchased: 0, itemRevenue: 0 }, productMetaById);
      updateRange(existing, rangeLabel, {
        wooUnits: aggregate.units,
        wooRevenue: aggregate.revenue
      });
      rows.set(key, existing);
    });
  });

  return [...rows.values()].map(applyClassification);
}

function createEmptyRow(item: ItemMetrics, productMetaById: Map<number, WooProductMeta>): ProductRow {
  const productId = item.itemId ? Number(item.itemId) : null;
  const meta = productId != null ? productMetaById.get(productId) : null;
  const row: ProductRow = {
    productId,
    productName: meta?.name ?? item.itemName,
    slug: meta?.slug ?? null,
    url: meta?.permalink ?? null,
    price: meta?.price ?? null,
    image: meta?.image ?? null,
    classification: "DATA_LIGHT",
    summary: "Not enough data yet.",
    recommendedAction: "Collect more signals before promoting.",
    confidence: "low",
    ranges: []
  };
  return row;
}

function updateRange(row: ProductRow, range: RangeLabel, values: { gaViewItem?: number | null; gaAddToCart?: number | null; gaItemsCheckedOut?: number | null; gaItemsPurchased?: number | null; itemRevenue?: number | null; wooUnits?: number | null; wooRevenue?: number | null }) {
  let snapshot = row.ranges.find((entry) => entry.range === range);
  if (!snapshot) {
    snapshot = {
      range,
      label: range === "7d" ? "Last 7d" : "Last 30d",
      source: "GA4 + Woo",
      confidence: "medium"
    } as ProductRow["ranges"][number];
    row.ranges.push(snapshot);
  }
  if (values.gaViewItem != null) snapshot.gaViewItem = values.gaViewItem;
  if (values.gaAddToCart != null) snapshot.gaAddToCart = values.gaAddToCart;
  if (values.gaItemsCheckedOut != null) snapshot.gaItemsCheckedOut = values.gaItemsCheckedOut;
  if (values.gaItemsPurchased != null) snapshot.gaItemsPurchased = values.gaItemsPurchased;
  if (values.itemRevenue != null) snapshot.itemRevenue = values.itemRevenue;
  if (values.wooUnits != null) snapshot.wooUnits = values.wooUnits;
  if (values.wooRevenue != null) {
    snapshot.wooRevenue = values.wooRevenue;
    if (snapshot.wooUnits && snapshot.wooUnits > 0) {
      snapshot.wooAov = Number((snapshot.wooRevenue / snapshot.wooUnits).toFixed(2));
    }
  }
  if (snapshot.gaAddToCart != null && snapshot.gaViewItem != null && snapshot.gaViewItem > 0) {
    snapshot.gaViewToCartRate = calculateRate(snapshot.gaAddToCart, snapshot.gaViewItem);
  }
}

function applyClassification(row: ProductRow): ProductRow {
  const primary = row.ranges.find((entry) => entry.range === "7d") ?? row.ranges[0];
  if (!primary) return row;
  const views = primary.gaViewItem ?? 0;
  const carts = primary.gaAddToCart ?? 0;
  const checkout = primary.gaItemsCheckedOut ?? 0;
  const purchases = primary.gaItemsPurchased ?? 0;
  const wooUnits = primary.wooUnits ?? 0;

  if (!views && !wooUnits) {
    row.classification = "DATA_LIGHT";
    row.summary = "No meaningful traffic or orders in the last 7 days.";
    row.recommendedAction = "Promote only when it regains traffic.";
    row.confidence = "low";
    return row;
  }

  if (views >= 40 && wooUnits === 0) {
    row.classification = "HIGH_TRAFFIC_LOW_SALES";
    row.summary = `${views} views but zero orders.`;
    row.recommendedAction = "Tighten PDP story, pricing, and trust badges. Retarget visitors.";
    row.confidence = "medium";
    row.tags = ["FIX_PDP", "RETARGET"];
    return row;
  }

  if (carts >= 5 && purchases === 0) {
    row.classification = "HIGH_CARTS_LOW_SALES";
    row.summary = `${carts} carts with no purchases — checkout friction.`;
    row.recommendedAction = "Audit checkout + payment methods, surface shipping costs early.";
    row.confidence = "high";
    row.tags = ["CHECKOUT" ];
    return row;
  }

  if (wooUnits >= 1 && views < 20) {
    row.classification = "HIGH_SALES_LOW_TRAFFIC";
    row.summary = `${wooUnits} orders despite thin traffic.`;
    row.recommendedAction = "Feature in email + Meta carousel immediately.";
    row.confidence = "high";
    row.tags = ["PROMOTE"];
    return row;
  }

  if (wooUnits >= 1 && carts >= 1) {
    row.classification = "CURRENT_MOMENTUM";
    row.summary = `${wooUnits} orders and ${carts} carts — reliable mover.`;
    row.recommendedAction = "Keep stocked and include in hero modules.";
    row.confidence = "high";
    row.tags = ["PROMOTE", "EMAIL"];
    return row;
  }

  row.classification = "DATA_LIGHT";
  row.summary = "Directional only.";
  row.recommendedAction = "Monitor until more signals accumulate.";
  row.confidence = "low";
  return row;
}

function buildChecklist(rows: ProductRow[]): Snapshot["instrumentationChecklist"] {
  const hasItemIds = rows.some((row) => row.productId != null);
  const hasCheckout = rows.some((row) => (row.ranges.find((entry) => entry.range === "7d")?.gaItemsCheckedOut ?? 0) > 0);
  return [
    {
      label: "GA4 item payload attached",
      status: hasItemIds ? "ready" : "blocked",
      detail: hasItemIds ? "item_id matches Woo product IDs" : "Need to send product_id with GA4 events"
    },
    {
      label: "Begin_checkout emits items",
      status: hasCheckout ? "ready" : "todo",
      detail: hasCheckout ? "Checkout stage visible" : "Emit begin_checkout items for better diagnosis"
    },
    {
      label: "Woo → GA4 nightly join",
      status: "todo",
      detail: "Persist joined data to Supabase for history"
    }
  ];
}

async function main() {
  try {
    const gaResults = await Promise.all(RANGES.map((range) => fetchGaItems(range)));
    const gaItems = gaResults.flat();
    const wooProducts = await fetchWooProducts();
    const wooOrdersEntries = Object.fromEntries(
      await Promise.all(
        RANGES.map(async (range) => {
          const dates = resolveAbsoluteDates(range);
          const aggregates = await fetchWooOrders(dates);
          return [range.label, aggregates];
        })
      )
    ) as Record<RangeLabel, WooOrderAggregate[]>;

    const rows = mergeData({ gaItems, wooProducts, wooOrders: wooOrdersEntries });
    const snapshot: Snapshot = {
      generatedAt: new Date().toISOString(),
      supportedRanges: RANGES.map((range) => range.label),
      rows: rows
        .sort((a, b) => (b.ranges[0]?.wooRevenue ?? 0) - (a.ranges[0]?.wooRevenue ?? 0))
        .slice(0, 25),
      instrumentationChecklist: buildChecklist(rows),
      notes: ["Derived from GA4 item metrics + Woo orders"]
    };

    const outputPath = path.resolve(process.cwd(), "dashboard", "data", "products", "latest.json");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2));
    console.log(`[product-conversion] snapshot written to ${outputPath}`);
    if (supabaseClient) {
      try {
        await supabaseClient
          .from("dashboard_snapshots")
          .upsert({
            key: "product_conversion",
            payload: snapshot,
            mode: "LIVE",
            generated_at: snapshot.generatedAt,
            updated_at: new Date().toISOString()
          });
        console.log("[product-conversion] Supabase dashboard snapshot updated");
      } catch (error) {
        console.warn(
          "[product-conversion] Failed to upsert Supabase snapshot:",
          error instanceof Error ? error.message : error
        );
      }
    } else {
      console.warn("[product-conversion] Supabase env missing; wrote local snapshot only.");
    }
  } catch (error) {
    console.error("Failed to generate product conversion snapshot", error);
    process.exit(1);
  }
}

function resolveAbsoluteDates(range: (typeof RANGES)[number]) {
  const end = new Date();
  const start = new Date(end);
  const days = range.label === "7d" ? 7 : 30;
  start.setUTCDate(end.getUTCDate() - (days - 1));
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  return { startDate: startIso, endDate: endIso };
}

void main();
