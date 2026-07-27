import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BusinessStatusPanel } from "@/components/dashboard/BusinessStatusPanel";
import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";

function makeSummary(partialWoo: boolean): ExecutiveSummary {
  return {
    rangeLabel: "2026-07-20 → 2026-07-27",
    comparisonLabel: "2026-07-13 → 2026-07-20",
    metrics: {
      revenue: {
        label: "Revenue",
        unit: "currency",
        current: 10,
        previous: 20,
        delta: partialWoo ? null : -10,
        deltaPercent: partialWoo ? null : -0.5,
        currentCompleteness: partialWoo ? "partial" : "complete",
        currentQualifier: partialWoo ? "at_least" : undefined
      },
      orders: {
        label: "Orders",
        unit: "count",
        current: 1,
        previous: 2,
        delta: partialWoo ? null : -1,
        deltaPercent: partialWoo ? null : -0.5,
        currentCompleteness: partialWoo ? "partial" : "complete",
        currentQualifier: partialWoo ? "at_least" : undefined
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
        previous: 150,
        delta: -50,
        deltaPercent: -0.333
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
        previous: 35,
        delta: 5,
        deltaPercent: 0.143
      }
    }
  };
}

test("Business Status uses partial-commerce language when Woo totals are partial", () => {
  const html = renderToStaticMarkup(<BusinessStatusPanel summary={makeSummary(true)} />);
  assert.match(
    html,
    /Traffic declined materially\. Current Woo revenue and order totals are partial because selected-range telemetry is unavailable\./
  );
});

test("Business Status uses comparative language when commerce is complete", () => {
  const html = renderToStaticMarkup(<BusinessStatusPanel summary={makeSummary(false)} />);
  assert.match(html, /Material declines in/);
});
