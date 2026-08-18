import type {
  DecisionUnderUncertaintyCoverageV1,
  DecisionUnderUncertaintyInputV1,
  DecisionUnderUncertaintyModeV1,
  DecisionUnderUncertaintyPlanV1
} from "./contracts";

const confidenceOrder = ["insufficient_evidence", "possible", "likely", "strongly_supported", "confirmed"] as const;
type Confidence = (typeof confidenceOrder)[number];

const coverageScore: Record<DecisionUnderUncertaintyCoverageV1, number> = {
  COMPLETE: 3,
  PARTIAL: 2,
  LOW: 1,
  UNKNOWN: 0
};

function confidenceCap(input: DecisionUnderUncertaintyInputV1): { low: Confidence; high: Confidence; cap_reason: string } {
  if (input.safety_blocked || !input.DOWNSIDE_BOUND.bounded) {
    return { low: "insufficient_evidence", high: "insufficient_evidence", cap_reason: "Unbounded downside or safety block caps confidence at insufficient evidence." };
  }
  if (!input.DIRECT_EVIDENCE_REFS.length && (input.PROXY_OR_ANALOG_EVIDENCE.length || input.PRIOR_OR_BASE_RATE_USED.length)) {
    return { low: "insufficient_evidence", high: "possible", cap_reason: "Proxy, analog, and prior evidence cannot raise confidence above possible without direct evidence." };
  }
  if (input.DATA_COVERAGE === "UNKNOWN" || input.CRITICAL_UNKNOWNS.length >= 3) {
    return { low: "insufficient_evidence", high: "possible", cap_reason: "Cold-start or high unknown count caps confidence at possible." };
  }
  if (input.DATA_COVERAGE === "PARTIAL") {
    return { low: "possible", high: "likely", cap_reason: "Partial direct coverage supports a bounded viable plan but not certainty." };
  }
  return { low: "likely", high: "strongly_supported", cap_reason: "Complete direct coverage can support high-evidence mode, but fixture remains non-executing." };
}

export function selectDecisionModeV1(input: DecisionUnderUncertaintyInputV1): DecisionUnderUncertaintyModeV1 {
  if (input.safety_blocked || !input.DOWNSIDE_BOUND.bounded || input.DOWNSIDE_BOUND.severity === "UNBOUNDED") return "DEFER_FOR_SAFETY";
  if (input.human_judgment_required) return "HUMAN_JUDGMENT_REQUIRED";
  if (input.CHEAPEST_CREDIBLE_TEST && (input.VALUE_OF_INFORMATION === "HIGH" || input.VALUE_OF_INFORMATION === "CRITICAL")) return "EXPERIMENT_FIRST";
  if (input.REVERSIBILITY === "REVERSIBLE" && input.VALUE_OF_INFORMATION !== "LOW" && coverageScore[input.DATA_COVERAGE] <= 1) return "OPTION_PRESERVING";
  if (coverageScore[input.DATA_COVERAGE] === 0 && !input.PROXY_OR_ANALOG_EVIDENCE.length && !input.PRIOR_OR_BASE_RATE_USED.length) return "RESEARCH_FIRST";
  if (input.DATA_COVERAGE === "COMPLETE" && input.DIRECT_EVIDENCE_REFS.length > 0 && input.CRITICAL_UNKNOWNS.length === 0) return "HIGH_EVIDENCE";
  return "BOUNDED_UNCERTAINTY";
}

export function buildDecisionUnderUncertaintyPlanV1(input: DecisionUnderUncertaintyInputV1): DecisionUnderUncertaintyPlanV1 {
  const DECISION_MODE = selectDecisionModeV1(input);
  const CONFIDENCE_RANGE = confidenceCap(input);
  const usesProxyOrPrior = input.PROXY_OR_ANALOG_EVIDENCE.length > 0 || input.PRIOR_OR_BASE_RATE_USED.length > 0;

  return {
    contract_version: "decision_under_uncertainty_v1",
    decision_id: input.decision_id,
    title: input.title,
    DATA_COVERAGE: input.DATA_COVERAGE,
    CRITICAL_UNKNOWNS: [...input.CRITICAL_UNKNOWNS],
    PROXY_OR_ANALOG_EVIDENCE: input.PROXY_OR_ANALOG_EVIDENCE.map((item) => ({ ...item, direct_evidence: false })),
    PRIOR_OR_BASE_RATE_USED: input.PRIOR_OR_BASE_RATE_USED.map((item) => ({ ...item, direct_evidence: false })),
    DIRECT_EVIDENCE_REFS: input.DIRECT_EVIDENCE_REFS.map((item) => ({ ...item, direct_evidence: true })),
    CONFIDENCE_RANGE,
    BEST_VIABLE_PLAN_NOW: DECISION_MODE === "DEFER_FOR_SAFETY" ? "Do not act; downside is not bounded enough for a viable plan." : input.candidate_plan,
    REVERSIBILITY: input.REVERSIBILITY,
    DOWNSIDE_BOUND: input.DOWNSIDE_BOUND,
    VALUE_OF_INFORMATION: input.VALUE_OF_INFORMATION,
    CHEAPEST_CREDIBLE_TEST: input.CHEAPEST_CREDIBLE_TEST,
    TRIGGERS_TO_REVISE: [...input.TRIGGERS_TO_REVISE],
    DECISION_MODE,
    approval_class: input.approval_class,
    dashboard_flags: {
      uses_proxy_or_prior: usesProxyOrPrior,
      has_direct_evidence: input.DIRECT_EVIDENCE_REFS.length > 0,
      unknowns_explicit: input.DATA_COVERAGE === "UNKNOWN" || input.CRITICAL_UNKNOWNS.length > 0,
      proxy_masquerades_as_direct: false,
      blocks_irreversible_action: DECISION_MODE === "DEFER_FOR_SAFETY" || input.REVERSIBILITY === "IRREVERSIBLE"
    }
  };
}
