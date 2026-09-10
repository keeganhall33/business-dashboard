import test from "node:test";
import assert from "node:assert/strict";

import { buildExecutiveActionSynthesisV1 } from "@/lib/core-intelligence/executive-action-synthesis/adapter";
import type { StrategyEvidenceReviewQueueItemV1, StrategyEvidenceReviewQueueV1 } from "@/lib/core-intelligence/strategy-evidence-review/contracts";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";

function recommendation(overrides: Partial<Recommendation> & Pick<Recommendation, "id">): Recommendation {
  return {
    id: overrides.id,
    title: overrides.title ?? `Recommendation ${overrides.id}`,
    category: overrides.category ?? "partnership",
    recommended_action: overrides.recommended_action ?? "Prepare the supported next step.",
    reason: overrides.reason ?? "Supported by current evidence.",
    supporting_evidence: overrides.supporting_evidence ?? [],
    affected_products: overrides.affected_products ?? [],
    affected_channels: overrides.affected_channels ?? [],
    affected_audiences: overrides.affected_audiences ?? [],
    expected_outcome: overrides.expected_outcome ?? "Advance only when supported.",
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
    estimated_effort: overrides.estimated_effort ?? { hours: null, level: "low", notes: [] },
    time_to_impact: overrides.time_to_impact ?? "unknown",
    confidence: overrides.confidence ?? "strongly_supported",
    confidence_reasons: overrides.confidence_reasons ?? [],
    urgency: overrides.urgency ?? "medium",
    priority_score: overrides.priority_score ?? {
      revenuePotential: 0.5,
      confidence: 0.8,
      urgency: 0.5,
      timeToImpact: 0.5,
      effortInverse: 0.5,
      costInverse: 0.5,
      riskInverse: 0.5,
      strategicFit: 0.8,
      executionReadiness: 0.5,
      overallScore: 70,
      formula: "fixture",
    },
    risk: overrides.risk ?? "low",
    downside: overrides.downside ?? [],
    prerequisites: overrides.prerequisites ?? [],
    execution_steps: overrides.execution_steps ?? [],
    prepared_assets: overrides.prepared_assets ?? [],
    approval_level: overrides.approval_level ?? "L1_RECOMMENDATION",
    measurement_plan: overrides.measurement_plan ?? "Observe supported outcome evidence.",
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

function review(
  recommendationId: string,
  overrides: Partial<StrategyEvidenceReviewQueueItemV1> = {},
): StrategyEvidenceReviewQueueItemV1 {
  return {
    recommendation_id: recommendationId,
    title: `Review ${recommendationId}`,
    disposition: "DEFER",
    review_score: 0,
    contradiction_count: 0,
    unknown_count: 0,
    degrading_input_count: 0,
    stale_source_count: 0,
    conflicted_source_count: 0,
    confidence_now: "strongly_supported",
    freshness_state: "CURRENT",
    truth_state: "KNOWN",
    WHY_REVIEW: ["No material evidence-review trigger is present."],
    WHAT_TO_REVIEW_NEXT: "Keep evidence on normal monitoring cadence.",
    ...overrides,
  };
}

function evidenceQueue(items: StrategyEvidenceReviewQueueItemV1[]): StrategyEvidenceReviewQueueV1 {
  return {
    contract_version: "strategy_evidence_review_queue_v1",
    generated_at: "2026-09-10T16:00:00.000Z",
    REVIEW_NOW: items.filter((item) => item.disposition === "REVIEW_NOW"),
    REVIEW_NEXT: items.filter((item) => item.disposition === "REVIEW_NEXT"),
    DEFER: items.filter((item) => item.disposition === "DEFER"),
    queue: items,
    recommendation_snapshots: [],
    mutation_performed: false,
    keegan_action_required: "NO",
  };
}

function synthesize(recommendations: Recommendation[], reviews: StrategyEvidenceReviewQueueItemV1[]) {
  return buildExecutiveActionSynthesisV1({
    contract_version: "executive_action_synthesis_input_v1",
    generated_at: "2026-09-10T16:01:00.000Z",
    recommendations,
    evidence_review_queue: evidenceQueue(reviews),
  });
}

test("approved execution-ready recommendation with known current evidence is DO_NOW and preserves authoritative score", () => {
  const rec = recommendation({
    id: "approved",
    status: "approved",
    approval_level: "L4_APPROVED_FOR_EXECUTION",
    priority_score: {
      revenuePotential: 0.8,
      confidence: 0.9,
      urgency: 0.9,
      timeToImpact: 0.8,
      effortInverse: 0.7,
      costInverse: 0.6,
      riskInverse: 0.8,
      strategicFit: 0.95,
      executionReadiness: 1,
      overallScore: 94,
      formula: "authoritative-score",
    },
  });

  const result = synthesize([rec], [review(rec.id)]);

  assert.equal(result.DO_NOW.length, 1);
  assert.equal(result.DO_NOW[0].recommendation_id, rec.id);
  assert.deepEqual(result.DO_NOW[0].priority_score, rec.priority_score);
  assert.equal(result.DO_NOW[0].blocking_reason, null);
  assert.equal(result.mutation_performed, false);
});

test("recommendation-stage work with known current evidence is PREPARE, not execution certainty", () => {
  const rec = recommendation({ id: "prepare", status: "recommended", approval_level: "L1_RECOMMENDATION" });
  const result = synthesize([rec], [review(rec.id)]);

  assert.deepEqual(result.PREPARE.map((item) => item.recommendation_id), [rec.id]);
  assert.equal(result.DO_NOW.length, 0);
});

test("unknown, conflicted, review-required, or missing evidence review forces WAIT", () => {
  const unknown = recommendation({ id: "unknown" });
  const conflicted = recommendation({ id: "conflicted", status: "approved", approval_level: "L4_APPROVED_FOR_EXECUTION" });
  const stale = recommendation({ id: "stale", status: "approved", approval_level: "L4_APPROVED_FOR_EXECUTION" });
  const missing = recommendation({ id: "missing", status: "approved", approval_level: "L4_APPROVED_FOR_EXECUTION" });

  const result = synthesize(
    [unknown, conflicted, stale, missing],
    [
      review(unknown.id, { truth_state: "UNKNOWN", disposition: "REVIEW_NEXT" }),
      review(conflicted.id, { truth_state: "CONFLICTED", conflicted_source_count: 1, disposition: "REVIEW_NOW" }),
      review(stale.id, { freshness_state: "REVIEW_REQUIRED", stale_source_count: 1, disposition: "REVIEW_NOW" }),
    ],
  );

  assert.deepEqual(new Set(result.WAIT.map((item) => item.recommendation_id)), new Set(["unknown", "conflicted", "stale", "missing"]));
  assert.equal(result.DO_NOW.length, 0);
  assert.equal(result.WAIT.find((item) => item.recommendation_id === "missing")?.evidence_state.review_disposition, "UNAVAILABLE");
  assert.match(result.WAIT.find((item) => item.recommendation_id === "conflicted")?.blocking_reason ?? "", /Conflicted evidence/);
});

test("monitoring and terminal negative statuses stay distinct from new action", () => {
  const snoozed = recommendation({ id: "snoozed", status: "snoozed" });
  const measuring = recommendation({ id: "measuring", status: "measuring", approval_level: "L5_EXECUTED_AND_MEASURED" });
  const rejected = recommendation({ id: "rejected", status: "rejected" });
  const expired = recommendation({ id: "expired", status: "expired" });

  const result = synthesize(
    [snoozed, measuring, rejected, expired],
    [review(snoozed.id), review(measuring.id), review(rejected.id), review(expired.id)],
  );

  assert.deepEqual(new Set(result.MONITOR.map((item) => item.recommendation_id)), new Set(["snoozed", "measuring"]));
  assert.deepEqual(new Set(result.DEPRIORITIZE.map((item) => item.recommendation_id)), new Set(["rejected", "expired"]));
  assert.equal(result.DO_NOW.length, 0);
});

test("do-nothing recommendations monitor and approved recommendations without execution approval wait", () => {
  const noAction = recommendation({ id: "do-nothing", category: "do_nothing", status: "recommended" });
  const weakApproval = recommendation({ id: "weak-approval", status: "approved", approval_level: "L3_READY_FOR_APPROVAL" });

  const result = synthesize([noAction, weakApproval], [review(noAction.id), review(weakApproval.id)]);

  assert.deepEqual(result.MONITOR.map((item) => item.recommendation_id), ["do-nothing"]);
  assert.deepEqual(result.WAIT.map((item) => item.recommendation_id), ["weak-approval"]);
  assert.match(result.WAIT[0].blocking_reason ?? "", /not approved for execution/);
});

test("queue ordering is deterministic by authoritative overall score then recommendation id", () => {
  const a = recommendation({ id: "a", priority_score: { ...recommendation({ id: "seed" }).priority_score, overallScore: 80 } });
  const b = recommendation({ id: "b", priority_score: { ...recommendation({ id: "seed2" }).priority_score, overallScore: 90 } });
  const c = recommendation({ id: "c", priority_score: { ...recommendation({ id: "seed3" }).priority_score, overallScore: 90 } });

  const result = synthesize([c, a, b], [review(a.id), review(b.id), review(c.id)]);

  assert.deepEqual(result.queue.map((item) => item.recommendation_id), ["b", "c", "a"]);
  assert.deepEqual(result.queue.map((item) => item.priority_score.overallScore), [90, 90, 80]);
  assert.equal(result.keegan_action_required, "NO");
});
