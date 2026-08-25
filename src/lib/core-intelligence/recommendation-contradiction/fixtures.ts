import type { ExplanationEvidenceItem } from "@/lib/intelligence/explanation-contract";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import { scorePriority } from "@/lib/intelligence/priority-scoring";
import { assessRecommendationContradictionsV1 } from "./adapter";
import type { RecommendationContradictionInputV1 } from "./contracts";

const evidence: ExplanationEvidenceItem = {
  id: "ev-core-contradiction-fixture",
  label: "Fixture recommendation evidence",
  source: "internal",
  kind: "event",
  details: { fixture: true }
};

function rec(input: Partial<Recommendation> & Pick<Recommendation, "id" | "title" | "category" | "recommended_action" | "reason">): Recommendation {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    recommended_action: input.recommended_action,
    reason: input.reason,
    supporting_evidence: input.supporting_evidence ?? [evidence],
    affected_products: input.affected_products ?? [],
    affected_channels: input.affected_channels ?? [],
    affected_audiences: input.affected_audiences ?? [],
    expected_outcome: input.expected_outcome ?? "Fixture expected outcome.",
    estimated_incremental_revenue: input.estimated_incremental_revenue ?? {
      currency: "USD",
      horizon: "7d",
      low_incremental_revenue_cents: 50000,
      expected_incremental_revenue_cents: 100000,
      high_incremental_revenue_cents: 150000,
      notes: ["Fixture range only."],
      assumptions: ["Range remains deterministic for contradiction tests."]
    },
    estimated_incremental_profit: input.estimated_incremental_profit ?? null,
    estimated_cost: input.estimated_cost ?? { money_cents: 25000, notes: ["Fixture bounded cost."] },
    estimated_effort: input.estimated_effort ?? { hours: 4, level: "medium", notes: ["Fixture effort."] },
    time_to_impact: input.time_to_impact ?? "days",
    confidence: input.confidence ?? "likely",
    confidence_reasons: input.confidence_reasons ?? ["Fixture confidence reason remains visible."],
    urgency: input.urgency ?? "medium",
    priority_score: input.priority_score ?? scorePriority({
      revenuePotential: 0.5,
      confidence: 0.6,
      urgency: 0.5,
      timeToImpact: 0.6,
      effortInverse: 0.6,
      costInverse: 0.6,
      riskInverse: 0.6,
      strategicFit: 0.7,
      executionReadiness: 0.6
    }),
    risk: input.risk ?? "medium",
    downside: input.downside ?? [],
    prerequisites: input.prerequisites ?? [],
    execution_steps: input.execution_steps ?? [],
    prepared_assets: input.prepared_assets ?? [],
    approval_level: input.approval_level ?? "L1_RECOMMENDATION",
    measurement_plan: input.measurement_plan ?? "Measure fixture result.",
    success_threshold: input.success_threshold ?? "Fixture success threshold.",
    stop_condition: input.stop_condition ?? "Fixture stop condition.",
    review_date: input.review_date ?? "2026-09-01",
    data_used: input.data_used ?? [{ source: "fixture", notes: "Deterministic fixture." }],
    data_missing: input.data_missing ?? [],
    assumptions: input.assumptions ?? ["matchback not required for this bounded fixture."],
    limitations: input.limitations ?? [],
    status: input.status ?? "recommended"
  };
}

export const RECOMMENDATION_CONTRADICTION_COMPATIBLE_INPUT_V1: RecommendationContradictionInputV1 = {
  contract_version: "recommendation_contradiction_input_v1",
  generated_at: "2026-08-25T09:00:00.000Z",
  recommendations: [
    rec({
      id: "rec-refresh-product-page",
      title: "Refresh product page proof",
      category: "website",
      recommended_action: "Improve product page evidence and clarity.",
      reason: "Website proof can improve buyer confidence.",
      affected_products: ["originals"],
      affected_channels: ["website"],
      affected_audiences: ["collectors"]
    }),
    rec({
      id: "rec-email-collector-note",
      title: "Prepare collector email note",
      category: "email",
      recommended_action: "Prepare a read-only collector email draft.",
      reason: "Email draft preparation does not compete with website proof work.",
      affected_products: ["prints"],
      affected_channels: ["email"],
      affected_audiences: ["existing collectors"]
    })
  ]
};

export const RECOMMENDATION_CONTRADICTION_CONFLICTING_INPUT_V1: RecommendationContradictionInputV1 = {
  contract_version: "recommendation_contradiction_input_v1",
  generated_at: "2026-08-25T09:05:00.000Z",
  recommendations: [
    rec({
      id: "rec-scale-meta-collector-campaign",
      title: "Scale Meta collector campaign",
      category: "scale",
      recommended_action: "Scale the collector campaign this week.",
      reason: "Traffic appears qualified enough to test a bounded scale move.",
      affected_channels: ["meta"],
      affected_audiences: ["collectors"],
      estimated_cost: { money_cents: 80000, notes: ["Paid campaign budget."] },
      estimated_effort: { hours: 10, level: "high", notes: ["Requires creative, QA, and measurement."] },
      urgency: "high",
      time_to_impact: "weeks",
      assumptions: ["matchback not required for bounded spend test.", "direct economics proven by prior campaign fixture."]
    }),
    rec({
      id: "rec-pause-meta-until-matchback",
      title: "Pause Meta until matchback is clean",
      category: "pause",
      recommended_action: "Pause Meta spend until matchback is reconciled.",
      reason: "Attribution gaps make spend scaling unsafe.",
      affected_channels: ["meta"],
      affected_audiences: ["collectors"],
      estimated_cost: { money_cents: 10000, notes: ["Measurement cleanup cost."] },
      estimated_effort: { hours: 6, level: "medium", notes: ["Requires data review."] },
      urgency: "high",
      time_to_impact: "days",
      assumptions: ["matchback required before spend changes.", "direct economics unknown until attribution is reconciled."],
      data_missing: ["matchback required"]
    })
  ]
};

export const RECOMMENDATION_CONTRADICTION_UNKNOWN_INPUT_V1: RecommendationContradictionInputV1 = {
  contract_version: "recommendation_contradiction_input_v1",
  generated_at: "2026-08-25T09:10:00.000Z",
  recommendations: [
    rec({
      id: "rec-unknown-event-partnership",
      title: "Explore event partnership",
      category: "partnership",
      recommended_action: "Explore a possible event partnership internally.",
      reason: "Prestige upside might exist, but evidence is incomplete.",
      affected_channels: ["events"],
      affected_audiences: ["collectors"],
      supporting_evidence: [],
      estimated_cost: { money_cents: null, notes: ["Cost is UNKNOWN."] },
      estimated_effort: { hours: null, level: "medium", notes: ["Time burden is UNKNOWN."] },
      time_to_impact: "unknown",
      review_date: null,
      confidence: "possible",
      assumptions: [],
      limitations: ["direct economics unknown"]
    }),
    rec({
      id: "rec-unknown-studio-focus",
      title: "Keep studio focus",
      category: "do_nothing",
      recommended_action: "Keep studio focus until event economics are known.",
      reason: "Unknown partnership cost may dilute production time.",
      affected_channels: ["studio"],
      affected_audiences: ["studio production"],
      estimated_cost: { money_cents: null, notes: ["Opportunity cost is UNKNOWN."] },
      estimated_effort: { hours: null, level: "medium", notes: ["Capacity cost is UNKNOWN."] },
      time_to_impact: "unknown",
      review_date: null,
      assumptions: [],
      limitations: ["direct economics unknown"]
    })
  ]
};

export const RECOMMENDATION_CONTRADICTION_COMPATIBLE_RESULT_V1 = assessRecommendationContradictionsV1(RECOMMENDATION_CONTRADICTION_COMPATIBLE_INPUT_V1);
export const RECOMMENDATION_CONTRADICTION_CONFLICTING_RESULT_V1 = assessRecommendationContradictionsV1(RECOMMENDATION_CONTRADICTION_CONFLICTING_INPUT_V1);
export const RECOMMENDATION_CONTRADICTION_UNKNOWN_RESULT_V1 = assessRecommendationContradictionsV1(RECOMMENDATION_CONTRADICTION_UNKNOWN_INPUT_V1);
