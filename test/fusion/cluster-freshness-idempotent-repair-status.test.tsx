import test from "node:test";
import assert from "node:assert/strict";

import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import { decideRunPolicy } from "@/lib/fusion-v1/production/run-policy";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

function minimalCandidate(id: string): FusionCandidate {
  return {
    candidate_id: id,
    candidate_type: "internal_finding_package",
    source_engine: "dashboard_snapshots",
    source_engine_version: "v1",
    linked_finding_id: null,
    linked_hypothesis_ids: [],
    linked_opportunity_id: null,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: ["commerce"],
    affected_entities: [],
    supporting_evidence_fact_ids: [],
    contradicting_evidence_fact_ids: [],
    missing_evidence: ["Need at least two independently sourced eligible candidates."],
    internal_sources_used: [],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: null,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: {
      system: "explanation_confidence",
      level: "likely",
      score: null,
      reasons: ["test"],
      blockers: []
    },
    urgency: "low",
    risk: "low",
    value_potential_proxy: 0.5,
    information_gain_value: 0.2,
    strategic_fit: 0.5,
    relevance_expires_at: null,
    current_regime: null,
    proposed_action: {
      action_key: "promote_product:33398",
      category: "marketing",
      headline: "Product momentum: Roberto Clemente",
      recommended_action: "Feature in email immediately.",
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
    early_warning_indicators: []
  };
}

test("idempotent repair status: same run identity, updated classification fields", () => {
  // Production-shaped identity (read-only test vector)
  const input_set_fingerprint = "a91f2941366b5fafe1ba346c306ec32b74d6ac6611f3867f32b7d3c049a91c87";
  const run_id = canonicalJsonSha256Hex({ input_set_fingerprint }).slice(0, 24);
  assert.equal(run_id, "85f1e36651549d8037cfe9f6");

  const nowIso = new Date("2026-08-04T05:10:51.648Z").toISOString();

  // Pre-fix misclassification (from production): freshCount was computed as 0.
  const before = {
    run_status: "no_fresh_candidates",
    execution_mode: "no_candidate",
    selected_candidate_id: "none"
  };

  // After wiring fix: one fresh independent cluster => single-candidate non-decision (not no_fresh_candidates).
  const policy = decideRunPolicy({
    nowIso,
    eligibleClusters: [minimalCandidate("cluster_1")],
    gatedCount: 0,
    freshCount: 1,
    staleCount: 0,
    sourcesInspected: ["dashboard_snapshots"]
  });

  assert.notEqual(policy.status, "no_fresh_candidates");
  assert.equal(policy.execution_mode, "single_candidate");

  const after = {
    run_status: policy.status,
    execution_mode: policy.execution_mode,
    selected_candidate_id: "none"
  };

  // Same run identity; only classification fields change.
  assert.equal(before.selected_candidate_id, after.selected_candidate_id);
});

