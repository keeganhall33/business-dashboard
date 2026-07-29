import { fetchWooEligibleSet, hashIdSet } from "../src/lib/woo/woo-parity.ts";

function envOrThrow(key) {
  const value = process.env[key];
  if (!value || !String(value).trim()) throw new Error(`Missing ${key}`);
  return String(value).trim();
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
    totals: {
      gross: normalized.reduce((s, r) => s + r.gross, 0),
      refunded: normalized.reduce((s, r) => s + r.refunded, 0),
      net: normalized.reduce((s, r) => s + r.net, 0)
    }
  };
}

function totalsForWoo(rows) {
  return {
    gross: rows.reduce((s, r) => s + r.grossCents, 0),
    refunded: rows.reduce((s, r) => s + r.refundedCents, 0),
    net: rows.reduce((s, r) => s + r.netCents, 0)
  };
}

async function main() {
  const start = envOrThrow("PARITY_START");
  const end = envOrThrow("PARITY_END");

  const woo = await fetchWooEligibleSet(
    {
      baseUrl: envOrThrow("WOOCOMMERCE_STORE_URL"),
      consumerKey: envOrThrow("WOOCOMMERCE_CONSUMER_KEY"),
      consumerSecret: envOrThrow("WOOCOMMERCE_CONSUMER_SECRET"),
      startDate: start,
      endDate: end,
      overlapDays: 2
    },
    fetch
  );

  const telemetry = await fetchTelemetryEligible({ start, end });

  const wooIds = woo.rows.map((r) => r.id);
  const wooTotals = totalsForWoo(woo.rows);

  const exactMatch =
    woo.rows.length === telemetry.count &&
    hashIdSet(wooIds) === telemetry.idSetHash &&
    wooTotals.gross === telemetry.totals.gross &&
    wooTotals.refunded === telemetry.totals.refunded &&
    wooTotals.net === telemetry.totals.net;

  const report = {
    range: { start, end },
    woo: {
      candidateCount: woo.stats.candidateCount,
      eligibleCount: woo.stats.eligibleCount,
      pagesRequested: woo.stats.pagesRequested,
      pagesCompleted: woo.stats.pagesCompleted,
      retryCount: woo.stats.retryCount,
      duplicateCandidateIds: woo.stats.duplicateCandidateIds,
      malformedRows: woo.stats.malformedRows,
      idSetHash: hashIdSet(wooIds),
      totals: wooTotals
    },
    telemetry,
    exactMatch
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

await main();
