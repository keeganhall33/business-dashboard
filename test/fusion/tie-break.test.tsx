import test from "node:test";
import assert from "node:assert/strict";

import type { FusionCandidate } from "@/lib/fusion-v1/contracts";
import { runFusionV1 } from "@/lib/fusion-v1/engine";
import { parseStrategicConstraintsV1FromJsonString } from "@/lib/fusion-v1/strategic-constraints";

type DedupeDecision = { cluster_id: string; member_candidate_ids: string[] };

function topMembers(out: ReturnType<typeof runFusionV1>): string[] {
  const top = out.decision.ranking[0]!.candidate_id;
  const dd = out.decision.deduplication_decisions as unknown as DedupeDecision[];
  return dd.find((d) => d.cluster_id === top)?.member_candidate_ids ?? [];
}

function constraints() {
  return parseStrategicConstraintsV1FromJsonString(
    JSON.stringify({
      schema_version: "strategic_constraints_v1",
      config_version: "v1.0",
      premium_positioning: { protected: true, prohibited_action_categories: ["discounting"], notes: [] },
      scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
      licensing_ip: { requires_review: true, notes: [] },
      blocked_domains: ["meta_attribution"],
      capacity: { available_hours_today: null, available_discretionary_budget_cents_today: null },
      prohibited_action_categories: ["unauthorized_scraping"],
      mutually_exclusive_action_groups: {}
    })
  );
}

function baseCandidate(id: string): FusionCandidate {
  return {
    candidate_id: id,
    candidate_type: "lower_priority_internal",
    source_engine: "manual_fixture",
    source_engine_version: "fixture_v1",
    linked_finding_id: null,
    linked_hypothesis_ids: [],
    linked_opportunity_id: null,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: ["marketing"],
    affected_entities: [],
    supporting_evidence_fact_ids: [`fact_${id}_1`, `fact_${id}_2`],
    contradicting_evidence_fact_ids: [],
    missing_evidence: [],
    internal_sources_used: [],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: `m_${id}`,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: { system: "explanation_confidence", level: "likely", score: null, reasons: [], blockers: [] },
    urgency: "medium",
    risk: "medium",
    value_potential_proxy: 0.5,
    information_gain_value: 0.1,
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
    early_warning_indicators: []
  };
}

test("tie-break #1: higher final score wins", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const a = { ...baseCandidate("a"), value_potential_proxy: 0.9 };
  const b = { ...baseCandidate("b"), value_potential_proxy: 0.1 };
  const out = runFusionV1({
    nowIso,
    candidates: [a, b],
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: constraints(),
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  assert.deepEqual(topMembers(out), ["a"]);
});

test("tie-break #2: when confidence is low, higher information gain wins", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const low = { system: "explanation_confidence" as const, level: "possible" as const, score: null, reasons: [], blockers: [] };
  const a = { ...baseCandidate("a"), confidence: low, information_gain_value: 0.9, value_potential_proxy: 0.5 };
  const b = { ...baseCandidate("b"), confidence: low, information_gain_value: 0.1, value_potential_proxy: 0.5 };
  const out = runFusionV1({
    nowIso,
    candidates: [a, b],
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: constraints(),
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  assert.deepEqual(topMembers(out), ["a"]);
});

test("tie-break #3: sooner expiration wins", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const a = { ...baseCandidate("a"), relevance_expires_at: "2026-08-05T00:00:00.000Z" };
  const b = { ...baseCandidate("b"), relevance_expires_at: "2026-08-12T00:00:00.000Z" };
  // Equalize info gain comparison by keeping confidence high.
  const out = runFusionV1({
    nowIso,
    candidates: [a, b],
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: constraints(),
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  assert.deepEqual(topMembers(out), ["a"]);
});

test("tie-break #4: lower effort wins", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const a = { ...baseCandidate("a"), proposed_action: { ...baseCandidate("a").proposed_action!, estimated_effort_hours: 1 } };
  const b = { ...baseCandidate("b"), proposed_action: { ...baseCandidate("b").proposed_action!, estimated_effort_hours: 6 } };
  const out = runFusionV1({
    nowIso,
    candidates: [a, b],
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: constraints(),
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  assert.deepEqual(topMembers(out), ["a"]);
});

test("tie-break #5: lexicographic candidate_id wins", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const a = baseCandidate("a");
  const b = baseCandidate("b");
  const out = runFusionV1({
    nowIso,
    candidates: [b, a],
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: constraints(),
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  // With identical scores and tie-breakers, lexicographic candidate_id should win.
  assert.deepEqual(topMembers(out), ["a"]);
});
