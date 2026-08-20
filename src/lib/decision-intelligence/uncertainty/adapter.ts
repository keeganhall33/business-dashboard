import type {
  UncertaintyCoverageV1,
  UncertaintyDecisionInputV1,
  UncertaintyDecisionModeV1,
  UncertaintyDecisionViewModelV1,
  UncertaintyEvidenceRefV1
} from "./contracts";

const coverageScore: Record<UncertaintyCoverageV1, number> = {
  COMPLETE: 3,
  PARTIAL: 2,
  LOW: 1,
  UNKNOWN: 0
};

type Confidence = UncertaintyDecisionViewModelV1["confidence_range"]["low"];

function forceEvidenceKind(input: UncertaintyEvidenceRefV1, direct_evidence: boolean): UncertaintyEvidenceRefV1 {
  return {
    ...input,
    direct_evidence
  };
}

function confidenceRangeFor(input: UncertaintyDecisionInputV1): UncertaintyDecisionViewModelV1["confidence_range"] {
  const usesOnlyIndirectEvidence =
    input.direct_evidence_refs.length === 0 &&
    (input.proxy_or_analog_evidence.length > 0 || input.prior_or_base_rate_evidence.length > 0);

  if (input.safety_blocked || !input.downside_bound.bounded || input.downside_bound.severity === "UNBOUNDED") {
    return {
      low: "insufficient_evidence",
      high: "insufficient_evidence",
      cap_reason: "Safety block or unbounded downside prevents a confidence claim."
    };
  }

  if (usesOnlyIndirectEvidence) {
    return {
      low: "insufficient_evidence",
      high: "possible",
      cap_reason: "Proxy, analog, and prior evidence are labeled indirect and cannot raise confidence above possible without direct evidence."
    };
  }

  if (input.data_coverage === "UNKNOWN" || input.critical_unknowns.length >= 3) {
    return {
      low: "insufficient_evidence",
      high: "possible",
      cap_reason: "Missing data and critical unknowns lower confidence instead of being treated as zero or false."
    };
  }

  if (input.data_coverage === "LOW") {
    return {
      low: "insufficient_evidence",
      high: "possible",
      cap_reason: "Low coverage supports only a bounded plan."
    };
  }

  if (input.data_coverage === "PARTIAL") {
    return {
      low: "possible",
      high: "likely",
      cap_reason: "Partial direct evidence supports a viable plan but not high confidence."
    };
  }

  return {
    low: "likely",
    high: "strongly_supported",
    cap_reason: "Complete direct evidence and bounded downside can support high-evidence mode without fake precision."
  };
}

export function selectUncertaintyDecisionModeV1(input: UncertaintyDecisionInputV1): UncertaintyDecisionModeV1 {
  if (input.safety_blocked || !input.downside_bound.bounded || input.downside_bound.severity === "UNBOUNDED") return "DEFER_FOR_SAFETY";
  if (input.human_judgment_required) return "HUMAN_JUDGMENT_REQUIRED";
  if (input.cheapest_credible_test && (input.value_of_information === "HIGH" || input.value_of_information === "CRITICAL")) return "EXPERIMENT_FIRST";
  if (input.reversibility === "REVERSIBLE" && coverageScore[input.data_coverage] <= 1 && input.value_of_information !== "LOW") return "OPTION_PRESERVING";
  if (input.data_coverage === "UNKNOWN" && input.direct_evidence_refs.length === 0 && input.proxy_or_analog_evidence.length === 0 && input.prior_or_base_rate_evidence.length === 0) return "RESEARCH_FIRST";
  if (input.data_coverage === "COMPLETE" && input.direct_evidence_refs.length > 0 && input.critical_unknowns.length === 0) return "HIGH_EVIDENCE";
  return "BOUNDED_UNCERTAINTY";
}

export function buildUncertaintyDecisionViewModelV1(input: UncertaintyDecisionInputV1): UncertaintyDecisionViewModelV1 {
  const decision_mode = selectUncertaintyDecisionModeV1(input);
  const direct = input.direct_evidence_refs.map((item) => forceEvidenceKind(item, true));
  const proxy_or_analog = input.proxy_or_analog_evidence.map((item) => forceEvidenceKind(item, false));
  const prior_or_base_rate = input.prior_or_base_rate_evidence.map((item) => forceEvidenceKind(item, false));
  const usesProxyOrAnalog = proxy_or_analog.length > 0 || prior_or_base_rate.length > 0;
  const blocksUnsafeAction = decision_mode === "DEFER_FOR_SAFETY" || input.reversibility === "IRREVERSIBLE";

  return {
    contract_version: "decision_uncertainty_adapter_v1",
    decision_id: input.decision_id,
    title: input.title,
    decision_mode,
    best_viable_plan_now: decision_mode === "DEFER_FOR_SAFETY" ? "Do not act until downside, safety, and permission constraints are bounded." : input.candidate_plan,
    confidence_range: confidenceRangeFor(input),
    critical_unknowns: [...input.critical_unknowns],
    evidence: {
      direct,
      proxy_or_analog,
      prior_or_base_rate
    },
    confidence_inputs: {
      data_coverage: input.data_coverage,
      missing_data_lowers_confidence: input.data_coverage !== "COMPLETE" || input.critical_unknowns.length > 0,
      proxy_evidence_cannot_masquerade_as_direct: true
    },
    downside_bound: {
      ...input.downside_bound,
      notes: [...input.downside_bound.notes]
    },
    value_of_information: input.value_of_information,
    cheapest_credible_test: input.cheapest_credible_test,
    reversibility: input.reversibility,
    what_would_change_my_mind: [...input.what_would_change_my_mind],
    approval_class: input.approval_class,
    dashboard_flags: {
      uses_proxy_or_analog_evidence: usesProxyOrAnalog,
      has_direct_evidence: direct.length > 0,
      unknowns_explicit: input.data_coverage === "UNKNOWN" || input.critical_unknowns.length > 0,
      blocks_irreversible_or_unsafe_action: blocksUnsafeAction,
      keegan_action_required: false
    }
  };
}
