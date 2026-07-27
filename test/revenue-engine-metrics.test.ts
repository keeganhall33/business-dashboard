import test from "node:test";
import assert from "node:assert/strict";
import { buildRevenueEngineMetrics } from "../src/lib/dashboard/revenue-engine";

type ScoreboardMetricRowLike = {
  metric_key: string;
  metric_name: string | null;
  current_value: unknown;
  target_value: unknown;
  unit: string | null;
  stats?: unknown;
  history?: Array<{ measured_at: string | null; value: number | null }>;
};

test("Revenue Engine metrics separate purchase conversion and funnel completion", () => {
  const metricByKey = new Map<string, ScoreboardMetricRowLike>([
    [
      "conversion_rate",
      {
        metric_key: "conversion_rate",
        metric_name: "Conversion Rate",
        current_value: 0.13,
        target_value: 3,
        unit: "percent",
        stats: null,
        history: [{ measured_at: "2026-07-01", value: 0.12 }]
      }
    ]
  ]);

  const commerceTelemetry = { funnel: { summary: { conversionRate: 27.3 } } };
  const metrics = buildRevenueEngineMetrics({ metricByKey, commerceTelemetry });

  const purchase = metrics.find((m) => m.metricKey === "conversion_rate");
  const funnel = metrics.find((m) => m.metricKey === "funnel_completion_rate");

  assert.ok(purchase);
  assert.equal(purchase.metricName, "Purchase conversion");
  assert.ok(funnel);
  assert.equal(funnel.metricName, "Funnel completion");
});
