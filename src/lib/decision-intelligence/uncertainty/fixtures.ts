import { moneyRange, unknownMoneyRange } from "@/lib/financial-intelligence/contracts";
import { buildUncertaintyDecisionViewModelV1 } from "./adapter";
import type { UncertaintyDecisionInputV1, UncertaintyEvidenceRefV1 } from "./contracts";

function evidence(input: Omit<UncertaintyEvidenceRefV1, "direct_evidence">): UncertaintyEvidenceRefV1 {
  return {
    ...input,
    direct_evidence: input.kind === "DIRECT"
  };
}

export const UNCERTAINTY_DECISION_INPUT_FIXTURES_V1: UncertaintyDecisionInputV1[] = [
  {
    decision_id: "uncertainty-bounded-private-room",
    title: "Private collector room validation",
    candidate_plan: "Proceed only with a bounded internal validation pass before any event build.",
    data_coverage: "LOW",
    critical_unknowns: ["Verified host/sponsor route", "Direct event economics"],
    proxy_or_analog_evidence: [
      evidence({
        ref_id: "strategy-proxy-prestige-fit",
        label: "Prestige fit proxy",
        kind: "PROXY",
        provenance: "STRATEGY_FIXTURE",
        source_label: "Strategy fixture",
        notes: "Prestige alignment is useful proxy evidence but not proof of buyer access or economics."
      })
    ],
    prior_or_base_rate_evidence: [
      evidence({
        ref_id: "learning-prior-weak-attribution",
        label: "Weak attribution prior",
        kind: "PRIOR_BASE_RATE",
        provenance: "LEARNING_FIXTURE",
        source_label: "Learning fixture",
        notes: "Prior warns against committing to weakly attributed signals."
      })
    ],
    direct_evidence_refs: [],
    downside_bound: {
      bounded: true,
      severity: "MEDIUM",
      estimated_loss_range: unknownMoneyRange(["missing-direct-event-economics"]),
      notes: ["Plan is bounded to internal validation; direct economics remain unknown."]
    },
    value_of_information: "MEDIUM",
    cheapest_credible_test: "Confirm one warm host/sponsor route before any external commitment.",
    reversibility: "PARTIALLY_REVERSIBLE",
    what_would_change_my_mind: ["Direct sponsor/host route confirmed", "Direct economics become known", "Proxy evidence conflicts with first-party evidence"],
    human_judgment_required: false,
    safety_blocked: false,
    approval_class: "L1_RECOMMENDATION"
  },
  {
    decision_id: "uncertainty-experiment-first-script",
    title: "Warm intro validation script",
    candidate_plan: "Run the cheapest credible internal validation test before allocating production capacity.",
    data_coverage: "PARTIAL",
    critical_unknowns: ["Warm intro conversion to serious collector meeting"],
    proxy_or_analog_evidence: [],
    prior_or_base_rate_evidence: [
      evidence({
        ref_id: "learning-prior-bounded-test",
        label: "Bounded test prior",
        kind: "PRIOR_BASE_RATE",
        provenance: "LEARNING_FIXTURE",
        source_label: "Learning fixture",
        notes: "Prior supports cheap-test discipline when value of information is high."
      })
    ],
    direct_evidence_refs: [
      evidence({
        ref_id: "direct-commerce-state",
        label: "First-party commerce state",
        kind: "DIRECT",
        provenance: "EVIDENCE_TRUST_FIXTURE",
        source_label: "Evidence trust fixture",
        notes: "Direct commerce fixture exists, but does not prove event conversion."
      })
    ],
    downside_bound: {
      bounded: true,
      severity: "LOW",
      estimated_loss_range: moneyRange({ low_cents: 0, high_cents: 0, coverage_state: "COMPLETE", evidence_refs: ["no-spend-fixture"] }),
      notes: ["No spend, no automated outreach, no public commitment."]
    },
    value_of_information: "HIGH",
    cheapest_credible_test: "Draft a one-question validation script and review it internally before external use.",
    reversibility: "REVERSIBLE",
    what_would_change_my_mind: ["Validation script reveals no credible route", "Direct host route is confirmed"],
    human_judgment_required: false,
    safety_blocked: false,
    approval_class: "L1_RECOMMENDATION"
  },
  {
    decision_id: "uncertainty-option-preserving-checklist",
    title: "Option-preserving no-regret checklist",
    candidate_plan: "Preserve optionality with a short evidence checklist; do not execute externally.",
    data_coverage: "LOW",
    critical_unknowns: ["Sponsor route", "Collector fit"],
    proxy_or_analog_evidence: [],
    prior_or_base_rate_evidence: [
      evidence({
        ref_id: "financial-prior-weak-direct-economics",
        label: "Weak direct economics prior",
        kind: "PRIOR_BASE_RATE",
        provenance: "FINANCIAL_FIXTURE",
        source_label: "Financial fixture",
        notes: "Prior warns against a full build while allowing reversible prep."
      })
    ],
    direct_evidence_refs: [],
    downside_bound: {
      bounded: true,
      severity: "LOW",
      estimated_loss_range: moneyRange({ low_cents: 0, high_cents: 0, coverage_state: "COMPLETE", evidence_refs: ["no-spend-fixture"] }),
      notes: ["Keeps optionality without external action."]
    },
    value_of_information: "MEDIUM",
    cheapest_credible_test: null,
    reversibility: "REVERSIBLE",
    what_would_change_my_mind: ["Capacity becomes constrained", "Direct buyer/sponsor evidence appears"],
    human_judgment_required: false,
    safety_blocked: false,
    approval_class: "L0_INSIGHT"
  },
  {
    decision_id: "uncertainty-safety-defer-public-commitment",
    title: "Public commitment with unbounded downside",
    candidate_plan: "Refuse action until legal, cash, and reputation downside are bounded.",
    data_coverage: "PARTIAL",
    critical_unknowns: ["Legal permission", "Cash exposure", "Reputational downside"],
    proxy_or_analog_evidence: [
      evidence({
        ref_id: "analog-prestige-fit",
        label: "Analog prestige fit",
        kind: "ANALOG",
        provenance: "STRATEGY_FIXTURE",
        source_label: "Strategy fixture",
        notes: "Analog prestige fit cannot bound legal, cash, or reputation downside."
      })
    ],
    prior_or_base_rate_evidence: [],
    direct_evidence_refs: [],
    downside_bound: {
      bounded: false,
      severity: "UNBOUNDED",
      estimated_loss_range: unknownMoneyRange(["unbounded-public-commitment-downside"]),
      notes: ["Legal, cash, and reputation downside are not bounded."]
    },
    value_of_information: "CRITICAL",
    cheapest_credible_test: "Obtain explicit human/legal review before any action.",
    reversibility: "IRREVERSIBLE",
    what_would_change_my_mind: ["Permission and cash exposure become known", "Downside is bounded by reviewed constraints"],
    human_judgment_required: true,
    safety_blocked: true,
    approval_class: "L0_INSIGHT"
  }
];

export const UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1 = UNCERTAINTY_DECISION_INPUT_FIXTURES_V1.map(buildUncertaintyDecisionViewModelV1);
