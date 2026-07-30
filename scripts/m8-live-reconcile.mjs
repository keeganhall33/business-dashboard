import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ART_DIR = path.join(process.cwd(), ".artifacts", "milestone-8-live-reconciled");
fs.mkdirSync(ART_DIR, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function safeWriteJson(filename, value) {
  const p = path.join(ART_DIR, filename);
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
  return p;
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

async function fetchOverview({ start, end }) {
  const token = process.env.DASHBOARD_ADMIN_TOKEN?.trim();
  // If token is set, must authenticate.
  const headers = token ? { "x-dashboard-secret": token } : {};

  const url = new URL("http://localhost:3456/api/dashboard/overview");
  url.searchParams.set("range", "custom");
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);

  const res = await fetch(url, { headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { parseError: true, raw: text.slice(0, 2000) };
  }
  return { status: res.status, json };
}

function pickOverviewFields(overview) {
  const woo = overview?.commerceTelemetry?.woo?.summary ?? null;
  const ga4 = overview?.commerceTelemetry?.ga4?.summary ?? null;
  const funnel = overview?.commerceTelemetry?.funnel?.summary ?? null;
  const meta = overview?.metaAds?.summary ?? null;

  return {
    dataMode: overview?.dataMode ?? null,
    dataModeReason: overview?.dataModeReason ?? null,
    resolvedRange: overview?.range ?? null,
    telemetryHealth: overview?.telemetryHealth ?? null,
    telemetryMetadata: overview?.telemetryMetadata ?? null,
    commerceTelemetry: {
      woo: woo
        ? {
            revenue: woo.revenue ?? null,
            refundedTotal: woo.refundedTotal ?? null,
            grossRevenue: woo.grossRevenue ?? null,
            netRevenue: woo.netRevenue ?? null,
            orders: woo.orders ?? null,
            avgOrderValue: woo.avgOrderValue ?? null,
            source: woo.source ?? null,
            completeness: woo.completeness ?? null,
            asOf: woo.asOf ?? null,
            definitionVersion: woo.definitionVersion ?? null,
            coverageStart: woo.coverageStart ?? null,
            coverageEnd: woo.coverageEnd ?? null,
            comparisonAvailable: woo.comparisonAvailable ?? null
          }
        : null,
      ga4: ga4 ?? null,
      funnel: funnel ?? null
    },
    metaAdsSummary: meta ?? null
  };
}

function dollarsToCents(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

async function supabaseWooAggregate({ start, end }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Get aggregates from telemetry table.
  const { data: rows, error } = await supabase
    .from("woo_order_telemetry_v1")
    .select("net_revenue_cents,refunded_cents")
    .eq("is_deleted", false)
    .gte("paid_pacific_date", start)
    .lte("paid_pacific_date", end);
  if (error) throw error;

  let revenueCents = 0;
  let refundedCents = 0;
  for (const r of rows ?? []) {
    revenueCents += Number(r.net_revenue_cents ?? 0);
    refundedCents += Number(r.refunded_cents ?? 0);
  }

  const orderCount = (rows ?? []).length;

  // Coverage + definition from latest successful ingestion run that proves this window.
  const { data: runs, error: runErr } = await supabase
    .from("woo_ingestion_runs_v1")
    .select("definition_version,proven_coverage_start,proven_coverage_end,source_as_of_gmt,completed_at,status")
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(25);
  if (runErr) throw runErr;

  const covering = (runs ?? []).find((run) => {
    const cs = run.proven_coverage_start;
    const ce = run.proven_coverage_end;
    return typeof cs === "string" && typeof ce === "string" && cs <= start && ce >= end;
  });

  return {
    start,
    end,
    net_revenue_cents: revenueCents,
    refunded_cents: refundedCents,
    orders: orderCount,
    aov_cents: orderCount > 0 ? Math.round(revenueCents / orderCount) : null,
    coverage: covering
      ? {
          proven_coverage_start: covering.proven_coverage_start ?? null,
          proven_coverage_end: covering.proven_coverage_end ?? null,
          definition_version: covering.definition_version ?? null,
          source_as_of_gmt: covering.source_as_of_gmt ?? null,
          completed_at: covering.completed_at ?? null
        }
      : null
  };
}

function evaluateRange({ label, expected }, apiFields, sourceAgg) {
  const apiWoo = apiFields.woo;

  const apiRevenueCents = dollarsToCents(apiWoo?.revenue ?? null);
  const apiRefundedCents = dollarsToCents(apiWoo?.refundedTotal ?? null);
  const apiOrders = apiWoo?.orders ?? null;
  const apiAovCents = dollarsToCents(apiWoo?.avgOrderValue ?? null);

  const sourceRevenueCents = sourceAgg?.net_revenue_cents ?? null;
  const sourceRefundedCents = sourceAgg?.refunded_cents ?? null;
  const sourceOrders = sourceAgg?.orders ?? null;
  const sourceAovCents = sourceAgg?.aov_cents ?? null;

  const revenueMatch = apiRevenueCents === sourceRevenueCents;
  const refundedMatch = apiRefundedCents === sourceRefundedCents;
  const ordersMatch = apiOrders === sourceOrders;
  const aovMatch = apiAovCents === sourceAovCents;

  const completeness = apiWoo?.completeness ?? null;
  const sourceCover = sourceAgg?.coverage;
  const coverageMatch = sourceCover && apiFields.telemetryMetadata
    ? (apiFields.telemetryMetadata.requestedStartDate === apiFields.resolvedRange?.startDate && apiFields.telemetryMetadata.requestedEndDate === apiFields.resolvedRange?.endDate)
    : null;

  const pass = revenueMatch && refundedMatch && ordersMatch && aovMatch && apiFields.dataMode !== "SEED_DATA";

  return {
    label,
    requested: expected.requested,
    resolved: apiFields.resolvedRange,
    http_status: expected.http_status,
    dataMode: apiFields.dataMode,
    woo_source: apiWoo?.source ?? null,
    woo_completeness: completeness,
    coverage: {
      api_telemetry_metadata: apiFields.telemetryMetadata ?? null,
      source_proven_coverage: sourceCover ?? null,
      coverage_request_matches_resolved_range: coverageMatch
    },
    as_of: {
      api_asOf: apiWoo?.asOf ?? null,
      source_as_of_gmt: sourceCover?.source_as_of_gmt ?? null
    },
    metrics: {
      api_revenue_cents: apiRevenueCents,
      source_revenue_cents: sourceRevenueCents,
      api_orders: apiOrders,
      source_orders: sourceOrders,
      api_aov_cents: apiAovCents,
      source_aov_cents: sourceAovCents,
      source_refunded_cents: sourceRefundedCents,
      api_refunded_cents: apiRefundedCents
    },
    result: {
      revenue_match: revenueMatch,
      refunded_match: refundedMatch,
      orders_match: ordersMatch,
      aov_match: aovMatch,
      pass
    }
  };
}

async function main() {
  // Compute canonical ranges (Pacific date semantics assumed by API resolver).
  const now = new Date();
  const today = toIsoDate(now);
  const yesterday = addDays(today, -1);

  const prev7Start = addDays(yesterday, -6);
  const prev30Start = addDays(yesterday, -29);

  const ranges = [
    { key: "prev_completed_7d", start: prev7Start, end: yesterday, expectation: "in_coverage_exact" },
    { key: "prev_completed_30d", start: prev30Start, end: yesterday, expectation: "in_coverage_exact" },
    { key: "custom_completed", start: prev7Start, end: addDays(prev7Start, 3), expectation: "in_coverage_exact" },
    { key: "future_empty", start: "2099-01-01", end: "2099-01-07", expectation: "empty" },
    { key: "dst_span", start: "2026-03-05", end: "2026-03-15", expectation: "dst_span_if_available" }
  ];

  // Live-mode proof: use the prev 7d window as the initial proof.
  const proofFetch = await fetchOverview({ start: prev7Start, end: yesterday });
  assert(proofFetch.status === 200, `overview http ${proofFetch.status}`);
  const proofFields = pickOverviewFields(proofFetch.json);
  safeWriteJson("live-mode-proof.json", proofFields);

  if (proofFields.dataMode === "SEED_DATA") {
    console.error("BLOCKED_SEED_MODE");
    process.exit(50);
  }

  const reconciliation = {
    generated_at: new Date().toISOString(),
    server: "http://localhost:3456",
    ranges_tested: ranges.map((r) => ({ key: r.key, start: r.start, end: r.end, expectation: r.expectation })),
    results: []
  };

  const sourceReconciliation = {
    generated_at: new Date().toISOString(),
    checks: []
  };

  for (const r of ranges) {
    const api = await fetchOverview({ start: r.start, end: r.end });
    const apiFields = pickOverviewFields(api.json);

    let sourceAgg = null;
    try {
      sourceAgg = await supabaseWooAggregate({ start: r.start, end: r.end });
    } catch (err) {
      sourceAgg = { error: err instanceof Error ? err.message : String(err) };
    }

    const row = evaluateRange(
      { label: r.key, expected: { requested: { start: r.start, end: r.end }, http_status: api.status } },
      { ...apiFields, dataMode: apiFields.dataMode ?? null, woo: apiFields.commerceTelemetry?.woo ?? null, telemetryMetadata: apiFields.telemetryMetadata?.woo ?? null },
      sourceAgg && !sourceAgg.error ? sourceAgg : null
    );

    reconciliation.results.push(row);

    if (sourceAgg && !sourceAgg.error) {
      sourceReconciliation.checks.push({
        range: { start: r.start, end: r.end },
        expected_exact_equality: ["net_revenue_cents", "refunded_cents", "orders", "coverage.definition_version", "coverage.proven_coverage_start", "coverage.proven_coverage_end"],
        source: sourceAgg
      });
    } else {
      sourceReconciliation.checks.push({ range: { start: r.start, end: r.end }, source_error: sourceAgg?.error ?? "unknown" });
    }

    // Per-range raw snapshot (sanitized selected fields only)
    safeWriteJson(`overview-${r.key}.json`, apiFields);
  }

  safeWriteJson("reconciliation-report.json", reconciliation);
  safeWriteJson("source-reconciliation.json", sourceReconciliation);

  console.log("OK");
}

main().catch((err) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});
