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

  const metaPrev = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    accountId: "acct",
    range: 7,
    campaigns: [],
    summary: { spend: 100, impressions: 1000, clicks: 10, purchases: 1, purchaseValue: 100, roas: 1.0 }
  };
  const metaCur = {
    ...metaPrev,
    generatedAt: "2026-07-24T00:00:00.000Z",
    summary: { ...metaPrev.summary, spend: 150, roas: 2.35 }
  };

  const snapshot = buildChangeInsightsSnapshot({ websiteCurrent: cur, websitePrevious: prev, metaCurrent: metaCur, metaPrevious: metaPrev, maxInsights: 5 });
  assert.ok(snapshot);
  assert.equal(snapshot.previousGeneratedAt, metaPrev.generatedAt);
  assert.ok(snapshot.insights.length > 0);

  const ids = snapshot.insights.map((i) => i.id);
  // stable ordering: Meta ROAS then Meta spend
  assert.deepEqual(ids.slice(0, 2), ["meta-roas", "meta-spend"]);

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
  assert.equal(snapshot.insights.length, 0);
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
  assert.equal(snapshot.insights.length, 0);
});

test("output limit is enforced", () => {
  const prevMeta = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    accountId: "acct",
    range: 7,
    campaigns: [],
    summary: { spend: 100, impressions: 1000, clicks: 10, purchases: 1, purchaseValue: 100, roas: 1.0 }
  };
  const curMeta = {
    ...prevMeta,
    generatedAt: "2026-07-24T00:00:00.000Z",
    summary: { ...prevMeta.summary, spend: 150, roas: 2.0 }
  };

  const snapshot = buildChangeInsightsSnapshot({ metaCurrent: curMeta, metaPrevious: prevMeta, maxInsights: 1 });
  assert.ok(snapshot);
  assert.equal(snapshot.insights.length, 1);
});

test("meta comparability: mismatched ranges omit meta insights", () => {
  const prevMeta = {
    generatedAt: "2026-07-23T00:00:00.000Z",
    accountId: "acct",
    range: 7,
    campaigns: [],
    summary: { spend: 100, impressions: 1000, clicks: 10, purchases: 1, purchaseValue: 100, roas: 1.0 }
  };
  const curMeta = {
    ...prevMeta,
    generatedAt: "2026-07-24T00:00:00.000Z",
    range: 30
  };

  const snapshot = buildChangeInsightsSnapshot({ metaCurrent: curMeta, metaPrevious: prevMeta });
  assert.ok(snapshot);
  assert.equal(snapshot.insights.length, 0);
});
