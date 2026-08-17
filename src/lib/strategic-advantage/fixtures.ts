import type { ExpectedImpactRange } from "@/lib/intelligence/recommendation-contract";
import {
  STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1,
  confidenceWithMissingDataCap,
  type AdvantageConfidenceV1,
  type AdvantageEvidenceRefV1,
  type DecisionAdvantageAssessmentV1,
  type OpportunityCostV1,
  type QualitativeDimensionV1,
  type RiskDimensionV1,
  unknownExpectedValueRange
} from "./contracts";

function confidence(level: AdvantageConfidenceV1["level"], reasons: string[]): AdvantageConfidenceV1 {
  return { level, reasons, cap: null, cap_reason: null };
}

function q(level: QualitativeDimensionV1["level"], rationale: string, evidence_refs: string[] = ["fixture-evidence"]): QualitativeDimensionV1 {
  return { level, rationale, evidence_refs: [...evidence_refs].sort() };
}

function risk(level: RiskDimensionV1["level"], rationale: string, evidence_refs: string[] = ["fixture-evidence"]): RiskDimensionV1 {
  return { level, rationale, evidence_refs: [...evidence_refs].sort() };
}

function dollars(low: number | null, expected: number | null, high: number | null, notes: string[]): ExpectedImpactRange {
  return {
    currency: "USD",
    horizon: "30d",
    low_incremental_revenue_cents: low,
    expected_incremental_revenue_cents: expected,
    high_incremental_revenue_cents: high,
    notes,
    assumptions: ["Fixture values are direct financial ranges only; qualitative strategic value is not dollarized."]
  };
}

function cost(input: Partial<OpportunityCostV1> = {}): OpportunityCostV1 {
  return {
    explicit_tradeoffs: input.explicit_tradeoffs ?? ["Uses limited studio/strategy capacity."],
    capacity_hours_range: input.capacity_hours_range ?? { low: 4, high: 8 },
    cash_cost_range_cents: input.cash_cost_range_cents ?? { low: 0, high: 25000, currency: "USD" },
    qualitative_costs: input.qualitative_costs ?? ["Attention diverted from current premium pipeline."],
    evidence_refs: [...(input.evidence_refs ?? ["fixture-evidence"])].sort()
  };
}

const evidence: AdvantageEvidenceRefV1[] = [
  { ref_id: "fixture-evidence", source: "fixture", note: "Synthetic deterministic evidence for contract tests." }
];

const HIGH_UPSIDE_REVERSIBLE_OPTION: DecisionAdvantageAssessmentV1 = {
  contract_version: STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1,
  assessment_id: "advantage-high-upside-reversible-learning-option",
  action_id: "collector-segment-signal-test",
  action_label: "Run a reversible collector-segment signal test",
  recommendation: "PURSUE_OPTION",
  expected_value_range: dollars(0, 150000, 600000, ["Small direct upside range; main value is learning, not fabricated revenue."]),
  asymmetry: q("VERY_HIGH", "Low downside and meaningful upside if signal reveals a premium buyer segment."),
  optionality: q("VERY_HIGH", "Creates several next moves without committing to a full campaign."),
  reversibility: { level: "REVERSIBLE", rationale: "Can stop after one small test without public positioning damage.", evidence_refs: ["fixture-evidence"] },
  opportunity_cost: cost({ explicit_tradeoffs: ["Defers low-leverage reporting cleanup by one day."], capacity_hours_range: { low: 3, high: 5 } }),
  compounding_value: q("HIGH", "Learning can improve future targeting and offer design."),
  defensibility: q("MEDIUM", "Insights compound internally but are not a strong external moat by themselves."),
  information_advantage: q("VERY_HIGH", "Creates proprietary demand evidence from first-party response."),
  network_effect: q("LOW", "Does not materially expand network effects."),
  brand_prestige_effect: q("MEDIUM", "Can be framed privately without diluting scarcity."),
  learning_value: q("VERY_HIGH", "Primary value is validated signal quality."),
  timing: { level: "GOOD_WINDOW", rationale: "No urgency, but current pipeline questions make learning useful now.", evidence_refs: ["fixture-evidence"] },
  capacity_fit: risk("LOW", "Fits inside available capacity."),
  risk_of_ruin: risk("LOW", "No irreversible spend, reputation, or operational exposure."),
  key_uncertainty: "Whether signal quality predicts actual collector intent.",
  what_would_change_my_mind: ["If the test required public discounting or broad accessibility messaging."],
  advantage_thesis: "Buy cheap learning that can compound into better premium targeting while preserving optionality.",
  biggest_bottleneck: "Clean enough segmentation hypothesis.",
  next_smallest_high_leverage_action: "Draft one private signal test for a narrow collector segment.",
  what_to_ignore_or_deprioritize: ["Broad campaign buildout", "Premature automation"],
  assumptions: ["The test remains private and reversible."],
  evidence_refs: evidence,
  confidence: confidence("likely", ["fixture_has_cost_capacity_and_learning_evidence"])
};

const HIGH_REVENUE_WEAK_MOAT: DecisionAdvantageAssessmentV1 = {
  contract_version: STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1,
  assessment_id: "advantage-high-revenue-weak-defensibility-poor-cost",
  action_id: "commodity-high-volume-print-push",
  action_label: "Accept a high-volume commodity print push",
  recommendation: "DEPRIORITIZE",
  expected_value_range: dollars(800000, 1800000, 2800000, ["Large direct revenue range does not imply durable advantage."]),
  asymmetry: q("LOW", "Requires high output for bounded upside."),
  optionality: q("LOW", "Locks attention into fulfillment rather than opening better options."),
  reversibility: { level: "PARTIALLY_REVERSIBLE", rationale: "Can stop future drops, but availability signal may linger.", evidence_refs: ["fixture-evidence"] },
  opportunity_cost: cost({
    explicit_tradeoffs: ["Consumes launch capacity that could build a scarcer original or elite collaboration."],
    capacity_hours_range: { low: 60, high: 90 },
    qualitative_costs: ["Dilutes premium scarcity if overexposed.", "Pushes brand toward volume economics."]
  }),
  compounding_value: q("LOW", "Revenue is transactional and does not deepen a moat."),
  defensibility: q("LOW", "Competitors can copy volume-based print pushes."),
  information_advantage: q("MEDIUM", "Sales data helps, but audience signal may be polluted by discount/volume framing."),
  network_effect: q("LOW", "Does not add elite relationships."),
  brand_prestige_effect: q("LOW", "Risks accessibility framing over rarity."),
  learning_value: q("MEDIUM", "Some demand data, but poor fit with premium positioning."),
  timing: { level: "EVERGREEN", rationale: "No time-specific advantage.", evidence_refs: ["fixture-evidence"] },
  capacity_fit: risk("HIGH", "Competes with higher-prestige production capacity."),
  risk_of_ruin: risk("MEDIUM", "Not fatal, but brand-positioning damage is plausible."),
  key_uncertainty: "Whether volume exposure would materially dilute perceived scarcity.",
  what_would_change_my_mind: ["If the offer were reframed as a tightly controlled edition with elite distribution."],
  advantage_thesis: "Revenue alone is not an advantage when it consumes scarce capacity and weakens defensibility.",
  biggest_bottleneck: "Poor strategic fit with premium scarcity.",
  next_smallest_high_leverage_action: "Redesign the offer around scarcity before considering launch.",
  what_to_ignore_or_deprioritize: ["Gross revenue headline", "Follower applause", "Discount mechanics"],
  assumptions: ["Current form is volume-oriented."],
  evidence_refs: evidence,
  confidence: confidence("likely", ["fixture_direct_revenue_known_but_moat_dimensions_weak"])
};

const PRESTIGE_NETWORK_OPTIONALITY: DecisionAdvantageAssessmentV1 = {
  contract_version: STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1,
  assessment_id: "advantage-prestige-network-uncertain-economics",
  action_id: "elite-event-private-showing",
  action_label: "Prepare an elite-event private showing concept",
  recommendation: "LEARN_FIRST",
  expected_value_range: unknownExpectedValueRange(
    ["Direct economics are unknown; prestige and network value remain qualitative."],
    ["No buyer commitment is assumed."]
  ),
  asymmetry: q("HIGH", "Potentially opens elite relationships with controlled downside if scoped as a concept."),
  optionality: q("VERY_HIGH", "Can lead to collector meetings, sponsor introductions, or a tighter collaboration proposal."),
  reversibility: { level: "REVERSIBLE", rationale: "A concept deck can be withheld or refined before public commitment.", evidence_refs: ["fixture-evidence"] },
  opportunity_cost: cost({ explicit_tradeoffs: ["Uses strategy/design time instead of immediate sales execution."], capacity_hours_range: { low: 10, high: 18 }, cash_cost_range_cents: { low: 0, high: 50000, currency: "USD" } }),
  compounding_value: q("HIGH", "Prestige association and relationship graph can compound across future opportunities."),
  defensibility: q("HIGH", "Museum-level craft plus elite relationships are harder to copy than a generic campaign."),
  information_advantage: q("MEDIUM", "Requires more first-party relationship evidence."),
  network_effect: q("VERY_HIGH", "Relationship access can create non-linear future options."),
  brand_prestige_effect: q("VERY_HIGH", "Aligned elite context reinforces rarity."),
  learning_value: q("HIGH", "Can reveal which prestige channels produce real buyer access."),
  timing: { level: "GOOD_WINDOW", rationale: "Useful before event planning windows close.", evidence_refs: ["fixture-evidence"] },
  capacity_fit: risk("MEDIUM", "Meaningful but bounded strategy/design load."),
  risk_of_ruin: risk("LOW", "Low if kept as a private concept."),
  key_uncertainty: "Whether access translates into real decision-makers.",
  what_would_change_my_mind: ["If no credible path to elite attendees or sponsors exists."],
  advantage_thesis: "Prestige plus network access can create option value without pretending direct dollars are known.",
  biggest_bottleneck: "Verified access path to the right room.",
  next_smallest_high_leverage_action: "Validate one warm route into the event host/sponsor ecosystem.",
  what_to_ignore_or_deprioritize: ["Public hype", "Unpriced speculative deliverables"],
  assumptions: ["Concept remains private until access is verified."],
  evidence_refs: evidence,
  confidence: confidence("possible", ["strategic_dimensions_supported_direct_economics_unknown"])
};

const REJECT_RUIN_CAPACITY_CONFLICT: DecisionAdvantageAssessmentV1 = {
  contract_version: STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1,
  assessment_id: "advantage-reject-risk-of-ruin-capacity-conflict",
  action_id: "rush-mega-commission-overcommit",
  action_label: "Accept a rush mega-commission that overcommits studio capacity",
  recommendation: "REJECT",
  expected_value_range: dollars(2000000, 4000000, 6500000, ["Large upside is present but cannot override ruin/capacity conflict."]),
  asymmetry: q("LOW", "Upside is paired with unacceptable delivery and reputation exposure."),
  optionality: q("LOW", "Locks the calendar and reduces future choices."),
  reversibility: { level: "IRREVERSIBLE", rationale: "Once accepted, failure would damage trust with a high-value counterparty.", evidence_refs: ["fixture-evidence"] },
  opportunity_cost: cost({
    explicit_tradeoffs: ["Displaces current premium pipeline and recovery capacity."],
    capacity_hours_range: { low: 260, high: 360 },
    cash_cost_range_cents: { low: 900000, high: 1500000, currency: "USD" },
    qualitative_costs: ["Potential missed deadlines", "Reputational damage", "No buffer for existing commitments"]
  }),
  compounding_value: q("LOW", "A rushed failure would compound negatively."),
  defensibility: q("MEDIUM", "The craft is defensible, but rushed execution weakens the advantage."),
  information_advantage: q("LOW", "Does not create meaningful proprietary learning."),
  network_effect: q("MEDIUM", "Could add a relationship only if delivered well."),
  brand_prestige_effect: q("LOW", "Prestige upside is dominated by failure risk."),
  learning_value: q("LOW", "Learning is not worth the downside."),
  timing: { level: "URGENT_WINDOW", rationale: "Urgency is a risk factor, not an advantage.", evidence_refs: ["fixture-evidence"] },
  capacity_fit: risk("UNACCEPTABLE", "Conflicts with available production capacity."),
  risk_of_ruin: risk("UNACCEPTABLE", "Could impair reputation, liquidity, and delivery credibility."),
  key_uncertainty: "Whether scope or deadline could be reduced enough to remove ruin risk.",
  what_would_change_my_mind: ["Signed phased scope", "Large non-refundable deposit", "Deadline moved beyond capacity conflict"],
  advantage_thesis: "Reject because unacceptable ruin risk cannot be netted against a large upside range.",
  biggest_bottleneck: "Capacity conflict with no delivery buffer.",
  next_smallest_high_leverage_action: "Offer a smaller phased alternative with protective terms.",
  what_to_ignore_or_deprioritize: ["Headline revenue", "Fear of missing out", "Artificial urgency"],
  assumptions: ["Current scope and deadline are binding."],
  evidence_refs: evidence,
  confidence: confidence("strongly_supported", ["fixture_ruin_and_capacity_conflict_explicit"])
};

const MISSING_DATA_COLD_START: DecisionAdvantageAssessmentV1 = {
  contract_version: STRATEGIC_ADVANTAGE_ASSESSMENT_VERSION_V1,
  assessment_id: "advantage-missing-data-cold-start-confidence-cap",
  action_id: "unknown-opportunity-cold-start",
  action_label: "Assess cold-start opportunity with missing data",
  recommendation: "UNKNOWN",
  expected_value_range: unknownExpectedValueRange(["Missing economics remain UNKNOWN, not zero."], ["Cold-start semantics: insufficient evidence caps confidence."]),
  asymmetry: q("UNKNOWN", "Missing upside/downside evidence prevents asymmetry judgment.", ["missing-data-fixture"]),
  optionality: q("UNKNOWN", "Optionality cannot be assessed without action path details.", ["missing-data-fixture"]),
  reversibility: { level: "UNKNOWN", rationale: "No reliable reversibility evidence.", evidence_refs: ["missing-data-fixture"] },
  opportunity_cost: cost({
    explicit_tradeoffs: ["UNKNOWN: cannot compare against existing portfolio without capacity and cost inputs."],
    capacity_hours_range: { low: null, high: null },
    cash_cost_range_cents: { low: null, high: null, currency: "UNKNOWN" },
    qualitative_costs: ["Missing opportunity-cost evidence."],
    evidence_refs: ["missing-data-fixture"]
  }),
  compounding_value: q("UNKNOWN", "No compounding mechanism is evidenced.", ["missing-data-fixture"]),
  defensibility: q("UNKNOWN", "No moat evidence is available.", ["missing-data-fixture"]),
  information_advantage: q("UNKNOWN", "No source advantage is known.", ["missing-data-fixture"]),
  network_effect: q("UNKNOWN", "No relationship graph evidence is available.", ["missing-data-fixture"]),
  brand_prestige_effect: q("UNKNOWN", "No prestige context is verified.", ["missing-data-fixture"]),
  learning_value: q("UNKNOWN", "No learning loop is defined.", ["missing-data-fixture"]),
  timing: { level: "UNKNOWN", rationale: "Timing evidence is missing.", evidence_refs: ["missing-data-fixture"] },
  capacity_fit: risk("UNKNOWN", "Capacity requirement is missing.", ["missing-data-fixture"]),
  risk_of_ruin: risk("UNKNOWN", "Ruin risk is not evidenced and cannot be assumed low.", ["missing-data-fixture"]),
  key_uncertainty: "Core economics, capacity, timing, and downside evidence are missing.",
  what_would_change_my_mind: ["Verified economics", "Known capacity requirement", "Clear downside bounds", "Evidence of a compounding mechanism"],
  advantage_thesis: "No advantage thesis yet; missing data prevents a decision.",
  biggest_bottleneck: "Insufficient evidence.",
  next_smallest_high_leverage_action: "Collect the minimum economics, capacity, and downside facts before ranking.",
  what_to_ignore_or_deprioritize: ["Any apparent score or zero-filled economics"],
  assumptions: ["UNKNOWN is distinct from none or zero."],
  evidence_refs: [{ ref_id: "missing-data-fixture", source: "fixture", note: "Synthetic cold-start missing-data fixture." }],
  confidence: confidenceWithMissingDataCap({
    base: confidence("possible", ["cold_start_fixture_present"]),
    missingData: ["expected_value", "opportunity_cost", "capacity", "risk_of_ruin"]
  })
};

export const STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1: DecisionAdvantageAssessmentV1[] = [
  HIGH_UPSIDE_REVERSIBLE_OPTION,
  HIGH_REVENUE_WEAK_MOAT,
  PRESTIGE_NETWORK_OPTIONALITY,
  REJECT_RUIN_CAPACITY_CONFLICT,
  MISSING_DATA_COLD_START
].sort((a, b) => a.assessment_id.localeCompare(b.assessment_id));
