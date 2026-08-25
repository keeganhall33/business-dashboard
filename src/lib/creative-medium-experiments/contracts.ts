export type CreativeExperimentTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type CreativeExperimentConfidenceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type CreativeExperimentReversibilityV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type CreativeExperimentOrderingV1 = "TEST_NOW" | "DEVELOP_NEXT" | "DEFER";

export type CreativeExperimentOptionV1 = {
  experiment_id: string;
  medium_material: string;
  scale: "SMALL_STUDY" | "CONTROL_PAIR" | "DIMENSIONAL_STUDY";
  learning_burden: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  production_time_days_range: { min: number | null; max: number | null; truth_state: CreativeExperimentTruthStateV1 };
  differentiation_hypothesis: string;
  market_evidence: {
    summary: string;
    source: string;
    truth_state: CreativeExperimentTruthStateV1;
    confidence: CreativeExperimentConfidenceV1;
  };
  institutional_fit: {
    summary: string;
    truth_state: CreativeExperimentTruthStateV1;
    confidence: CreativeExperimentConfidenceV1;
  };
  reversibility: CreativeExperimentReversibilityV1;
  evidence_truth_state: CreativeExperimentTruthStateV1;
  success_signal: string;
  capacity_required: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  decision_notes: string[];
};

export type CreativeExperimentShortlistV1 = {
  contract_version: "creative_medium_experiment_shortlist_v1";
  generated_at: string;
  options: CreativeExperimentRankedOptionV1[];
  dashboard_projection: {
    TEST_NOW: string[];
    DEVELOP_NEXT: string[];
    DEFER: string[];
    WHAT_CHANGED: string;
    WHY_IT_MATTERS: string;
    WHAT_TO_VERIFY_NEXT: string[];
  };
};

export type CreativeExperimentRankedOptionV1 = CreativeExperimentOptionV1 & {
  ordering: CreativeExperimentOrderingV1;
  rank: number;
  score: number;
  score_breakdown: {
    learning_cost: number;
    differentiation: number;
    market_evidence: number;
    institutional_fit: number;
    reversibility: number;
    capacity_fit: number;
    unknown_penalty: number;
  };
};
