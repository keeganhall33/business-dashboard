import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

export type OpportunityRow = {
  id: string;
  name: string;
  organization: string | null;
  opportunity_type: string;
  status: string;
  value_estimate: number | null;
  prestige_score: number | null;
  probability_score: number | null;
  owner_agent: string;
  contact_name: string | null;
  contact_role: string | null;
  next_step: string | null;
  next_step_due_at: string | null;
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Normalization: map value_estimate (USD) to [0,1] using log scale.
// - 0 -> 0
// - 10k -> ~0.33
// - 50k -> ~0.56
// - 200k -> ~0.8
// - 500k+ -> 1
function normalizeValueEstimateUsd(value: number | null): number {
  const v = Math.max(0, value ?? 0);
  if (v <= 0) return 0;
  const lo = Math.log10(10_000);
  const hi = Math.log10(500_000);
  const x = (Math.log10(v) - lo) / (hi - lo);
  return clamp01(x);
}

function normalizePrestige(prestige: number | null): number {
  // prestige_score is expected ~[0,10]
  return clamp01(((prestige ?? 0) as number) / 10);
}

function normalizeProbability(p: number | null): number {
  // probability_score is already expected [0,1]
  return clamp01((p ?? 0) as number);
}

function normalizeAccess(contactName: string | null, contactRole: string | null): number {
  return contactName?.trim() && contactRole?.trim() ? 1 : 0;
}

function normalizeActionability(nextStep: string | null): number {
  return nextStep?.trim() ? 1 : 0;
}

export function scoreOpportunitySelectorV2(row: OpportunityRow): {
  score: number;
  factors: { commercial_value: number; prestige: number; probability: number; actionability: number; access: number };
} {
  const commercial_value = normalizeValueEstimateUsd(row.value_estimate);
  const prestige = normalizePrestige(row.prestige_score);
  const probability = normalizeProbability(row.probability_score);
  const actionability = normalizeActionability(row.next_step);
  const access = normalizeAccess(row.contact_name, row.contact_role);

  // Deterministic V1 weights. Value is important but bounded by log normalization.
  const score =
    0.35 * commercial_value +
    0.25 * prestige +
    0.25 * probability +
    0.10 * actionability +
    0.05 * access;

  return { score: Math.round(score * 1000) / 1000, factors: { commercial_value, prestige, probability, actionability, access } };
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

  // Exclude explicit HOLD_AND_MONITOR from active execution unless a reactivation trigger has fired.
  // Reactivation triggers are not modeled yet, so treat as inactive here.
  if (String(input.row.status).toLowerCase() === "hold_and_monitor") {
    return { candidate: null, freshness: { age_days: 0, classification: "monitor_only" }, skipped_reason: "hold_and_monitor" };
  }

  const age_days = daysBetween(input.nowIso, input.row.updated_at);
  const freshnessClass = classifyFreshness(age_days);
  const freshness = { age_days, classification: freshnessClass };
  if (freshnessClass === "stale") return { candidate: null, freshness, skipped_reason: "stale_opportunity" };

  const active = isActiveStatus(input.row.status);
  if (!active) return { candidate: null, freshness, skipped_reason: "inactive_status" };

  const licensing = impliesLicensing(input.row.opportunity_type);

  const selector = scoreOpportunitySelectorV2(input.row);

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
    missing_evidence: [
      "No internal evidence of current relevance",
      ...(input.row.contact_name ? [] : ["No named contact on opportunity_pipeline row"])
    ],
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
    // Selector v2 score drives the candidate feature proxies (scoring engine uses these).
    value_potential_proxy: selector.factors.commercial_value,
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
