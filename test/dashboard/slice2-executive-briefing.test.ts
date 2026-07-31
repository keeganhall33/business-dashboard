import test from "node:test";
import assert from "node:assert/strict";

import { buildExecutiveBriefingModel } from "@/lib/dashboard/executive-briefing";
import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import type { ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";

function summaryWithMovements(movements: Array<{ label: string; deltaPercent: number }>) {
  const base: ExecutiveSummary = {
    rangeLabel: "2026-01-01 → 2026-01-31",
    comparisonLabel: "2025-12-01 → 2025-12-31",
    metrics: {
      revenue: { label: "Revenue", unit: "currency", current: 1, previous: 1, delta: 0, deltaPercent: 0 },
      orders: { label: "Orders", unit: "count", current: 1, previous: 1, delta: 0, deltaPercent: 0 },
      aov: { label: "AOV", unit: "currency", current: 1, previous: 1, delta: 0, deltaPercent: 0 },
      sessions: { label: "Sessions", unit: "count", current: 1, previous: 1, delta: 0, deltaPercent: 0 },
      purchaseConversion: { label: "Purchase conversion", unit: "percent", current: 1, previous: 1, delta: 0, deltaPercent: 0 },
      funnelCompletion: { label: "Funnel completion", unit: "percent", current: 1, previous: 1, delta: 0, deltaPercent: 0 }
    }
  } as unknown as ExecutiveSummary;

  // apply movements
  for (const m of movements) {
    const key = Object.keys(base.metrics).find((k) => base.metrics[k].label === m.label);
    if (key) base.metrics[key].deltaPercent = m.deltaPercent;
  }
  return base;
}

function confidenceWithIssues(labels: string[]) {
  const summary = {
    entries: labels.map((label, idx) => ({
      id: `src-${idx}`,
      label,
      state: "unavailable",
      decisionImpact: `${label} is unavailable.`,
      confidenceScore: 0
    }))
  };
  return summary as unknown as ConfidenceSummary;
}

test("briefing: shows max 3 changes", () => {
  const model = buildExecutiveBriefingModel({
    summary: summaryWithMovements([
      { label: "Revenue", deltaPercent: -0.3 },
      { label: "Orders", deltaPercent: -0.25 },
      { label: "Sessions", deltaPercent: 0.2 },
      { label: "AOV", deltaPercent: 0.15 }
    ]),
    confidence: confidenceWithIssues([]),
    actions: []
  });

  assert.ok(model.changed.lines.length <= 3);
});

test("briefing: attention shows max 3 items", () => {
  const model = buildExecutiveBriefingModel({
    summary: null,
    confidence: confidenceWithIssues(["Woo", "GA4", "Meta", "Funnel"]),
    actions: []
  });

  assert.ok(model.attention.lines.length <= 3);
});

test("briefing: next move is one primary recommendation", () => {
  const model = buildExecutiveBriefingModel({
    summary: null,
    confidence: confidenceWithIssues([]),
    actions: [
      {
        id: "marketing-1",
        title: "Fix ads",
        impact: "ROAS down",
        confidence: "High",
        evidence: "Meta trend",
        priority: "P1",
        owner: null,
        due: null,
        weight: 10
      } as unknown as ExecutiveActionPlan
    ]
  });

  assert.ok(model.nextMove.lines.length >= 1);
  // First line should be the single action title.
  assert.equal(model.nextMove.lines[0], "Fix ads");
});

test("briefing: when no actions, next move becomes a single data prerequisite", () => {
  const model = buildExecutiveBriefingModel({
    summary: null,
    confidence: confidenceWithIssues(["Meta"]),
    actions: []
  });

  assert.equal(model.nextMove.title, "Recommended next move");
  assert.equal(model.nextMove.lines[0], "Restore data confidence");
});
