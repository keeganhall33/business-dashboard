#!/usr/bin/env tsx
import { Command } from "commander";
import fetch from "node-fetch";
import * as process from "node:process";
import { Pool } from "pg";

const program = new Command();
const SUPABASE_SCHEMA = "exec_dashboard";
const ORDER_TABLE = `${SUPABASE_SCHEMA}.raw_woocommerce_orders`;
const LINE_ITEM_TABLE = `${SUPABASE_SCHEMA}.raw_woocommerce_order_items`;

program
  .option("--lookback-days <number>", "Number of days to look back", (value) => parseInt(value, 10))
  .option("--from <date>", "ISO date (YYYY-MM-DD) to start from")
  .option("--to <date>", "ISO date (YYYY-MM-DD) to end at (default: today)")
  .option("--dry-run", "Fetch + normalize but skip Supabase writes", true)
  .option("--write", "Actually upsert into Supabase", false)
  .option("--limit-pages <number>", "Maximum Woo API pages to fetch", (value) => parseInt(value, 10));

program.parse(process.argv);

const options = program.opts<{
  lookbackDays?: number;
  from?: string;
  to?: string;
  dryRun?: boolean;
  write?: boolean;
  limitPages?: number;
}>();

const dryRun = options.write ? false : true;

function envOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function parseDateInput(dateStr: string): Date {
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${dateStr}`);
  }
  return parsed;
}

function computeDateWindow() {
  const toDate = options.to ? parseDateInput(options.to) : new Date();
  toDate.setUTCHours(23, 59, 59, 999);
  let fromDate: Date;
  if (options.from) {
    fromDate = parseDateInput(options.from);
  } else if (options.lookbackDays && options.lookbackDays > 0) {
    fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - (options.lookbackDays - 1));
  } else {
    throw new Error("Provide either --lookback-days or --from");
  }
  fromDate.setUTCHours(0, 0, 0, 0);
  if (fromDate > toDate) {
    throw new Error("from date must be <= to date");
  }
  return { fromDate, toDate };
}

async function fetchWooOrders(
  baseUrl: string,
  key: string,
  secret: string,
  fromIso: string,
  toIso?: string,
  limitPages?: number
) {
  const perPage = 100;
  let page = 1;
  const orders: any[] = [];
  while (true) {
    if (limitPages && page > limitPages) break;
    const url = new URL("/wp-json/wc/v3/orders", baseUrl);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("status", "completed,processing");
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");
    url.searchParams.set("after", fromIso);
    if (toIso) {
      url.searchParams.set("before", toIso);
    }
    const response = await fetch(url, {
      headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64") }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Woo API error ${response.status}: ${text}`);
    }
    const data = (await response.json()) as any[];
    orders.push(...data);
    console.error(`[dry-run] fetched page ${page} (${data.length} orders, cumulative ${orders.length})`);
    if (data.length < perPage) break;
    page += 1;
  }
  return orders;
}

function normalizeOrders(rawOrders: any[]) {
  const statuses: Record<string, number> = {};
  const lineItems: { order_id: number; line_item_id: number; product_id: number | null; product_name: string; product_sku: string | null; quantity: number; subtotal: number; total: number; metadata: any }[] = [];
  const orders = rawOrders.map((order) => {
    const status = order.status ?? "unknown";
    statuses[status] = (statuses[status] ?? 0) + 1;
    for (const item of order.line_items ?? []) {
      lineItems.push({
        order_id: order.id,
        line_item_id: item.id,
        product_id: item.product_id ?? null,
        product_name: item.name ?? "",
        product_sku: item.sku ?? null,
        quantity: item.quantity ?? 0,
        subtotal: Number(item.subtotal ?? 0),
        total: Number(item.total ?? 0),
        metadata: item.meta_data ?? []
      });
    }
    return {
      order_id: order.id,
      order_number: order.number ?? String(order.id),
      status,
      created_at: order.date_created,
      updated_at: order.date_modified,
      completed_at: order.date_completed ?? order.date_paid ?? null,
      currency: order.currency,
      subtotal: Number(order.subtotal ?? order.total ?? 0),
      discount_total: Number(order.discount_total ?? 0),
      shipping_total: Number(order.shipping_total ?? 0),
      tax_total: Number(order.total_tax ?? 0),
      total: Number(order.total ?? 0),
      total_items: order.line_items?.length ?? 0,
      customer_id: order.customer_id ?? null,
      customer_email: (order.billing?.email ?? "").toLowerCase().trim() || null,
      coupon_codes: (order.coupon_lines ?? []).map((line: any) => line.code).filter(Boolean),
      payment_method: order.payment_method ?? null,
      payment_method_title: order.payment_method_title ?? null,
      meta: order.meta_data ?? []
    };
  });
  return { orders, lineItems, statuses };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function createDbPool() {
  const connectionString = envOrThrow("SUPABASE_DB_DSN");
  return new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false }
  });
}

const ORDER_COLUMNS = [
  "order_id",
  "order_number",
  "status",
  "created_at",
  "updated_at",
  "completed_at",
  "currency",
  "subtotal",
  "discount_total",
  "shipping_total",
  "tax_total",
  "total",
  "total_items",
  "customer_id",
  "customer_email",
  "coupon_codes",
  "payment_method",
  "payment_method_title",
  "meta"
] as const;

const LINE_ITEM_COLUMNS = [
  "order_id",
  "line_item_id",
  "product_id",
  "product_name",
  "product_sku",
  "quantity",
  "subtotal",
  "total",
  "metadata"
] as const;

const JSON_COLUMNS = new Set(["meta", "metadata"]);

function prepareValue(column: string, value: unknown) {
  if (JSON_COLUMNS.has(column)) {
    if (value === null || value === undefined) return null;
    return JSON.stringify(value);
  }
  return value ?? null;
}

function buildInsertStatement(
  table: string,
  columns: readonly string[],
  rows: Record<string, unknown>[],
  conflictColumns: readonly string[]
) {
  const values: unknown[] = [];
  const valueClauses = rows
    .map((row) => {
      const placeholders = columns.map((column) => {
        values.push(prepareValue(column, row[column]));
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    })
    .join(", ");

  const updateAssignments = columns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  const text = `
    INSERT INTO ${table} (${columns.join(", ")})
    VALUES ${valueClauses}
    ON CONFLICT (${conflictColumns.join(", ")})
    DO UPDATE SET ${updateAssignments};
  `;

  return { text, values };
}

async function upsertDirect(
  pool: Pool,
  table: string,
  columns: readonly string[],
  rows: Record<string, unknown>[],
  conflictColumns: readonly string[]
) {
  if (!rows.length) return;
  const batches = chunk(rows, 200);
  for (const batch of batches) {
    const { text, values } = buildInsertStatement(table, columns, batch, conflictColumns);
    await pool.query(text, values);
  }
}

function sanitizeOrderForLog(order?: Record<string, unknown>) {
  if (!order) return null;
  return { ...order, customer_email: order.customer_email ? "[redacted]" : order.customer_email };
}

async function main() {
  const { fromDate, toDate } = computeDateWindow();
  const baseUrl = envOrThrow("WOO_BASE_URL");
  const key = envOrThrow("WOO_CONSUMER_KEY");
  const secret = envOrThrow("WOO_CONSUMER_SECRET");
  console.log(`Backfill window: ${fromDate.toISOString()} → ${toDate.toISOString()} (dryRun=${dryRun})`);
  console.log(`Direct DB target: ${ORDER_TABLE} & ${LINE_ITEM_TABLE}`);
  const rawOrders = await fetchWooOrders(
    baseUrl,
    key,
    secret,
    fromDate.toISOString(),
    toDate.toISOString(),
    options.limitPages
  );
  const rawOrdersInRange = rawOrders.filter((order) => {
    const completed = order.date_completed ?? order.date_created ?? null;
    if (!completed) return false;
    const completedDate = new Date(completed);
    return completedDate >= fromDate && completedDate <= toDate;
  });
  const { orders, lineItems, statuses } = normalizeOrders(rawOrdersInRange);
  const earliest = orders.reduce((min, order) => {
    if (!min) return order.created_at;
    return min < order.created_at ? min : order.created_at;
  }, null as string | null);
  const latest = orders.reduce((max, order) => {
    if (!max) return order.created_at;
    return max > order.created_at ? max : order.created_at;
  }, null as string | null);

  console.log("Summary:\n", {
    totalOrdersFetched: rawOrders.length,
    totalOrdersInRange: orders.length,
    totalLineItems: lineItems.length,
    earliestOrder: earliest,
    latestOrder: latest,
    statusCounts: statuses
  });

  const writeOrders = orders.filter((order) => !["trash", "refunded", "cancelled", "failed"].includes(order.status ?? ""));
  const writeLineItems = lineItems;

  if (dryRun) {
    console.log("Dry-run only. Skipping writes.");
    console.log("Sample order:", sanitizeOrderForLog(orders[0]));
    console.log("Sample line item:", lineItems[0] ?? null);
    return;
  }

  const pool = createDbPool();
  console.log(
    `Writing ${writeOrders.length} orders + ${writeLineItems.length} line items directly into ${SUPABASE_SCHEMA} ...`
  );
  try {
    await upsertDirect(pool, ORDER_TABLE, ORDER_COLUMNS, writeOrders, ["order_id"]);
    await upsertDirect(pool, LINE_ITEM_TABLE, LINE_ITEM_COLUMNS, writeLineItems, ["line_item_id", "order_id"]);
  } finally {
    await pool.end();
  }
  console.log("Write complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
