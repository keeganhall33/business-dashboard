import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptDashboardRevenueSourcesV1,
  type RevenueDashboardSourceAdapterInputV1
} from "@/lib/intelligence/production-revenue-loop/dashboard-source-adapter-v1";
import type { DashboardOverviewResponse, TelemetrySource } from "@/lib/types/dashboard";

const CURRENT = { startDate: "2026-08-14", endDate: "2026-09-12" };
const PREVIOUS = { startDate: "2026-07-15", endDate: "2026-08-13" };

function snapshot(
  range: { startDate: string; endDate: string },
  overrides: Record<string, unknown> = {}
): DashboardOverviewResponse {
  const metadata = Object.fromEntries((["woo", "ga4", "meta"] as TelemetrySource[]).map((source) => [source, {
    source,
    requestedStartDate: range.startDate,
    requestedEndDate: range.endDate,
    timezone: "America/Los_Angeles",
    generatedAt: "2026-09-13T22:00:00.000Z",
    freshnessStatus: "fresh",
    coverageStatus: "complete",
    includesPartialDay: false,
    includesFutureDates: false,
    warningCodes: []
  }]));
  const health = Object.fromEntries((["woo", "ga4", "meta"] as TelemetrySource[]).map((source) => [source, {
    source,
    status: "healthy",
    reasons: [],
    warningCodes: []
  }]));
  return {
    ok: true,
    timestamp: "2026-09-13T22:00:00.000Z",
    dataMode: "LIVE_DATA",
    range: { preset: "custom", ...range },
    commerceTelemetry: {
      range: { preset: "custom", ...range },
      woo: { summary: { revenue: 1_250.55, orders: 10, avgOrderValue: 125.055, discountTotal: null, shippingTotal: null, taxTotal: null, items: 10, completeness: "complete", hasData: true }, timeseries: [] },
      ga4: { summary: { revenue: null, sessions: 1_000, engagedSessions: null, eventCount: null, avgEngagementSeconds: null }, timeseries: [] }
    },
    metaAds: { generatedAt: "2026-09-13T22:00:00.000Z", accountId: "act_live", range: 30, campaigns: [], summary: { spend: 300.25, impressions: 10_000, clicks: 200, purchases: 5, purchaseValue: 700.1, roas: 2.33 }, status: "LIVE" },
    telemetryMetadata: metadata,
    telemetryHealth: health,
    ...overrides
  } as unknown as DashboardOverviewResponse;
}

function input(overrides: Partial<RevenueDashboardSourceAdapterInputV1> = {}): RevenueDashboardSourceAdapterInputV1 {
  return {
    generatedAt: "2026-09-13T23:00:00.000Z",
    currentRange: CURRENT,
    comparisonRange: PREVIOUS,
    current: snapshot(CURRENT),
    previous: snapshot(PREVIOUS),
    ...overrides
  };
}

test("adapts canonical Woo, GA4, and Meta metrics with stable cents and evidence refs", () => {
  const result = adaptDashboardRevenueSourcesV1(input());
  assert.equal(result.status, "ADAPTED");
  if (result.status !== "ADAPTED") return;
  assert.deepEqual(result.input.observations.map((item) => item.source), ["WOO", "GA4", "META"]);
  assert.equal(result.input.observations[0].current.revenueCents, 125_055);
  assert.equal(result.input.observations[0].current.averageOrderValueCents, 12_506);
  assert.equal(result.input.observations[1].current.sessions, 1_000);
  assert.equal(result.input.observations[2].current.spendCents, 30_025);
  assert.equal(result.input.observations[2].current.attributedPurchaseValueCents, 70_010);
  assert.deepEqual(result.input.observations[0].evidenceRefs, [
    "dashboard:woo:2026-07-15:2026-08-13",
    "dashboard:woo:2026-08-14:2026-09-12"
  ]);
});

test("preserves the worst bounded truth state across both periods", () => {
  const previous = snapshot(PREVIOUS);
  previous.telemetryMetadata!.ga4!.freshnessStatus = "stale";
  previous.telemetryHealth!.meta!.warningCodes = ["ATTRIBUTION_CONFLICT"];
  previous.commerceTelemetry!.woo!.summary.completeness = "partial";
  const result = adaptDashboardRevenueSourcesV1(input({ previous }));
  assert.equal(result.status, "ADAPTED");
  if (result.status !== "ADAPTED") return;
  assert.deepEqual(result.input.observations.map((item) => item.truthState), ["PARTIAL", "STALE", "CONFLICTED"]);
  assert.deepEqual(result.warnings, [
    "WOO source truth is PARTIAL.",
    "GA4 source truth is STALE.",
    "META source truth is CONFLICTED."
  ]);
});

test("keeps missing canonical source values UNKNOWN and null", () => {
  const current = snapshot(CURRENT, { commerceTelemetry: { range: { preset: "custom", ...CURRENT } }, metaAds: null });
  const result = adaptDashboardRevenueSourcesV1(input({ current }));
  assert.equal(result.status, "ADAPTED");
  if (result.status !== "ADAPTED") return;
  assert.deepEqual(result.input.observations.map((item) => item.truthState), ["UNKNOWN", "UNKNOWN", "UNKNOWN"]);
  assert.equal(result.input.observations[0].current.revenueCents, null);
  assert.equal(result.input.observations[1].current.sessions, null);
  assert.equal(result.input.observations[2].current.spendCents, null);
});

test("fails closed on fixture truth, unavailable snapshots, invalid time, and range mismatch", () => {
  assert.equal(adaptDashboardRevenueSourcesV1(input({ current: snapshot(CURRENT, { dataMode: "SEED_DATA" }) })).reasonCode, "SEED_DATA_FORBIDDEN");
  assert.equal(adaptDashboardRevenueSourcesV1(input({ previous: snapshot(PREVIOUS, { ok: false }) })).reasonCode, "SOURCE_SNAPSHOT_UNAVAILABLE");
  assert.equal(adaptDashboardRevenueSourcesV1(input({ generatedAt: "invalid" })).reasonCode, "INVALID_GENERATED_AT");
  assert.equal(adaptDashboardRevenueSourcesV1(input({ current: snapshot(PREVIOUS) })).reasonCode, "RANGE_MISMATCH");
});

test("is deterministic, deeply immutable, and does not mutate snapshots", () => {
  const value = input();
  const before = structuredClone(value);
  const first = adaptDashboardRevenueSourcesV1(value);
  const second = adaptDashboardRevenueSourcesV1(structuredClone(value));
  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.warnings));
  if (first.status !== "ADAPTED") return;
  assert.ok(Object.isFrozen(first.input));
  assert.ok(Object.isFrozen(first.input.observations));
  assert.ok(Object.isFrozen(first.input.observations[0].current));
  assert.ok(Object.isFrozen(first.input.observations[0].evidenceRefs));
});
