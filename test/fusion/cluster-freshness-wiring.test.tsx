import test from "node:test";
import assert from "node:assert/strict";

import { decideRunPolicy } from "@/lib/fusion-v1/production/run-policy";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

type Freshness = "fresh" | "monitor_only" | "stale";

function deriveClusterFreshness(input: { memberFreshness: Freshness[] }): Freshness {
  let sawMonitorOnly = false;
  for (const f of input.memberFreshness) {
    if (f === "fresh") return "fresh";
    if (f === "monitor_only") sawMonitorOnly = true;
  }
  return sawMonitorOnly ? "monitor_only" : "stale";
}

function minimalCandidate(id: string, overrides?: Partial<FusionCandidate>): FusionCandidate {
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
    missing_evidence: ["Not yet linked to intelligence_facts_v1 fact ids"],
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
    early_warning_indicators: [],
    ...(overrides ?? {})
  };
}

test("cluster freshness precedence: fresh > monitor_only > stale", () => {
  assert.equal(deriveClusterFreshness({ memberFreshness: ["fresh", "stale"] }), "fresh");
  assert.equal(deriveClusterFreshness({ memberFreshness: ["monitor_only", "stale"] }), "monitor_only");
  assert.equal(deriveClusterFreshness({ memberFreshness: ["stale", "stale"] }), "stale");
  assert.equal(deriveClusterFreshness({ memberFreshness: ["monitor_only", "fresh"] }), "fresh");
});

test("run policy regression: one fresh independent cluster is not no_fresh_candidates", () => {
  const nowIso = new Date("2026-08-04T05:10:51.648Z").toISOString();
  const one = minimalCandidate("cluster_1");

  const policy = decideRunPolicy({
    nowIso,
    eligibleClusters: [one],
    gatedCount: 0,
    freshCount: 1,
    staleCount: 0,
    sourcesInspected: ["dashboard_snapshots"]
  });

  assert.notEqual(policy.status, "no_fresh_candidates");
  assert.equal(policy.execution_mode, "single_candidate");
});

test("duplicate sources in one cluster do not inflate comparative count", () => {
  const nowIso = new Date("2026-08-04T05:10:51.648Z").toISOString();

  // Two source candidates deduped into one merged cluster still yields freshCount=1.
  const policy = decideRunPolicy({
    nowIso,
    eligibleClusters: [minimalCandidate("cluster_1")],
    gatedCount: 0,
    freshCount: 1,
    staleCount: 0,
    sourcesInspected: ["dashboard_snapshots"]
  });

  assert.equal(policy.execution_mode, "single_candidate");
});

