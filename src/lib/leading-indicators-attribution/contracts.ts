import type {
  AttributionConfidenceV1,
  DecisionLearningRecordInputV1,
  ResultVsPredictionV1
} from "@/lib/learning-engine/decision-record-v1";

export const LEADING_INDICATOR_REGISTRY_CONTRACT_VERSION_V1 = "leading_indicator_registry_v1.0" as const;
export const MULTI_TOUCH_ATTRIBUTION_CONTRACT_VERSION_V1 = "multi_touch_attribution_v1.0" as const;

export type LeadingIndicatorTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type LeadingIndicatorFreshnessV1 = "FRESH" | "STALE" | "UNKNOWN";
export type LeadingIndicatorUnitV1 = "COUNT" | "PERCENT" | "USD_CENTS" | "INDEX" | "UNKNOWN";
export type LeadingIndicatorDirectionV1 = "STRENGTHENING" | "WEAKENING" | "STABLE" | "UNKNOWN";
export type LeadingIndicatorReviewStateV1 = "NO_REVIEW" | "REVIEW_TRIGGERED" | "UNKNOWN";
export type AttributionContributorTypeV1 = "FIRST_PARTY_TRAFFIC" | "RELATIONSHIP" | "PARTNERSHIP" | "MEDIA" | "PRODUCT_OFFER" | "UNKNOWN";
export type AttributionRoleV1 = "PRIMARY_CONTRIBUTOR" | "SUPPORTING_CONTRIBUTOR" | "POSSIBLE_CONTRIBUTOR" | "UNKNOWN";
export type CausalClaimStateV1 = "SUPPORTED" | "DIRECTIONAL" | "CORRELATION_ONLY" | "UNKNOWN";

export type LeadingIndicatorDefinitionV1 = {
  metric_id: string;
  label: string;
  category: "QUALIFIED_COLLECTOR_GROWTH" | "CONVERSION_AOV" | "WARM_INTRO_RELATIONSHIP" | "PARTNERSHIP_LICENSING" | "AUDIENCE_MEDIA_REACH";
  source: string;
  freshness: LeadingIndicatorFreshnessV1;
  unit: LeadingIndicatorUnitV1;
  comparison_basis: "PRIOR_PERIOD" | "TARGET_RANGE" | "QUALITATIVE_STAGE" | "UNKNOWN";
  target_range: { low: number | null; high: number | null; rationale: string };
  truth_state: LeadingIndicatorTruthStateV1;
  decision_use: string;
  evidence_refs: string[];
};

export type LeadingIndicatorObservationV1 = {
  metric_id: string;
  current_value: number | null;
  prior_value: number | null;
  direction: LeadingIndicatorDirectionV1;
  review_state: LeadingIndicatorReviewStateV1;
  revenue_conclusion: "NOT_INFERRED" | "UNKNOWN";
  notes: string[];
  truth_state: LeadingIndicatorTruthStateV1;
};

export type LeadingIndicatorRegistryV1 = {
  contract_version: typeof LEADING_INDICATOR_REGISTRY_CONTRACT_VERSION_V1;
  generated_at: string;
  definitions: LeadingIndicatorDefinitionV1[];
  observations: LeadingIndicatorObservationV1[];
  dashboard_summary: {
    growth_signal: LeadingIndicatorDirectionV1;
    review_required: boolean;
    revenue_has_changed: "UNKNOWN";
    rationale: string;
  };
};

export type AttributionContributorV1 = {
  contributor_id: string;
  label: string;
  type: AttributionContributorTypeV1;
  role: AttributionRoleV1;
  contribution_weight: number | null;
  confidence: AttributionConfidenceV1;
  evidence_refs: string[];
  notes: string[];
};

export type MultiTouchAttributionRecordV1 = {
  contract_version: typeof MULTI_TOUCH_ATTRIBUTION_CONTRACT_VERSION_V1;
  attribution_id: string;
  outcome_id: string;
  outcome_label: string;
  contributors: AttributionContributorV1[];
  attribution_confidence: AttributionConfidenceV1;
  causal_claim_state: CausalClaimStateV1;
  unknowns: string[];
  winner_take_all_blocked: true;
  learning_handoff: Pick<
    DecisionLearningRecordInputV1,
    "PREDICTED_OUTCOME_RANGE" | "OBSERVED_OUTCOME" | "ATTRIBUTION_CONFIDENCE" | "RESULT_VS_PREDICTION" | "CALIBRATION_ERROR" | "LESSON"
  >;
};

export function deterioratingIndicators(registry: LeadingIndicatorRegistryV1): LeadingIndicatorObservationV1[] {
  return registry.observations.filter((observation) => observation.direction === "WEAKENING");
}

export function registryTriggersReview(registry: LeadingIndicatorRegistryV1): boolean {
  return deterioratingIndicators(registry).some((observation) => observation.review_state === "REVIEW_TRIGGERED");
}

export function attributionCanUpdateCausalPolicy(record: MultiTouchAttributionRecordV1): boolean {
  return record.attribution_confidence === "HIGH" && record.causal_claim_state === "SUPPORTED" && record.unknowns.length === 0;
}

export function buildLearningHandoffRecordV1(record: MultiTouchAttributionRecordV1): DecisionLearningRecordInputV1 {
  return {
    id: `learning-${record.attribution_id}`,
    recommendation_id: record.outcome_id,
    HYPOTHESIS: `${record.outcome_label} can be explained by the observed contributor mix without winner-take-all attribution.`,
    PREDICTED_OUTCOME_RANGE: record.learning_handoff.PREDICTED_OUTCOME_RANGE,
    CONFIDENCE: record.attribution_confidence === "HIGH" ? "likely" : record.attribution_confidence === "MEDIUM" ? "possible" : "insufficient_evidence",
    KEY_ASSUMPTIONS: record.unknowns.length ? record.unknowns : ["Contributor evidence is complete enough for this confidence level."],
    SUCCESS_CRITERIA: ["Observed outcome is compared against the forecast range.", "Attribution confidence remains explicit."],
    EVALUATION_WINDOW: { start: "2026-08-01", end: "2026-08-31" },
    ACTION_STATUS: record.attribution_confidence === "UNKNOWN" ? "inconclusive" : "measuring",
    OBSERVED_OUTCOME: record.learning_handoff.OBSERVED_OUTCOME,
    ATTRIBUTION_CONFIDENCE: record.learning_handoff.ATTRIBUTION_CONFIDENCE,
    RESULT_VS_PREDICTION: record.learning_handoff.RESULT_VS_PREDICTION as ResultVsPredictionV1,
    LESSON: record.learning_handoff.LESSON,
    CALIBRATION_ERROR: record.learning_handoff.CALIBRATION_ERROR,
    POLICY_UPDATE_CANDIDATE: attributionCanUpdateCausalPolicy(record) ? "Candidate only after high-confidence causal support." : null
  };
}
