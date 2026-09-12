import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExecutiveStrategyWorkspaceV1 } from "@/components/strategy/ExecutiveStrategyWorkspaceV1";
import { assessRecommendationContradictionsV1 } from "@/lib/core-intelligence/recommendation-contradiction/adapter";
import { buildExecutiveActionSynthesisV1 } from "@/lib/core-intelligence/executive-action-synthesis/adapter";
import { buildStrategyEvidenceReviewQueueV1 } from "@/lib/core-intelligence/strategy-evidence-review/adapter";
import type { Recommendation, RecommendationsResponse } from "@/lib/intelligence/recommendation-contract";
import { buildExecutiveStrategyWorkspaceV1 } from "@/lib/strategy/executive-strategy-v1";

function recommendation(overrides: Partial<Recommendation> & Pick<Recommendation, "id" | "title" | "category">): Recommendation {
  return {
    id: overrides.id,
    title: overrides.title,
    category: overrides.category,
    recommended_action: overrides.recommended_action ?? "Prepare the supported next step.",
    reason: overrides.reason ?? "Current evidence supports review.",
    supporting_evidence: overrides.supporting_evidence ?? [],
    affected_products: overrides.affected_products ?? [],
    affected_channels: overrides.affected_channels ?? [],
    affected_audiences: overrides.affected_audiences ?? [],
    expected_outcome: overrides.expected_outcome ?? "Advance only when evidence supports it.",
    estimated_incremental_revenue: overrides.estimated_incremental_revenue ?? {
      currency: "UNKNOWN",
      horizon: "unknown",
      low_incremental_revenue_cents: null,
      expected_incremental_revenue_cents: null,
      high_incremental_revenue_cents: null,
      notes: [],
      assumptions: [],
    },
    estimated_incremental_profit: overrides.estimated_incremental_profit ?? null,
    estimated_cost: overrides.estimated_cost ?? { money_cents: null, notes: [] },
    estimated_effort: overrides.estimated_effort ?? { hours: null, level: "medium", notes: [] },
    time_to_impact: overrides.time_to_impact ?? "unknown",
    confidence: overrides.confidence ?? "possible",
    confidence_reasons: overrides.confidence_reasons ?? [],
    urgency: overrides.urgency ?? "medium",
    priority_score: overrides.priority_score ?? {
      revenuePotential: 0.5,
      confidence: 0.5,
      urgency: 0.5,
      timeToImpact: 0.5,
      effortInverse: 0.5,
      costInverse: 0.5,
      riskInverse: 0.5,
      strategicFit: 0.5,
      executionReadiness: 0.5,
      overallScore: 50,
      formula: "test-score",
    },
    risk: overrides.risk ?? "medium",
    downside: overrides.downside ?? [],
    prerequisites: overrides.prerequisites ?? [],
    execution_steps: overrides.execution_steps ?? [],
    prepared_assets: overrides.prepared_assets ?? [],
    approval_level: overrides.approval_level ?? "L1_RECOMMENDATION",
    measurement_plan: overrides.measurement_plan ?? "Review current evidence before changing course.",
    success_threshold: overrides.success_threshold ?? "UNKNOWN",
    stop_condition: overrides.stop_condition ?? "UNKNOWN",
    review_date: overrides.review_date ?? null,
    data_used: overrides.data_used ?? [],
    data_missing: overrides.data_missing ?? [],
    assumptions: overrides.assumptions ?? [],
    limitations: overrides.limitations ?? [],
    status: overrides.status ?? "recommended",
  };
}

function buildModel(recommendations: Recommendation[]) {
  const generatedAt = "2026-09-12T18:00:00.000Z";
  const payload: RecommendationsResponse = {
    ok: true,
    generatedAt,
    dataMode: "LIVE_DATA",
    window: { startDate: "2026-09-01", endDate: "2026-09-12" },
    recommendations,
    guardrailsTriggered: [],
    warnings: [],
  };
  const contradiction = assessRecommendationContradictionsV1({
    contract_version: "recommendation_contradiction_input_v1",
    generated_at: generatedAt,
    recommendations,
  });
  const review = buildStrategyEvidenceReviewQueueV1({
    contract_version: "strategy_evidence_review_queue_input_v1",
    generated_at: generatedAt,
    recommendations,
    contradiction_assessment: contradiction,
    confidence_guards: [],
  });
  const synthesis = buildExecutiveActionSynthesisV1({
    contract_version: "executive_action_synthesis_input_v1",
    generated_at: generatedAt,
    recommendations,
    evidence_review_queue: review,
  });
  return buildExecutiveStrategyWorkspaceV1({ recommendations: payload, contradictionAssessment: contradiction, evidenceReview: review, synthesis });
}

test("strategy workspace preserves canonical score order and conflicting evidence", () => {
  const high = recommendation({
    id: "scale-high",
    title: "Scale qualified traffic",
    category: "scale",
    affected_channels: ["paid-social"],
    priority_score: {
      revenuePotential: 0.8,
      confidence: 0.7,
      urgency: 0.8,
      timeToImpact: 0.7,
      effortInverse: 0.6,
      costInverse: 0.4,
      riskInverse: 0.5,
      strategicFit: 0.8,
      executionReadiness: 0.6,
      overallScore: 88,
      formula: "existing-score",
    },
  });
  const lower = recommendation({
    id: "pause-lower",
    title: "Pause paid social",
    category: "pause",
    affected_channels: ["paid-social"],
    priority_score: {
      revenuePotential: 0.4,
      confidence: 0.5,
      urgency: 0.6,
      timeToImpact: 0.7,
      effortInverse: 0.8,
      costInverse: 0.8,
      riskInverse: 0.7,
      strategicFit: 0.5,
      executionReadiness: 0.8,
      overallScore: 61,
      formula: "existing-score",
    },
  });

  const model = buildModel([lower, high]);
  assert.equal(model.currentPriorities[0]?.id, "scale-high");
  assert.equal(model.currentPriorities[0]?.priorityScore, 88);
  assert.equal(model.currentPriorities[0]?.epistemicState, "CONFLICTED");
  assert.equal(model.currentPriorities[0]?.lane, "WAIT");
  assert.equal(model.currentPriorities[0]?.economics, null);
  assert.ok(model.blockers.some((item) => item.id === "scale-high"));
  assert.ok(model.decisionPoints.some((item) => item.id === "pause-lower"));
});

test("strategy workspace preserves INFERRED only when truth is compatible and freshness is current", () => {
  const generatedAt = "2026-09-12T18:00:00.000Z";
  const records = ["one", "two"].map((id) => recommendation({
    id,
    title: `Supported option ${id}`,
    category: "scale",
    affected_channels: ["organic"],
    supporting_evidence: [{ id: `e-${id}`, label: "Observed metric", source: "ga4", kind: "metric", details: {} }],
    estimated_cost: { money_cents: 0, notes: [] },
    estimated_effort: { hours: 1, level: "low", notes: [] },
    time_to_impact: "days",
    confidence: "likely",
    review_date: "2026-09-20",
    assumptions: ["Observed channel scope remains comparable."],
  }));
  const payload: RecommendationsResponse = {
    ok: true,
    generatedAt,
    dataMode: "LIVE_DATA",
    window: { startDate: "2026-09-01", endDate: "2026-09-12" },
    recommendations: records,
    guardrailsTriggered: [],
    warnings: [],
  };
  const contradiction = assessRecommendationContradictionsV1({
    contract_version: "recommendation_contradiction_input_v1",
    generated_at: generatedAt,
    recommendations: records,
  });
  assert.ok(contradiction.compatible_pairs.some((pair) => pair.truth_state === "INFERRED"));

  const baseReview = buildStrategyEvidenceReviewQueueV1({
    contract_version: "strategy_evidence_review_queue_input_v1",
    generated_at: generatedAt,
    recommendations: records,
    contradiction_assessment: contradiction,
    confidence_guards: [],
  });
  const currentQueue = baseReview.queue.map((item) => ({ ...item, freshness_state: "CURRENT" as const }));
  const review = {
    ...baseReview,
    queue: currentQueue,
    REVIEW_NOW: currentQueue.filter((item) => item.disposition === "REVIEW_NOW"),
    REVIEW_NEXT: currentQueue.filter((item) => item.disposition === "REVIEW_NEXT"),
    DEFER: currentQueue.filter((item) => item.disposition === "DEFER"),
  };
  const synthesis = buildExecutiveActionSynthesisV1({
    contract_version: "executive_action_synthesis_input_v1",
    generated_at: generatedAt,
    recommendations: records,
    evidence_review_queue: review,
  });
  const model = buildExecutiveStrategyWorkspaceV1({
    recommendations: payload,
    contradictionAssessment: contradiction,
    evidenceReview: review,
    synthesis,
  });

  assert.equal(model.currentPriorities[0]?.epistemicState, "INFERRED");
});

test("strategy workspace renders scan-first sections without inventing unsupported economics", () => {
  const model = buildModel([
    recommendation({
      id: "unknown-economics",
      title: "Evidence-limited partnership",
      category: "partnership",
      data_missing: ["current partner budget"],
      prerequisites: ["verify decision-maker"],
    }),
  ]);
  const html = renderToStaticMarkup(<ExecutiveStrategyWorkspaceV1 model={model} />);

  assert.match(html, /Current priorities/);
  assert.match(html, /Active bets/);
  assert.match(html, /Dependencies and blockers/);
  assert.match(html, /Decision points/);
  assert.match(html, /Next safe moves/);
  assert.match(html, /Economics: Unknown/);
  assert.match(html, /current partner budget/);
  assert.match(html, /href="\/recommend"/);
  assert.match(html, /href="\/data-evidence"/);
});

test("strategy production route uses canonical recommendation pipeline and no strategy fixtures", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/strategy/page.tsx"), "utf8");
  assert.match(source, /getDashboardOverview/);
  assert.match(source, /getCommerceTelemetry/);
  assert.match(source, /buildRecommendationsFromExplanation/);
  assert.match(source, /buildExecutiveActionSynthesisV1/);
  assert.doesNotMatch(source, /fixture/i);
});
