import type { ActionLevel } from "@/lib/actions/action-contract";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { MoneyRangeV1 } from "@/lib/financial-intelligence/contracts";

export type DecisionUnderUncertaintyModeV1 =
  | "HIGH_EVIDENCE"
  | "BOUNDED_UNCERTAINTY"
  | "EXPERIMENT_FIRST"
  | "OPTION_PRESERVING"
  | "RESEARCH_FIRST"
  | "HUMAN_JUDGMENT_REQUIRED"
  | "DEFER_FOR_SAFETY";

export type DecisionUnderUncertaintyEvidenceKindV1 = "DIRECT" | "PROXY" | "ANALOG" | "PRIOR_BASE_RATE";
export type DecisionUnderUncertaintyCoverageV1 = "COMPLETE" | "PARTIAL" | "LOW" | "UNKNOWN";
export type DecisionUnderUncertaintyReversibilityV1 = "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE" | "UNKNOWN";
export type DecisionUnderUncertaintyValueOfInformationV1 = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DecisionUnderUncertaintyEvidenceRefV1 = {
  ref_id: string;
  label: string;
  kind: DecisionUnderUncertaintyEvidenceKindV1;
  provenance: "STRATEGY_FIXTURE" | "EVIDENCE_TRUST_FIXTURE" | "LEARNING_FIXTURE" | "FINANCIAL_FIXTURE" | "MANUAL_FIXTURE";
  direct_evidence: boolean;
  notes: string;
};

export type DecisionUnderUncertaintyInputV1 = {
  decision_id: string;
  title: string;
  DATA_COVERAGE: DecisionUnderUncertaintyCoverageV1;
  CRITICAL_UNKNOWNS: string[];
  PROXY_OR_ANALOG_EVIDENCE: DecisionUnderUncertaintyEvidenceRefV1[];
  PRIOR_OR_BASE_RATE_USED: DecisionUnderUncertaintyEvidenceRefV1[];
  DIRECT_EVIDENCE_REFS: DecisionUnderUncertaintyEvidenceRefV1[];
  REVERSIBILITY: DecisionUnderUncertaintyReversibilityV1;
  DOWNSIDE_BOUND: {
    bounded: boolean;
    severity: "LOW" | "MEDIUM" | "HIGH" | "UNBOUNDED";
    notes: string[];
    estimated_loss_range: MoneyRangeV1;
  };
  VALUE_OF_INFORMATION: DecisionUnderUncertaintyValueOfInformationV1;
  CHEAPEST_CREDIBLE_TEST: string | null;
  TRIGGERS_TO_REVISE: string[];
  human_judgment_required: boolean;
  safety_blocked: boolean;
  approval_class: ActionLevel;
  candidate_plan: string;
};

export type DecisionUnderUncertaintyPlanV1 = {
  contract_version: "decision_under_uncertainty_v1";
  decision_id: string;
  title: string;
  DATA_COVERAGE: DecisionUnderUncertaintyCoverageV1;
  CRITICAL_UNKNOWNS: string[];
  PROXY_OR_ANALOG_EVIDENCE: DecisionUnderUncertaintyEvidenceRefV1[];
  PRIOR_OR_BASE_RATE_USED: DecisionUnderUncertaintyEvidenceRefV1[];
  DIRECT_EVIDENCE_REFS: DecisionUnderUncertaintyEvidenceRefV1[];
  CONFIDENCE_RANGE: {
    low: ExplanationConfidence;
    high: ExplanationConfidence;
    cap_reason: string;
  };
  BEST_VIABLE_PLAN_NOW: string;
  REVERSIBILITY: DecisionUnderUncertaintyReversibilityV1;
  DOWNSIDE_BOUND: DecisionUnderUncertaintyInputV1["DOWNSIDE_BOUND"];
  VALUE_OF_INFORMATION: DecisionUnderUncertaintyValueOfInformationV1;
  CHEAPEST_CREDIBLE_TEST: string | null;
  TRIGGERS_TO_REVISE: string[];
  DECISION_MODE: DecisionUnderUncertaintyModeV1;
  approval_class: ActionLevel;
  dashboard_flags: {
    uses_proxy_or_prior: boolean;
    has_direct_evidence: boolean;
    unknowns_explicit: boolean;
    proxy_masquerades_as_direct: false;
    blocks_irreversible_action: boolean;
  };
};
