import test from "node:test";
import assert from "node:assert/strict";

import { buildRevenueIntelligence } from "../src/lib/revenue-intelligence.ts";
import type { CommerceTelemetry, WebsiteConversionSnapshot } from "../src/lib/types/dashboard";

test("buildRevenueIntelligence emits Woo revenue headline", () => {
  const snapshot: WebsiteConversionSnapshot = {
    generatedAt: new Date().toISOString(),
    wooCommerce: {
      netRevenue: 42000,
      paidOrdersInWindow: 320,
      grossAov: 150,
      topProducts: [
        { name: "Steph Curry Print", units: 120, revenue: 18000 },
        { name: "Seahawks Poster", units: 80, revenue: 9000 },
        { name: "Kraken Poster", units: 30, revenue: 4500 }
      ],
      recentOrders: []
    }
  } as WebsiteConversionSnapshot;

  const telemetry: CommerceTelemetry = {
    range: { preset: "7d", startDate: "2026-07-09", endDate: "2026-07-15" },
    woo: {
      summary: { revenue: 42000, orders: 320, avgOrderValue: 150, discountTotal: 0, shippingTotal: 0, taxTotal: 0, items: 0 },
      timeseries: [
        { date: "2026-07-09", revenue: 7000, orders: 60 },
        { date: "2026-07-15", revenue: 5000, orders: 45 }
      ]
    }
  } as CommerceTelemetry;

  const intel = buildRevenueIntelligence({ snapshot, telemetry });
  assert.match(intel.headline, /Woo/);
  assert.ok(intel.metrics.some((metric) => metric.label === "Woo revenue"));
  assert.ok(intel.actions.length > 0);
});
