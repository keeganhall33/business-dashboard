import type { FusionCandidate } from "@/lib/fusion-v1/contracts";
import type { Finding, Hypothesis } from "@/lib/intelligence-v1/contracts";

export type TrafficQualityChain = {
  finding: Finding;
  hypotheses: Hypothesis[];
  recommendation: {
    recommendation_id: string;
    recommendation_fingerprint: string;
    action_key: string;
    recommendation_policy_version: string;
    recommended_action: string;
    measurement_plan: string | null;
    success_metrics: Array<{ metric_id: string; note: string | null }>;
    evaluation_window: { startDate: string; endDate: string } | null;
    stop_condition: string | null;
    review_by: string | null;
  };
  fact_ids: string[];
  contradicting_fact_ids: string[];
};

export function isCompleteTrafficQualityChain(chain: TrafficQualityChain | null): boolean {
  if (!chain) return false;
  if (!chain.finding?.finding_id) return false;
  if (!chain.hypotheses || chain.hypotheses.length < 3) return false;
  if (!chain.recommendation?.recommendation_id) return false;
  if (!chain.recommendation?.recommendation_fingerprint) return false;
  if (!chain.recommendation?.action_key) return false;
  // Require at least one fact reference via ids (may be empty today; enforce once loader can provide).
  return true;
}

export function trafficQualityChainToFusionCandidate(input: {
  nowIso: string;
  chain: TrafficQualityChain;
}): FusionCandidate {
  const f = input.chain.finding;
  return {
    candidate_id: `prod_intelligence_v1:${f.finding_id}`,
    candidate_type: "internal_finding_package",
    source_engine: "intelligence_v1_detector",
    source_engine_version: f.engine_version,
    linked_finding_id: f.finding_id,
    linked_hypothesis_ids: input.chain.hypotheses.map((h) => h.hypothesis_id),
    linked_opportunity_id: null,
    linked_recommendation_id: input.chain.recommendation.recommendation_id,
    recommendation_fingerprint: input.chain.recommendation.recommendation_fingerprint,
    affected_business_domains: ["marketing", "commerce", "website"],
    affected_entities: [],
    supporting_evidence_fact_ids: input.chain.fact_ids,
    contradicting_evidence_fact_ids: input.chain.contradicting_fact_ids,
    missing_evidence: f.missing_evidence,
    internal_sources_used: ["intelligence_v1"],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: input.chain.hypotheses[0]?.statement ?? null,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: [],
    confidence: {
      system: "intelligence_v1",
      level: f.confidence.level,
      score: f.confidence.score,
      reasons: f.confidence.reasons,
      blockers: f.confidence.blockers
    },
    urgency: "high",
    risk: "medium",
    value_potential_proxy: 0.7,
    information_gain_value: 0.8,
    strategic_fit: 0.9,
    relevance_expires_at: null,
    current_regime: null,
    proposed_action: {
      action_key: input.chain.recommendation.action_key,
      category: "measurement",
      headline: "Resolve traffic-quality vs conversion constraint",
      recommended_action: input.chain.recommendation.recommended_action,
      measurement_plan: input.chain.recommendation.measurement_plan,
      success_metrics: input.chain.recommendation.success_metrics,
      evaluation_window: input.chain.recommendation.evaluation_window,
      stop_condition: input.chain.recommendation.stop_condition,
      review_by: input.chain.recommendation.review_by,
      reversibility: "reversible",
      estimated_effort_hours: 1.5,
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
