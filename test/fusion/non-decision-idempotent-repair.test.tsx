import test from "node:test";
import assert from "node:assert/strict";

import { persistFusionRunV1, type FusionDbClient } from "@/lib/fusion-v1/persistence";
import type { DailyDecisionPackage, FusionCandidate, RankedCandidate } from "@/lib/fusion-v1/contracts";

type TableRow = Record<string, unknown>;

function makeFakeDb() {
  const fusion_runs_v1 = new Map<string, TableRow>();
  const fusion_candidates_v1 = new Map<string, TableRow>(); // key = `${run_id}:${candidate_id}`
  const fusion_rankings_v1 = new Map<string, TableRow>(); // key = `${run_id}:${candidate_id}`

  const client: FusionDbClient = {
    from(table: string) {
      return {
        async upsert(row: Record<string, unknown>) {
          if (table === "fusion_runs_v1") {
            const key = String(row.run_id);
            fusion_runs_v1.set(key, { ...(fusion_runs_v1.get(key) ?? {}), ...row });
            return { error: null };
          }
          if (table === "fusion_candidates_v1") {
            const key = `${row.run_id}:${row.candidate_id}`;
            fusion_candidates_v1.set(key, { ...(fusion_candidates_v1.get(key) ?? {}), ...row });
            return { error: null };
          }
          if (table === "fusion_rankings_v1") {
            const key = `${row.run_id}:${row.candidate_id}`;
            fusion_rankings_v1.set(key, { ...(fusion_rankings_v1.get(key) ?? {}), ...row });
            return { error: null };
          }
          return { error: { message: `unknown table ${table}` } };
        },
        async insert() {
          return { error: { message: "not implemented" } };
        },
        // Not used by this test client.
        select() {
          return null as unknown;
        }
      };
    }
  };

  return { client, fusion_runs_v1, fusion_candidates_v1, fusion_rankings_v1 };
}

function minimalCandidate(candidate_id: string): FusionCandidate {
  return {
    candidate_id,
    candidate_type: "internal_finding_package",
    source_engine: "dashboard_snapshots",
    source_engine_version: "v1",
    linked_finding_id: null,
    linked_hypothesis_ids: [],
    linked_opportunity_id: null,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: ["product"],
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
    early_warning_indicators: []
  };
}

function buildNonDecisionPackage(run_id: string, nowIso: string, candidate_id: string, ranking: RankedCandidate[]): DailyDecisionPackage {
  return {
    run_id,
    generated_at: nowIso,
    fusion_policy_version: "fusion_policy_v1.0",
    fusion_score_version: "fusion_score_v1.0",
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints_hash: "sc",
    strategic_constraints_version: "v1.0",
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    strategic_constraints_snapshot: {},
    all_candidate_ids: [candidate_id],
    deduplication_decisions: [],
    conflicts_identified: [],
    ranking,
    selected: {
      candidate_id: "none",
      headline: "no_fresh_candidates",
      recommended_action: "No comparative decision produced.",
      why_binding_priority: "Candidates were stale under freshness policy.",
      supporting_fact_ids: [],
      contradicting_fact_ids: [],
      missing_evidence: ["Need at least two independently sourced eligible candidates."],
      confidence: {
        system: "explanation_confidence",
        level: "insufficient_evidence",
        score: null,
        reasons: ["no_fresh_candidates"],
        blockers: []
      },
      success_metrics: [],
      evaluation_window: null,
      stop_condition: null,
      review_by: new Date(new Date(nowIso).getTime() + 24 * 3600 * 1000).toISOString(),
      what_changes_my_mind: ["A second independently sourced fresh candidate"],
      do_not_do: []
    },
    next_best: null,
    alternatives_considered: [],
    monitor: [],
    ignored: [],
    generated_narrative: {
      situation_summary: "Fusion ran but did not produce a comparative decision.",
      why_winner: "",
      why_alternatives: [],
      do_not_do: []
    }
  };
}

test("idempotent repair: existing run+candidate without rankings is repaired without duplicates", async () => {
  const run_id = "85f1e36651549d8037cfe9f6";
  const candidate_id = "prod_snapshot:product_conversion:2026-07-24T13:50:59.075+00:00";
  const nowIso = new Date("2026-08-04T05:10:51.648Z").toISOString();

  const db = makeFakeDb();

  // Pre-existing production-shaped state: run + candidate exist, rankings missing.
  db.fusion_runs_v1.set(run_id, { run_id, selected_candidate_id: "none" });
  db.fusion_candidates_v1.set(`${run_id}:${candidate_id}`, {
    run_id,
    candidate_id,
    gated_out: false,
    gate_reasons: [],
    cluster_id: null
  });
  assert.equal(db.fusion_rankings_v1.size, 0);

  const ranked: RankedCandidate[] = [
    {
      candidate_id,
      cluster_id: "cluster_prod_snapshot_abc",
      gated: {
        gated_out: true,
        reasons: [{ code: "stale_candidate", detail: "Excluded by production freshness policy (candidate is stale)." }],
        eligible_action_modes: ["hold"]
      },
      score_before_penalties: 50,
      penalties: {
        contradiction_penalty: 0,
        missing_evidence_penalty: 0,
        regime_mismatch_penalty: 0,
        fatigue_penalty: 0,
        outcome_prior_penalty: 0
      },
      features: {
        valuePotential: 0.5,
        confidenceNorm: 0.5,
        urgencyNorm: 0.3,
        strategicFit: 0.5,
        evidenceQuality: 1,
        outcomePrior: 0.5,
        effortInverse: 0.5,
        costInverse: 0.5,
        riskInverse: 0.8,
        reversibility: 1,
        informationGain: 0.2,
        expirationPressure: 0,
        riskIfIgnored: 0.3
      },
      final_score: 10,
      tie_break: { used: false, reason: null },
      why_ranked_lower: null
    }
  ];

  const pkg = buildNonDecisionPackage(run_id, nowIso, candidate_id, ranked);

  await persistFusionRunV1({
    client: db.client,
    run: pkg,
    input_set_fingerprint: "fp",
    candidateFingerprints: { [candidate_id]: "cfp" },
    normalizedCandidatesById: { [candidate_id]: minimalCandidate(candidate_id) },
    gateByClusterId: {
      [candidate_id]: { gated_out: true, reasons: ranked[0]!.gated.reasons, cluster_id: ranked[0]!.cluster_id }
    },
    ranking: ranked,
    conflictsByCandidateId: {}
  });

  assert.equal(db.fusion_runs_v1.size, 1);
  assert.equal(db.fusion_candidates_v1.size, 1);
  assert.equal(db.fusion_rankings_v1.size, 1);

  const candRow = db.fusion_candidates_v1.get(`${run_id}:${candidate_id}`)!;
  assert.equal(candRow.cluster_id, "cluster_prod_snapshot_abc");
  assert.equal(candRow.gated_out, true);

  // Re-run again: must remain idempotent.
  await persistFusionRunV1({
    client: db.client,
    run: pkg,
    input_set_fingerprint: "fp",
    candidateFingerprints: { [candidate_id]: "cfp" },
    normalizedCandidatesById: { [candidate_id]: minimalCandidate(candidate_id) },
    gateByClusterId: {
      [candidate_id]: { gated_out: true, reasons: ranked[0]!.gated.reasons, cluster_id: ranked[0]!.cluster_id }
    },
    ranking: ranked,
    conflictsByCandidateId: {}
  });

  assert.equal(db.fusion_runs_v1.size, 1);
  assert.equal(db.fusion_candidates_v1.size, 1);
  assert.equal(db.fusion_rankings_v1.size, 1);
});
