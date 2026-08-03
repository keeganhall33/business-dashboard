import test from "node:test";
import assert from "node:assert/strict";

import { buildExecutiveBriefingModel } from "@/lib/dashboard/executive-briefing";
import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary } from "@/lib/data-confidence";
import type { ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import type { DashboardTruthState } from "@/lib/dashboard/truth-state";

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

function confidenceWithIssues(labels: string[], options?: { trustedSources?: string[] }) {
  const entries = labels.map((label) => {
    const lower = label.toLowerCase();
    const id = (lower === "woo" || lower === "ga4" || lower === "meta" || lower === "funnelkit" || lower === "industry" || lower === "operations" || lower === "pipeline" || lower === "customer"
      ? (lower as unknown)
      : ("industry" as unknown)) as ConfidenceSummary["entries"][number]["id"]; 

    return {
      id,
      label,
      state: "unavailable",
      decisionImpact: label === "Meta" ? "Meta attribution is unavailable; decisions relying on it are blocked." : `${label} is unavailable.`,
      confidenceScore: 0
    };
  });

  const summary = {
    entries,
    partialDay: false,
    overall: { label: "Moderate confidence", tone: "amber", rationale: "", state: "mixed", lastRefresh: null },
    trustedSources: options?.trustedSources ?? [],
    caveatSources: [],
    insufficientSources: labels,
    conflictingSources: [],
    topRisk: null,
    decisionsAffected: [],
    recommendedActions: []
  };

  return summary as unknown as ConfidenceSummary;
}

function confidenceCommerceTrafficTrustedMetaBlocked() {
  return confidenceWithIssues(["Meta"], { trustedSources: ["Woo", "GA4"] });
}

function healthyTruth(): DashboardTruthState {
  return {
    degraded: { active: false, reason: "", unavailableDomains: [], stillWorks: [], consequence: { summary: "", decisionsAffected: [] } },
    domains: {},
    metrics: {}
  };
}

function degradedTruth(): DashboardTruthState {
  return {
    degraded: {
      active: true,
      reason: "Limited reporting",
      unavailableDomains: [],
      stillWorks: [],
      consequence: { summary: "Revenue decisions cannot be verified.", decisionsAffected: [] },
      nextAction: { title: "Restore Woo data feed", href: "/data" }
    },
    domains: {},
    metrics: {}
  };
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
    actions: [],
    truth: healthyTruth()
  });

  assert.ok(model.changed.lines.length <= 3);
});

test("briefing: attention shows max 3 items", () => {
  const model = buildExecutiveBriefingModel({
    summary: null,
    confidence: confidenceWithIssues(["Woo", "GA4", "Meta", "Funnel"]),
    actions: [],
    truth: healthyTruth()
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
    ],
    truth: healthyTruth()
  });

  assert.ok(model.nextMove.lines.length >= 1);
  // First line should be the single action title.
  assert.equal(model.nextMove.lines[0], "Fix ads");
});

test("briefing: when no actions, next move becomes a single data prerequisite", () => {
  const model = buildExecutiveBriefingModel({
    summary: null,
    confidence: confidenceWithIssues(["Meta"]),
    actions: [],
    truth: healthyTruth()
  });

  assert.equal(model.nextMove.title, "Recommended next move");
  assert.equal(model.nextMove.lines[0], "Restore data confidence");
});

test("briefing: degraded mode forces 'Unable to verify changes'", () => {
  const model = buildExecutiveBriefingModel({
    summary: summaryWithMovements([{ label: "Revenue", deltaPercent: 0.2 }]),
    confidence: confidenceWithIssues(["Woo"]),
    actions: [],
    truth: degradedTruth()
  });

  assert.equal(model.changed.lines[0], "Unable to verify changes for this period.");
  assert.ok(!model.health.lines.join(" ").includes("No material verified changes"));
  assert.ok(!model.changed.lines.join(" ").includes("No material verified changes"));
});

test("briefing: domain-qualified narrative when Meta attribution is unavailable", () => {
  const model = buildExecutiveBriefingModel({
    summary: summaryWithMovements([]),
    confidence: confidenceCommerceTrafficTrustedMetaBlocked(),
    actions: [],
    truth: healthyTruth()
  });

  // Business can remain stable.
  assert.equal(model.health.lines[0], "Stable");
  // Verified basis is explicit.
  assert.ok(model.health.lines.join(" ").includes("Verified: commerce + traffic"));
  // Decision limitation is explicit and not numeric.
  assert.ok(model.health.lines.join(" ").toLowerCase().includes("meta attribution"));
  assert.ok(model.health.lines.join(" ").toLowerCase().includes("marketing efficiency"));
  // Avoid repeating the same warning verbatim in other cards.
  assert.ok(!model.attention.lines.join(" ").toLowerCase().includes("meta attribution"));
});

test("briefing: healthy comparable mode can render 'No material verified changes'", () => {
  const model = buildExecutiveBriefingModel({
    summary: summaryWithMovements([]),
    confidence: confidenceWithIssues([]),
    actions: [],
    truth: healthyTruth()
  });

  assert.match(model.health.lines.join(" "), /No material verified changes/);
});
