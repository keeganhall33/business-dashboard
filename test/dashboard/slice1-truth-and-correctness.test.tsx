import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatExecutiveTruthLine } from "@/lib/dashboard/metric-truth";
import { formatPerformanceBaselineDelta } from "@/components/dashboard/PerformanceBaselinePanel";
import { MetaAdsPanel } from "@/components/dashboard/MetaAdsPanel";
import type { ExecutiveMetric } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary, ConfidenceEntry, ConfidenceDomain, ConfidenceState } from "@/lib/data-confidence";
import type { MetaAdsSnapshot } from "@/lib/types/dashboard";
import { WebsiteConversionPanel } from "@/components/dashboard/WebsiteConversionPanel";
import type { WebsiteConversionSnapshot } from "@/lib/types/dashboard";

function confidenceSummary(stateById: Partial<Record<ConfidenceDomain, ConfidenceState>>): ConfidenceSummary {
  // Minimal ConfidenceSummary shape for metric-truth; only entries[].id/state are read.
  const entries: ConfidenceEntry[] = Object.entries(stateById)
    .filter(([, state]) => Boolean(state))
    .map(([id, state]) => ({
      id: id as ConfidenceDomain,
      label: String(id).toUpperCase(),
      state: state as ConfidenceState,
      freshnessHours: null,
      coverage: "",
      completeness: "",
      provenance: "",
      lastSuccess: null,
      lastVerified: null,
      warningCodes: [],
      confidenceScore: 0,
      executiveImpact: "",
      decisionImpact: ""
    }));

  return {
    entries,
    partialDay: false,
    overall: { label: "", tone: "amber", rationale: "", state: "mixed", lastRefresh: null },
    trustedSources: [],
    caveatSources: [],
    insufficientSources: [],
    conflictingSources: [],
    topRisk: null,
    decisionsAffected: [],
    recommendedActions: []
  };
}

test("executive truth line: value + trusted source => complete/fresh/high", () => {
  const metric: ExecutiveMetric = {
    label: "Revenue",
    unit: "currency",
    current: 100,
    previous: 90,
    delta: 10,
    deltaPercent: 0.111
  };
  const line = formatExecutiveTruthLine({
    metric,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ woo: "trusted" })
  });
  assert.match(line, /WOO/);
  assert.match(line, /Complete coverage/);
  assert.match(line, /Fresh/);
  assert.match(line, /High confidence/);
});

test("executive truth line: value + caveats => partial/moderate", () => {
  const metric: ExecutiveMetric = {
    label: "Orders",
    unit: "count",
    current: 10,
    previous: 9,
    delta: 1,
    deltaPercent: 0.111
  };
  const line = formatExecutiveTruthLine({
    metric,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ woo: "usable_with_caveats" })
  });
  assert.match(line, /Partial coverage/);
  assert.match(line, /Moderate confidence/);
});

test("executive truth line: unavailable value => Unavailable with source label", () => {
  const metric: ExecutiveMetric = {
    label: "Sessions",
    unit: "count",
    current: null,
    previous: null,
    delta: null,
    deltaPercent: null
  };
  const line = formatExecutiveTruthLine({
    metric,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ ga4: "trusted" })
  });
  assert.match(line, /GA4/);
  assert.match(line, /Unavailable/);
});

test("executive truth line: value must never be paired with Unavailable status", () => {
  const metric: ExecutiveMetric = {
    label: "Revenue",
    unit: "currency",
    current: 100,
    previous: 90,
    delta: 10,
    deltaPercent: 0.111
  };
  const line = formatExecutiveTruthLine({
    metric,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ woo: "unavailable" })
  });
  assert.ok(!/\bUnavailable\b/.test(line));
});

test("baseline delta suppression: previous=0 for count/currency suppresses delta", () => {
  const line = formatPerformanceBaselineDelta({
    id: "sessions",
    unit: "count",
    current: 100,
    previous: 0,
    delta: 100,
    deltaPercent: null
  });
  assert.equal(line, "Comparison unavailable");
});

test("Meta Ads: attribution missing does not show 0 ROAS", () => {
  const snap: MetaAdsSnapshot = {
    generatedAt: new Date().toISOString(),
    range: 7,
    accountId: "act_123",
    status: "LIVE",
    summary: { spend: 123, impressions: 1000, clicks: 25, purchases: null, purchaseValue: null, roas: null },
    campaigns: []
  };

  const html = renderToStaticMarkup(React.createElement(MetaAdsPanel, { snapshot: snap }));
  const text = String(html);
  assert.match(text, /Not attributable/);
  assert.match(text, /Purchase attribution unavailable/);
});

test("Meta Ads: true attributable zero may still render 0", () => {
  const snap: MetaAdsSnapshot = {
    generatedAt: new Date().toISOString(),
    range: 7,
    accountId: "act_123",
    status: "LIVE",
    summary: { spend: 123, impressions: 1000, clicks: 25, purchases: 0, purchaseValue: 0, roas: 0 },
    campaigns: [{
      campaignId: "cmp_1",
      campaignName: "Test",
      spend: 10,
      impressions: 100,
      clicks: 2,
      ctr: null,
      cpc: null,
      cpm: null,
      purchases: 0,
      purchaseValue: 0,
      roas: 0
    }]
  };

  const html = renderToStaticMarkup(React.createElement(MetaAdsPanel, { snapshot: snap }));
  const text = String(html);
  assert.match(text, /ROAS/);
  assert.ok(/0(\.0+)?x/.test(text) || /0\.00x/.test(text));
});

test("snapshot vs selected range: both windows render and remain distinct", () => {
  const snapshot: WebsiteConversionSnapshot = {
    generatedAt: new Date().toISOString(),
    ga4: { sessions: 10 },
    wooCommerce: {
      netRevenue: 100,
      paidOrdersInWindow: 2,
      observedPaidRange: { earliestPaid: "2026-07-21", latestPaid: "2026-07-23" },
      topProducts: [],
      recentOrders: []
    }
  } as unknown as WebsiteConversionSnapshot;

  const html = renderToStaticMarkup(
    React.createElement(WebsiteConversionPanel, {
      snapshot,
      range: { startDate: "2026-01-01", endDate: "2026-07-31" }
    })
  );

  assert.match(html, /Selected range 2026-01-01 → 2026-07-31/);
  assert.match(html, /Snapshot window 2026-07-21 → 2026-07-23/);
});

test("snapshot window degrades honestly when missing range metadata", () => {
  const snapshot: WebsiteConversionSnapshot = {
    generatedAt: new Date().toISOString(),
    ga4: { sessions: 10 },
    wooCommerce: {
      netRevenue: 100,
      paidOrdersInWindow: 2,
      observedPaidRange: null,
      topProducts: [],
      recentOrders: []
    }
  } as unknown as WebsiteConversionSnapshot;

  const html = renderToStaticMarkup(
    React.createElement(WebsiteConversionPanel, {
      snapshot,
      range: { startDate: "2026-01-01", endDate: "2026-07-31" }
    })
  );

  assert.match(html, /Snapshot window Unavailable/);
});
