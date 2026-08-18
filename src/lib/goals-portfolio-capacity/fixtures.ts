import { moneyRange, timeRange, unknownMoneyRange } from "@/lib/financial-intelligence/contracts";
import type { ConfidenceV1, TimeRangeV1 } from "@/lib/financial-intelligence/contracts";
import {
  GOALS_PORTFOLIO_CAPACITY_SNAPSHOT_CONTRACT_VERSION_V1,
  type AttentionCapacityLoadV1,
  type GoalsPortfolioCapacitySnapshotV1,
  type QualitativeObjectiveV1,
  type StrategicBetV1,
  type StrategicGoalV1
} from "./contracts";

const AS_OF = "2026-08-18T00:00:00.000Z";

const confidence = (level: ConfidenceV1["level"], reasons: string[], qualifiers: string[] = []): ConfidenceV1 => ({
  level,
  reasons,
  qualifiers
});

const unknownTimeRange = (evidence_refs: string[] = []): TimeRangeV1 =>
  timeRange({ low_hours: null, high_hours: null, coverage_state: "UNKNOWN", evidence_refs });

const prestigeObjective: QualitativeObjectiveV1 = {
  kind: "PRESTIGE",
  label: "Increase premium fine-art authority without accessibility positioning.",
  not_monetized: true,
  evidence_refs: ["strategy-535-premium-positioning"]
};

const networkObjective: QualitativeObjectiveV1 = {
  kind: "NETWORK",
  label: "Create elite collector and institutional relationship optionality.",
  not_monetized: true,
  evidence_refs: ["strategy-535-elite-network"]
};

const authorityObjective: QualitativeObjectiveV1 = {
  kind: "AUTHORITY",
  label: "Build durable cultural authority around museum-level graphite craft.",
  not_monetized: true,
  evidence_refs: ["strategy-535-authority"]
};

const goals: StrategicGoalV1[] = [
  {
    goal_id: "goal-premium-positioning",
    label: "Protect premium positioning and pricing power",
    status: "ACTIVE",
    horizon: "90_DAYS",
    qualitative_objectives: [prestigeObjective, authorityObjective],
    success_signal: "Higher-status opportunities and collector conversations increase without discounting or volume messaging."
  },
  {
    goal_id: "goal-elite-network",
    label: "Build elite collector and institutional access",
    status: "ACTIVE",
    horizon: "90_DAYS",
    qualitative_objectives: [networkObjective, prestigeObjective],
    success_signal: "A credible warm access path appears for decision-makers, sponsors, or private collector rooms."
  },
  {
    goal_id: "goal-studio-throughput",
    label: "Keep studio capacity focused on rare, high-signal work",
    status: "ACTIVE",
    horizon: "30_DAYS",
    qualitative_objectives: [{ kind: "CRAFT", label: "Protect creative hours for museum-level graphite execution.", not_monetized: true, evidence_refs: ["capacity-fixture"] }],
    success_signal: "No low-prestige work displaces the highest-authority original."
  }
];

const healthyLoad: AttentionCapacityLoadV1 = {
  state: "HEALTHY",
  load_score: 0.58,
  creative_hours_committed_range: timeRange({ low_hours: 34, high_hours: 46, coverage_state: "COMPLETE", evidence_refs: ["studio-capacity-fixture"] }),
  creative_hours_available_range: timeRange({ low_hours: 54, high_hours: 64, coverage_state: "COMPLETE", evidence_refs: ["studio-capacity-fixture"] }),
  attention_load: "MEDIUM",
  bottleneck_refs: ["access-validation"]
};

const overloadedLoad: AttentionCapacityLoadV1 = {
  state: "OVERLOADED",
  load_score: 1.28,
  creative_hours_committed_range: timeRange({ low_hours: 82, high_hours: 104, coverage_state: "COMPLETE", evidence_refs: ["overload-capacity-fixture"] }),
  creative_hours_available_range: timeRange({ low_hours: 48, high_hours: 56, coverage_state: "COMPLETE", evidence_refs: ["overload-capacity-fixture"] }),
  attention_load: "HIGH",
  bottleneck_refs: ["studio-hours", "keegan-attention"]
};

const unknownLoad: AttentionCapacityLoadV1 = {
  state: "UNKNOWN",
  load_score: null,
  creative_hours_committed_range: unknownTimeRange(["unknown-capacity-fixture"]),
  creative_hours_available_range: unknownTimeRange(["unknown-capacity-fixture"]),
  attention_load: "UNKNOWN",
  bottleneck_refs: ["unknown-creative-hours"]
};

const collectorRoomBet: StrategicBetV1 = {
  bet_id: "bet-private-collector-room-validation",
  title: "Private collector room validation",
  status: "ACTIVE",
  goal_refs: ["goal-elite-network", "goal-premium-positioning"],
  EXPECTED_UPSIDE: {
    direct_financial_range: unknownMoneyRange(["financial-542-direct-economics-unknown"]),
    qualitative_objectives: [prestigeObjective, networkObjective],
    notes: ["Prestige and network value are preserved as qualitative objectives, not converted into dollars."]
  },
  EXPECTED_DOWNSIDE: {
    cash_risk_range: moneyRange({ low_cents: 0, high_cents: 50000, coverage_state: "PARTIAL", evidence_refs: ["validation-cost-fixture"] }),
    creative_capacity_risk_range: timeRange({ low_hours: 4, high_hours: 8, coverage_state: "COMPLETE", evidence_refs: ["validation-time-fixture"] }),
    notes: ["Risk is bounded if the next step stays validation-only."]
  },
  CONFIDENCE: confidence("MEDIUM", ["prestige_fit_known", "access_path_unverified"], ["direct_economics_unknown"]),
  CASH_REQUIREMENT_RANGE: moneyRange({ low_cents: 0, high_cents: 50000, coverage_state: "PARTIAL", evidence_refs: ["validation-cost-fixture"] }),
  CREATIVE_HOURS_RANGE: timeRange({ low_hours: 4, high_hours: 8, coverage_state: "COMPLETE", evidence_refs: ["validation-time-fixture"] }),
  ATTENTION_CAPACITY_LOAD: healthyLoad,
  DEPENDENCIES: ["Warm route into host, sponsor, or collector decision-maker ecosystem"],
  OPPORTUNITY_COST: {
    notes: ["Small validation step avoids displacing core studio work."],
    displaced_bet_refs: [],
    creative_hours_range: timeRange({ low_hours: 4, high_hours: 8, coverage_state: "COMPLETE", evidence_refs: ["validation-time-fixture"] }),
    cash_range: moneyRange({ low_cents: 0, high_cents: 50000, coverage_state: "PARTIAL", evidence_refs: ["validation-cost-fixture"] })
  },
  KILL_CRITERIA: ["No credible access path after one focused validation pass", "Only public exposure is available without decision-maker access"],
  CURRENT_BOTTLENECK: "Verified access path",
  WHAT_TO_IGNORE: ["General event hype", "Low-status exposure-only opportunities"],
  NEXT_PORTFOLIO_ACTION: {
    action: "VALIDATE",
    label: "Validate one access path before any build",
    rationale: "This preserves option value without spending or positioning commitment.",
    requires_keegan_approval: false
  },
  evidence_refs: ["strategy-535-elite-network", "financial-542-direct-economics-unknown", "validation-time-fixture"]
};

const originalWorkBet: StrategicBetV1 = {
  bet_id: "bet-iconic-original-work",
  title: "Iconic original artwork focus",
  status: "ACTIVE",
  goal_refs: ["goal-premium-positioning", "goal-studio-throughput"],
  EXPECTED_UPSIDE: {
    direct_financial_range: unknownMoneyRange(["price-realization-unknown-fixture"]),
    qualitative_objectives: [prestigeObjective, authorityObjective],
    notes: ["Primary upside is brand gravity and scarcity, not a fabricated revenue estimate."]
  },
  EXPECTED_DOWNSIDE: {
    cash_risk_range: moneyRange({ low_cents: 75000, high_cents: 125000, coverage_state: "PARTIAL", evidence_refs: ["materials-fixture"] }),
    creative_capacity_risk_range: timeRange({ low_hours: 40, high_hours: 56, coverage_state: "COMPLETE", evidence_refs: ["studio-capacity-fixture"] }),
    notes: ["Large creative block reduces ability to chase side opportunities."]
  },
  CONFIDENCE: confidence("MEDIUM", ["premium_strategy_fit_high"], ["sale_timing_unknown"]),
  CASH_REQUIREMENT_RANGE: moneyRange({ low_cents: 75000, high_cents: 125000, coverage_state: "PARTIAL", evidence_refs: ["materials-fixture"] }),
  CREATIVE_HOURS_RANGE: timeRange({ low_hours: 40, high_hours: 56, coverage_state: "COMPLETE", evidence_refs: ["studio-capacity-fixture"] }),
  ATTENTION_CAPACITY_LOAD: healthyLoad,
  DEPENDENCIES: ["Protected uninterrupted studio capacity"],
  OPPORTUNITY_COST: {
    notes: ["Displaces low-ticket commissions and reactive content production."],
    displaced_bet_refs: ["low-ticket-commission-volume"],
    creative_hours_range: timeRange({ low_hours: 40, high_hours: 56, coverage_state: "COMPLETE", evidence_refs: ["studio-capacity-fixture"] }),
    cash_range: unknownMoneyRange(["opportunity-cost-not-dollarized"])
  },
  KILL_CRITERIA: ["Collector/institutional evidence contradicts subject fit", "Execution quality would be compromised by capacity pressure"],
  CURRENT_BOTTLENECK: "Protected studio hours",
  WHAT_TO_IGNORE: ["Low-ticket commission requests", "Volume-based content asks"],
  NEXT_PORTFOLIO_ACTION: {
    action: "CONTINUE",
    label: "Protect the studio block",
    rationale: "The bet compounds through scarcity and authority when capacity is not fragmented.",
    requires_keegan_approval: false
  },
  evidence_refs: ["strategy-535-premium-positioning", "studio-capacity-fixture", "materials-fixture"]
};

const weakEconomicsHighOptionBet: StrategicBetV1 = {
  bet_id: "bet-museum-authority-study",
  title: "Museum authority study",
  status: "WATCH",
  goal_refs: ["goal-premium-positioning", "goal-elite-network"],
  EXPECTED_UPSIDE: {
    direct_financial_range: moneyRange({ low_cents: 0, high_cents: 50000, coverage_state: "PARTIAL", evidence_refs: ["financial-542-weak-direct-economics"] }),
    qualitative_objectives: [authorityObjective, prestigeObjective, networkObjective],
    notes: ["High option value comes from authority and network access, not direct economics."]
  },
  EXPECTED_DOWNSIDE: {
    cash_risk_range: moneyRange({ low_cents: 120000, high_cents: 180000, coverage_state: "COMPLETE", evidence_refs: ["financial-542-project-budget"] }),
    creative_capacity_risk_range: timeRange({ low_hours: 28, high_hours: 44, coverage_state: "COMPLETE", evidence_refs: ["financial-542-project-time"] }),
    notes: ["Weak direct economics and real studio-hour cost make this a watch bet, not an automatic do-now."]
  },
  CONFIDENCE: confidence("MEDIUM", ["capital_and_time_known", "strategic_option_value_not_monetized"], ["direct_revenue_weak"]),
  CASH_REQUIREMENT_RANGE: moneyRange({ low_cents: 120000, high_cents: 180000, coverage_state: "COMPLETE", evidence_refs: ["financial-542-project-budget"] }),
  CREATIVE_HOURS_RANGE: timeRange({ low_hours: 28, high_hours: 44, coverage_state: "COMPLETE", evidence_refs: ["financial-542-project-time"] }),
  ATTENTION_CAPACITY_LOAD: healthyLoad,
  DEPENDENCIES: ["Institutional proof point or relationship path"],
  OPPORTUNITY_COST: {
    notes: ["Could displace sellable original work during a scarce studio window."],
    displaced_bet_refs: ["bet-iconic-original-work"],
    creative_hours_range: timeRange({ low_hours: 28, high_hours: 44, coverage_state: "COMPLETE", evidence_refs: ["financial-542-project-time"] }),
    cash_range: unknownMoneyRange(["qualitative-opportunity-cost"])
  },
  KILL_CRITERIA: ["No institutional or collector authority signal", "Direct cost rises without stronger access upside"],
  CURRENT_BOTTLENECK: "Proof that authority value is real enough to justify the weak direct economics",
  WHAT_TO_IGNORE: ["Direct revenue ranking alone", "Generic exposure logic"],
  NEXT_PORTFOLIO_ACTION: {
    action: "VALIDATE",
    label: "Validate authority signal before committing hours",
    rationale: "High option value deserves a proof step, not fake financial certainty.",
    requires_keegan_approval: false
  },
  evidence_refs: ["financial-542-weak-direct-economics", "financial-542-project-budget", "strategy-535-authority"]
};

const overloadBet: StrategicBetV1 = {
  ...originalWorkBet,
  bet_id: "bet-overloaded-original-plus-event",
  title: "Original work plus event build overload",
  CREATIVE_HOURS_RANGE: timeRange({ low_hours: 82, high_hours: 104, coverage_state: "COMPLETE", evidence_refs: ["overload-capacity-fixture"] }),
  ATTENTION_CAPACITY_LOAD: overloadedLoad,
  CURRENT_BOTTLENECK: "Creative hours and attention are overcommitted",
  WHAT_TO_IGNORE: ["Upside narratives that hide capacity overload", "Additional speculative event build requests"],
  NEXT_PORTFOLIO_ACTION: {
    action: "REBALANCE",
    label: "Defer one active build before adding anything else",
    rationale: "Upside cannot hide overload; scarce creative hours are already beyond available capacity.",
    requires_keegan_approval: false
  }
};

const unknownResourceBet: StrategicBetV1 = {
  ...weakEconomicsHighOptionBet,
  bet_id: "bet-unknown-resource-inputs",
  title: "Option-value bet with unknown resource inputs",
  CASH_REQUIREMENT_RANGE: unknownMoneyRange(["unknown-cash-fixture"]),
  CREATIVE_HOURS_RANGE: unknownTimeRange(["unknown-capacity-fixture"]),
  ATTENTION_CAPACITY_LOAD: unknownLoad,
  CURRENT_BOTTLENECK: "Cash and creative-hour inputs are UNKNOWN",
  WHAT_TO_IGNORE: ["Treating unknown cash or hours as free"],
  NEXT_PORTFOLIO_ACTION: {
    action: "VALIDATE",
    label: "Collect resource ranges before ranking",
    rationale: "UNKNOWN resource inputs must stay unknown rather than becoming zero.",
    requires_keegan_approval: false
  }
};

export const GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1: GoalsPortfolioCapacitySnapshotV1[] = [
  {
    contract_version: GOALS_PORTFOLIO_CAPACITY_SNAPSHOT_CONTRACT_VERSION_V1,
    snapshot_id: "goals-capacity-healthy-portfolio",
    as_of: AS_OF,
    source: "fixture" as const,
    GOALS: goals,
    ACTIVE_BETS: [collectorRoomBet, originalWorkBet],
    ATTENTION_CAPACITY_LOAD: healthyLoad,
    CURRENT_BOTTLENECK: "Verified elite access path",
    WHAT_TO_IGNORE: ["Low-ticket commission volume", "Generic event hype", "Discount-led urgency"],
    NEXT_PORTFOLIO_ACTION: collectorRoomBet.NEXT_PORTFOLIO_ACTION,
    conflicts: [],
    unknown_resource_inputs: ["Direct economics for collector room remain UNKNOWN"],
    evidence_refs: [
      { ref_id: "strategy-535-premium-positioning", source: "fixture", notes: "Premium positioning objective reused qualitatively." },
      { ref_id: "financial-542-direct-economics-unknown", source: "fixture", notes: "Direct event economics are unknown, not zero." },
      { ref_id: "studio-capacity-fixture", source: "fixture", notes: "Synthetic studio capacity range." }
    ]
  },
  {
    contract_version: GOALS_PORTFOLIO_CAPACITY_SNAPSHOT_CONTRACT_VERSION_V1,
    snapshot_id: "goals-capacity-high-option-weak-economics",
    as_of: AS_OF,
    source: "fixture" as const,
    GOALS: goals,
    ACTIVE_BETS: [weakEconomicsHighOptionBet, unknownResourceBet],
    ATTENTION_CAPACITY_LOAD: unknownLoad,
    CURRENT_BOTTLENECK: "Resource ranges must be verified before portfolio ranking",
    WHAT_TO_IGNORE: ["Fake dollarization of prestige", "Unknown resources treated as free", "Direct revenue alone"],
    NEXT_PORTFOLIO_ACTION: unknownResourceBet.NEXT_PORTFOLIO_ACTION,
    conflicts: [
      {
        conflict_id: "conflict-resource-unknowns",
        severity: "WATCH",
        bet_refs: ["bet-unknown-resource-inputs"],
        scarce_resource: "UNKNOWN",
        summary: "Cash and creative-hour requirements are unknown and cannot be scored as zero.",
        cannot_be_hidden_by_upside: true
      }
    ],
    unknown_resource_inputs: ["Cash requirement range", "Creative hours range", "Available creative capacity"],
    evidence_refs: [
      { ref_id: "financial-542-weak-direct-economics", source: "fixture", notes: "Weak direct economics preserved." },
      { ref_id: "unknown-capacity-fixture", source: "fixture", notes: "Unknown creative hours intentionally remain null." },
      { ref_id: "strategy-535-authority", source: "fixture", notes: "Authority option value remains qualitative." }
    ]
  },
  {
    contract_version: GOALS_PORTFOLIO_CAPACITY_SNAPSHOT_CONTRACT_VERSION_V1,
    snapshot_id: "goals-capacity-overload-conflict",
    as_of: AS_OF,
    source: "fixture" as const,
    GOALS: goals,
    ACTIVE_BETS: [overloadBet, collectorRoomBet],
    ATTENTION_CAPACITY_LOAD: overloadedLoad,
    CURRENT_BOTTLENECK: "Creative hours and Keegan attention are over capacity",
    WHAT_TO_IGNORE: ["Any new speculative build until capacity is rebalanced", "Upside-only ranking"],
    NEXT_PORTFOLIO_ACTION: overloadBet.NEXT_PORTFOLIO_ACTION,
    conflicts: [
      {
        conflict_id: "conflict-creative-hours-overload",
        severity: "BLOCKING",
        bet_refs: ["bet-overloaded-original-plus-event", "bet-private-collector-room-validation"],
        scarce_resource: "CREATIVE_HOURS",
        summary: "Committed creative hours exceed available range even though both bets have strategic upside.",
        cannot_be_hidden_by_upside: true
      }
    ],
    unknown_resource_inputs: [],
    evidence_refs: [
      { ref_id: "overload-capacity-fixture", source: "fixture", notes: "Synthetic overloaded capacity range." },
      { ref_id: "strategy-535-premium-positioning", source: "fixture", notes: "Strategic upside remains visible but cannot hide overload." }
    ]
  }
];

export function getGoalsPortfolioCapacityFixtureBundleV1() {
  return {
    generated_at: AS_OF,
    snapshots: GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1
  };
}
