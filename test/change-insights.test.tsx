import test from "node:test";
import assert from "node:assert/strict";
import { buildChangeInsightsSnapshot } from "../src/lib/dashboard/change-insights";
import type { MetaAdsSnapshot, WebsiteConversionSnapshot } from "../src/lib/types/dashboard";

test("no previous snapshot returns empty insights and previousGeneratedAt null", () => {
  const current: WebsiteConversionSnapshot = {
    generatedAt: "2026-07-24T00:00:00.000Z",
    ga4: { sessions: 100, funnelRates: { sessionToPurchase: 0.02 } },
    wooCommerce: { totalRevenue: 5000, orderCount: 10 }
  };

  const snapshot = buildChangeInsightsSnapshot({ websiteCurrent: current, websitePrevious: null });
  assert.ok(snapshot);
  assert.equal(snapshot.generatedAt, current.generatedAt);
  assert.equal(snapshot.previousGeneratedAt, null);
  assert.deepEqual(snapshot.insights, []);
});

test("valid current and previous data emits deterministic insights", () => {
  const prev: WebsiteConversionSnapshot = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    ga4: { sessions: 100, funnelRates: { sessionToPurchase: 0.02 } },
    wooCommerce: { totalRevenue: 5000, orderCount: 10 }
  };
  const cur: WebsiteConversionSnapshot = {
    generatedAt: "2026-07-24T00:00:00.000Z",
    ga4: { sessions: 150, funnelRates: { sessionToPurchase: 0.03 } },
    wooCommerce: { totalRevenue: 6000, orderCount: 12 }
  };

  const snapshot = buildChangeInsightsSnapshot({ websiteCurrent: cur, websitePrevious: prev, maxInsights: 5 });
  assert.ok(snapshot);
  assert.equal(snapshot.previousGeneratedAt, prev.generatedAt);
  assert.ok(snapshot.insights.length > 0);

  const ids = snapshot.insights.map((i) => i.id);
  // stable ordering: revenue, conversion, sessions (website) first
  assert.deepEqual(ids.slice(0, 3), ["website-revenue", "website-session-to-purchase", "website-sessions"]);

  for (const insight of snapshot.insights) {
    assert.ok(!insight.interpretation.includes("<"), "no raw HTML in interpretation");
  }
});

test("unchanged data produces flat deltas (not misleading)", () => {
  const prev: MetaAdsSnapshot = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    accountId: "acct",
    range: 7,
    campaigns: [],
    summary: { spend: 100, impressions: 1000, clicks: 10, purchases: 1, purchaseValue: 100, roas: 1.0 }
  };
  const cur: MetaAdsSnapshot = {
    ...prev,
    generatedAt: "2026-07-24T00:00:00.000Z"
  };

  const snapshot = buildChangeInsightsSnapshot({ metaCurrent: cur, metaPrevious: prev });
  assert.ok(snapshot);
  const roas = snapshot.insights.find((i) => i.id === "meta-roas");
  assert.ok(roas);
  assert.equal(roas.delta, 0);
  assert.equal(roas.direction, "flat");
});

test("previous value of zero yields deltaPercent null", () => {
  const prev: WebsiteConversionSnapshot = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    ga4: { sessions: 0, funnelRates: { sessionToPurchase: 0 } },
    wooCommerce: { totalRevenue: 0, orderCount: 0 }
  };
  const cur: WebsiteConversionSnapshot = {
    generatedAt: "2026-07-24T00:00:00.000Z",
    ga4: { sessions: 10, funnelRates: { sessionToPurchase: 0.01 } },
    wooCommerce: { totalRevenue: 1000, orderCount: 1 }
  };

  const snapshot = buildChangeInsightsSnapshot({ websiteCurrent: cur, websitePrevious: prev });
  assert.ok(snapshot);
  const revenue = snapshot.insights.find((i) => i.id === "website-revenue");
  assert.ok(revenue);
  assert.equal(revenue.previous, 0);
  assert.equal(revenue.deltaPercent, null);
});

test("output limit is enforced", () => {
  const prev: WebsiteConversionSnapshot = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    ga4: { sessions: 100, funnelRates: { sessionToPurchase: 0.02 } },
    wooCommerce: { totalRevenue: 5000, orderCount: 10 }
  };
  const cur: WebsiteConversionSnapshot = {
    generatedAt: "2026-07-24T00:00:00.000Z",
    ga4: { sessions: 150, funnelRates: { sessionToPurchase: 0.03 } },
    wooCommerce: { totalRevenue: 6000, orderCount: 12 }
  };

  const snapshot = buildChangeInsightsSnapshot({ websiteCurrent: cur, websitePrevious: prev, maxInsights: 1 });
  assert.ok(snapshot);
  assert.equal(snapshot.insights.length, 1);
});
