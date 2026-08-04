import test from "node:test";
import assert from "node:assert/strict";

import { dedupeAndCluster } from "@/lib/fusion-v1/dedupe";
import { computeFusionCandidateFingerprint } from "@/lib/fusion-v1/fingerprinting";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

function cand(id: string, overrides?: Partial<FusionCandidate>): FusionCandidate {
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
    supporting_evidence_fact_ids: [],
    contradicting_evidence_fact_ids: [],
    missing_evidence: [],
    internal_sources_used: [],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: "m",
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: { system: "explanation_confidence", level: "likely", score: null, reasons: [], blockers: [] },
    urgency: "low",
    risk: "low",
    value_potential_proxy: 0.2,
    information_gain_value: 0.2,
    strategic_fit: 0.6,
    relevance_expires_at: null,
    current_regime: null,
    proposed_action: null,
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

test("dedupe: recommendation_fingerprint takes priority", () => {
  const a = cand("a", { recommendation_fingerprint: "same" });
  const b = cand("b", { recommendation_fingerprint: "same" });
  const fp = { a: computeFusionCandidateFingerprint(a), b: computeFusionCandidateFingerprint(b) };
  const out = dedupeAndCluster({ candidates: [a, b], candidateFingerprintById: fp });
  assert.equal(out.clustered.length, 1);
  assert.deepEqual(out.clustered[0]!.dedupe_decision.member_candidate_ids, ["a", "b"]);
  assert.ok(out.clustered[0]!.dedupe_decision.reason_codes.includes("cluster:same_fingerprint"));
});

test("dedupe: candidate_fingerprint is fallback when recommendation_fingerprint missing", () => {
  const a = cand("a");
  const b = { ...a, candidate_id: "b" };
  const fp = { a: computeFusionCandidateFingerprint(a), b: computeFusionCandidateFingerprint(b) };
  const out = dedupeAndCluster({ candidates: [a, b], candidateFingerprintById: fp });
  assert.equal(out.clustered.length, 1);
});

test("clustering: same finding clusters", () => {
  const a = cand("a", { linked_finding_id: "find1" });
  const b = cand("b", { linked_finding_id: "find1" });
  const fp = { a: computeFusionCandidateFingerprint(a), b: computeFusionCandidateFingerprint(b) };
  const out = dedupeAndCluster({ candidates: [a, b], candidateFingerprintById: fp });
  assert.equal(out.clustered.length, 1);
  assert.ok(out.clustered[0]!.dedupe_decision.reason_codes.includes("cluster:same_finding"));
});

test("clustering: same action key clusters", () => {
  const a = cand("a", { proposed_action: { action_key: "k", category: "measurement", headline: "a", recommended_action: "a", measurement_plan: null, success_metrics: [], evaluation_window: null, stop_condition: null, review_by: null, reversibility: "reversible", estimated_effort_hours: 1, estimated_cost_cents: 0 } });
  const b = cand("b", { proposed_action: { ...a.proposed_action!, headline: "b" } });
  const fp = { a: computeFusionCandidateFingerprint(a), b: computeFusionCandidateFingerprint(b) };
  const out = dedupeAndCluster({ candidates: [a, b], candidateFingerprintById: fp });
  assert.equal(out.clustered.length, 1);
  assert.ok(out.clustered[0]!.dedupe_decision.reason_codes.includes("cluster:same_action_key"));
});

test("clustering: two shared fact ids clusters; unions evidence and dedupes missing evidence", () => {
  const a = cand("a", { supporting_evidence_fact_ids: ["f1", "f2", "f3"], missing_evidence: ["m1", "m2"] });
  const b = cand("b", { supporting_evidence_fact_ids: ["f2", "f3", "f4"], missing_evidence: ["m2", "m3"], contradicting_evidence_fact_ids: ["c1"] });
  const fp = { a: computeFusionCandidateFingerprint(a), b: computeFusionCandidateFingerprint(b) };
  const out = dedupeAndCluster({ candidates: [a, b], candidateFingerprintById: fp });
  assert.equal(out.clustered.length, 1);
  const merged = out.clustered[0]!.merged;
  assert.deepEqual(merged.supporting_evidence_fact_ids.sort(), ["f1", "f2", "f3", "f4"].sort());
  assert.deepEqual(merged.contradicting_evidence_fact_ids.sort(), ["c1"].sort());
  assert.deepEqual(merged.missing_evidence.sort(), ["m1", "m2", "m3"].sort());
  assert.ok(out.clustered[0]!.dedupe_decision.reason_codes.includes("cluster:shared_supporting_facts"));
});

