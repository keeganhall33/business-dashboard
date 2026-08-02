import test from "node:test";
import assert from "node:assert/strict";

import type { MetaAdsSnapshot } from "@/lib/types/dashboard";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { hasDefensibleMetaAttribution } from "@/lib/meta/meta-attribution";
import { __test__ as dashboardShellTest } from "@/components/dashboard/DashboardShell";

function minimalDashboardData(metaAds: MetaAdsSnapshot) {
  const data: Pick<DashboardOverviewResponse, "metaAds" | "executiveInsights"> = {
    metaAds,
    executiveInsights: null
  };

  return data;
}

test("Meta LIVE + attribution unavailable: delivery visible; ROAS and conversions are not numeric in Marketing summary", () => {
  const snap: MetaAdsSnapshot = {
    generatedAt: new Date().toISOString(),
    range: 7,
    accountId: "act_123",
    status: "LIVE",
    summary: {
      spend: 274.68,
      impressions: 19115,
      clicks: 701,
      purchases: 0,
      purchaseValue: 0,
      roas: 0
    },
    campaigns: [
      {
        campaignId: "cmp_1",
        campaignName: "Prospecting",
        spend: 121.15,
        impressions: 7087,
        clicks: 311,
        ctr: null,
        cpc: null,
        cpm: null,
        purchases: null,
        purchaseValue: null,
        roas: null
      }
    ]
  };

  assert.equal(hasDefensibleMetaAttribution(snap), false);

  const summary = dashboardShellTest.buildMarketingSummary(minimalDashboardData(snap), []);
  const metrics = summary.metrics.join(" • ");

  // Delivery still visible.
  assert.match(metrics, /Spend/);
  // But attribution metrics must not be numeric.
  assert.ok(!/ROAS\s*0\.0x/.test(metrics));
  assert.ok(!/Conv\s*0\b/.test(metrics));
});

test("Defensible attribution: genuine attributable zeros may still render as numeric in Marketing summary", () => {
  const snap: MetaAdsSnapshot = {
    generatedAt: new Date().toISOString(),
    range: 7,
    accountId: "act_123",
    status: "LIVE",
    summary: {
      spend: 274.68,
      impressions: 19115,
      clicks: 701,
      purchases: 0,
      purchaseValue: 0,
      roas: 0
    },
    campaigns: [
      {
        campaignId: "cmp_1",
        campaignName: "Prospecting",
        spend: 121.15,
        impressions: 7087,
        clicks: 311,
        ctr: null,
        cpc: null,
        cpm: null,
        purchases: 0,
        purchaseValue: 0,
        roas: 0
      }
    ]
  };

  assert.equal(hasDefensibleMetaAttribution(snap), true);

  const summary = dashboardShellTest.buildMarketingSummary(minimalDashboardData(snap), []);
  const metrics = summary.metrics.join(" • ");
  assert.match(metrics, /ROAS\s*0\.0x/);
  assert.match(metrics, /Conv\s*0\b/);
});
