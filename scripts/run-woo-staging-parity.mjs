import crypto from "node:crypto";

function envOrThrow(key) {
  const value = process.env[key];
  if (!value || !String(value).trim()) throw new Error(`Missing ${key}`);
  return String(value).trim();
}

function toCents(value) {
  if (value == null) return null;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
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

function hashIdSet(ids) {
  const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  const digest = crypto.createHash("sha256").update(sorted.join(","), "utf8").digest("hex");
  return { count: sorted.length, sha256: digest };
}

async function fetchWooAll({ after, before }) {
  const baseUrl = envOrThrow("WOOCOMMERCE_STORE_URL");
  const key = envOrThrow("WOOCOMMERCE_CONSUMER_KEY");
  const secret = envOrThrow("WOOCOMMERCE_CONSUMER_SECRET");

  const byId = new Map();
  let page = 1;
  while (true) {
    const url = new URL("/wp-json/wc/v3/orders", baseUrl.replace(/\/$/, "") + "/");
    url.searchParams.set("consumer_key", key);
    url.searchParams.set("consumer_secret", secret);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("status", "any");
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");
    if (after) url.searchParams.set("after", after);
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Woo fetch failed: status=${res.status} page=${page}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const o of rows) {
      if (!o || o.id == null) continue;
      byId.set(Number(o.id), o);
    }
    if (rows.length < 100) break;
    page += 1;
    if (page > 200) throw new Error("Woo pagination exceeded safety cap");
  }

  return { pageCount: page, orders: Array.from(byId.values()) };
}

function normalizeWoo(order) {
  const wooOrderId = Number(order.id);
  const currency = String(order.currency ?? "").toUpperCase();
  const paidPacificDate = parsePacificDayFromIso(order.date_paid_gmt ?? null);
  const gross = toCents(order.total);
  const refunded = toCents(order.total_refunded) ?? 0;
  const net = gross == null ? null : Math.max(0, gross - refunded);
  return { wooOrderId, currency, paidPacificDate, gross, refunded, net };
}

async function fetchStagingAll({ afterPacific, beforePacific }) {
  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  // Paginate REST because order ids are non-contiguous.
  const out = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url = new URL("/rest/v1/woo_order_telemetry_v1", supabaseUrl.replace(/\/$/, "") + "/");
    url.searchParams.set("select", "woo_order_id,currency,paid_pacific_date,gross_total_cents,refunded_cents,net_revenue_cents");
    url.searchParams.set("paid_pacific_date", `gte.${afterPacific}`);
    url.searchParams.append("paid_pacific_date", `lte.${beforePacific}`);
    url.searchParams.set("order", "woo_order_id.asc");

    const headers = {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: "application/json",
      range: `${offset}-${offset + limit - 1}`
    };

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Staging REST fetch failed: status=${res.status} offset=${offset}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) out.push(r);
    if (rows.length < limit) break;
    offset += limit;
    if (offset > 500_000) throw new Error("Staging REST pagination exceeded safety cap");
  }

  return out.map((r) => ({
    wooOrderId: Number(r.woo_order_id),
    currency: String(r.currency ?? "").toUpperCase(),
    paidPacificDate: r.paid_pacific_date,
    gross: r.gross_total_cents == null ? null : Number(r.gross_total_cents),
    refunded: r.refunded_cents == null ? null : Number(r.refunded_cents),
    net: r.net_revenue_cents == null ? null : Number(r.net_revenue_cents)
  }));
}

function summarize(rows) {
  const paid = rows.filter((r) => r.paidPacificDate);
  const paidDates = paid.map((r) => r.paidPacificDate).sort();
  const currencySet = Array.from(new Set(paid.map((r) => r.currency))).sort();
  return {
    eligible: paid.length,
    coverage: { start: paidDates[0] ?? null, end: paidDates.length ? paidDates[paidDates.length - 1] : null },
    currencies: currencySet,
    totals: {
      gross: paid.reduce((s, r) => s + (r.gross ?? 0), 0),
      refunded: paid.reduce((s, r) => s + (r.refunded ?? 0), 0),
      net: paid.reduce((s, r) => s + (r.net ?? 0), 0)
    },
    idSet: hashIdSet(paid.map((r) => r.wooOrderId))
  };
}

async function main() {
  const start = envOrThrow("PARITY_START"); // YYYY-MM-DD
  const end = envOrThrow("PARITY_END"); // YYYY-MM-DD

  const after = `${start}T00:00:00Z`;
  const before = `${end}T23:59:59Z`;

  const woo = await fetchWooAll({ after, before });
  const wooRows = woo.orders.map(normalizeWoo);

  const stagingRows = await fetchStagingAll({ afterPacific: start, beforePacific: end });

  const wooSummary = summarize(wooRows);
  const stagingSummary = summarize(stagingRows);

  const exact =
    wooSummary.idSet.sha256 === stagingSummary.idSet.sha256 &&
    wooSummary.totals.gross === stagingSummary.totals.gross &&
    wooSummary.totals.refunded === stagingSummary.totals.refunded &&
    wooSummary.totals.net === stagingSummary.totals.net;

  const report = {
    range: { start, end },
    woo: { pages: woo.pageCount, ...wooSummary },
    staging: stagingSummary,
    exactMatch: exact
  };

  // Single JSON output for artifact capture.
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

await main();
