import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketingInsights } from "../src/lib/marketing-intelligence.ts";
import type { CommerceTelemetry, MetaAdsSnapshot } from "../src/lib/types/dashboard";

test("detects GA4 session decline and surfaces action when volume sufficient", () => {
  const telemetry: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-09", endDate: "2026-07-15" },
    ga4: {
      summary: { revenue: 40000, sessions: 1800, engagedSessions: 900, eventCount: 8000, avgEngagementSeconds: 110 },
      timeseries: [
        { date: "2026-07-09", revenue: 7000, sessions: 1500, engagedSessions: 900 },
        { date: "2026-07-15", revenue: 5000, sessions: 900, engagedSessions: 500 }
      ]
    }
  } as CommerceTelemetry;

  const insights = buildMarketingInsights({ commerceTelemetry: telemetry });
  assert.ok(insights.actions.some((action) => action.id === "ga4-sessions"));
});

test("flags meta low ROAS spend", () => {
  const meta: MetaAdsSnapshot = {
    generatedAt: new Date().toISOString(),
    accountId: "123",
    range: 7,
    summary: { spend: 1500, impressions: 50000, clicks: 2000, purchases: 5, purchaseValue: 1000, roas: 0.8 },
    status: "LIVE",
    campaigns: [
      {
        campaignId: "c1",
        campaignName: "Test Campaign",
        spend: 800,
        impressions: 25000,
        clicks: 900,
        ctr: 3.6,
        cpc: 0.88,
        cpm: 32,
        purchases: 2,
        purchaseValue: 200,
        roas: 0.25
      }
    ]
  };

  const insights = buildMarketingInsights({ metaAds: meta });
  assert.ok(insights.actions.some((action) => action.id === "meta-roas"));
});

test("skips GA recommendation when baseline too low", () => {
  const telemetry: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-09", endDate: "2026-07-15" },
    ga4: {
      summary: { revenue: 2000, sessions: 300, engagedSessions: 100, eventCount: 2000, avgEngagementSeconds: 60 },
      timeseries: [
        { date: "2026-07-09", revenue: 400, sessions: 200, engagedSessions: 80 },
        { date: "2026-07-15", revenue: 200, sessions: 50, engagedSessions: 20 }
      ]
    }
  } as CommerceTelemetry;

  const insights = buildMarketingInsights({ commerceTelemetry: telemetry });
  assert.ok(!insights.actions.some((action) => action.id === "ga4-sessions"));
});

test("skips meta recommendations when snapshot is partial", () => {
  const meta: MetaAdsSnapshot = {
    generatedAt: new Date().toISOString(),
    accountId: "123",
    range: 7,
    status: "PARTIAL",
    summary: { spend: 2000, impressions: 40000, clicks: 1800, purchases: 10, purchaseValue: 1200, roas: 0.9 },
    campaigns: []
  };

  const insights = buildMarketingInsights({ metaAds: meta });
  assert.ok(!insights.actions.some((action) => action.id.startsWith("meta-")));
});

test("revenue recovery estimate uses absolute loss", () => {
  const telemetry: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-09", endDate: "2026-07-15" },
    ga4: {
      summary: { revenue: 50000, sessions: 3000, engagedSessions: 1400, eventCount: 9000, avgEngagementSeconds: 130 },
      timeseries: [
        { date: "2026-07-09", revenue: 12000, sessions: 1600, engagedSessions: 900 },
        { date: "2026-07-15", revenue: 9000, sessions: 1200, engagedSessions: 700 }
      ]
    }
  } as CommerceTelemetry;

  const insights = buildMarketingInsights({ commerceTelemetry: telemetry });
  const action = insights.actions.find((entry) => entry.id === "ga4-revenue");
  assert.ok(action);
  assert.match(action!.expectedImpact, /3000/);
});
