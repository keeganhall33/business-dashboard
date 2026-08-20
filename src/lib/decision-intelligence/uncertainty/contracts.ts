import type { ActionLevel } from "@/lib/actions/action-contract";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { MoneyRangeV1 } from "@/lib/financial-intelligence/contracts";

export type UncertaintyDecisionModeV1 =
  | "HIGH_EVIDENCE"
  | "BOUNDED_UNCERTAINTY"
  | "EXPERIMENT_FIRST"
  | "OPTION_PRESERVING"
  | "RESEARCH_FIRST"
  | "HUMAN_JUDGMENT_REQUIRED"
  | "DEFER_FOR_SAFETY";

export type UncertaintyEvidenceKindV1 = "DIRECT" | "PROXY" | "ANALOG" | "PRIOR_BASE_RATE";
export type UncertaintyCoverageV1 = "COMPLETE" | "PARTIAL" | "LOW" | "UNKNOWN";
export type UncertaintyReversibilityV1 = "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE" | "UNKNOWN";
export type UncertaintyValueOfInformationV1 = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type UncertaintyEvidenceRefV1 = {
  ref_id: string;
  label: string;
  kind: UncertaintyEvidenceKindV1;
  provenance: "FUSION_FIXTURE" | "STRATEGY_FIXTURE" | "EVIDENCE_TRUST_FIXTURE" | "LEARNING_FIXTURE" | "FINANCIAL_FIXTURE" | "MANUAL_FIXTURE";
  direct_evidence: boolean;
  source_label: string;
  notes: string;
};

export type UncertaintyDownsideBoundV1 = {
  bounded: boolean;
  severity: "LOW" | "MEDIUM" | "HIGH" | "UNBOUNDED";
  estimated_loss_range: MoneyRangeV1;
  notes: string[];
};

export type UncertaintyDecisionInputV1 = {
  decision_id: string;
  title: string;
  candidate_plan: string;
  data_coverage: UncertaintyCoverageV1;
  critical_unknowns: string[];
  proxy_or_analog_evidence: UncertaintyEvidenceRefV1[];
  prior_or_base_rate_evidence: UncertaintyEvidenceRefV1[];
  direct_evidence_refs: UncertaintyEvidenceRefV1[];
  downside_bound: UncertaintyDownsideBoundV1;
  value_of_information: UncertaintyValueOfInformationV1;
  cheapest_credible_test: string | null;
  reversibility: UncertaintyReversibilityV1;
  what_would_change_my_mind: string[];
  human_judgment_required: boolean;
  safety_blocked: boolean;
  approval_class: ActionLevel;
};

export type UncertaintyDecisionViewModelV1 = {
  contract_version: "decision_uncertainty_adapter_v1";
  decision_id: string;
  title: string;
  decision_mode: UncertaintyDecisionModeV1;
  best_viable_plan_now: string;
  confidence_range: {
    low: ExplanationConfidence;
    high: ExplanationConfidence;
    cap_reason: string;
  };
  critical_unknowns: string[];
  evidence: {
    direct: UncertaintyEvidenceRefV1[];
    proxy_or_analog: UncertaintyEvidenceRefV1[];
    prior_or_base_rate: UncertaintyEvidenceRefV1[];
  };
  confidence_inputs: {
    data_coverage: UncertaintyCoverageV1;
    missing_data_lowers_confidence: boolean;
    proxy_evidence_cannot_masquerade_as_direct: true;
  };
  downside_bound: UncertaintyDownsideBoundV1;
  value_of_information: UncertaintyValueOfInformationV1;
  cheapest_credible_test: string | null;
  reversibility: UncertaintyReversibilityV1;
  what_would_change_my_mind: string[];
  approval_class: ActionLevel;
  dashboard_flags: {
    uses_proxy_or_analog_evidence: boolean;
    has_direct_evidence: boolean;
    unknowns_explicit: boolean;
    blocks_irreversible_or_unsafe_action: boolean;
    keegan_action_required: false;
  };
};
