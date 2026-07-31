import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatExecutiveTruthLine } from "@/lib/dashboard/metric-truth";
import { formatPerformanceBaselineDelta } from "@/components/dashboard/PerformanceBaselinePanel";
import { MetaAdsPanel } from "@/components/dashboard/MetaAdsPanel";

function confidenceSummary(stateById: Partial<Record<string, string>>) {
  // Minimal ConfidenceSummary shape for metric-truth; only entries[].id/state are read.
  return {
    entries: Object.entries(stateById).map(([id, state]) => ({ id, state })) as any,
    partialDay: false,
    overall: { label: "", tone: "amber", rationale: "", state: "mixed", lastRefresh: null },
    trustedSources: [],
    caveatSources: [],
    insufficientSources: [],
    conflictingSources: [],
    topRisk: null,
    decisionsAffected: [],
    recommendedActions: []
  } as any;
}

test("executive truth line: value + trusted source => complete/fresh/high", () => {
  const line = formatExecutiveTruthLine({
    metric: { label: "Revenue", unit: "currency", current: 100, previous: 90, delta: 10, deltaPercent: 0.111 } as any,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ woo: "trusted" })
  });
  assert.match(line, /WOO/);
  assert.match(line, /Complete coverage/);
  assert.match(line, /Fresh/);
  assert.match(line, /High confidence/);
});

test("executive truth line: value + caveats => partial/moderate", () => {
  const line = formatExecutiveTruthLine({
    metric: { label: "Orders", unit: "count", current: 10, previous: 9, delta: 1, deltaPercent: 0.111 } as any,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ woo: "usable_with_caveats" })
  });
  assert.match(line, /Partial coverage/);
  assert.match(line, /Moderate confidence/);
});

test("executive truth line: unavailable value => Unavailable with source label", () => {
  const line = formatExecutiveTruthLine({
    metric: { label: "Sessions", unit: "count", current: null, previous: null, delta: null, deltaPercent: null } as any,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ ga4: "trusted" })
  });
  assert.match(line, /GA4/);
  assert.match(line, /Unavailable/);
});

test("executive truth line: value must never be paired with Unavailable status", () => {
  const line = formatExecutiveTruthLine({
    metric: { label: "Revenue", unit: "currency", current: 100, previous: 90, delta: 10, deltaPercent: 0.111 } as any,
    rangeLabel: "2026-01-01 → 2026-01-31",
    confidence: confidenceSummary({ woo: "unavailable" })
  });
  assert.ok(!/\bUnavailable\b/.test(line));
});

test("baseline delta suppression: previous=0 for count/currency suppresses delta", () => {
  const line = formatPerformanceBaselineDelta({ id: "sessions", unit: "count", current: 100, previous: 0, delta: 100, deltaPercent: null } as any);
  assert.equal(line, "Comparison unavailable");
});

test("Meta Ads: attribution missing does not show 0 ROAS", () => {
  const snap = {
    generatedAt: new Date().toISOString(),
    range: 7,
    accountId: "act_123",
    status: "OK",
    summary: { spend: 123, impressions: 1000, clicks: 25, purchases: null, roas: null },
    campaigns: []
  };

  const html = renderToStaticMarkup(React.createElement(MetaAdsPanel, { snapshot: snap as any }));
  const text = String(html);
  assert.match(text, /Not attributable/);
  assert.match(text, /Purchase attribution unavailable/);
});
