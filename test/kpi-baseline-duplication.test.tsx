/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PerformanceBaselinePanel } from "../src/components/dashboard/PerformanceBaselinePanel";

test("Performance Baseline emphasizes previous value, not repeating current as the primary number", () => {
  const html = renderToStaticMarkup(
    <PerformanceBaselinePanel
      range={{ preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" } as any}
      snapshot={{
        range: { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" },
        previousRange: { startDate: "2026-06-24", endDate: "2026-06-30" },
        metrics: {
          revenue: { id: "revenue", unit: "currency", current: 200, previous: 100, delta: 100, deltaPercent: 1 },
          orders: { id: "orders", unit: "count", current: 4, previous: 2, delta: 2, deltaPercent: 1 },
          avgOrderValue: { id: "avg_order_value", unit: "currency", current: 50, previous: 50, delta: 0, deltaPercent: 0 },
          sessions: { id: "sessions", unit: "count", current: 1000, previous: 800, delta: 200, deltaPercent: 0.25 },
          purchaseConversionRate: { id: "purchase_conversion_rate", unit: "percent", current: 0.4, previous: 0.3, delta: 0.1, deltaPercent: 0.333 },
          funnelCompletionRate: { id: "funnel_completion_rate", unit: "percent", current: 12, previous: 10, delta: 2, deltaPercent: 0.2 }
        }
      } as any}
    />
  );

  // Revenue card should lead with previous $100.00 and include current in a separate "Now" line.
  assert.match(html, />Revenue<\/div>[\s\S]*>\$100\.00<\/div>[\s\S]*Now: \$200\.00/);
});
