import crypto from "node:crypto";
import { parsePacificDayFromIso } from "../src/lib/woo/woo-ingestion.ts";

function envOrThrow(key) {
  const value = process.env[key];
  if (!value || !String(value).trim()) throw new Error(`Missing ${key}`);
  return String(value).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCents(value) {
  if (value == null) return null;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function idHash(id) {
  return crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 16);
}

async function fetchWooAll({ modifiedAfter }) {
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
    url.searchParams.set("orderby", "modified");
    url.searchParams.set("order", "desc");
    url.searchParams.set("modified_after", modifiedAfter);

    let attempt = 0;
    let res;
    while (true) {
      attempt += 1;
      res = await fetch(url.toString(), { headers: { accept: "application/json" } });
      if (res.ok) break;
      if (attempt >= 4) throw new Error(`Woo page failed: status=${res.status}`);
      await sleep(250 * attempt);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    rows.forEach((o) => {
      if (o?.id == null) return;
      byId.set(Number(o.id), o);
    });

    if (rows.length < 100) break;
    page += 1;
    if (page > 500) throw new Error("Woo pagination exceeded cap");
  }

  return Array.from(byId.values());
}

async function fetchTelemetryAll({ start, end }) {
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
      "woo_order_id,status,currency,date_created_gmt,date_paid_gmt,date_modified_gmt,paid_pacific_date,gross_total_cents,refunded_cents,net_revenue_cents"
    );
    url.searchParams.set("paid_pacific_date", `gte.${start}`);
    url.searchParams.append("paid_pacific_date", `lte.${end}`);
    url.searchParams.set("status", "in.(completed,processing)");
    url.searchParams.set("is_deleted", "eq.false");
    url.searchParams.set("order", "woo_order_id.asc");

    headers.range = `${offset}-${offset + limit - 1}`;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Telemetry fetch failed: status=${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  return out.map((r) => ({
    id: Number(r.woo_order_id),
    status: String(r.status ?? ""),
    currency: String(r.currency ?? "").toUpperCase(),
    paidPacific: String(r.paid_pacific_date ?? ""),
    createdGmt: r.date_created_gmt ?? null,
    paidGmt: r.date_paid_gmt ?? null,
    modifiedGmt: r.date_modified_gmt ?? null,
    gross: r.gross_total_cents == null ? 0 : Number(r.gross_total_cents),
    refunded: r.refunded_cents == null ? 0 : Number(r.refunded_cents),
    net: r.net_revenue_cents == null ? 0 : Number(r.net_revenue_cents)
  }));
}

function summarizeSet(rows) {
  return {
    count: rows.length,
    totals: {
      gross: rows.reduce((s, r) => s + (r.gross ?? 0), 0),
      refunded: rows.reduce((s, r) => s + (r.refunded ?? 0), 0),
      net: rows.reduce((s, r) => s + (r.net ?? 0), 0)
    }
  };
}

function statusDist(rows) {
  const out = {};
  rows.forEach((r) => {
    out[r.status] = (out[r.status] ?? 0) + 1;
  });
  return out;
}

async function main() {
  const start = envOrThrow("DIAG_START");
  const end = envOrThrow("DIAG_END");

  const modifiedAfter = `${start}T00:00:00Z`;

  const wooAll = await fetchWooAll({ modifiedAfter });
  const wooEligible = wooAll
    .map((o) => {
      const status = String(o.status ?? "").toLowerCase();
      const paidPacific = parsePacificDayFromIso(o.date_paid_gmt ?? null);
      const gross = toCents(o.total) ?? 0;
      const refunded = toCents(o.total_refunded) ?? 0;
      const net = Math.max(0, gross - refunded);
      return {
        id: Number(o.id),
        status,
        currency: String(o.currency ?? "").toUpperCase(),
        paidPacific,
        createdGmt: o.date_created_gmt ?? null,
        paidGmt: o.date_paid_gmt ?? null,
        modifiedGmt: o.date_modified_gmt ?? null,
        gross,
        refunded,
        net
      };
    })
    .filter((r) => r.paidPacific && r.paidPacific >= start && r.paidPacific <= end)
    .filter((r) => r.status === "completed" || r.status === "processing");

  const telemetryEligible = await fetchTelemetryAll({ start, end });

  const wooById = new Map(wooEligible.map((r) => [r.id, r]));
  const telById = new Map(telemetryEligible.map((r) => [r.id, r]));

  const onlyWoo = [];
  const onlyTel = [];

  wooById.forEach((v, k) => {
    if (!telById.has(k)) onlyWoo.push(v);
  });
  telById.forEach((v, k) => {
    if (!wooById.has(k)) onlyTel.push(v);
  });

  const wooSum = summarizeSet(wooEligible);
  const telSum = summarizeSet(telemetryEligible);

  const earliestPaid = (rows) => rows.map((r) => r.paidPacific).filter(Boolean).sort()[0] ?? null;
  const latestPaid = (rows) => {
    const dates = rows.map((r) => r.paidPacific).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  };

  const report = {
    range: { start, end },
    woo: {
      eligibleCount: wooSum.count,
      totals: wooSum.totals,
      statusDist: statusDist(wooEligible)
    },
    telemetry: {
      eligibleCount: telSum.count,
      totals: telSum.totals,
      statusDist: statusDist(telemetryEligible)
    },
    delta: {
      grossCents: telSum.totals.gross - wooSum.totals.gross,
      refundedCents: telSum.totals.refunded - wooSum.totals.refunded,
      netCents: telSum.totals.net - wooSum.totals.net
    },
    onlyInWoo: {
      count: onlyWoo.length,
      ids: onlyWoo.map((r) => idHash(r.id)).slice(0, 50),
      paidRange: { earliest: earliestPaid(onlyWoo), latest: latestPaid(onlyWoo) },
      statusDist: statusDist(onlyWoo)
    },
    onlyInTelemetry: {
      count: onlyTel.length,
      ids: onlyTel.map((r) => idHash(r.id)).slice(0, 50),
      paidRange: { earliest: earliestPaid(onlyTel), latest: latestPaid(onlyTel) },
      statusDist: statusDist(onlyTel)
    },
    semantics: {
      ingestion: {
        wooEndpoint: "/wp-json/wc/v3/orders",
        status: "any",
        pagination: { per_page: 100, orderby: "modified", order: "desc" },
        filter: "modified_after >= startDate and local filter paid_pacific_date in [start,end] inclusive"
      }
    }
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

await main();
