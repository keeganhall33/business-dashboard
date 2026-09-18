import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptDashboardRevenueSourcesV1,
  type RevenueDashboardSourceAdapterInputV1
} from "@/lib/intelligence/production-revenue-loop/dashboard-source-adapter-v1";
import { buildRevenueDecisionPacketV1 } from "@/lib/intelligence/production-revenue-loop/decision-packet-v1";
import type { DashboardOverviewResponse, TelemetrySource } from "@/lib/types/dashboard";

const CURRENT = { startDate: "2026-08-14", endDate: "2026-09-12" };
const PREVIOUS = { startDate: "2026-07-15", endDate: "2026-08-13" };

function snapshot(range: { startDate: string; endDate: string }): DashboardOverviewResponse {
  const metadata = Object.fromEntries(
    (["woo", "ga4", "meta"] as TelemetrySource[]).map((source) => [
      source,
      {
        source,
        requestedStartDate: range.startDate,
        requestedEndDate: range.endDate,
        timezone: "America/Los_Angeles",
        generatedAt: "2026-09-13T22:00:00.000Z",
        freshnessStatus: "fresh",
        coverageStatus: "complete",
        includesPartialDay: false,
        includesFutureDates: false,
        latestCompletedBusinessDate: range.endDate,
        warningCodes: []
      }
    ])
  );
  const health = Object.fromEntries(
    (["woo", "ga4", "meta"] as TelemetrySource[]).map((source) => [
      source,
      { source, status: "healthy", reasons: [], warningCodes: [] }
    ])
  );

  return {
    ok: true,
    timestamp: "2026-09-13T22:00:00.000Z",
    dataMode: "LIVE_DATA",
    range: { preset: "custom", ...range },
    commerceTelemetry: {
      range: { preset: "custom", ...range },
      woo: {
        summary: {
          revenue: 1_250.55,
          orders: 10,
          avgOrderValue: 125.055,
          discountTotal: null,
          shippingTotal: null,
          taxTotal: null,
          items: 10,
          completeness: "complete",
          hasData: true
        },
        timeseries: []
      },
      ga4: {
        summary: {
          revenue: null,
          sessions: 1_000,
          engagedSessions: null,
          eventCount: null,
          avgEngagementSeconds: null
        },
        timeseries: []
      }
    },
    metaAds: {
      generatedAt: "2026-09-13T22:00:00.000Z",
      accountId: "act_live",
      range: 30,
      campaigns: [],
      summary: {
        spend: 300.25,
        impressions: 10_000,
        clicks: 200,
        purchases: 5,
        purchaseValue: 700.1,
        roas: 2.33
      },
      status: "LIVE"
    },
    telemetryMetadata: metadata,
    telemetryHealth: health
  } as unknown as DashboardOverviewResponse;
}

function input(
  overrides: Partial<RevenueDashboardSourceAdapterInputV1> = {}
): RevenueDashboardSourceAdapterInputV1 {
  return {
    generatedAt: "2026-09-13T23:00:00.000Z",
    currentRange: CURRENT,
    comparisonRange: PREVIOUS,
    current: snapshot(CURRENT),
    previous: snapshot(PREVIOUS),
    ...overrides
  };
}

function truthStates(value: RevenueDashboardSourceAdapterInputV1) {
  const result = adaptDashboardRevenueSourcesV1(value);
  assert.equal(result.status, "ADAPTED");
  if (result.status !== "ADAPTED") return [];
  return result.input.observations.map((observation) => observation.truthState);
}

test("keeps exact complete source periods decision-grade", () => {
  assert.deepEqual(truthStates(input()), ["CURRENT", "CURRENT", "CURRENT"]);
});

test("fails closed when source metadata describes a different reporting range", () => {
  const current = snapshot(CURRENT);
  current.telemetryMetadata!.ga4!.requestedEndDate = "2026-09-11";

  const result = adaptDashboardRevenueSourcesV1(input({ current }));
  assert.equal(result.status, "ADAPTED");
  if (result.status !== "ADAPTED") return;

  assert.deepEqual(result.input.observations.map((item) => item.truthState), [
    "CURRENT",
    "CONFLICTED",
    "CURRENT"
  ]);
  assert.ok(result.warnings.includes("GA4 source truth is CONFLICTED."));

  const packet = buildRevenueDecisionPacketV1(result.input);
  assert.equal(packet.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(packet.reasonCode, "SOURCE_COVERAGE_INCOMPLETE");
});

test("does not promote partial-day or future-date telemetry to CURRENT", () => {
  const current = snapshot(CURRENT);
  current.telemetryMetadata!.woo!.includesPartialDay = true;
  current.telemetryMetadata!.meta!.includesFutureDates = true;

  assert.deepEqual(truthStates(input({ current })), ["PARTIAL", "CURRENT", "PARTIAL"]);
});

test("requires source coverage through the requested period end", () => {
  const current = snapshot(CURRENT);
  current.telemetryMetadata!.ga4!.latestCompletedBusinessDate = "2026-09-11";

  assert.deepEqual(truthStates(input({ current })), ["CURRENT", "PARTIAL", "CURRENT"]);
});

test("treats impossible completion metadata as conflicted instead of normalizing it", () => {
  const current = snapshot(CURRENT);
  current.telemetryMetadata!.meta!.latestCompletedBusinessDate = "2026-09-31";

  assert.deepEqual(truthStates(input({ current })), ["CURRENT", "CURRENT", "CONFLICTED"]);
});
