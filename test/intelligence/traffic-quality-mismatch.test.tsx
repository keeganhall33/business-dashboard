import test from "node:test";
import assert from "node:assert/strict";

import { runTrafficQualityMismatch } from "@/lib/intelligence-v1/traffic-quality-mismatch";

test("Traffic Quality Mismatch: triggers sessions up + conversion down with guardrails", async () => {
  const fakeTelemetry = (sessions: number, orders: number, revenue: number) => ({
    woo: { summary: { orders, revenue, avgOrderValue: revenue / Math.max(1, orders), completeness: "complete", asOf: "2026-08-03T12:00:00Z" }, timeseries: [] },
    ga4: { summary: { sessions, engagedSessions: null, revenue: null, eventCount: null, avgEngagementSeconds: null }, timeseries: [] }
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
  assert.equal(out.finding?.detector_id, "traffic_quality_mismatch_v1");
  assert.match(out.finding?.summary ?? "", /Sessions increased while purchase conversion declined/);
  assert.equal(out.hypotheses.length >= 3, true);
  assert.ok(out.recommendation);
  assert.ok(
    (out.recommendation?.recommended_action ?? "").includes("source/medium") ||
      (out.recommendation?.recommended_action ?? "").includes("device")
  );
});

test("Traffic Quality Mismatch: Scenario D reduces confidence when strong contradictory evidence exists", async () => {
  const fakeTelemetry = (sessions: number, orders: number, revenue: number) => ({
    woo: { summary: { orders, revenue, avgOrderValue: revenue / Math.max(1, orders), completeness: "complete", asOf: "2026-08-03T12:00:00Z" }, timeseries: [] },
    ga4: { summary: { sessions, engagedSessions: null, revenue: null, eventCount: null, avgEngagementSeconds: null }, timeseries: [] }
  });

  const fetcher = async ({ startDate }: { startDate: string }) => {
    if (startDate === "2026-07-25") return fakeTelemetry(2000, 40, 22000); // conversion down but revenue materially up
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
  assert.ok((out.finding?.evidence_against ?? []).length >= 1);
  assert.ok((out.finding?.confidence.score ?? 1) < 0.55);
  assert.ok((out.finding?.confidence.reasons ?? []).some((r) => /Contradictory evidence/i.test(r)));
});

test("Traffic Quality Mismatch: Scenario E suppressed when inputs are partial/stale", async () => {
  const fakeTelemetry = (sessions: number, orders: number, revenue: number) => ({
    woo: { summary: { orders, revenue, avgOrderValue: revenue / Math.max(1, orders), completeness: "partial", asOf: "2026-08-03T12:00:00Z" }, timeseries: [] },
    ga4: { summary: { sessions, engagedSessions: null, revenue: null, eventCount: null, avgEngagementSeconds: null }, timeseries: [] }
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

  assert.equal(out.finding, null);
  assert.equal(out.recommendation, null);
  assert.ok(out.warnings.some((w) => /completeness/i.test(w)));
});
