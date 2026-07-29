import crypto from "node:crypto";
import { buildWooOrdersQuery, isOrderPaidInPacificRange, parsePacificDayFromIso, subtractDaysIso } from "../src/lib/woo/woo-ingestion.ts";

function envOrThrow(key) {
  const value = process.env[key];
  if (!value || !String(value).trim()) throw new Error(`Missing ${key}`);
  return String(value).trim();
}

function hashIdSet(ids) {
  const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  return crypto.createHash("sha256").update(sorted.join(","), "utf8").digest("hex");
}

function toCents(value) {
  if (value == null) return 0;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

async function fetchWooEligibleIndependent({ startDate, endDate }) {
  const baseUrl = envOrThrow("WOOCOMMERCE_STORE_URL");
  const key = envOrThrow("WOOCOMMERCE_CONSUMER_KEY");
  const secret = envOrThrow("WOOCOMMERCE_CONSUMER_SECRET");

  // Candidate-window rationale:
  // - Use modified_after (not after/before) to avoid created-date omission.
  // - Conservative overlap: startDate - 2 days.
  const modifiedAfter = `${subtractDaysIso(startDate, 2)}T00:00:00Z`;

  const eligibleById = new Map();

  let pagesRequested = 0;
  let pagesCompleted = 0;
  let retryCount = 0;
  let malformedRows = 0;
  let duplicateCandidateIds = 0;

  let page = 1;
  while (true) {
    const url = new URL("/wp-json/wc/v3/orders", baseUrl.replace(/\/$/, "") + "/");
    url.searchParams.set("consumer_key", key);
    url.searchParams.set("consumer_secret", secret);

    const query = buildWooOrdersQuery({ page, after: null, before: null, modifiedAfter });
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

    pagesRequested += 1;

    let attempt = 0;
    let res;
    while (true) {
      attempt += 1;
      res = await fetch(url.toString(), { headers: { accept: "application/json" } });
      if (res.ok) break;
      if (attempt >= 4) throw new Error(`Woo page failed: status=${res.status} page=${page}`);
      retryCount += 1;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const order of rows) {
      if (!order || order.id == null) {
        malformedRows += 1;
        continue;
      }

      const id = Number(order.id);

      // Duplicate detection across pages / overlap windows.
      if (eligibleById.has(id)) duplicateCandidateIds += 1;

      // Local eligibility derivation (independent from telemetry):
      // paid-date in Pacific, inclusive, and status in (completed, processing)
      if (!isOrderPaidInPacificRange(order, startDate, endDate)) continue;

      const status = String(order.status ?? "").toLowerCase();
      if (status !== "completed" && status !== "processing") continue;

      const paidPacificDate = parsePacificDayFromIso(order.date_paid_gmt ?? null);
      if (!paidPacificDate) continue;

      const gross = toCents(order.total);
      const refunded = toCents(order.total_refunded);

      eligibleById.set(id, {
        id,
        currency: String(order.currency ?? "").toUpperCase(),
        paidPacificDate,
        gross,
        refunded,
        net: Math.max(0, gross - refunded)
      });
    }

    pagesCompleted += 1;

    if (rows.length < 100) break;
    page += 1;
    if (page > 500) throw new Error("Woo pagination exceeded safety cap");
  }

  const eligible = Array.from(eligibleById.values()).sort((a, b) => a.id - b.id);

  return {
    candidateFetch: { modifiedAfter, orderby: "modified", order: "desc" },
    pagesRequested,
    pagesCompleted,
    retryCount,
    malformedRows,
    duplicateCandidateIds,
    candidateCount: eligible.length,
    eligibleCount: eligible.length,
    ids: eligible.map((r) => r.id),
    currencySet: Array.from(new Set(eligible.map((r) => r.currency))).sort(),
    totals: {
      gross: eligible.reduce((s, r) => s + r.gross, 0),
      refunded: eligible.reduce((s, r) => s + r.refunded, 0),
      net: eligible.reduce((s, r) => s + r.net, 0)
    }
  };
}

async function fetchTelemetryEligible({ start, end }) {
  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const key = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: "application/json"
  };

  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/woo_order_telemetry_v1`);
    url.searchParams.set(
      "select",
      "woo_order_id,status,currency,paid_pacific_date,gross_total_cents,refunded_cents,net_revenue_cents,is_deleted"
    );
    url.searchParams.set("paid_pacific_date", `gte.${start}`);
    url.searchParams.append("paid_pacific_date", `lte.${end}`);
    url.searchParams.set("status", "in.(completed,processing)");
    url.searchParams.set("is_deleted", "eq.false");
    url.searchParams.set("order", "woo_order_id.asc");

    headers.range = `${offset}-${offset + limit - 1}`;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Telemetry fetch failed: status=${res.status} offset=${offset}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  const normalized = out.map((r) => ({
    id: Number(r.woo_order_id),
    currency: String(r.currency ?? "").toUpperCase(),
    gross: r.gross_total_cents == null ? 0 : Number(r.gross_total_cents),
    refunded: r.refunded_cents == null ? 0 : Number(r.refunded_cents),
    net: r.net_revenue_cents == null ? 0 : Number(r.net_revenue_cents)
  }));

  return {
    count: normalized.length,
    idSetHash: hashIdSet(normalized.map((r) => r.id)),
    currencySet: Array.from(new Set(normalized.map((r) => r.currency))).sort(),
    totals: {
      gross: normalized.reduce((s, r) => s + r.gross, 0),
      refunded: normalized.reduce((s, r) => s + r.refunded, 0),
      net: normalized.reduce((s, r) => s + r.net, 0)
    }
  };
}

async function main() {
  const start = envOrThrow("PARITY_START");
  const end = envOrThrow("PARITY_END");

  const woo = await fetchWooEligibleIndependent({ startDate: start, endDate: end });
  const telemetry = await fetchTelemetryEligible({ start, end });

  const exactMatch =
    woo.eligibleCount === telemetry.count &&
    hashIdSet(woo.ids) === telemetry.idSetHash &&
    woo.totals.gross === telemetry.totals.gross &&
    woo.totals.refunded === telemetry.totals.refunded &&
    woo.totals.net === telemetry.totals.net &&
    JSON.stringify(woo.currencySet) === JSON.stringify(telemetry.currencySet);

  process.stdout.write(
    JSON.stringify(
      {
        range: { start, end },
        woo,
        telemetry,
        exactMatch
      },
      null,
      2
    ) + "\n"
  );
}

await main();
