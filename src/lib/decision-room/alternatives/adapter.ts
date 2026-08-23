import type { UncertaintyDecisionViewModelV1 } from "@/lib/decision-intelligence/uncertainty/contracts";
import type {
  DecisionAlternativeComparisonItemV1,
  DecisionAlternativeKindV1,
  DecisionAlternativesComparisonViewModelV1,
  DecisionEvidenceClassV1
} from "./contracts";

function allEvidenceRefs(input: UncertaintyDecisionViewModelV1): string[] {
  return [
    ...input.evidence.direct.map((item) => item.ref_id),
    ...input.evidence.proxy_or_analog.map((item) => item.ref_id),
    ...input.evidence.prior_or_base_rate.map((item) => item.ref_id)
  ];
}

function evidenceClassFor(input: UncertaintyDecisionViewModelV1): DecisionEvidenceClassV1 {
  const indirect = [...input.evidence.proxy_or_analog, ...input.evidence.prior_or_base_rate];
  const strongest_supported_kind =
    input.evidence.direct.length > 0
      ? "DIRECT"
      : input.evidence.proxy_or_analog[0]?.kind ?? input.evidence.prior_or_base_rate[0]?.kind ?? "NONE";

  return {
    direct_evidence_count: input.evidence.direct.length,
    indirect_evidence_count: indirect.length,
    strongest_supported_kind,
    proxy_evidence_cannot_be_direct: true
  };
}

function strongestDownsideFor(input: UncertaintyDecisionViewModelV1): string {
  const note = input.downside_bound.notes[0] ?? "No downside note supplied.";
  if (!input.downside_bound.bounded || input.downside_bound.severity === "UNBOUNDED") return `UNBOUNDED: ${note}`;
  return `${input.downside_bound.severity}: ${note}`;
}

function opportunityCostFor(input: UncertaintyDecisionViewModelV1, kind: DecisionAlternativeKindV1): string {
  if (kind === "DO_NOTHING") return "Preserves capacity but delays learning and may let the decision remain blocked.";
  if (kind === "LOW_RISK_TEST") return "Uses the smallest credible attention block to buy decision information before commitment.";
  if (kind === "OPTION_PRESERVING") return "Preserves upside while delaying irreversible execution and direct revenue proof.";
  if (!input.downside_bound.bounded || input.reversibility === "IRREVERSIBLE") return "Consumes commitment capacity while downside is not safely bounded.";
  return "Commits capacity now and gives up cheaper learning paths.";
}

function item(input: UncertaintyDecisionViewModelV1, kind: DecisionAlternativeKindV1, overrides: Partial<DecisionAlternativeComparisonItemV1>): DecisionAlternativeComparisonItemV1 {
  const labels: Record<DecisionAlternativeKindV1, string> = {
    DO_NOTHING: "Do nothing now",
    LOW_RISK_TEST: "Run the lowest-risk credible test",
    OPTION_PRESERVING: "Preserve the option without external commitment",
    AGGRESSIVE_COMMIT: "Commit aggressively"
  };

  return {
    alternative_id: `${input.decision_id}:${kind.toLowerCase()}`,
    kind,
    label: labels[kind],
    status: "VIABLE",
    rationale: input.best_viable_plan_now,
    rejection_reason: null,
    evidence_refs: allEvidenceRefs(input),
    opportunity_cost: opportunityCostFor(input, kind),
    strongest_downside: strongestDownsideFor(input),
    reversibility: input.reversibility,
    value_of_information: input.value_of_information,
    cheapest_credible_test: input.cheapest_credible_test,
    ...overrides
  };
}

function alternativesFor(input: UncertaintyDecisionViewModelV1): DecisionAlternativeComparisonItemV1[] {
  const alternatives: DecisionAlternativeComparisonItemV1[] = [
    item(input, "DO_NOTHING", {
      status: input.decision_mode === "DEFER_FOR_SAFETY" ? "PREFERRED" : "VIABLE",
      rationale:
        input.decision_mode === "DEFER_FOR_SAFETY"
          ? "Do not act until safety, permission, and downside constraints are bounded."
          : "Viable if attention is better spent elsewhere, but it leaves the critical unknowns unresolved."
    })
  ];

  if (input.cheapest_credible_test) {
    alternatives.push(
      item(input, "LOW_RISK_TEST", {
        status: input.decision_mode === "EXPERIMENT_FIRST" ? "PREFERRED" : input.decision_mode === "DEFER_FOR_SAFETY" ? "REJECTED" : "VIABLE",
        rationale: input.cheapest_credible_test,
        rejection_reason: input.decision_mode === "DEFER_FOR_SAFETY" ? "Even the test requires safety, permission, or downside bounds first." : null
      })
    );
  }

  if (input.reversibility === "REVERSIBLE" || input.reversibility === "PARTIALLY_REVERSIBLE") {
    alternatives.push(
      item(input, "OPTION_PRESERVING", {
        status: input.decision_mode === "OPTION_PRESERVING" ? "PREFERRED" : "VIABLE",
        rationale: "Keep the path open while preserving unknowns, downside bounds, and revision triggers."
      })
    );
  }

  if (input.evidence.direct.length > 0 || input.downside_bound.severity === "UNBOUNDED" || input.reversibility === "IRREVERSIBLE") {
    const unsafe = input.decision_mode === "DEFER_FOR_SAFETY" || !input.downside_bound.bounded || input.reversibility === "IRREVERSIBLE";
    alternatives.push(
      item(input, "AGGRESSIVE_COMMIT", {
        status: unsafe ? "REJECTED" : input.decision_mode === "HIGH_EVIDENCE" ? "PREFERRED" : "VIABLE",
        rationale: unsafe ? "A full commitment is not supported while downside is unbounded or irreversible." : input.best_viable_plan_now,
        rejection_reason: unsafe ? "Strongest downside or irreversibility blocks commitment." : null
      })
    );
  }

  return alternatives;
}

export function buildDecisionAlternativesComparisonViewModelV1(input: UncertaintyDecisionViewModelV1): DecisionAlternativesComparisonViewModelV1 {
  const alternatives = alternativesFor(input);
  const preferred = alternatives.find((alternative) => alternative.status === "PREFERRED") ?? null;
  const strongest_downside = strongestDownsideFor(input);

  return {
    contract_version: "decision_alternatives_comparison_v1",
    source_contract_version: input.contract_version,
    decision_id: input.decision_id,
    title: input.title,
    decision_mode: input.decision_mode,
    evidence_class: evidenceClassFor(input),
    critical_unknowns: [...input.critical_unknowns],
    downside_bound: { ...input.downside_bound, notes: [...input.downside_bound.notes] },
    reversibility: input.reversibility,
    value_of_information: input.value_of_information,
    cheapest_credible_test: input.cheapest_credible_test,
    alternatives,
    preferred_alternative_id: preferred?.alternative_id ?? null,
    rejected_alternative_ids: alternatives.filter((alternative) => alternative.status === "REJECTED").map((alternative) => alternative.alternative_id),
    opportunity_cost_summary: preferred ? preferred.opportunity_cost : "No preferred alternative selected; preserve all explicit uncertainty.",
    strongest_downside,
    what_would_change_my_mind: [...input.what_would_change_my_mind],
    dashboard_flags: {
      dashboard_consumable: true,
      missing_data_remains_unknown:
        input.confidence_inputs.data_coverage === "UNKNOWN" ||
        input.downside_bound.estimated_loss_range.low_cents === null ||
        input.downside_bound.estimated_loss_range.high_cents === null,
      rejected_alternatives_visible: alternatives.some((alternative) => alternative.status === "REJECTED"),
      keegan_action_required: false
    }
  };
}
