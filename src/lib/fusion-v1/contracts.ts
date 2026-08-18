import type { EvidenceEdge } from "@/lib/intelligence-v1/contracts";

export const FUSION_POLICY_VERSION_V1 = "fusion_policy_v1.0" as const;
export const FUSION_SCORE_VERSION_V1 = "fusion_score_v1.0" as const;

export type BusinessDomain =
  | "commerce"
  | "marketing"
  | "website"
  | "product"
  | "pricing"
  | "operations"
  | "partnerships"
  | "brand"
  | "data_quality";

export type FusionCandidateType =
  | "internal_finding_package"
  | "external_opportunity_fixture"
  | "competitive_signal_fixture"
  | "canonical_external_knowledge"
  | "lower_priority_internal"
  | "blocked_recommendation"
  | "do_nothing_hold";

export type FusionSourceEngine =
  | "intelligence_v1_detector"
  | "dashboard_snapshots"
  | "opportunity_pipeline"
  | "external_knowledge_synthesis"
  | "manual_fixture";

export type FusionUrgency = "low" | "medium" | "high";
export type FusionRisk = "low" | "medium" | "high";
export type FusionReversibility = "reversible" | "partially_reversible" | "irreversible";

export type BlockedDomainConstraint = "meta_attribution_blocked" | "licensing_ip_unvetted" | "insufficient_data_quality";

export type StrategicGuardrailViolation =
  | "premium_positioning_violation"
  | "scarcity_violation"
  | "licensing_ip_review_required";

export type ProposedAction = {
  action_key: string;
  category: string;
  headline: string;
  recommended_action: string;
  measurement_plan: string | null;
  success_metrics: Array<{ metric_id: string; note: string | null }>;
  evaluation_window: { startDate: string; endDate: string } | null;
  stop_condition: string | null;
  review_by: string | null;
  reversibility: FusionReversibility;
  estimated_effort_hours: number | null;
  estimated_cost_cents: number | null;
};

export type FusionConfidence =
  | {
      system: "intelligence_v1";
      level: "confirmed" | "strongly_supported" | "likely" | "possible" | "insufficient_evidence";
      score: number | null;
      reasons: string[];
      blockers: string[];
    }
  | {
      system: "explanation_confidence";
      level: "confirmed" | "strongly_supported" | "likely" | "possible" | "insufficient_evidence";
      score: null;
      reasons: string[];
      blockers: string[];
    };

export type FusionCandidate = {
  candidate_id: string;
  candidate_type: FusionCandidateType;
  source_engine: FusionSourceEngine;
  source_engine_version: string;

  // Linkage to existing chain objects (optional in fixtures)
  linked_finding_id: string | null;
  linked_hypothesis_ids: string[];
  linked_opportunity_id: string | null;
  linked_recommendation_id: string | null;
  recommendation_fingerprint: string | null;

  affected_business_domains: BusinessDomain[];
  affected_entities: Array<{ entity_id: string; role: string; entity_type: string | null }>;

  supporting_evidence_fact_ids: string[];
  contradicting_evidence_fact_ids: string[];
  missing_evidence: string[];

  internal_sources_used: string[];
  external_signals_used: string[];
  external_signals_missing: string[];

  expected_mechanism: string | null;

  blocked_domain_constraints: BlockedDomainConstraint[];
  strategic_guardrail_violations: StrategicGuardrailViolation[];

  confidence: FusionConfidence;
  urgency: FusionUrgency;
  risk: FusionRisk;

  value_potential_proxy: number; // 0-1
  information_gain_value: number; // 0-1
  strategic_fit: number; // 0-1 (post-gate; remains auditable)

  relevance_expires_at: string | null;
  current_regime: string | null;

  proposed_action: ProposedAction | null;
  evidence_edges: EvidenceEdge[]; // optional: can be empty in v1 fixtures

  // Reserved for later engines (empty in v1)
  thesis_influence_trace: Array<Record<string, unknown>>;
  knowledge_gap_ids: string[];
  scenario_ids_evaluated: string[];
  resilience_score: number | null;
  fragile_assumptions: string[];
  contingency_id: string | null;
  early_warning_indicators: string[];
};

export type CandidateGateCode =
  | "expired_relevance"
  | "blocked_domain"
  | "premium_positioning_violation"
  | "scarcity_violation"
  | "licensing_ip_review_required"
  | "capacity_infeasible"
  | "budget_infeasible"
  | "action_already_underway"
  | "mutually_exclusive"
  | "insufficient_evidence_for_operating_action"
  // Production eligibility/exclusion (used by scheduler audit trails)
  | "stale_candidate"
  | "monitor_only_candidate"
  | "insufficient_fresh_evidence"
  | "no_actionable_candidate";

export type CandidateGateResult = {
  gated_out: boolean;
  reasons: Array<{ code: CandidateGateCode; detail: string }>;
  eligible_action_modes: Array<"operating" | "information_gain" | "hold">;
};

export type CandidatePenaltyBreakdown = {
  contradiction_penalty: number; // 0-1
  missing_evidence_penalty: number; // 0-1
  regime_mismatch_penalty: number; // 0-1 (reserved)
  fatigue_penalty: number; // 0-1 (reserved)
  outcome_prior_penalty: number; // 0-1 (reserved)
};

export type CandidateFeatureValues = {
  valuePotential: number;
  confidenceNorm: number;
  urgencyNorm: number;
  strategicFit: number;
  evidenceQuality: number;
  outcomePrior: number;
  effortInverse: number;
  costInverse: number;
  riskInverse: number;
  reversibility: number;
  informationGain: number;
  expirationPressure: number;
  riskIfIgnored: number;
};

export type RankedCandidate = {
  candidate_id: string;
  cluster_id: string | null;
  gated: CandidateGateResult;
  score_before_penalties: number;
  penalties: CandidatePenaltyBreakdown;
  features: CandidateFeatureValues;
  final_score: number;
  tie_break: {
    used: boolean;
    reason: string | null;
  };
  why_ranked_lower: string | null;
};

export type DailyDecisionPackage = {
  run_id: string;
  generated_at: string;
  fusion_policy_version: typeof FUSION_POLICY_VERSION_V1;
  fusion_score_version: typeof FUSION_SCORE_VERSION_V1;

  constitution_hash: string;
  roadmap_hash: string;
  strategic_constraints_hash: string;
  strategic_constraints_version: string;

  external_context_snapshot: Record<string, unknown>;
  competitor_context_snapshot: Record<string, unknown>;
  strategic_constraints_snapshot: Record<string, unknown>;

  all_candidate_ids: string[];
  deduplication_decisions: Array<Record<string, unknown>>;
  conflicts_identified: Array<Record<string, unknown>>;

  ranking: RankedCandidate[];
  selected: {
    candidate_id: string;
    headline: string;
    recommended_action: string;
    why_binding_priority: string;
    supporting_fact_ids: string[];
    contradicting_fact_ids: string[];
    missing_evidence: string[];
    confidence: FusionConfidence;
    success_metrics: Array<{ metric_id: string; note: string | null }>;
    evaluation_window: { startDate: string; endDate: string } | null;
    stop_condition: string | null;
    review_by: string | null;
    what_changes_my_mind: string[];
    do_not_do: string[];
  };

  next_best: { candidate_id: string; headline: string; trigger_condition: string } | null;
  alternatives_considered: Array<{ candidate_id: string; headline: string; why_ranked_lower: string }>;
  monitor: Array<{ candidate_id: string; reason: string; review_by: string | null }>;
  ignored: Array<{ candidate_id: string; reason: string }>;

  generated_narrative: {
    situation_summary: string;
    why_winner: string;
    why_alternatives: Array<{ candidate_id: string; why: string }>;
    do_not_do: string[];
  };
};
