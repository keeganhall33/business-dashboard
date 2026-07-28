import assert from "node:assert/strict";
import test from "node:test";

import { deriveWooSummaryFromRecentOrders } from "@/lib/dashboard/woo-fallback";

test("Woo recent-order fallback uses Pacific calendar dates (UTC timestamp can resolve to prior Pacific day)", () => {
  const summary = deriveWooSummaryFromRecentOrders({
    range: { startDate: "2026-07-20", endDate: "2026-07-20" },
    recentOrders: [
      {
        id: 1,
        status: "completed",
        total: 10,
        // 06:30Z is 23:30 Pacific on the prior day during DST.
        date_paid_gmt: "2026-07-21T06:30:00Z"
      }
    ]
  });

  assert.ok(summary);
  assert.equal(summary.orders, 1);
  assert.equal(summary.revenue, 10);
});

test("Woo recent-order fallback includes inclusive start/end boundaries", () => {
  const summary = deriveWooSummaryFromRecentOrders({
    range: { startDate: "2026-07-21", endDate: "2026-07-23" },
    recentOrders: [
      { id: 1, status: "processing", total: 5, date_paid_gmt: "2026-07-21T12:00:00Z" },
      { id: 2, status: "completed", total: 7, date_paid_gmt: "2026-07-23T03:00:00Z" }
    ]
  });

  assert.ok(summary);
  assert.equal(summary.orders, 2);
  assert.equal(summary.revenue, 12);
});

test("Woo recent-order fallback ignores malformed dates safely", () => {
  const summary = deriveWooSummaryFromRecentOrders({
    range: { startDate: "2026-07-21", endDate: "2026-07-21" },
    recentOrders: [{ id: 1, status: "completed", total: 10, date_paid_gmt: "not-a-date" }]
  });
  assert.equal(summary, null);
});

test("Woo recent-order fallback deduplicates by stable order id", () => {
  const summary = deriveWooSummaryFromRecentOrders({
    range: { startDate: "2026-07-21", endDate: "2026-07-21" },
    recentOrders: [
      { id: 1, status: "completed", total: 10, date_paid_gmt: "2026-07-21T12:00:00Z" },
      { id: 1, status: "completed", total: 10, date_paid_gmt: "2026-07-21T12:00:00Z" }
    ]
  });

  assert.ok(summary);
  assert.equal(summary.orders, 1);
  assert.equal(summary.revenue, 10);
});

test("Woo recent-order fallback skips rows without stable id (conservative)", () => {
  const summary = deriveWooSummaryFromRecentOrders({
    range: { startDate: "2026-07-21", endDate: "2026-07-21" },
    recentOrders: [{ status: "completed", total: 10, date_paid_gmt: "2026-07-21T12:00:00Z" }]
  });

  assert.equal(summary, null);
});
