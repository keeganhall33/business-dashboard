import type { DecisionEvidenceRefV1 } from "@/lib/decision-evidence/contracts";
import type { RecommendationRevisionVersionV1 } from "@/lib/decision-intelligence/revision/contracts";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";

export type DecisionConfidenceGuardStateV1 = "CURRENT" | "WATCH" | "REVIEW_REQUIRED";

export type DecisionConfidenceGuardInputV1 = {
  contract_version: "decision_confidence_guard_input_v1";
  recommendation: RecommendationRevisionVersionV1;
  prior_rationale: {
    recommendation_id: string;
    version: number;
    summary: string;
    recommended_action: string;
    confidence: ExplanationConfidence;
    rationale: string[];
  };
  current_evidence_refs: DecisionEvidenceRefV1[];
  materiality: "LOW" | "MEDIUM" | "HIGH" | "DECISION_CHANGING";
};

export type DecisionConfidenceGuardAssessmentV1 = {
  contract_version: "decision_confidence_guard_v1";
  recommendation_id: string;
  recommendation_version: number;
  confidence_before: ExplanationConfidence;
  confidence_now: ExplanationConfidence;
  confidence_delta: "UNCHANGED" | "DOWN";
  guard_state: DecisionConfidenceGuardStateV1;
  review_required: boolean;
  degrading_inputs: Array<{
    ref_id: string;
    label: string;
    reason: "STALE" | "CONFLICTED" | "LOW_QUALITY" | "UNKNOWN";
    detail: string;
  }>;
  stale_sources: DecisionEvidenceRefV1[];
  conflicted_sources: DecisionEvidenceRefV1[];
  prior_rationale: DecisionConfidenceGuardInputV1["prior_rationale"];
  active_recommendation_snapshot: RecommendationRevisionVersionV1;
  history_preserved: true;
  mutation_performed: false;
  dashboard_projection: DecisionConfidenceGuardDashboardProjectionV1;
  keegan_action_required: "NO";
};

export type DecisionConfidenceGuardDashboardProjectionV1 = {
  view_model_version: "decision_confidence_guard_dashboard_v1";
  recommendation_id: string;
  recommendation_version: number;
  status: DecisionConfidenceGuardStateV1;
  confidence_before: ExplanationConfidence;
  confidence_now: ExplanationConfidence;
  review_required: boolean;
  headline: string;
  degrading_input_count: number;
  stale_source_count: number;
  conflicted_source_count: number;
  prior_rationale_visible: true;
  prior_rationale_summary: string;
  rows: Array<{
    ref_id: string;
    label: string;
    state: "STALE" | "CONFLICTED" | "LOW_QUALITY" | "UNKNOWN";
    detail: string;
  }>;
};
