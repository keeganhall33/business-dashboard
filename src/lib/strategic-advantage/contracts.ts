import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { ExpectedImpactRange } from "@/lib/intelligence/recommendation-contract";

export const STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1 = "strategic_advantage_assessment_v1.0" as const;
export const STRATEGIC_ADVANTAGE_EXECUTIVE_VIEW_VERSION_V1 = "strategic_advantage_executive_view_v1.0" as const;

export type AdvantageDimensionLevelV1 = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "UNKNOWN";
export type AdvantageRiskLevelV1 = "LOW" | "MEDIUM" | "HIGH" | "UNACCEPTABLE" | "UNKNOWN";
export type AdvantageReversibilityV1 = "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE" | "UNKNOWN";
export type AdvantageTimingV1 = "TOO_EARLY" | "GOOD_WINDOW" | "URGENT_WINDOW" | "TOO_LATE" | "EVERGREEN" | "UNKNOWN";
export type AdvantageRecommendationV1 = "PURSUE" | "PURSUE_OPTION" | "LEARN_FIRST" | "DEPRIORITIZE" | "REJECT" | "UNKNOWN";

export type AdvantageEvidenceRefV1 = {
  ref_id: string;
  source: "fixture" | "internal" | "external" | "unknown";
  note: string;
};

export type AdvantageConfidenceV1 = {
  level: ExplanationConfidence;
  reasons: string[];
  cap: ExplanationConfidence | null;
  cap_reason: string | null;
};

export type QualitativeDimensionV1 = {
  level: AdvantageDimensionLevelV1;
  rationale: string;
  evidence_refs: string[];
};

export type RiskDimensionV1 = {
  level: AdvantageRiskLevelV1;
  rationale: string;
  evidence_refs: string[];
};

export type OpportunityCostV1 = {
  explicit_tradeoffs: string[];
  capacity_hours_range: { low: number | null; high: number | null };
  cash_cost_range_cents: { low: number | null; high: number | null; currency: "USD" | "UNKNOWN" };
  qualitative_costs: string[];
  evidence_refs: string[];
};

export type DecisionAdvantageAssessmentV1 = {
  contract_version: typeof STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1;
  assessment_id: string;
  action_id: string;
  action_label: string;
  recommendation: AdvantageRecommendationV1;

  expected_value_range: ExpectedImpactRange;
  asymmetry: QualitativeDimensionV1;
  optionality: QualitativeDimensionV1;
  reversibility: {
    level: AdvantageReversibilityV1;
    rationale: string;
    evidence_refs: string[];
  };
  opportunity_cost: OpportunityCostV1;
  compounding_value: QualitativeDimensionV1;
  defensibility: QualitativeDimensionV1;
  information_advantage: QualitativeDimensionV1;
  network_effect: QualitativeDimensionV1;
  brand_prestige_effect: QualitativeDimensionV1;
  learning_value: QualitativeDimensionV1;
  timing: {
    level: AdvantageTimingV1;
    rationale: string;
    evidence_refs: string[];
  };
  capacity_fit: RiskDimensionV1;
  risk_of_ruin: RiskDimensionV1;

  key_uncertainty: string;
  what_would_change_my_mind: string[];
  advantage_thesis: string;
  biggest_bottleneck: string;
  next_smallest_high_leverage_action: string;
  what_to_ignore_or_deprioritize: string[];
  assumptions: string[];
  evidence_refs: AdvantageEvidenceRefV1[];
  confidence: AdvantageConfidenceV1;
};

export type StrategicAdvantageExecutiveViewModelV1 = {
  view_version: typeof STRATEGIC_ADVANTAGE_EXECUTIVE_VIEW_VERSION_V1;
  assessment_id: string;
  action_label: string;
  recommendation: AdvantageRecommendationV1;
  why_this_creates_advantage: string;
  what_compounds: string;
  what_is_hard_to_copy: string;
  what_we_give_up: string[];
  biggest_uncertainty: string;
  biggest_bottleneck: string;
  what_to_ignore_or_deprioritize: string[];
  next_high_leverage_move: string;
  what_would_change_the_recommendation: string[];
  confidence: AdvantageConfidenceV1;
};

export function unknownExpectedValueRange(notes: string[] = [], assumptions: string[] = []): ExpectedImpactRange {
  return {
    currency: "UNKNOWN",
    horizon: "unknown",
    low_incremental_revenue_cents: null,
    expected_incremental_revenue_cents: null,
    high_incremental_revenue_cents: null,
    notes,
    assumptions
  };
}

export function confidenceWithMissingDataCap(input: {
  base: AdvantageConfidenceV1;
  missingData: string[];
}): AdvantageConfidenceV1 {
  if (input.missingData.length === 0) return input.base;

  return {
    level: "insufficient_evidence",
    reasons: [...input.base.reasons, ...input.missingData.map((item) => `missing:${item}`)],
    cap: "insufficient_evidence",
    cap_reason: `Missing data caps confidence: ${input.missingData.join(", ")}`
  };
}

export function hasUnacceptableRuinRisk(assessment: DecisionAdvantageAssessmentV1): boolean {
  return assessment.risk_of_ruin.level === "UNACCEPTABLE";
}
