import test from "node:test";
import assert from "node:assert/strict";
import { buildForwardStrategyCopy } from "../src/lib/dashboard/forward-strategy";
import type { ExecutiveSummary } from "../src/lib/dashboard/executive-summary";

function summaryWith(opts: Partial<ExecutiveSummary["metrics"]>): ExecutiveSummary {
  const base: ExecutiveSummary = {
    rangeLabel: "2026-07-01 → 2026-07-31",
    comparisonLabel: "2026-06-01 → 2026-06-30",
    metrics: {
      revenue: { label: "Revenue", unit: "currency", current: 5000, previous: 6000, delta: -1000, deltaPercent: -0.1667 },
      orders: { label: "Orders", unit: "count", current: 7, previous: 9, delta: -2, deltaPercent: -0.2222 },
      aov: { label: "AOV", unit: "currency", current: 714, previous: 700, delta: 14, deltaPercent: 0.02 },
      sessions: { label: "Sessions", unit: "count", current: 5589, previous: 6200, delta: -611, deltaPercent: -0.0985 },
      purchaseConversion: { label: "Purchase conversion", unit: "percent", current: 0.13, previous: 0.12, delta: 0.01, deltaPercent: 0.05 },
      funnelCompletion: { label: "Funnel completion", unit: "percent", current: 27.3, previous: 25.0, delta: 2.3, deltaPercent: 0.092 }
    }
  };

  return {
    ...base,
    metrics: {
      ...base.metrics,
      ...opts
    }
  };
}

test("Forward Strategy: material declines suppress 'no telemetry risks' fallback", () => {
  const s = summaryWith({
    revenue: { label: "Revenue", unit: "currency", current: 5000, previous: 6500, delta: -1500, deltaPercent: -0.23 },
    orders: { label: "Orders", unit: "count", current: 7, previous: 10, delta: -3, deltaPercent: -0.3 }
  });
  const copy = buildForwardStrategyCopy(s);
  assert.ok(copy.risks.length > 0);
  assert.ok(copy.risks.every((r) => !r.toLowerCase().includes("no telemetry risks")));
  assert.ok(copy.nextAction.length > 0);
});

test("Forward Strategy: missing summary yields insufficient evidence + no action", () => {
  const copy = buildForwardStrategyCopy(null);
  assert.ok(copy.risks[0].toLowerCase().includes("unavailable"));
  assert.equal(copy.nextAction, "No evidence-backed next action is available for this period.");
});

test("Forward Strategy: stable window yields no material risk movement", () => {
  const s = summaryWith({
    revenue: { label: "Revenue", unit: "currency", current: 5000, previous: 5050, delta: -50, deltaPercent: -0.01 },
    orders: { label: "Orders", unit: "count", current: 7, previous: 7, delta: 0, deltaPercent: 0 }
  });
  const copy = buildForwardStrategyCopy(s);
  assert.ok(copy.risks[0].toLowerCase().includes("no material risk movement"));
});

test("Forward Strategy: sessions down materially + conversion stable yields traffic action", () => {
  const s = summaryWith({
    sessions: { label: "Sessions", unit: "count", current: 3000, previous: 4000, delta: -1000, deltaPercent: -0.25 },
    purchaseConversion: { label: "Purchase conversion", unit: "percent", current: 0.2, previous: 0.2, delta: 0, deltaPercent: 0.0 }
  });
  const copy = buildForwardStrategyCopy(s);
  assert.ok(copy.nextAction.toLowerCase().includes("sessions declined"));
  assert.ok(copy.nextAction.toLowerCase().includes("traffic"));
});
