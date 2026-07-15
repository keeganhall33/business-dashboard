import test from "node:test";
import assert from "node:assert/strict";

import { buildHealthEvents, evaluateIncidentsForSource, buildIncidentSummary } from "../src/lib/telemetry/healthMonitor.ts";
import type { CommerceTelemetryResult } from "../src/lib/supabase/queries";
import type { TelemetryMetadata, TelemetryHealth } from "../src/lib/types/dashboard";

test("buildHealthEvents captures fallback and warnings", () => {
  const metadata = {
    woo: {
      source: "woo",
      requestedStartDate: "2026-07-01",
      requestedEndDate: "2026-07-07",
      timezone: "America/Los_Angeles",
      generatedAt: "2026-07-07T12:00:00Z",
      freshnessStatus: "fresh",
      coverageStatus: "complete",
      includesPartialDay: false,
      includesFutureDates: true,
      latestCompletedBusinessDate: "2026-07-06",
      warningCodes: ["future_dates"]
    } satisfies TelemetryMetadata
  };
  const health = {
    woo: {
      source: "woo",
      status: "warning",
      reasons: [],
      warningCodes: []
    }
  } satisfies Partial<Record<string, TelemetryHealth>>;
  const commerce: CommerceTelemetryResult = {
    startDate: "2026-07-01",
    endDate: "2026-07-07",
    woo: { summary: { revenue: 100, orders: 2, avgOrderValue: 50, discountTotal: null, shippingTotal: null, taxTotal: null, items: null }, timeseries: [] },
    wooDetails: { payload: { summary: { revenue: 100, orders: 2, avgOrderValue: 50, discountTotal: null, shippingTotal: null, taxTotal: null, items: null }, timeseries: [] }, fallbackToLegacy: true },
    wooLatencyMs: 1200,
    ga4LatencyMs: null,
    funnelLatencyMs: null
  };

  const intelligence: Parameters<typeof buildHealthEvents>[0]["intelligence"] = {
    metadata,
    health,
    executiveInsights: { brief: null, trends: [] }
  };

  const events = buildHealthEvents({
    observedAt: "2026-07-07T15:00:00Z",
    range: { startDate: "2026-07-01", endDate: "2026-07-07" },
    intelligence,
    commerce,
    deploymentVersion: "abc123"
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].fallback, true);
  assert.deepEqual(events[0].warningCodes, ["future_dates"]);
});

test("evaluateIncidentsForSource detects stale, coverage, fallback, latency", () => {
  const meta: TelemetryMetadata = {
    source: "woo",
    requestedStartDate: "2026-07-01",
    requestedEndDate: "2026-07-07",
    timezone: "America/Los_Angeles",
    freshnessStatus: "no_data",
    coverageStatus: "partial",
    includesPartialDay: true,
    includesFutureDates: false,
    latestCompletedBusinessDate: "2026-07-05",
    warningCodes: ["future_dates"]
  };
  const commerce: CommerceTelemetryResult = {
    startDate: "2026-07-01",
    endDate: "2026-07-07",
    wooLatencyMs: 4500,
    ga4LatencyMs: null,
    funnelLatencyMs: null,
    wooDetails: { payload: { summary: { revenue: null, orders: null, avgOrderValue: null, discountTotal: null, shippingTotal: null, taxTotal: null, items: null }, timeseries: [] }, fallbackToLegacy: true },
    errors: { woo: "rpc_error" }
  };
  const incidents = evaluateIncidentsForSource({
    source: "woo",
    meta,
    health: { source: "woo", status: "critical", reasons: [], warningCodes: [] },
    commerce,
    observedAt: "2026-07-07T15:00:00Z"
  });
  const reasons = incidents.map((incident) => incident.reason);
  assert.ok(reasons.includes("no_data"));
  assert.ok(reasons.includes("coverage_partial"));
  assert.ok(reasons.includes("semantic_fallback"));
  assert.ok(reasons.includes("future_dates"));
  assert.ok(reasons.includes("latency_regression"));
  assert.ok(reasons.includes("rpc_error"));
});

test("buildIncidentSummary encodes first/latest and consecutive", () => {
  const summary = buildIncidentSummary({
    incident: { source: "woo", reason: "no_data", severity: "critical", detail: "missing" },
    state: { firstObserved: "2026-07-01T00:00:00Z", latestObserved: "2026-07-02T00:00:00Z", consecutive: 3 },
    observedAt: "2026-07-02T00:00:00Z"
  });
  assert.match(summary, /first=2026-07-01T00:00:00Z/);
  assert.match(summary, /latest=2026-07-02T00:00:00Z/);
  assert.match(summary, /consecutive=3/);
});
