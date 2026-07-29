import crypto from "node:crypto";

function envOrThrow(key) {
  const value = process.env[key];
  if (!value || !String(value).trim()) throw new Error(`Missing ${key}`);
  return String(value).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCents(value) {
  if (value == null) return 0;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return 0;
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

function hashId(id) {
  return crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 16);
}

function hashIdSet(ids) {
  const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  return crypto.createHash("sha256").update(sorted.join(","), "utf8").digest("hex");
}

async function fetchWooPage({ baseUrl, key, secret, page, after, before, modifiedAfter, orderby }) {
  const url = new URL("/wp-json/wc/v3/orders", baseUrl.replace(/\/$/, "") + "/");
  url.searchParams.set("consumer_key", key);
  url.searchParams.set("consumer_secret", secret);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("status", "any");
  url.searchParams.set("orderby", orderby);
  url.searchParams.set("order", "desc");
  if (modifiedAfter) url.searchParams.set("modified_after", modifiedAfter);
  if (after) url.searchParams.set("after", after);
  if (before) url.searchParams.set("before", before);

  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (res.ok) return { ok: true, attempt, rows: await res.json() };
    if (attempt >= 4) throw new Error(`Woo page failed: status=${res.status} page=${page}`);
    await sleep(250 * attempt);
  }
}

function normalizeEligible(order) {
  const id = Number(order.id);
  const status = String(order.status ?? "").toLowerCase();
  const paidPacificDate = parsePacificDayFromIso(order.date_paid_gmt ?? null);
  if (!paidPacificDate) return null;
  if (status !== "completed" && status !== "processing") return null;
  const currency = String(order.currency ?? "").toUpperCase();
  const gross = toCents(order.total);
  const refunded = toCents(order.total_refunded);
  const net = Math.max(0, gross - refunded);
  return { id, status, currency, paidPacificDate, gross, refunded, net, createdGmt: order.date_created_gmt ?? null, modifiedGmt: order.date_modified_gmt ?? null };
}

async function fetchWooEligibleOld({ start, end }) {
  const baseUrl = envOrThrow("WOOCOMMERCE_STORE_URL");
  const key = envOrThrow("WOOCOMMERCE_CONSUMER_KEY");
  const secret = envOrThrow("WOOCOMMERCE_CONSUMER_SECRET");

  const after = `${start}T00:00:00Z`;
  const before = `${end}T23:59:59Z`;

  const byId = new Map();
  let page = 1;
  let pages = 0;

  while (true) {
    const { rows } = await fetchWooPage({ baseUrl, key, secret, page, after, before, modifiedAfter: null, orderby: "date" });
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const o of rows) {
      const eligible = normalizeEligible(o);
      if (!eligible) continue;
      if (eligible.paidPacificDate < start || eligible.paidPacificDate > end) continue;
      byId.set(eligible.id, eligible);
    }
    pages += 1;
    if (rows.length < 100) break;
    page += 1;
    if (page > 200) throw new Error("Old comparator pagination cap");
  }

  return { byId, pagesRequested: pages, after, before };
}

async function fetchWooEligibleCorrected({ start, end }) {
  const baseUrl = envOrThrow("WOOCOMMERCE_STORE_URL");
  const key = envOrThrow("WOOCOMMERCE_CONSUMER_KEY");
  const secret = envOrThrow("WOOCOMMERCE_CONSUMER_SECRET");

  // overlap rationale: capture orders modified shortly after payment or refund transitions.
  const overlapDays = 2;
  const startMinus2 = new Date(`${start}T00:00:00Z`);
  startMinus2.setUTCDate(startMinus2.getUTCDate() - overlapDays);
  const modifiedAfter = startMinus2.toISOString().slice(0, 10) + "T00:00:00Z";

  const byId = new Map();
  let page = 1;
  let pages = 0;

  while (true) {
    const { rows } = await fetchWooPage({ baseUrl, key, secret, page, after: null, before: null, modifiedAfter, orderby: "modified" });
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const o of rows) {
      const eligible = normalizeEligible(o);
      if (!eligible) continue;
      if (eligible.paidPacificDate < start || eligible.paidPacificDate > end) continue;
      byId.set(eligible.id, eligible);
    }
    pages += 1;
    if (rows.length < 100) break;
    page += 1;
    if (page > 500) throw new Error("Corrected comparator pagination cap");
  }

  return { byId, pagesRequested: pages, modifiedAfter };
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
    url.searchParams.set("select", "woo_order_id,status,currency,paid_pacific_date,gross_total_cents,refunded_cents,net_revenue_cents,is_deleted");
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

  const ids = out.map((r) => Number(r.woo_order_id));
  const totals = {
    gross: out.reduce((s, r) => s + (r.gross_total_cents == null ? 0 : Number(r.gross_total_cents)), 0),
    refunded: out.reduce((s, r) => s + (r.refunded_cents == null ? 0 : Number(r.refunded_cents)), 0),
    net: out.reduce((s, r) => s + (r.net_revenue_cents == null ? 0 : Number(r.net_revenue_cents)), 0)
  };

  return { count: ids.length, idSetHash: hashIdSet(ids), totals };
}

function summarizeEligible(byId) {
  const rows = Array.from(byId.values());
  const ids = rows.map((r) => r.id);
  const currencySet = Array.from(new Set(rows.map((r) => r.currency))).sort();
  return {
    count: rows.length,
    idSetHash: hashIdSet(ids),
    currencySet,
    totals: {
      gross: rows.reduce((s, r) => s + r.gross, 0),
      refunded: rows.reduce((s, r) => s + r.refunded, 0),
      net: rows.reduce((s, r) => s + r.net, 0)
    }
  };
}

async function main() {
  const start = envOrThrow("DIFF_START");
  const end = envOrThrow("DIFF_END");

  const telemetry = await fetchTelemetryEligible({ start, end });

  const old = await fetchWooEligibleOld({ start, end });
  const corrected = await fetchWooEligibleCorrected({ start, end });

  const onlyInCorrected = [];
  const onlyInOld = [];

  corrected.byId.forEach((v, k) => {
    if (!old.byId.has(k)) onlyInCorrected.push(v);
  });
  old.byId.forEach((v, k) => {
    if (!corrected.byId.has(k)) onlyInOld.push(v);
  });

  const oldSum = summarizeEligible(old.byId);
  const corrSum = summarizeEligible(corrected.byId);

  const report = {
    range: { start, end },
    telemetry,
    old: {
      exactMatch: oldSum.count === telemetry.count && oldSum.idSetHash === telemetry.idSetHash && oldSum.totals.gross === telemetry.totals.gross && oldSum.totals.refunded === telemetry.totals.refunded && oldSum.totals.net === telemetry.totals.net,
      pagesRequested: old.pagesRequested,
      query: { after: old.after, before: old.before, orderby: "date", order: "desc" },
      ...oldSum
    },
    corrected: {
      exactMatch: corrSum.count === telemetry.count && corrSum.idSetHash === telemetry.idSetHash && corrSum.totals.gross === telemetry.totals.gross && corrSum.totals.refunded === telemetry.totals.refunded && corrSum.totals.net === telemetry.totals.net,
      pagesRequested: corrected.pagesRequested,
      query: { modifiedAfter: corrected.modifiedAfter, orderby: "modified", order: "desc" },
      ...corrSum
    },
    delta: {
      onlyInCorrected: {
        count: onlyInCorrected.length,
        ids: onlyInCorrected.map((r) => hashId(r.id)),
        reason: "Excluded by old comparator because Woo after/before filter applies to created date; order(s) were created outside the window but paid inside it."
      },
      onlyInOld: {
        count: onlyInOld.length,
        ids: onlyInOld.map((r) => hashId(r.id)),
        reason: "Included by old comparator due to created-date window; paid date (Pacific) fell outside requested window, so corrected comparator excludes."
      },
      totalsDeltaCorrectedMinusOld: {
        gross: corrSum.totals.gross - oldSum.totals.gross,
        refunded: corrSum.totals.refunded - oldSum.totals.refunded,
        net: corrSum.totals.net - oldSum.totals.net
      }
    }
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

await main();
