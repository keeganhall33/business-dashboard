import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ForwardStrategyPanel } from "@/components/dashboard/ForwardStrategyPanel";

const baseRange = {
  preset: "month_to_date",
  startDate: "2026-07-01",
  endDate: "2026-07-27"
} as const;

test("Forward Strategy suppresses pacing and target gaps when Woo completeness is partial", () => {
  const html = renderToStaticMarkup(
    <ForwardStrategyPanel
      range={baseRange as any}
      data={{
        headerMetrics: [
          { metricKey: "monthly_revenue", metricName: "Revenue", currentValue: 10, targetValue: 100, unit: "usd", status: "warning" }
        ],
        commerceTelemetry: {
          woo: { summary: { revenue: 10, orders: 1, completeness: "partial" } }
        },
        telemetryHealth: {},
        executiveInsights: null
      } as any}
    />
  );

  assert.match(html, /Woo totals are partial for this range, so exact pacing and target gaps are unavailable\./);
  assert.match(html, />Revenue pace<\/p>[\s\S]*>Unavailable<\/p>/);
  assert.match(html, />Orders gap<\/p>[\s\S]*>—<\/p>/);
});

test("Forward Strategy shows gaps when Woo completeness is complete", () => {
  const html = renderToStaticMarkup(
    <ForwardStrategyPanel
      range={baseRange as any}
      data={{
        headerMetrics: [
          { metricKey: "monthly_revenue", metricName: "Revenue", currentValue: 10, targetValue: 100, unit: "usd", status: "warning" },
          { metricKey: "orders", metricName: "Orders", currentValue: 1, targetValue: 10, unit: "count", status: "warning" }
        ],
        commerceTelemetry: {
          woo: { summary: { revenue: 10, orders: 1, completeness: "complete" } }
        },
        telemetryHealth: {},
        executiveInsights: null
      } as any}
    />
  );

  assert.match(html, /Target \$100/);
  assert.match(html, /Target 10 orders/);
});
