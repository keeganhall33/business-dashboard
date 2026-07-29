import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const DEFINITION_VERSION = "woo_paid_net_v1";

function envOrThrow(key) {
  const value = process.env[key];
  if (!value || !String(value).trim()) throw new Error(`Missing ${key}`);
  return String(value).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const out = { startDate: null, endDate: null, dryRun: false, mode: "incremental" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--start" && argv[i + 1]) {
      out.startDate = argv[++i];
    } else if (arg === "--end" && argv[i + 1]) {
      out.endDate = argv[++i];
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--mode" && argv[i + 1]) {
      out.mode = argv[++i];
    }
  }
  return out;
}

function pacificIsoDay(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : null;
}

function parsePacificDayFromIso(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return pacificIsoDay(parsed);
}

function toCents(value) {
  if (value == null) return null;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function checksumForOrder(order) {
  const minimal = {
    id: order.id,
    status: order.status,
    currency: order.currency,
    total: order.total,
    total_refunded: order.total_refunded,
    discount_total: order.discount_total,
    shipping_total: order.shipping_total,
    total_tax: order.total_tax,
    date_created_gmt: order.date_created_gmt,
    date_paid_gmt: order.date_paid_gmt,
    date_modified_gmt: order.date_modified_gmt
  };
  return crypto.createHash("sha256").update(JSON.stringify(minimal)).digest("hex");
}

function normalizeOrderRow(order) {
  const wooOrderId = Number(order.id);
  const status = String(order.status ?? "").toLowerCase();
  const currency = String(order.currency ?? "").toUpperCase();

  const dateCreatedGmt = order.date_created_gmt ?? null;
  const datePaidGmt = order.date_paid_gmt ?? null;
  const dateModifiedGmt = order.date_modified_gmt ?? null;

  const paidPacificDate = parsePacificDayFromIso(datePaidGmt) ?? null;

  const gross = toCents(order.total);
  const refunded = toCents(order.total_refunded) ?? 0;
  const net = gross == null ? null : Math.max(0, gross - refunded);

  const discount = toCents(order.discount_total);
  const shipping = toCents(order.shipping_total);
  const tax = toCents(order.total_tax);

  return {
    woo_order_id: wooOrderId,
    status,
    currency,
    date_created_gmt: dateCreatedGmt,
    date_paid_gmt: datePaidGmt,
    date_modified_gmt: dateModifiedGmt,
    paid_pacific_date: paidPacificDate,
    gross_total_cents: gross,
    refunded_cents: refunded,
    net_revenue_cents: net,
    discount_cents: discount,
    tax_cents: tax,
    shipping_cents: shipping,
    source_modified_gmt: dateModifiedGmt,
    source_checksum: checksumForOrder(order),
    is_deleted: false
  };
}

async function fetchWooOrders(params) {
  const baseUrl = envOrThrow("WOOCOMMERCE_STORE_URL");
  const key = envOrThrow("WOOCOMMERCE_CONSUMER_KEY");
  const secret = envOrThrow("WOOCOMMERCE_CONSUMER_SECRET");

  const statuses = ["any"]; // we persist all statuses; attribution uses canonical filter later.
  const ordersById = new Map();

  const after = params.after;
  const before = params.before;

  let pagesRequested = 0;
  let pagesCompleted = 0;
  let retryCount = 0;
  let malformedCount = 0;

  for (const status of statuses) {
    let page = 1;
    while (true) {
      const url = new URL("/wp-json/wc/v3/orders", baseUrl.replace(/\/$/, "") + "/");
      url.searchParams.set("consumer_key", key);
      url.searchParams.set("consumer_secret", secret);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      url.searchParams.set("status", status);
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");
      if (after) url.searchParams.set("after", after);
      if (before) url.searchParams.set("before", before);

      pagesRequested += 1;

      let attempt = 0;
      let res;
      while (true) {
        attempt += 1;
        res = await fetch(url.toString(), { headers: { accept: "application/json" } });
        if (res.ok) break;
        if (attempt >= 4) throw new Error(`Woo page failed: status=${res.status}`);
        retryCount += 1;
        await sleep(250 * attempt);
      }

      const text = await res.text();
      const rows = JSON.parse(text);
      if (!Array.isArray(rows) || rows.length === 0) break;

      for (const order of rows) {
        if (!order || order.id == null) {
          malformedCount += 1;
          continue;
        }
        if (!ordersById.has(order.id)) ordersById.set(order.id, order);
      }

      pagesCompleted += 1;

      if (rows.length < 100) break;
      page += 1;
      if (page > 200) throw new Error("Woo pagination exceeded safety cap");
    }
  }

  return {
    orders: Array.from(ordersById.values()),
    pagesRequested,
    pagesCompleted,
    retryCount,
    malformedCount
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const primaryCurrency = (process.env.DASHBOARD_PRIMARY_CURRENCY ?? "USD").toUpperCase();

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const now = new Date();
  const overlapDays = 14;
  const defaultAfter = new Date(now.getTime() - overlapDays * 24 * 60 * 60 * 1000).toISOString();

  const after = args.startDate ? `${args.startDate}T00:00:00Z` : defaultAfter;
  const before = args.endDate ? `${args.endDate}T23:59:59Z` : null;

  await supabase.from("woo_ingestion_runs_v1").insert({
    run_id: runId,
    definition_version: DEFINITION_VERSION,
    started_at: startedAt,
    status: "running",
    requested_start_date: args.startDate,
    requested_end_date: args.endDate,
    source_as_of_gmt: new Date().toISOString()
  });

  let rowsFetched = 0;
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsUnchanged = 0;

  let fetched = null;

  try {
    fetched = await fetchWooOrders({ after, before });
    const orders = fetched.orders;
    rowsFetched = orders.length;

    const normalized = orders.map(normalizeOrderRow);

    const currencyMismatches = normalized.filter((row) => row.currency !== primaryCurrency).length;
    if (currencyMismatches) {
      throw new Error(`Mixed currency rows detected (${currencyMismatches}). Expected ${primaryCurrency}.`);
    }

    // Read existing checksums for fetched IDs to compute inserted/updated/unchanged without round-tripping full rows.
    const ids = normalized.map((row) => row.woo_order_id);
    const existing = ids.length
      ? await supabase.from("woo_order_telemetry_v1").select("woo_order_id,source_checksum").in("woo_order_id", ids)
      : { data: [], error: null };
    if (existing.error) throw existing.error;

    const checksumById = new Map((existing.data ?? []).map((r) => [r.woo_order_id, r.source_checksum]));

    normalized.forEach((row) => {
      const prev = checksumById.get(row.woo_order_id);
      if (!prev) rowsInserted += 1;
      else if (prev !== row.source_checksum) rowsUpdated += 1;
      else rowsUnchanged += 1;
    });

    if (!args.dryRun && normalized.length) {
      const { error } = await supabase
        .from("woo_order_telemetry_v1")
        .upsert(normalized, { onConflict: "woo_order_id" });
      if (error) throw error;
    }

    // Proven coverage bounds based on paid_pacific_date.
    const paidDates = normalized.map((r) => r.paid_pacific_date).filter(Boolean).sort();
    const coverageStart = paidDates.length ? paidDates[0] : null;
    const coverageEnd = paidDates.length ? paidDates[paidDates.length - 1] : null;

    const completedAt = new Date().toISOString();
    const runStatus = fetched.malformedCount > 0 ? "partial" : "success";
    const runNote =
      fetched.malformedCount > 0
        ? `Skipped ${fetched.malformedCount} malformed Woo rows (missing id). Coverage may be incomplete.`
        : null;

    await supabase
      .from("woo_ingestion_runs_v1")
      .update({
        completed_at: completedAt,
        status: runStatus,
        pages_requested: fetched.pagesRequested,
        pages_completed: fetched.pagesCompleted,
        retry_count: fetched.retryCount,
        rows_fetched: rowsFetched,
        rows_inserted: rowsInserted,
        rows_updated: rowsUpdated,
        rows_unchanged: rowsUnchanged,
        rows_failed: fetched.malformedCount,
        proven_coverage_start: coverageStart,
        proven_coverage_end: coverageEnd,
        error_summary: runNote
      })
      .eq("run_id", runId);

    // Emit a sanitized summary (no IDs/keys, no PII).
    console.log(
      JSON.stringify(
        {
          mode: args.mode,
          dryRun: args.dryRun,
          definitionVersion: DEFINITION_VERSION,
          requestedStartDate: args.startDate,
          requestedEndDate: args.endDate,
          sourceWindow: { after, before },
          primaryCurrency,
          status: runStatus,
          eligibleOrders: rowsFetched,
          pagesRequested: fetched.pagesRequested,
          pagesCompleted: fetched.pagesCompleted,
          retryCount: fetched.retryCount,
          malformedRows: fetched.malformedCount,
          rowsInserted,
          rowsUpdated,
          rowsUnchanged,
          coverage: { start: coverageStart, end: coverageEnd },
          asOfGmt: completedAt
        },
        null,
        2
      )
    );

    process.exit(0);
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("woo_ingestion_runs_v1")
      .update({
        completed_at: completedAt,
        status: "error",
        pages_requested: typeof fetched?.pagesRequested === "number" ? fetched.pagesRequested : null,
        pages_completed: typeof fetched?.pagesCompleted === "number" ? fetched.pagesCompleted : null,
        retry_count: typeof fetched?.retryCount === "number" ? fetched.retryCount : 0,
        rows_fetched: rowsFetched,
        rows_inserted: rowsInserted,
        rows_updated: rowsUpdated,
        rows_unchanged: rowsUnchanged,
        rows_failed: typeof fetched?.malformedCount === "number" ? fetched.malformedCount : 1,
        error_summary: message
      })
      .eq("run_id", runId);

    // Emit a sanitized error summary.
    console.log(
      JSON.stringify(
        {
          mode: args.mode,
          dryRun: args.dryRun,
          definitionVersion: DEFINITION_VERSION,
          requestedStartDate: args.startDate,
          requestedEndDate: args.endDate,
          primaryCurrency,
          status: "error",
          errorSummary: message,
          eligibleOrders: rowsFetched,
          pagesRequested: typeof fetched?.pagesRequested === "number" ? fetched.pagesRequested : null,
          pagesCompleted: typeof fetched?.pagesCompleted === "number" ? fetched.pagesCompleted : null,
          retryCount: typeof fetched?.retryCount === "number" ? fetched.retryCount : null,
          malformedRows: typeof fetched?.malformedCount === "number" ? fetched.malformedCount : null,
          asOfGmt: completedAt
        },
        null,
        2
      )
    );

    process.exit(1);
  }
}

await main();
