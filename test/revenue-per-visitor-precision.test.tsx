/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildRevenueEngineMetrics } from "@/lib/dashboard/revenue-engine";
import { MetricCard } from "@/components/dashboard/MetricCard";

function mapFromRows(rows: Array<{ metric_key: string; metric_name?: string | null; current_value?: unknown; target_value?: unknown; unit?: string | null }>) {
  return new Map(
    rows.map((row) => [
      row.metric_key,
      {
        metric_key: row.metric_key,
        metric_name: row.metric_name ?? null,
        current_value: row.current_value ?? null,
        target_value: row.target_value ?? null,
        unit: row.unit ?? null,
        stats: null,
        history: null
      }
    ])
  );
}

test("Revenue per visitor preserves cents under $1", () => {
  const metricByKey = mapFromRows([
    { metric_key: "revenue_per_visitor", metric_name: "Revenue per visitor", target_value: 1, unit: "usd" }
  ]);

  const metrics = buildRevenueEngineMetrics({
    metricByKey,
    commerceTelemetry: {
      woo: { summary: { revenue: 14, orders: 1, completeness: "complete" } },
      ga4: { summary: { sessions: 100 } }
    }
  });

  const rpv = metrics.find((m) => m.metricKey === "revenue_per_visitor");
  assert.ok(rpv);
  assert.equal(rpv.currentValue, 0.14);

  const html = renderToStaticMarkup(<MetricCard metric={rpv as any} hideSupportingDetails />);
  assert.match(html, /\$0\.14/);
});

test("Revenue per visitor shows Unavailable when sessions are missing or zero", () => {
  const metricByKey = mapFromRows([{ metric_key: "revenue_per_visitor", metric_name: "Revenue per visitor", unit: "usd" }]);

  const missing = buildRevenueEngineMetrics({
    metricByKey,
    commerceTelemetry: { woo: { summary: { revenue: 10, orders: 1, completeness: "complete" } }, ga4: { summary: { sessions: null } } }
  }).find((m) => m.metricKey === "revenue_per_visitor");
  assert.ok(missing);
  assert.equal(missing.currentValue, null);

  const zero = buildRevenueEngineMetrics({
    metricByKey,
    commerceTelemetry: { woo: { summary: { revenue: 10, orders: 1, completeness: "complete" } }, ga4: { summary: { sessions: 0 } } }
  }).find((m) => m.metricKey === "revenue_per_visitor");
  assert.ok(zero);
  assert.equal(zero.currentValue, null);
});

test("Partial commerce revenue produces At least RPV and suppresses target comparison", () => {
  const metricByKey = mapFromRows([
    { metric_key: "revenue_per_visitor", metric_name: "Revenue per visitor", target_value: 1, unit: "usd" }
  ]);

  const metrics = buildRevenueEngineMetrics({
    metricByKey,
    commerceTelemetry: {
      woo: { summary: { revenue: 1, orders: 1, completeness: "partial" } },
      ga4: { summary: { sessions: 100 } }
    }
  });

  const rpv = metrics.find((m) => m.metricKey === "revenue_per_visitor");
  assert.ok(rpv);
  assert.equal(rpv.currentQualifier, "at_least");
  assert.equal(rpv.targetValue, null);

  const html = renderToStaticMarkup(<MetricCard metric={rpv as any} hideSupportingDetails />);
  assert.match(html, /At least/);
  assert.match(html, /Target Unavailable/);
});

test("Revenue per visitor formatting does not collapse small values to $0", () => {
  const metricByKey = mapFromRows([{ metric_key: "revenue_per_visitor", metric_name: "Revenue per visitor", unit: "usd" }]);

  const cases = [0.01, 0.56, 1.0].map((rpv) => {
    const sessions = 100;
    const revenue = rpv * sessions;
    const metrics = buildRevenueEngineMetrics({
      metricByKey,
      commerceTelemetry: { woo: { summary: { revenue, orders: 1, completeness: "complete" } }, ga4: { summary: { sessions } } }
    });
    return metrics.find((m) => m.metricKey === "revenue_per_visitor");
  });

  const html = cases.map((metric) => renderToStaticMarkup(<MetricCard metric={metric as any} hideSupportingDetails />)).join("\n");
  assert.match(html, /\$0\.01/);
  assert.match(html, /\$0\.56/);
  assert.match(html, /\$1\.00/);
});
