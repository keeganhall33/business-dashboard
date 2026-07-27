import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TopDriversPanel } from "@/components/dashboard/TopDriversPanel";
import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";

const summary: ExecutiveSummary = {
  rangeLabel: "2026-07-20 → 2026-07-27",
  comparisonLabel: "2026-07-13 → 2026-07-20",
  metrics: {
    revenue: {
      label: "Revenue",
      unit: "currency",
      current: 10,
      previous: 100,
      delta: null,
      deltaPercent: null,
      currentCompleteness: "partial",
      currentQualifier: "at_least"
    },
    orders: {
      label: "Orders",
      unit: "count",
      current: 1,
      previous: 10,
      delta: null,
      deltaPercent: null,
      currentCompleteness: "partial",
      currentQualifier: "at_least"
    },
    aov: {
      label: "AOV",
      unit: "currency",
      current: null,
      previous: 10,
      delta: null,
      deltaPercent: null
    },
    sessions: {
      label: "Sessions",
      unit: "count",
      current: 100,
      previous: 200,
      delta: -100,
      deltaPercent: -0.5
    },
    purchaseConversion: {
      label: "Purchase conversion",
      unit: "percent",
      current: null,
      previous: null,
      delta: null,
      deltaPercent: null
    },
    funnelCompletion: {
      label: "Funnel completion",
      unit: "percent",
      current: 40,
      previous: 20,
      delta: 20,
      deltaPercent: 1
    }
  }
};

test("Top Drivers excludes commerce metrics when commerce is partial", () => {
  const html = renderToStaticMarkup(<TopDriversPanel summary={summary} />);
  assert.match(html, /Sessions/);
  assert.match(html, /Funnel completion/);
  assert.doesNotMatch(html, /Revenue/);
  assert.doesNotMatch(html, /Orders/);
});
