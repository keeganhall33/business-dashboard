import test from "node:test";
import assert from "node:assert/strict";
import { buildRecommendationsFromExplanation } from "@/lib/intelligence/recommendation-engine";
import type { ExplainResponse } from "@/lib/intelligence/explanation-contract";

function mkExplain(confidence: ExplainResponse["explanation"]["confidence"], primaryLabel: string): ExplainResponse {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    dataMode: "LIVE_DATA",
    explanation: {
      metric: "revenue",
      current_period: { startDate: "2026-07-01", endDate: "2026-07-07" },
      comparison_period: { startDate: "2026-06-24", endDate: "2026-06-30" },
      absolute_change: 10000,
      percentage_change: 10,
      baseline: { currentValue: 20000, previousValue: 10000 },
      primary_driver: {
        id: "d1",
        label: primaryLabel,
        direction: "up",
        magnitude: "moderate",
        confidence,
        confidenceReasons: [],
        evidence: []
      },
      contributing_drivers: [],
      counteracting_drivers: [],
      possible_external_events: [],
      alternative_explanations: [],
      confidence,
      confidence_reasons: [],
      data_used: [],
      data_missing: [],
      assumptions: [],
      limitations: [],
      recommended_follow_up: [],
      evidence: []
    },
    timeline: { window: { startDate: "2026-07-01", endDate: "2026-07-07" }, sources: [], events: [] }
  };
}

test("insufficient evidence produces do_nothing + data_connection", () => {
  const ex = mkExplain("insufficient_evidence", "Traffic (sessions)");
  const res = buildRecommendationsFromExplanation({ explanation: ex, missingSources: ["email", "matchback"] });
  assert.equal(res.ok, true);
  assert.ok(res.recommendations.some((r) => r.category === "do_nothing"));
  assert.ok(res.recommendations.some((r) => r.category === "data_connection"));
});

test("traffic driver yields a traffic-focused recommendation", () => {
  const ex = mkExplain("likely", "Traffic (sessions)");
  const res = buildRecommendationsFromExplanation({ explanation: ex, missingSources: ["email", "matchback"] });
  assert.equal(res.ok, true);
  assert.ok(res.recommendations.some((r) => r.title.toLowerCase().includes("traffic")));
});
