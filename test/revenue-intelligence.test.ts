import test from "node:test";
import assert from "node:assert/strict";

import { buildRevenueIntelligence } from "../src/lib/revenue-intelligence.ts";
import type { CommerceTelemetry, WebsiteConversionSnapshot } from "../src/lib/types/dashboard";

test("healthy revenue growth emits no corrective actions", () => {
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry: makeTelemetry() });
  assert.ok(intel.headline);
  assert.match(intel.headline?.value ?? "", /up/);
  assert.equal(intel.actions.length, 0);
});

test("material Woo decline triggers stabilization action", () => {
  const telemetry = structuredClone(makeTelemetry());
  telemetry.woo!.timeseries = telemetry.woo!.timeseries.map((point, idx) => ({
    ...point,
    revenue: 9000 - idx * 800,
    orders: 40 - idx
  }));
  telemetry.woo!.summary.revenue = 42000;
  telemetry.woo!.summary.orders = 160;
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry });
  assert.ok(intel.actions.some((action) => action.id === "woo-revenue-decline"));
  assert.equal(intel.scenario?.label, "Scenario Outlook");
});

test("low cart-to-checkout conversion triggers checkout fix recommendation", () => {
  const snapshot = makeSnapshot({
    ga4: {
      ...makeSnapshot().ga4!,
      funnelRates: { cartToCheckout: 0.2 }
    }
  });
  const intel = buildRevenueIntelligence({ snapshot, telemetry: makeTelemetry() });
  assert.ok(intel.actions.some((action) => action.id === "funnel-cart-drop"));
});

test("high refund rate generates refund investigation", () => {
  const snapshot = makeSnapshot({
    wooCommerce: {
      ...makeSnapshot().wooCommerce!,
      refundRate: 0.11,
      netRevenue: 50000,
      refundDefinition: "completed orders"
    }
  });
  const intel = buildRevenueIntelligence({ snapshot, telemetry: makeTelemetry() });
  assert.ok(intel.actions.some((action) => action.id === "woo-refunds"));
});

test("product concentration issues emit diversify action when thresholds met", () => {
  const snapshot = makeSnapshot({
    wooCommerce: {
      ...makeSnapshot().wooCommerce!,
      paidOrdersInWindow: 120,
      topProducts: [
        { name: "Hero", units: 80, revenue: 16000 },
        { name: "Alt 1", units: 20, revenue: 4000 },
        { name: "Alt 2", units: 20, revenue: 3000 }
      ]
    }
  });
  const telemetry = makeTelemetry();
  const intel = buildRevenueIntelligence({ snapshot, telemetry });
  assert.ok(intel.actions.some((action) => action.id === "woo-product-concentration"));
});

test("product concentration suppressed when order sample insufficient", () => {
  const snapshot = makeSnapshot({
    wooCommerce: {
      ...makeSnapshot().wooCommerce!,
      paidOrdersInWindow: 5,
      topProducts: [
        { name: "Hero", units: 5, revenue: 1000 },
        { name: "Alt", units: 1, revenue: 200 }
      ]
    }
  });
  const intel = buildRevenueIntelligence({ snapshot, telemetry: makeTelemetry() });
  assert.ok(!intel.actions.some((action) => action.id === "woo-product-concentration"));
});

test("customer intelligence always marked insufficient", () => {
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry: makeTelemetry() });
  assert.equal(intel.customerMessage, "Insufficient customer history for reliable customer intelligence");
});

test("empty telemetry window returns insufficient scenario", () => {
  const intel = buildRevenueIntelligence({ snapshot: null, telemetry: undefined });
  assert.equal(intel.actions.length, 0);
  assert.match(intel.scenario?.summary ?? "", /cannot yet be quantified/);
});

test("partial day range suppresses revenue decline action", () => {
  const today = new Date().toISOString().slice(0, 10);
  const start = isoDaysAgo(6, today);
  const telemetry = structuredClone(makeTelemetry());
  telemetry.range = { preset: "7d", startDate: start, endDate: today };
  telemetry.woo!.timeseries = enumerateRange(start, today).map((date, idx) => ({
    date,
    revenue: 9000 - idx * 700,
    orders: 30 - idx
  }));
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry });
  assert.ok(!intel.actions.some((action) => action.id === "woo-revenue-decline"));
});

test("stale sources suppress drivers", () => {
  const endDate = isoDaysAgo(10);
  const startDate = isoDaysAgo(16);
  const telemetry = structuredClone(makeTelemetry());
  telemetry.range = { preset: "7d", startDate, endDate };
  telemetry.woo!.timeseries = enumerateRange(startDate, endDate).map((date) => ({ date, revenue: 6000, orders: 20 }));
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry });
  assert.equal(intel.actions.length, 0);
});

test("missing comparison period prevents trend drivers", () => {
  const telemetry = structuredClone(makeTelemetry());
  telemetry.woo!.timeseries = [telemetry.woo!.timeseries[0]];
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry });
  assert.equal(intel.drivers.length, 0);
});

test("single order range suppresses order actions", () => {
  const telemetry = structuredClone(makeTelemetry());
  telemetry.woo!.summary = { revenue: 1000, orders: 1, avgOrderValue: 1000, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 };
  telemetry.woo!.timeseries = telemetry.woo!.timeseries.map((point) => ({ ...point, revenue: 1000, orders: 1 }));
  const snapshot = makeSnapshot({ wooCommerce: { ...makeSnapshot().wooCommerce!, paidOrdersInWindow: 1 } });
  const intel = buildRevenueIntelligence({ snapshot, telemetry });
  assert.ok(!intel.actions.some((action) => action.id === "woo-order-decline"));
});

test("reconciliation includes Woo and GA4 when both available", () => {
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry: makeTelemetry() });
  const labels = intel.reconciliation.entries.map((entry) => entry.label);
  assert.ok(labels.includes("Woo completed-order revenue"));
  assert.ok(labels.includes("GA4 analytics-reported revenue"));
});

test("conflicting Woo and GA4 signals both surface", () => {
  const telemetry = structuredClone(makeTelemetry());
  telemetry.woo!.timeseries = telemetry.woo!.timeseries.map((point, idx) => ({ ...point, revenue: 9000 - idx * 900, orders: 35 - idx }));
  telemetry.ga4!.timeseries = telemetry.ga4!.timeseries.map((point, idx) => ({ ...point, revenue: 2000 + idx * 700, sessions: 220 + idx * 10 }));
  const intel = buildRevenueIntelligence({ snapshot: makeSnapshot(), telemetry });
  assert.ok(intel.headline?.label === "Woo trend" || intel.headline?.label === "GA4 trend");
  assert.ok(intel.reconciliation.entries.length >= 2);
});

function makeSnapshot(overrides?: Partial<WebsiteConversionSnapshot>): WebsiteConversionSnapshot {
  const { endIso } = baseRange();
  return {
    generatedAt: `${endIso}T12:00:00.000Z`,
    ga4: {
      totalUsers: 1500,
      sessions: 1700,
      ecommercePurchases: 120,
      purchaseRevenue: 38000,
      funnelRates: {
        cartToCheckout: 0.45,
        sessionToPurchase: 0.08,
        checkoutToPurchase: 0.6
      }
    },
    wooCommerce: {
      netRevenue: 42000,
      paidOrdersInWindow: 160,
      topProducts: [
        { name: "Hero", units: 45, revenue: 15000 },
        { name: "Alt", units: 40, revenue: 12000 },
        { name: "Third", units: 35, revenue: 9000 }
      ],
      refundRate: 0.04,
      refundDefinition: "completed orders",
      recentOrders: [
        { id: 1, status: "completed", total: 250, currency: "USD", date_paid: "2026-07-14T10:00:00Z" },
        { id: 2, status: "completed", total: 180, currency: "USD", date_paid: "2026-07-13T10:00:00Z" }
      ]
    },
    ...overrides
  } as WebsiteConversionSnapshot;
}

function makeTelemetry(overrides?: Partial<CommerceTelemetry>): CommerceTelemetry {
  const { startIso, endIso } = baseRange();
  const range = overrides?.range ?? { preset: "7d", startDate: startIso, endDate: endIso };
  const wooTimeseries = overrides?.woo?.timeseries ?? enumerateRange(range.startDate, range.endDate).map((date, idx) => ({
    date,
    revenue: 6000 + idx * 250,
    orders: 20 + idx
  }));
  const gaTimeseries = overrides?.ga4?.timeseries ?? enumerateRange(range.startDate, range.endDate).map((date, idx) => ({
    date,
    revenue: 3500 + idx * 150,
    sessions: 180 + idx * 10,
    engagedSessions: 120 + idx * 8
  }));
  return {
    range,
    woo: overrides?.woo ?? {
      summary: { revenue: 42000, orders: 160, avgOrderValue: 260, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 },
      timeseries: wooTimeseries
    },
    ga4: overrides?.ga4 ?? {
      summary: { revenue: 38000, sessions: 1700, engagedSessions: 1400, eventCount: 0, avgEngagementSeconds: 0 },
      timeseries: gaTimeseries
    }
  } as CommerceTelemetry;
}

function baseRange() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  return { startIso: formatIso(start), endIso: formatIso(end) };
}

function enumerateRange(startIso: string, endIso: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function formatIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number, referenceIso?: string) {
  const reference = referenceIso ? new Date(`${referenceIso}T00:00:00Z`) : new Date();
  reference.setUTCDate(reference.getUTCDate() - days);
  return formatIso(reference);
}
