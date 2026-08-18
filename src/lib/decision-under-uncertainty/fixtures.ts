import { moneyRange, unknownMoneyRange } from "@/lib/financial-intelligence/contracts";
import type { DecisionUnderUncertaintyEvidenceRefV1, DecisionUnderUncertaintyInputV1 } from "./contracts";
import { buildDecisionUnderUncertaintyPlanV1 } from "./adapter";

const evidence = (
  ref_id: string,
  kind: DecisionUnderUncertaintyEvidenceRefV1["kind"],
  provenance: DecisionUnderUncertaintyEvidenceRefV1["provenance"],
  label: string,
  notes: string
): DecisionUnderUncertaintyEvidenceRefV1 => ({
  ref_id,
  label,
  kind,
  provenance,
  direct_evidence: kind === "DIRECT",
  notes
});

export const DECISION_UNDER_UNCERTAINTY_INPUT_FIXTURES_V1: DecisionUnderUncertaintyInputV1[] = [
  {
    decision_id: "duu-cold-start-collector-room",
    title: "Cold-start collector room access question",
    DATA_COVERAGE: "UNKNOWN",
    CRITICAL_UNKNOWNS: ["Buyer access path", "Direct economics", "Host decision-maker identity"],
    PROXY_OR_ANALOG_EVIDENCE: [],
    PRIOR_OR_BASE_RATE_USED: [],
    DIRECT_EVIDENCE_REFS: [],
    REVERSIBILITY: "UNKNOWN",
    DOWNSIDE_BOUND: { bounded: true, severity: "MEDIUM", notes: ["No spend or commitment in this slice."], estimated_loss_range: unknownMoneyRange(["missing-direct-economics"]) },
    VALUE_OF_INFORMATION: "HIGH",
    CHEAPEST_CREDIBLE_TEST: "Find one reviewed source or first-party note confirming who controls access.",
    TRIGGERS_TO_REVISE: ["Direct access evidence appears", "Direct economics become known"],
    human_judgment_required: false,
    safety_blocked: false,
    approval_class: "L0_INSIGHT",
    candidate_plan: "Research first: identify the missing access and economics inputs before recommending action."
  },
  {
    decision_id: "duu-proxy-prestige-signal",
    title: "Proxy prestige signal with no direct buyer evidence",
    DATA_COVERAGE: "LOW",
    CRITICAL_UNKNOWNS: ["Actual buyer intent remains UNKNOWN"],
    PROXY_OR_ANALOG_EVIDENCE: [evidence("strategy-prepare-creative-direction", "PROXY", "STRATEGY_FIXTURE", "Strategy proxy", "Premium positioning fit is proxy evidence, not direct buyer evidence.")],
    PRIOR_OR_BASE_RATE_USED: [evidence("learn-low-attribution-meta-003", "PRIOR_BASE_RATE", "LEARNING_FIXTURE", "Weak attribution prior", "Prior weak signal warns against overconfidence.")],
    DIRECT_EVIDENCE_REFS: [],
    REVERSIBILITY: "PARTIALLY_REVERSIBLE",
    DOWNSIDE_BOUND: { bounded: true, severity: "MEDIUM", notes: ["Plan limits work to analysis only."], estimated_loss_range: unknownMoneyRange(["project-economics-strategic-weak-direct"]) },
    VALUE_OF_INFORMATION: "MEDIUM",
    CHEAPEST_CREDIBLE_TEST: "Ask for one concrete collector or sponsor route.",
    TRIGGERS_TO_REVISE: ["A direct buyer signal appears", "Proxy signal conflicts with first-party evidence"],
    human_judgment_required: false,
    safety_blocked: false,
    approval_class: "L1_RECOMMENDATION",
    candidate_plan: "Use proxy evidence only to justify a bounded validation plan, not a full commitment."
  },
  {
    decision_id: "duu-cheap-experiment",
    title: "Cheap high-value experiment",
    DATA_COVERAGE: "PARTIAL",
    CRITICAL_UNKNOWNS: ["Conversion from warm intro to serious collector meeting"],
    PROXY_OR_ANALOG_EVIDENCE: [],
    PRIOR_OR_BASE_RATE_USED: [evidence("learn-success-traffic-quality-001", "PRIOR_BASE_RATE", "LEARNING_FIXTURE", "Prior successful bounded test", "Prior learning supports cheap test discipline.")],
    DIRECT_EVIDENCE_REFS: [evidence("ev_fixture_woo_completed_orders_snapshot", "DIRECT", "EVIDENCE_TRUST_FIXTURE", "First-party commerce fixture", "Direct evidence exists for commerce state, not for event conversion.")],
    REVERSIBILITY: "REVERSIBLE",
    DOWNSIDE_BOUND: { bounded: true, severity: "LOW", notes: ["No spend, no outreach automation, no commitment."], estimated_loss_range: moneyRange({ low_cents: 0, high_cents: 0, coverage_state: "COMPLETE", evidence_refs: ["no-spend-fixture"] }) },
    VALUE_OF_INFORMATION: "HIGH",
    CHEAPEST_CREDIBLE_TEST: "Draft a one-question validation script and review it internally before any external action.",
    TRIGGERS_TO_REVISE: ["Validation script reveals no credible route", "Direct host route is confirmed"],
    human_judgment_required: false,
    safety_blocked: false,
    approval_class: "L1_RECOMMENDATION",
    candidate_plan: "Run the cheapest credible internal validation test before committing capacity."
  },
  {
    decision_id: "duu-option-preserving",
    title: "Option-preserving no-regret prep",
    DATA_COVERAGE: "LOW",
    CRITICAL_UNKNOWNS: ["Sponsor route", "Collector fit"],
    PROXY_OR_ANALOG_EVIDENCE: [],
    PRIOR_OR_BASE_RATE_USED: [evidence("project-economics-strategic-weak-direct", "PRIOR_BASE_RATE", "FINANCIAL_FIXTURE", "Weak direct economics prior", "Prior warns against full build while allowing option preservation.")],
    DIRECT_EVIDENCE_REFS: [],
    REVERSIBILITY: "REVERSIBLE",
    DOWNSIDE_BOUND: { bounded: true, severity: "LOW", notes: ["Keeps optionality without external action."], estimated_loss_range: moneyRange({ low_cents: 0, high_cents: 0, coverage_state: "COMPLETE", evidence_refs: ["no-spend-fixture"] }) },
    VALUE_OF_INFORMATION: "MEDIUM",
    CHEAPEST_CREDIBLE_TEST: null,
    TRIGGERS_TO_REVISE: ["Capacity becomes constrained", "Direct buyer/sponsor evidence appears"],
    human_judgment_required: false,
    safety_blocked: false,
    approval_class: "L0_INSIGHT",
    candidate_plan: "Preserve the option by keeping a short evidence checklist ready; do not execute externally."
  },
  {
    decision_id: "duu-unbounded-downside-refusal",
    title: "Unbounded downside refusal",
    DATA_COVERAGE: "PARTIAL",
    CRITICAL_UNKNOWNS: ["Legal permission", "Cash exposure", "Reputational downside"],
    PROXY_OR_ANALOG_EVIDENCE: [evidence("strategy-prepare-creative-direction", "ANALOG", "STRATEGY_FIXTURE", "Analog prestige fit", "Analog prestige fit cannot bound legal or financial downside.")],
    PRIOR_OR_BASE_RATE_USED: [],
    DIRECT_EVIDENCE_REFS: [],
    REVERSIBILITY: "IRREVERSIBLE",
    DOWNSIDE_BOUND: { bounded: false, severity: "UNBOUNDED", notes: ["Legal, cash, and reputation downside are not bounded."], estimated_loss_range: unknownMoneyRange(["unbounded-downside-fixture"]) },
    VALUE_OF_INFORMATION: "CRITICAL",
    CHEAPEST_CREDIBLE_TEST: "Obtain explicit human/legal review before any action.",
    TRIGGERS_TO_REVISE: ["Downside is bounded by reviewed constraints", "Permission and cash exposure become known"],
    human_judgment_required: true,
    safety_blocked: true,
    approval_class: "L0_INSIGHT",
    candidate_plan: "Refuse action until downside is bounded."
  }
];

export const DECISION_UNDER_UNCERTAINTY_PLAN_FIXTURES_V1 = DECISION_UNDER_UNCERTAINTY_INPUT_FIXTURES_V1.map(buildDecisionUnderUncertaintyPlanV1);
