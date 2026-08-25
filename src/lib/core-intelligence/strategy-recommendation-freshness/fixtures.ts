import type { ExplanationEvidenceItem } from "@/lib/intelligence/explanation-contract";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import { scorePriority } from "@/lib/intelligence/priority-scoring";
import { assessStrategyRecommendationFreshnessV1 } from "./adapter";
import type { StrategyRecommendationFreshnessInputV1 } from "./contracts";

const baseEvidence: ExplanationEvidenceItem = {
  id: "strategy-freshness-fixture-evidence",
  label: "Strategy freshness fixture evidence",
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
    supporting_evidence: input.supporting_evidence ?? [baseEvidence],
    affected_products: input.affected_products ?? ["originals"],
    affected_channels: input.affected_channels ?? ["strategy"],
    affected_audiences: input.affected_audiences ?? ["collectors"],
    expected_outcome: input.expected_outcome ?? "Fixture expected outcome.",
    estimated_incremental_revenue: input.estimated_incremental_revenue ?? {
      currency: "USD",
      horizon: "14d",
      low_incremental_revenue_cents: 50000,
      expected_incremental_revenue_cents: 100000,
      high_incremental_revenue_cents: 150000,
      notes: ["Fixture revenue range."],
      assumptions: ["Used only for freshness-gate tests."]
    },
    estimated_incremental_profit: input.estimated_incremental_profit ?? null,
    estimated_cost: input.estimated_cost ?? { money_cents: 10000, notes: ["Fixture bounded cost."] },
    estimated_effort: input.estimated_effort ?? { hours: 3, level: "medium", notes: ["Fixture effort."] },
    time_to_impact: input.time_to_impact ?? "days",
    confidence: input.confidence ?? "likely",
    confidence_reasons: input.confidence_reasons ?? ["Prior rationale remains inspectable."],
    urgency: input.urgency ?? "medium",
    priority_score: input.priority_score ?? scorePriority({
      revenuePotential: 0.5,
      confidence: 0.6,
      urgency: 0.5,
      timeToImpact: 0.6,
      effortInverse: 0.7,
      costInverse: 0.7,
      riskInverse: 0.6,
      strategicFit: 0.8,
      executionReadiness: 0.7
    }),
    risk: input.risk ?? "medium",
    downside: input.downside ?? [],
    prerequisites: input.prerequisites ?? [],
    execution_steps: input.execution_steps ?? [],
    prepared_assets: input.prepared_assets ?? [],
    approval_level: input.approval_level ?? "L1_RECOMMENDATION",
    measurement_plan: input.measurement_plan ?? "Measure fixture outcome.",
    success_threshold: input.success_threshold ?? "Fixture success threshold.",
    stop_condition: input.stop_condition ?? "Fixture stop condition.",
    review_date: input.review_date ?? "2026-09-01",
    data_used: input.data_used ?? [{ source: "fixture", notes: "Deterministic fixture." }],
    data_missing: input.data_missing ?? [],
    assumptions: input.assumptions ?? ["Evidence remains current."],
    limitations: input.limitations ?? [],
    status: input.status ?? "recommended"
  };
}

export const STRATEGY_RECOMMENDATION_FRESHNESS_VALID_INPUT_V1: StrategyRecommendationFreshnessInputV1 = {
  contract_version: "strategy_recommendation_freshness_input_v1",
  generated_at: "2026-08-25T12:00:00.000Z",
  recommendation_version: "strategy-rec-v1",
  last_reviewed_at: "2026-08-22T12:00:00.000Z",
  review_window_days: 14,
  recommendation: rec({
    id: "rec-current-private-room-proof",
    title: "Keep private collector room proof narrow",
    category: "website",
    recommended_action: "Keep the private collector-room proof path narrow and evidence-backed.",
    reason: "Recent supporting evidence still aligns with the narrow premium path."
  }),
  evidence: [
    {
      evidence_id: "private-room-proof-current",
      label: "Current private-room proof",
      observed_at: "2026-08-22T12:00:00.000Z",
      materiality: "MEDIUM",
      truth_state: "KNOWN",
      freshness: "CURRENT",
      supports_recommendation: true,
      summary: "Evidence reviewed with the recommendation and still supports the current path."
    }
  ]
};

export const STRATEGY_RECOMMENDATION_FRESHNESS_STALE_INPUT_V1: StrategyRecommendationFreshnessInputV1 = {
  contract_version: "strategy_recommendation_freshness_input_v1",
  generated_at: "2026-08-25T12:00:00.000Z",
  recommendation_version: "strategy-rec-v1",
  last_reviewed_at: "2026-08-05T12:00:00.000Z",
  review_window_days: 14,
  recommendation: rec({
    id: "rec-stale-event-path",
    title: "Explore premium event partnership",
    category: "partnership",
    recommended_action: "Explore a premium event partnership internally.",
    reason: "Older evidence suggested prestige upside before newer collector-room evidence arrived.",
    confidence: "possible",
    assumptions: ["Event economics are directionally useful."],
    limitations: ["Prior rationale predates newer collector-room evidence."]
  }),
  evidence: [
    {
      evidence_id: "collector-room-new-material-signal",
      label: "New collector-room signal",
      observed_at: "2026-08-21T12:00:00.000Z",
      materiality: "HIGH",
      truth_state: "KNOWN",
      freshness: "CURRENT",
      supports_recommendation: true,
      summary: "Material evidence arrived after review and could change recommendation priority."
    },
    {
      evidence_id: "event-economics-old",
      label: "Old event economics assumption",
      observed_at: "2026-08-01T12:00:00.000Z",
      materiality: "MEDIUM",
      truth_state: "STALE",
      freshness: "STALE",
      supports_recommendation: true,
      summary: "Original event economics input is stale."
    }
  ]
};

export const STRATEGY_RECOMMENDATION_FRESHNESS_CONFLICTED_INPUT_V1: StrategyRecommendationFreshnessInputV1 = {
  contract_version: "strategy_recommendation_freshness_input_v1",
  generated_at: "2026-08-25T12:00:00.000Z",
  recommendation_version: "strategy-rec-v2",
  last_reviewed_at: "2026-08-20T12:00:00.000Z",
  review_window_days: 14,
  recommendation: rec({
    id: "rec-conflicted-scale-meta",
    title: "Scale Meta collector campaign",
    category: "scale",
    recommended_action: "Scale the Meta collector campaign this week.",
    reason: "Prior rationale assumed matchback was clean enough for bounded spend.",
    assumptions: ["matchback not required for bounded spend test."],
    limitations: ["Prior rationale must remain visible if attribution evidence conflicts."]
  }),
  evidence: [
    {
      evidence_id: "matchback-conflict-after-review",
      label: "Matchback conflict after review",
      observed_at: "2026-08-23T12:00:00.000Z",
      materiality: "HIGH",
      truth_state: "CONFLICTED",
      freshness: "CURRENT",
      supports_recommendation: false,
      summary: "New attribution evidence conflicts with the scale assumption."
    }
  ]
};

export const STRATEGY_RECOMMENDATION_FRESHNESS_INPUTS_V1 = [
  STRATEGY_RECOMMENDATION_FRESHNESS_VALID_INPUT_V1,
  STRATEGY_RECOMMENDATION_FRESHNESS_STALE_INPUT_V1,
  STRATEGY_RECOMMENDATION_FRESHNESS_CONFLICTED_INPUT_V1
];

export const STRATEGY_RECOMMENDATION_FRESHNESS_RESULTS_V1 = STRATEGY_RECOMMENDATION_FRESHNESS_INPUTS_V1.map((input) =>
  assessStrategyRecommendationFreshnessV1(input)
);
