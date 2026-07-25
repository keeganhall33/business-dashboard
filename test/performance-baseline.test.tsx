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

test("previous range crosses month/year boundaries and handles leap years", () => {
  assert.deepEqual(computePreviousInclusiveDateRange({ startDate: "2026-03-01", endDate: "2026-03-01" }), {
    startDate: "2026-02-28",
    endDate: "2026-02-28"
  });

  assert.deepEqual(computePreviousInclusiveDateRange({ startDate: "2026-01-01", endDate: "2026-01-03" }), {
    startDate: "2025-12-29",
    endDate: "2025-12-31"
  });

  // leap year: 2024-03-01 compares to 2024-02-29
  assert.deepEqual(computePreviousInclusiveDateRange({ startDate: "2024-03-01", endDate: "2024-03-01" }), {
    startDate: "2024-02-29",
    endDate: "2024-02-29"
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

test("rejects NaN and Infinity but preserves zeros", () => {
  const current: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-19", endDate: "2026-07-25" },
    woo: {
      summary: { revenue: Number.NaN, orders: Number.POSITIVE_INFINITY, avgOrderValue: 0, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 },
      timeseries: []
    },
    ga4: {
      summary: { revenue: 0, sessions: 0, engagedSessions: 0, eventCount: 0, avgEngagementSeconds: null },
      timeseries: []
    },
    funnel: {
      summary: { entries: 0, completions: 0, conversionRate: Number.NEGATIVE_INFINITY, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null },
      timeseries: []
    }
  };

  const previous: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-12", endDate: "2026-07-18" },
    woo: {
      summary: { revenue: 0, orders: 0, avgOrderValue: null, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 },
      timeseries: []
    },
    ga4: {
      summary: { revenue: 0, sessions: 0, engagedSessions: 0, eventCount: 0, avgEngagementSeconds: null },
      timeseries: []
    },
    funnel: {
      summary: { entries: 0, completions: 0, conversionRate: 0, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null },
      timeseries: []
    }
  };

  const baseline = buildPerformanceBaselineSnapshot({
    range: { preset: "7d", startDate: "2026-07-19", endDate: "2026-07-25" },
    currentTelemetry: current,
    previousTelemetry: previous
  });

  assert.ok(baseline);
  // invalid values rejected
  assert.equal(baseline.metrics.revenue.current, null);
  assert.equal(baseline.metrics.orders.current, null);
  assert.equal(baseline.metrics.conversionRate.current, null);
  // valid zero preserved
  assert.equal(baseline.metrics.sessions.current, 0);
});

test("conversion rate remains on 0–100 scale (no extra scaling)", () => {
  const current: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-19", endDate: "2026-07-25" },
    funnel: { summary: { entries: 100, completions: 3, conversionRate: 3.2, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null }, timeseries: [] }
  };
  const previous: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-12", endDate: "2026-07-18" },
    funnel: { summary: { entries: 100, completions: 2, conversionRate: 2.2, upsellOffers: 0, upsellAccepts: 0, upsellTakeRate: null }, timeseries: [] }
  };

  const baseline = buildPerformanceBaselineSnapshot({
    range: { preset: "7d", startDate: "2026-07-19", endDate: "2026-07-25" },
    currentTelemetry: current,
    previousTelemetry: previous
  });

  assert.ok(baseline);
  assert.equal(baseline.metrics.conversionRate.current, 3.2);
  assert.equal(baseline.metrics.conversionRate.previous, 2.2);
});
