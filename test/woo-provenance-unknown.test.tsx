/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import { buildPerformanceBaselineSnapshot } from "@/lib/dashboard/performance-baseline";

const RANGE = { preset: "7d", startDate: "2026-07-19", endDate: "2026-07-25" } as const;

test("Selected-range telemetry without completeness is treated as unknown and suppresses AOV + deltas", () => {
  const current = {
    range: RANGE,
    woo: {
      summary: {
        revenue: 7000,
        orders: 14,
        avgOrderValue: 500,
        discountTotal: 0,
        shippingTotal: 0,
        taxTotal: 0,
        items: 0,
        source: "selected_range_telemetry"
        // completeness intentionally omitted
      },
      timeseries: []
    },
    ga4: { summary: { revenue: null, sessions: 1000, engagedSessions: 0, eventCount: 0, avgEngagementSeconds: null }, timeseries: [] },
    funnel: { summary: { entries: null, completions: null, conversionRate: null, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null }, timeseries: [] }
  } as any;

  const previous = {
    range: { preset: "7d", startDate: "2026-07-12", endDate: "2026-07-18" },
    woo: {
      summary: { revenue: 5000, orders: 10, avgOrderValue: 500, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 },
      timeseries: []
    },
    ga4: { summary: { revenue: null, sessions: 800, engagedSessions: 0, eventCount: 0, avgEngagementSeconds: null }, timeseries: [] },
    funnel: { summary: { entries: null, completions: null, conversionRate: null, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null }, timeseries: [] }
  } as any;

  const baseline = buildPerformanceBaselineSnapshot({ range: RANGE, currentTelemetry: current, previousTelemetry: previous });
  assert.ok(baseline);

  assert.equal(baseline.metrics.revenue.currentCompleteness, "unknown");
  assert.equal(baseline.metrics.revenue.currentQualifier ?? null, null);
  assert.equal(baseline.metrics.revenue.delta, null);

  assert.equal(baseline.metrics.avgOrderValue.current, null);
});
