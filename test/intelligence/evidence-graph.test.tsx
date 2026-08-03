import test from "node:test";
import assert from "node:assert/strict";

import { buildTrafficQualityEvidenceEdges } from "@/lib/intelligence-v1/evidence-graph";
import { runTrafficQualityMismatch } from "@/lib/intelligence-v1/traffic-quality-mismatch";

test("evidence graph: edges reference persisted fact ids and connect finding/hypotheses/recommendation", async () => {
  const fakeTelemetry = (sessions: number, orders: number, revenue: number) => ({
    woo: { summary: { orders, revenue, avgOrderValue: revenue / Math.max(1, orders), completeness: "complete", asOf: "2026-08-03T12:00:00Z" }, timeseries: [] },
    ga4: { summary: { sessions, engagedSessions: null }, timeseries: [] }
  });

  const fetcher = async ({ startDate }: { startDate: string }) => {
    if (startDate === "2026-07-25") return fakeTelemetry(2000, 40, 10000);
    return fakeTelemetry(1500, 45, 10500);
  };

  const out = await runTrafficQualityMismatch({
    current: { startDate: "2026-07-25", endDate: "2026-07-31" },
    comparison: { startDate: "2026-07-18", endDate: "2026-07-24" },
    config: { minSessions: 500, minOrders: 10, minSessionsIncreasePct: 15, minConversionDropPct: 10, minConversionAbsDropPctPoints: 0.1 },
    fetchCommerceTelemetry: fetcher as unknown as (range: { startDate: string; endDate: string }) => Promise<unknown>,
    fetchNowIso: "2026-08-03T13:00:00Z"
  });

  assert.ok(out.finding);
  assert.ok(out.recommendation);
  assert.ok(out.hypotheses.length >= 3);

  const factIdByMetricId: Record<string, string> = {
    "ga4.sessions_count": "fact_sessions",
    "woo.orders_count": "fact_orders",
    "woo.revenue_net_usd": "fact_revenue",
    "woo.aov_usd": "fact_aov",
    "derived.purchase_conversion_pct": "fact_conv"
  };

  const edges = buildTrafficQualityEvidenceEdges({
    finding: out.finding!,
    hypotheses: out.hypotheses,
    recommendation: out.recommendation!,
    factIdByMetricId
  });

  // At least one edge to a fact id, and recommendation depends on finding.
  assert.ok(edges.some((e) => e.to_type === "fact" && e.to_id.startsWith("fact_")));
  assert.ok(edges.some((e) => e.from_type === "recommendation" && e.to_type === "finding" && e.relation === "depends_on"));
  // Hypotheses link back to the finding.
  assert.ok(edges.some((e) => e.from_type === "hypothesis" && e.to_type === "finding"));
});

