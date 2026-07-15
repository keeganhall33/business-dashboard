import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardTelemetryIntelligence } from "../src/lib/telemetry/intelligence.ts";
import type { CommerceTelemetryResult, WooMetricsResult } from "../src/lib/supabase/queries";
import type { MetaAdsSnapshot } from "../src/lib/types/dashboard";

const BASE_WOO_SUMMARY = {
  revenue: 1000,
  orders: 5,
  avgOrderValue: 200,
  discountTotal: null,
  shippingTotal: null,
  taxTotal: null,
  items: null
};

function buildWooDetails(payloadOverride?: Partial<WooMetricsResult["payload"]>, metadataOverride?: Partial<WooMetricsResult["metadata"]>) {
  const payload = {
    summary: { ...BASE_WOO_SUMMARY, ...(payloadOverride?.summary ?? {}) },
    timeseries: []
  };
  return {
    payload,
    metadata: {
      matching_data_recency_status: "fresh",
      generated_at: "2026-07-14T12:00:00Z",
      requested_start_date: "2026-07-08",
      requested_end_date: "2026-07-14",
      latest_completed_requested_business_date: "2026-07-13",
      includes_partial_day: false,
      includes_future_dates: false,
      coverage: { requested_day_count: 7, days_with_matching_orders: 7 },
      ...(metadataOverride ?? {})
    },
    summarySafe: true,
  } satisfies WooMetricsResult;
}

test("telemetry intelligence builds metadata, health, and trends", () => {
  const currentCommerce: CommerceTelemetryResult = {
    startDate: "2026-07-08",
    endDate: "2026-07-14",
    woo: { summary: { ...BASE_WOO_SUMMARY }, timeseries: [] },
    wooDetails: buildWooDetails(),
    ga4: {
      summary: { revenue: null, sessions: 100, engagedSessions: 80, eventCount: 400, avgEngagementSeconds: 45 },
      timeseries: []
    },
    funnel: {
      summary: { entries: 300, completions: 30, conversionRate: 10, upsellOffers: null, upsellAccepts: null, upsellTakeRate: null },
      timeseries: []
    }
  };

  const previousCommerce: CommerceTelemetryResult = {
    startDate: "2026-07-01",
    endDate: "2026-07-07",
    woo: {
      summary: { ...BASE_WOO_SUMMARY, revenue: 800, orders: 4, avgOrderValue: 200 },
      timeseries: []
    },
    wooDetails: buildWooDetails({ summary: { ...BASE_WOO_SUMMARY, revenue: 800, orders: 4, avgOrderValue: 200 } }),
    ga4: {
      summary: { revenue: null, sessions: 120, engagedSessions: 100, eventCount: 420, avgEngagementSeconds: 40 },
      timeseries: []
    },
    funnel: {
      summary: { entries: 280, completions: 35, conversionRate: 12, upsellOffers: null, upsellAccepts: null, upsellTakeRate: null },
      timeseries: []
    }
  };

  const metaSnapshot: MetaAdsSnapshot = {
    generatedAt: "2026-07-14T11:45:00Z",
    accountId: "act_123",
    range: 7,
    campaigns: [],
    summary: { spend: 500, impressions: 10000, clicks: 400, purchases: 20, purchaseValue: 1200, roas: 2.4 },
    status: "LIVE"
  };

  const result = buildDashboardTelemetryIntelligence({
    range: { startDate: "2026-07-08", endDate: "2026-07-14" },
    currentCommerce,
    previousCommerce,
    metaSnapshot,
    now: new Date("2026-07-15T10:00:00-07:00")
  });

  assert.equal(result.metadata.woo?.freshnessStatus, "fresh");
  assert.equal(result.metadata.ga4?.includesPartialDay, false);
  assert.equal(result.health.woo?.status, "healthy");
  const revenueTrend = result.executiveInsights.trends.find((trend) => trend.id === "woo_revenue");
  assert.ok(revenueTrend, "expected woo revenue trend entry");
  assert.equal(revenueTrend?.direction, "up");
  assert.equal(Math.round(revenueTrend?.percentChange ?? 0), 25);
  assert.equal(result.executiveInsights.brief?.topChanges.length, Math.min(3, result.executiveInsights.trends.length));
});

test("partial-day metadata and anomalies are reported", () => {
  const currentCommerce: CommerceTelemetryResult = {
    startDate: "2026-07-13",
    endDate: "2026-07-15",
    woo: {
      summary: { ...BASE_WOO_SUMMARY, revenue: 400, orders: 2, avgOrderValue: 200 },
      timeseries: []
    },
    wooDetails: buildWooDetails({ summary: { ...BASE_WOO_SUMMARY, revenue: 400, orders: 2, avgOrderValue: 200 } }, {
      matching_data_recency_status: "stale",
      includes_partial_day: true
    }),
    ga4: {
      summary: { revenue: null, sessions: 40, engagedSessions: 30, eventCount: 90, avgEngagementSeconds: 32 },
      timeseries: []
    },
    funnel: {
      summary: { entries: 90, completions: 10, conversionRate: 11.1, upsellOffers: null, upsellAccepts: null, upsellTakeRate: null },
      timeseries: []
    }
  };
  const previousCommerce: CommerceTelemetryResult = {
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    woo: {
      summary: { ...BASE_WOO_SUMMARY, revenue: 800, orders: 4, avgOrderValue: 200 },
      timeseries: []
    },
    wooDetails: buildWooDetails({ summary: { ...BASE_WOO_SUMMARY, revenue: 800, orders: 4, avgOrderValue: 200 } }),
    ga4: {
      summary: { revenue: null, sessions: 80, engagedSessions: 60, eventCount: 150, avgEngagementSeconds: 40 },
      timeseries: []
    },
    funnel: {
      summary: { entries: 120, completions: 20, conversionRate: 16, upsellOffers: null, upsellAccepts: null, upsellTakeRate: null },
      timeseries: []
    }
  };

  const intelligence = buildDashboardTelemetryIntelligence({
    range: { startDate: "2026-07-13", endDate: "2026-07-15" },
    currentCommerce,
    previousCommerce,
    now: new Date("2026-07-15T10:15:00-07:00")
  });

  assert.ok(intelligence.metadata.woo?.warningCodes.includes("partial_day"));
  assert.equal(intelligence.health.woo?.status, "warning");
  const revenueTrend = intelligence.executiveInsights.trends.find((trend) => trend.id === "woo_revenue");
  assert.ok(revenueTrend?.anomaly, "large drop should be flagged as anomaly");
});
