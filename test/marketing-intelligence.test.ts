import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketingInsights } from "../src/lib/marketing-intelligence.ts";
import type { CommerceTelemetry, MetaAdsSnapshot } from "../src/lib/types/dashboard";

test("detects GA4 session decline and surfaces action", () => {
  const telemetry: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-09", endDate: "2026-07-15" },
    ga4: {
      summary: { revenue: 12000, sessions: 900, engagedSessions: 500, eventCount: 8000, avgEngagementSeconds: 110 },
      timeseries: [
        { date: "2026-07-09", revenue: 2500, sessions: 200, engagedSessions: 120 },
        { date: "2026-07-15", revenue: 1500, sessions: 150, engagedSessions: 80 }
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
