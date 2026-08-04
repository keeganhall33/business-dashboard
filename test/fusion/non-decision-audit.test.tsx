import test from "node:test";
import assert from "node:assert/strict";

import { rankCandidatesForAuditV1 } from "@/lib/fusion-v1/audit-ranking";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

function minimalCandidate(overrides: Partial<FusionCandidate>): FusionCandidate {
  return {
    candidate_id: "c1",
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
    missing_evidence: [],
    internal_sources_used: [],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: null,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: {
      system: "explanation_confidence",
      level: "possible",
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
      recommended_action: "Feature in email + Meta carousel immediately.",
      measurement_plan: null,
      success_metrics: [],
      evaluation_window: null,
      stop_condition: null,
      review_by: null,
      reversibility: "reversible",
      estimated_effort_hours: null,
      estimated_cost_cents: null
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

test("non-decision audit ranking: stale candidate is explicitly gated and still ranked", () => {
  const nowIso = new Date("2026-08-04T05:10:51.648Z").toISOString();
  const candidate = minimalCandidate({
    candidate_id: "prod_snapshot:product_conversion:2026-07-24T13:50:59.075+00:00"
  });

  const ranked = rankCandidatesForAuditV1({
    nowIso,
    candidates: [candidate],
    constraints: {
      config_version: "v1.0",
      blocked_domains: ["meta_attribution"],
      capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
      premium_positioning: { protected: true, prohibited_action_categories: ["discounting"], notes: [] },
      scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
      licensing_ip: { requires_review: true, notes: [] },
      prohibited_action_categories: [],
      mutually_exclusive_action_groups: {}
    },
    activeActionKeys: [],
    candidateMetaById: {
      [candidate.candidate_id]: { source: "dashboard_snapshots", freshness: "stale" }
    },
    clusterIdByCandidateId: {
      [candidate.candidate_id]: "cluster_prod_snapshot_abc"
    },
    enforceFreshnessPolicy: true
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.candidate_id, candidate.candidate_id);
  assert.equal(ranked[0]!.cluster_id, "cluster_prod_snapshot_abc");
  assert.equal(ranked[0]!.gated.gated_out, true);
  assert.ok(ranked[0]!.gated.reasons.some((r) => r.code === "stale_candidate"));
});

test("non-decision audit ranking: monitor-only candidate is explicitly gated", () => {
  const nowIso = new Date("2026-08-04T05:10:51.648Z").toISOString();
  const candidate = minimalCandidate({ candidate_id: "c-monitor" });

  const ranked = rankCandidatesForAuditV1({
    nowIso,
    candidates: [candidate],
    constraints: {
      config_version: "v1.0",
      blocked_domains: [],
      capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
      premium_positioning: { protected: true, prohibited_action_categories: [], notes: [] },
      scarcity: { protected: true, prohibited_action_categories: [], notes: [] },
      licensing_ip: { requires_review: true, notes: [] },
      prohibited_action_categories: [],
      mutually_exclusive_action_groups: {}
    },
    activeActionKeys: [],
    candidateMetaById: {
      [candidate.candidate_id]: { source: "opportunity_pipeline", freshness: "monitor_only" }
    },
    clusterIdByCandidateId: {},
    enforceFreshnessPolicy: true
  });

  assert.equal(ranked[0]!.gated.gated_out, true);
  assert.ok(ranked[0]!.gated.reasons.some((r) => r.code === "monitor_only_candidate"));
});

