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
      capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
      prohibited_action_categories: ["unauthorized_scraping"],
      mutually_exclusive_action_groups: { traffic: ["scale_spend", "pause_spend"] }
    })
  );
}

function baseCandidate(id: string, action_key: string, category: string): FusionCandidate {
  return {
    candidate_id: id,
    candidate_type: "internal_finding_package",
    source_engine: "manual_fixture",
    source_engine_version: "fixture_v1",
    linked_finding_id: "find_same_window",
    linked_hypothesis_ids: [],
    linked_opportunity_id: null,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: ["marketing", "commerce"],
    affected_entities: [],
    supporting_evidence_fact_ids: ["fact_sessions", "fact_conv"],
    contradicting_evidence_fact_ids: [],
    missing_evidence: ["source/medium"],
    internal_sources_used: ["ga4", "woo"],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: "traffic-quality risk",
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: { system: "intelligence_v1", level: "possible", score: 0.55, reasons: [], blockers: [] },
    urgency: "high",
    risk: "medium",
    value_potential_proxy: 0.7,
    information_gain_value: action_key === "diagnose_traffic_quality_segments" ? 0.9 : 0.1,
    strategic_fit: 0.9,
    relevance_expires_at: null,
    current_regime: null,
    proposed_action: {
      action_key,
      category,
      headline: id,
      recommended_action: id,
      measurement_plan: "plan",
      success_metrics: [{ metric_id: "derived.purchase_conversion_pct", note: null }],
      evaluation_window: { startDate: "2026-08-04", endDate: "2026-08-10" },
      stop_condition: "stop",
      review_by: "2026-08-11T00:00:00.000Z",
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

test("true conflict-resolution: scaling cannot win against unresolved traffic-quality diagnostic", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const scaling = baseCandidate("cand_scale", "scale_spend", "scale");
  const diagnostic = baseCandidate("cand_diagnose", "diagnose_traffic_quality_segments", "measurement");

  const out = runFusionV1({
    nowIso,
    candidates: [scaling, diagnostic],
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: constraints(),
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });

  assert.ok(out.decision.conflicts_identified.length >= 1);
  const conflict = out.decision.conflicts_identified[0] as Record<string, unknown>;
  assert.equal(conflict.group_id, "conflict_traffic_quality_vs_scaling");
  assert.ok(conflict.member_candidate_ids);
  const resolution = (conflict as { resolution?: { reason?: unknown } }).resolution;
  assert.match(String(resolution?.reason ?? ""), /traffic-quality/i);

  // Scaling must be gated.
  const dedupe = out.decision.deduplication_decisions as unknown as Array<{ cluster_id: string; member_candidate_ids: string[] }>;
  const scaleRank = out.decision.ranking.find((r) => {
    const d = dedupe.find((dd) => dd.cluster_id === r.candidate_id);
    return (d?.member_candidate_ids ?? []).includes("cand_scale");
  });
  assert.ok(scaleRank);
  assert.ok(scaleRank!.gated.gated_out);
  assert.ok(scaleRank!.gated.reasons.some((x) => x.code === "mutually_exclusive"));

  // Diagnostic wins.
  const selectedMembers = dedupe.find((d) => d.cluster_id === out.decision.selected.candidate_id)?.member_candidate_ids;
  assert.deepEqual(selectedMembers, ["cand_diagnose"]);
});
