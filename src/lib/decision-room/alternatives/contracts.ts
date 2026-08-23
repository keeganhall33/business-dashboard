import type {
  UncertaintyDecisionModeV1,
  UncertaintyDecisionViewModelV1,
  UncertaintyDownsideBoundV1,
  UncertaintyEvidenceKindV1,
  UncertaintyReversibilityV1,
  UncertaintyValueOfInformationV1
} from "@/lib/decision-intelligence/uncertainty/contracts";

export type DecisionAlternativeKindV1 = "DO_NOTHING" | "LOW_RISK_TEST" | "OPTION_PRESERVING" | "AGGRESSIVE_COMMIT";
export type DecisionAlternativeStatusV1 = "PREFERRED" | "VIABLE" | "REJECTED";

export type DecisionEvidenceClassV1 = {
  direct_evidence_count: number;
  indirect_evidence_count: number;
  strongest_supported_kind: UncertaintyEvidenceKindV1 | "NONE";
  proxy_evidence_cannot_be_direct: true;
};

export type DecisionAlternativeComparisonItemV1 = {
  alternative_id: string;
  kind: DecisionAlternativeKindV1;
  label: string;
  status: DecisionAlternativeStatusV1;
  rationale: string;
  rejection_reason: string | null;
  evidence_refs: string[];
  opportunity_cost: string;
  strongest_downside: string;
  reversibility: UncertaintyReversibilityV1;
  value_of_information: UncertaintyValueOfInformationV1;
  cheapest_credible_test: string | null;
};

export type DecisionAlternativesComparisonViewModelV1 = {
  contract_version: "decision_alternatives_comparison_v1";
  source_contract_version: UncertaintyDecisionViewModelV1["contract_version"];
  decision_id: string;
  title: string;
  decision_mode: UncertaintyDecisionModeV1;
  evidence_class: DecisionEvidenceClassV1;
  critical_unknowns: string[];
  downside_bound: UncertaintyDownsideBoundV1;
  reversibility: UncertaintyReversibilityV1;
  value_of_information: UncertaintyValueOfInformationV1;
  cheapest_credible_test: string | null;
  alternatives: DecisionAlternativeComparisonItemV1[];
  preferred_alternative_id: string | null;
  rejected_alternative_ids: string[];
  opportunity_cost_summary: string;
  strongest_downside: string;
  what_would_change_my_mind: string[];
  dashboard_flags: {
    dashboard_consumable: true;
    missing_data_remains_unknown: boolean;
    rejected_alternatives_visible: boolean;
    keegan_action_required: false;
  };
};
