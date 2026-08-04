import test from "node:test";
import assert from "node:assert/strict";

import { rankCandidatesForAuditV1 } from "@/lib/fusion-v1/audit-ranking";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

function baseCandidate(id: string, overrides?: Partial<FusionCandidate>): FusionCandidate {
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

test("mixed audit ranking: every candidate is ranked and exclusions are explicit", () => {
  const nowIso = new Date("2026-08-04T05:10:51.648Z").toISOString();

  const freshEligible = baseCandidate("fresh", { value_potential_proxy: 0.9 });
  const stale = baseCandidate("stale");
  const monitorOnly = baseCandidate("monitor");
  const hardGated = baseCandidate("hard", { blocked_domain_constraints: ["meta_attribution_blocked"] });
  const eligibleNotSelected = baseCandidate("eligible2", { value_potential_proxy: 0.4 });

  const ranked = rankCandidatesForAuditV1({
    nowIso,
    candidates: [freshEligible, stale, monitorOnly, hardGated, eligibleNotSelected],
    constraints: {
      config_version: "v1.0",
      blocked_domains: ["meta_attribution"],
      capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
      premium_positioning: { protected: true, prohibited_action_categories: [], notes: [] },
      scarcity: { protected: true, prohibited_action_categories: [], notes: [] },
      licensing_ip: { requires_review: true, notes: [] },
      prohibited_action_categories: [],
      mutually_exclusive_action_groups: {}
    },
    activeActionKeys: [],
    candidateMetaById: {
      fresh: { source: "dashboard_snapshots", freshness: "fresh" },
      stale: { source: "dashboard_snapshots", freshness: "stale" },
      monitor: { source: "opportunity_pipeline", freshness: "monitor_only" },
      hard: { source: "dashboard_snapshots", freshness: "fresh" },
      eligible2: { source: "dashboard_snapshots", freshness: "fresh" }
    },
    clusterIdByCandidateId: {},
    enforceFreshnessPolicy: true
  });

  assert.equal(ranked.length, 5);
  assert.equal(new Set(ranked.map((r) => r.candidate_id)).size, 5);

  const byId = Object.fromEntries(ranked.map((r) => [r.candidate_id, r]));

  // Fresh eligible candidate should not be falsely freshness-gated.
  assert.equal(byId.fresh!.gated.reasons.some((r) => r.code === "stale_candidate"), false);
  assert.equal(byId.fresh!.gated.reasons.some((r) => r.code === "monitor_only_candidate"), false);

  assert.ok(byId.stale!.gated.reasons.some((r) => r.code === "stale_candidate"));
  assert.ok(byId.monitor!.gated.reasons.some((r) => r.code === "monitor_only_candidate"));

  // Hard-gated candidate preserves original gate reason.
  assert.ok(byId.hard!.gated.reasons.some((r) => r.code === "blocked_domain"));

  // Eligible-but-not-selected still receives rank+scores.
  assert.ok(typeof byId.eligible2!.final_score === "number");
  assert.ok(typeof byId.eligible2!.score_before_penalties === "number");
});

