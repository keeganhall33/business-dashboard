import test from "node:test";
import assert from "node:assert/strict";

import { runFusionV1 } from "@/lib/fusion-v1/engine";
import { parseStrategicConstraintsV1FromJsonString } from "@/lib/fusion-v1/strategic-constraints";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

function constraints() {
  return parseStrategicConstraintsV1FromJsonString(
    JSON.stringify({
      schema_version: "strategic_constraints_v1",
      config_version: "v1.0",
      premium_positioning: { protected: true, prohibited_action_categories: ["discounting"], notes: [] },
      scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
      licensing_ip: { requires_review: true, notes: [] },
      blocked_domains: ["meta_attribution"],
      capacity: { available_hours_today: 1, available_discretionary_budget_cents_today: 1000 },
      prohibited_action_categories: ["unauthorized_scraping"],
      mutually_exclusive_action_groups: {}
    })
  );
}

function candidate(id: string, opts: Partial<FusionCandidate>): FusionCandidate {
  return {
    candidate_id: id,
    candidate_type: "internal_finding_package",
    source_engine: "manual_fixture",
    source_engine_version: "fixture_v1",
    linked_finding_id: null,
    linked_hypothesis_ids: [],
    linked_opportunity_id: null,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: ["marketing"],
    affected_entities: [],
    supporting_evidence_fact_ids: [],
    contradicting_evidence_fact_ids: [],
    missing_evidence: ["missing"],
    internal_sources_used: [],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: null,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: { system: "explanation_confidence", level: "possible", score: null, reasons: [], blockers: [] },
    urgency: "medium",
    risk: "medium",
    value_potential_proxy: 0.5,
    information_gain_value: 0.6,
    strategic_fit: 0.6,
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
      estimated_effort_hours: 6,
      estimated_cost_cents: 50000
    },
    evidence_edges: [],
    thesis_influence_trace: [],
    knowledge_gap_ids: [],
    scenario_ids_evaluated: [],
    resilience_score: null,
    fragile_assumptions: [],
    contingency_id: null,
    early_warning_indicators: [],
    ...opts
  };
}

test("hold decision: selected when all candidates are gated and review_by populated", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const allGated = [
    candidate("a", { blocked_domain_constraints: ["meta_attribution_blocked"] }),
    candidate("b", { strategic_guardrail_violations: ["premium_positioning_violation"] })
  ];
  const out = runFusionV1({
    nowIso,
    candidates: allGated,
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: constraints(),
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  assert.equal(out.decision.selected.candidate_id, "hold");
  assert.ok(out.decision.selected.review_by);
  assert.ok(out.decision.selected.what_changes_my_mind.length > 0);
});

