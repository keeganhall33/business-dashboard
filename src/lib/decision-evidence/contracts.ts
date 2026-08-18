import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type {
  TrustSnapshotCoverageState,
  TrustSnapshotEvidenceQuality,
  TrustSnapshotFreshnessState,
  TrustSnapshotTruthState
} from "@/lib/data-evidence-trust-snapshot/contracts";

export type DecisionEvidenceCostOrEffortClassV1 = "LOW" | "MEDIUM" | "HIGH" | "NOT_WORTH_IT";
export type DecisionEvidenceTimeSensitivityV1 = "NOW" | "THIS_WEEK" | "WATCH" | "LOW";
export type DecisionEvidenceInformationValueV1 = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DecisionEvidenceDirectnessV1 = "DIRECT" | "PROXY" | "ANALOG";
export type DecisionEvidenceRecommendationV1 = "RESEARCH_NOW" | "MONITOR" | "SKIP_FOR_NOW" | "SUFFICIENT";

export type DecisionEvidenceRefV1 = {
  ref_id: string;
  label: string;
  source: "strategy_fixture" | "data_evidence_fixture" | "learning_fixture" | "financial_fixture" | "manual_fixture";
  directness: DecisionEvidenceDirectnessV1;
  truth_state: TrustSnapshotTruthState;
  freshness_state: TrustSnapshotFreshnessState;
  evidence_quality: TrustSnapshotEvidenceQuality;
  notes: string;
};

export type DecisionEvidenceGapV1 = {
  contract_version: "decision_evidence_gap_v1";
  DECISION_ID: string;
  EVIDENCE_REFS: DecisionEvidenceRefV1[];
  COVERAGE_STATE: TrustSnapshotCoverageState;
  CRITICAL_UNKNOWN: string | null;
  MATERIALITY_IF_RESOLVED: "LOW" | "MEDIUM" | "HIGH" | "DECISION_CHANGING";
  CURRENT_PROXY_OR_ANALOG: DecisionEvidenceRefV1[];
  DIRECT_VS_PROXY_EVIDENCE: {
    direct_ref_ids: string[];
    proxy_or_analog_ref_ids: string[];
    proxy_masquerades_as_direct: false;
  };
  NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: string;
  ESTIMATED_INFORMATION_VALUE_QUALITATIVE: DecisionEvidenceInformationValueV1;
  COST_OR_EFFORT_CLASS: DecisionEvidenceCostOrEffortClassV1;
  TIME_SENSITIVITY: DecisionEvidenceTimeSensitivityV1;
  CONFIDENCE_CAP: ExplanationConfidence;
  STOP_RESEARCH_RULE: string;
  WHAT_RESULT_WOULD_CHANGE_THE_RECOMMENDATION: string;
};

export type DecisionEvidenceDashboardViewModelV1 = {
  view_model_version: "decision_evidence_dashboard_v1";
  decision_id: string;
  headline: string;
  recommendation: DecisionEvidenceRecommendationV1;
  coverage_state: TrustSnapshotCoverageState;
  confidence_cap: ExplanationConfidence;
  critical_unknowns: string[];
  evidence_rows: Array<{
    ref_id: string;
    label: string;
    badge: DecisionEvidenceDirectnessV1;
    state: TrustSnapshotTruthState | TrustSnapshotFreshnessState | TrustSnapshotEvidenceQuality;
    detail: string;
  }>;
  next_best_action: string;
  stop_rule: string;
  change_trigger: string;
  flags: {
    material_unknown_visible: boolean;
    stale_or_conflicted_visible: boolean;
    low_value_research_deprioritized: boolean;
    proxy_masquerades_as_direct: false;
  };
};
