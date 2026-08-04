import test from "node:test";
import assert from "node:assert/strict";

import { dedupeAndCluster } from "@/lib/fusion-v1/dedupe";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

function cand(id: string, overrides?: Partial<FusionCandidate>): FusionCandidate {
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
    affected_business_domains: ["marketing"],
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
      level: "likely",
      score: null,
      reasons: ["test"],
      blockers: []
    },
    urgency: "medium",
    risk: "low",
    value_potential_proxy: 0.6,
    information_gain_value: 0.4,
    strategic_fit: 0.7,
    relevance_expires_at: null,
    current_regime: null,
    proposed_action: {
      action_key: `action:${id}`,
      category: "marketing",
      headline: `headline:${id}`,
      recommended_action: `do:${id}`,
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
    ...(overrides ?? {})
  };
}

test("cluster persistence mapping: members share cluster_id and opposing actions remain separate", () => {
  const a1 = cand("a1", { recommendation_fingerprint: "fp" });
  const a2 = cand("a2", { recommendation_fingerprint: "fp" });

  const scaler = cand("scale", { proposed_action: { ...cand("tmp").proposed_action!, action_key: "scale_spend" } });
  const diag = cand("diag", { proposed_action: { ...cand("tmp2").proposed_action!, action_key: "diagnose_traffic_quality_segments" } });

  const candidateFingerprintById = {
    a1: "fp",
    a2: "fp",
    scale: "x",
    diag: "y"
  };

  const { clustered } = dedupeAndCluster({ candidates: [a1, a2, scaler, diag], candidateFingerprintById });

  const clusterIdByCandidateId: Record<string, string> = {};
  for (const cluster of clustered) {
    for (const member of cluster.members) {
      clusterIdByCandidateId[member.candidate_id] = cluster.cluster_id;
    }
  }

  assert.equal(clusterIdByCandidateId.a1, clusterIdByCandidateId.a2);
  assert.notEqual(clusterIdByCandidateId.scale, clusterIdByCandidateId.diag);
});

