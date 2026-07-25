import test from "node:test";
import assert from "node:assert/strict";
import { buildPerformanceBaselineSnapshot, computePreviousInclusiveDateRange } from "../src/lib/dashboard/performance-baseline";
import type { CommerceTelemetry } from "../src/lib/types/dashboard";

test("previous inclusive date range matches equal-length window", () => {
  assert.deepEqual(computePreviousInclusiveDateRange({ startDate: "2026-07-19", endDate: "2026-07-25" }), {
    startDate: "2026-07-12",
    endDate: "2026-07-18"
  });

  assert.deepEqual(computePreviousInclusiveDateRange({ startDate: "2026-07-25", endDate: "2026-07-25" }), {
    startDate: "2026-07-24",
    endDate: "2026-07-24"
  });
});

test("builds baseline metrics with independent degradation and safe percent math", () => {
  const current: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-19", endDate: "2026-07-25" },
    woo: {
      summary: { revenue: 7000, orders: 14, avgOrderValue: null, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 },
      timeseries: []
    },
    ga4: {
      summary: { revenue: 0, sessions: 1000, engagedSessions: 0, eventCount: 0, avgEngagementSeconds: null },
      timeseries: []
    },
    funnel: {
      summary: { entries: 100, completions: 3, conversionRate: 3.0, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null },
      timeseries: []
    }
  };

  const previous: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-12", endDate: "2026-07-18" },
    woo: {
      summary: { revenue: 5000, orders: 10, avgOrderValue: 500, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 },
      timeseries: []
    },
    ga4: {
      summary: { revenue: 0, sessions: 0, engagedSessions: 0, eventCount: 0, avgEngagementSeconds: null },
      timeseries: []
    },
    funnel: {
      summary: { entries: 0, completions: 0, conversionRate: null, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null },
      timeseries: []
    }
  };

  const baseline = buildPerformanceBaselineSnapshot({
    range: { preset: "7d", startDate: "2026-07-19", endDate: "2026-07-25" },
    currentTelemetry: current,
    previousTelemetry: previous
  });

  assert.ok(baseline);
  assert.equal(baseline.previousRange.startDate, "2026-07-12");
  assert.equal(baseline.previousRange.endDate, "2026-07-18");

  // Revenue
  assert.equal(baseline.metrics.revenue.current, 7000);
  assert.equal(baseline.metrics.revenue.previous, 5000);
  assert.equal(baseline.metrics.revenue.delta, 2000);
  assert.equal(baseline.metrics.revenue.deltaPercent, 2000 / 5000);

  // Orders
  assert.equal(baseline.metrics.orders.current, 14);
  assert.equal(baseline.metrics.orders.previous, 10);

  // AOV current falls back to revenue/orders; previous uses direct field
  assert.equal(baseline.metrics.avgOrderValue.current, 7000 / 14);
  assert.equal(baseline.metrics.avgOrderValue.previous, 500);

  // Sessions previous is 0 => deltaPercent must be null
  assert.equal(baseline.metrics.sessions.current, 1000);
  assert.equal(baseline.metrics.sessions.previous, 0);
  assert.equal(baseline.metrics.sessions.deltaPercent, null);

  // Conversion rate: current ok, previous missing => conversion metric unavailable (no delta)
  assert.equal(baseline.metrics.conversionRate.current, 3.0);
  assert.equal(baseline.metrics.conversionRate.previous, null);
  assert.equal(baseline.metrics.conversionRate.delta, null);
});
