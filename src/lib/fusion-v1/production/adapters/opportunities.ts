import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

export type OpportunityRow = {
  id: string;
  name: string;
  opportunity_type: string;
  status: string;
  owner_agent: string;
  next_step: string | null;
  updated_at: string | null;
};

export type OpportunityFreshnessClass = "fresh" | "monitor_only" | "stale";

function daysBetween(nowIso: string, updatedAtIso: string): number {
  const now = new Date(nowIso).getTime();
  const t = new Date(updatedAtIso).getTime();
  return Math.floor((now - t) / (24 * 3600 * 1000));
}

function classifyFreshness(ageDays: number): OpportunityFreshnessClass {
  if (ageDays <= 30) return "fresh";
  if (ageDays <= 90) return "monitor_only";
  return "stale";
}

function isActiveStatus(status: string): boolean {
  return ["researching", "ready_for_outreach", "in_progress", "in_review"].includes(status);
}

function impliesLicensing(opportunityType: string): boolean {
  return opportunityType.toLowerCase().includes("licens");
}

export function opportunityToFusionCandidate(input: {
  nowIso: string;
  row: OpportunityRow;
}): {
  candidate: FusionCandidate | null;
  freshness: { age_days: number | null; classification: OpportunityFreshnessClass };
  skipped_reason: string | null;
} {
  if (!input.row.updated_at) {
    return { candidate: null, freshness: { age_days: null, classification: "stale" }, skipped_reason: "missing_updated_at" };
  }

  const age_days = daysBetween(input.nowIso, input.row.updated_at);
  const freshnessClass = classifyFreshness(age_days);
  const freshness = { age_days, classification: freshnessClass };
  if (freshnessClass === "stale") return { candidate: null, freshness, skipped_reason: "stale_opportunity" };

  const active = isActiveStatus(input.row.status);
  if (!active) return { candidate: null, freshness, skipped_reason: "inactive_status" };

  const licensing = impliesLicensing(input.row.opportunity_type);

  // Eligible only if next step exists and is specific.
  const next = input.row.next_step?.trim() ?? "";
  if (!next) {
    // monitor-only: keep as candidate without action
    return {
      candidate: {
        candidate_id: `prod_opportunity:${input.row.id}`,
        candidate_type: "external_opportunity_fixture",
        source_engine: "opportunity_pipeline",
        source_engine_version: "opportunity_pipeline",
        linked_finding_id: null,
        linked_hypothesis_ids: [],
        linked_opportunity_id: input.row.id,
        linked_recommendation_id: null,
        recommendation_fingerprint: null,
        affected_business_domains: ["partnerships", "brand"],
        affected_entities: [],
        supporting_evidence_fact_ids: [],
        contradicting_evidence_fact_ids: [],
        missing_evidence: ["No specific next_step on opportunity_pipeline row"],
        internal_sources_used: ["opportunity_pipeline"],
        external_signals_used: [],
        external_signals_missing: ["current relevance corroboration"],
        expected_mechanism: null,
        blocked_domain_constraints: [],
        strategic_guardrail_violations: licensing ? ["licensing_ip_review_required"] : [],
        confidence: {
          system: "explanation_confidence",
          level: "possible",
          score: null,
          reasons: ["Opportunity exists but has no actionable next step."],
          blockers: ["Add next_step to become eligible for action."]
        },
        urgency: freshnessClass === "fresh" ? "low" : "low",
        risk: "medium",
        value_potential_proxy: 0.4,
        information_gain_value: 0.2,
        strategic_fit: 0.8,
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
        early_warning_indicators: []
      },
      freshness,
      skipped_reason: "monitor_only_missing_next_step"
    };
  }

  if (freshnessClass === "monitor_only") {
    return { candidate: null, freshness, skipped_reason: "monitor_only_age" };
  }

  const candidate: FusionCandidate = {
    candidate_id: `prod_opportunity:${input.row.id}`,
    candidate_type: "external_opportunity_fixture",
    source_engine: "opportunity_pipeline",
    source_engine_version: "opportunity_pipeline",
    linked_finding_id: null,
    linked_hypothesis_ids: [],
    linked_opportunity_id: input.row.id,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: ["partnerships", "brand"],
    affected_entities: [],
    supporting_evidence_fact_ids: [],
    contradicting_evidence_fact_ids: [],
    missing_evidence: ["No internal evidence of current relevance"],
    internal_sources_used: ["opportunity_pipeline"],
    external_signals_used: [],
    external_signals_missing: [],
    expected_mechanism: null,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: licensing ? ["licensing_ip_review_required"] : [],
    confidence: {
      system: "explanation_confidence",
      level: "possible",
      score: null,
      reasons: ["Opportunity is active and has a concrete next step."],
      blockers: licensing ? ["Licensing/IP review required before direct execution."] : []
    },
    urgency: "low",
    risk: "medium",
    value_potential_proxy: 0.4,
    information_gain_value: 0.3,
    strategic_fit: 0.8,
    relevance_expires_at: null,
    current_regime: null,
    proposed_action: {
      action_key: `opportunity_next_step:${input.row.id}`,
      category: "opportunity_next_step",
      headline: input.row.name,
      recommended_action: next,
      measurement_plan: "Record outreach attempt and outcome.",
      success_metrics: [{ metric_id: "outreach.completed", note: "Manual tracking" }],
      evaluation_window: null,
      stop_condition: "If unresponsive after a fixed number of attempts, park.",
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

  return { candidate, freshness, skipped_reason: null };
}
