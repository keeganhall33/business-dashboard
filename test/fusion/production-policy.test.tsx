import test from "node:test";
import assert from "node:assert/strict";

import { decideRunPolicy } from "@/lib/fusion-v1/production/run-policy";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

function candidate(id: string, overrides?: Partial<FusionCandidate>): FusionCandidate {
  return {
    candidate_id: id,
    candidate_type: "internal_finding_package",
    source_engine: "dashboard_snapshots",
    source_engine_version: "dashboard_snapshots:test",
    linked_finding_id: null,
    linked_hypothesis_ids: [],
    linked_opportunity_id: null,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: ["marketing"],
    affected_entities: [],
    supporting_evidence_fact_ids: [],
    contradicting_evidence_fact_ids: [],
    missing_evidence: [],
    internal_sources_used: ["dashboard_snapshots"],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: null,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: { system: "explanation_confidence", level: "likely", score: null, reasons: [], blockers: [] },
    urgency: "medium",
    risk: "low",
    value_potential_proxy: 0.4,
    information_gain_value: 0.2,
    strategic_fit: 0.8,
    relevance_expires_at: null,
    current_regime: null,
    proposed_action: {
      action_key: `k_${id}`,
      category: "measurement",
      headline: id,
      recommended_action: id,
      measurement_plan: null,
      success_metrics: [],
      evaluation_window: null,
      stop_condition: null,
      review_by: null,
      reversibility: "reversible",
      estimated_effort_hours: 1,
      estimated_cost_cents: 0
    },
    evidence_edges: [],
    thesis_influence_trace: [],
    knowledge_gap_ids: [],
    scenario_ids_evaluated: [],
    resilience_score: null,
    fragile_assumptions: [],
    contingency_id: null,
    early_warning_indicators: [],
    ...overrides
  };
}

test("run policy: no candidates => insufficient_candidates", () => {
  const p = decideRunPolicy({
    nowIso: "2026-08-04T00:00:00.000Z",
    eligibleClusters: [],
    gatedCount: 0,
    freshCount: 0,
    staleCount: 0,
    sourcesInspected: ["dashboard_snapshots"]
  });
  assert.equal(p.status, "insufficient_candidates");
  assert.equal(p.execution_mode, "no_candidate");
});

test("run policy: single candidate => never completed_with_decision", () => {
  const p = decideRunPolicy({
    nowIso: "2026-08-04T00:00:00.000Z",
    eligibleClusters: [candidate("a")],
    gatedCount: 0,
    freshCount: 1,
    staleCount: 0,
    sourcesInspected: ["dashboard_snapshots"]
  });
  assert.notEqual(p.status, "completed_with_decision");
  assert.equal(p.execution_mode, "single_candidate");
});

test("run policy: two candidates, none sufficient => blocked_by_data_quality", () => {
  const a = candidate("a", { missing_evidence: ["m1", "m2", "m3", "m4", "m5"], confidence: { system: "explanation_confidence", level: "possible", score: null, reasons: [], blockers: [] } });
  const b = candidate("b", { missing_evidence: ["m1", "m2", "m3", "m4", "m5"], confidence: { system: "explanation_confidence", level: "possible", score: null, reasons: [], blockers: [] } });
  const p = decideRunPolicy({
    nowIso: "2026-08-04T00:00:00.000Z",
    eligibleClusters: [a, b],
    gatedCount: 0,
    freshCount: 2,
    staleCount: 0,
    sourcesInspected: ["dashboard_snapshots"]
  });
  assert.equal(p.status, "blocked_by_data_quality");
});

