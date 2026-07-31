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
    status: "OK",
    summary: { spend: 123, impressions: 1000, clicks: 25, purchases: null, roas: null },
    campaigns: []
  };

  const html = renderToStaticMarkup(React.createElement(MetaAdsPanel, { snapshot: snap }));
  const text = String(html);
  assert.match(text, /Not attributable/);
  assert.match(text, /Purchase attribution unavailable/);
});
