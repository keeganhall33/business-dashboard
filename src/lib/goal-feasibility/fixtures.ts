import { moneyRange, timeRange, unknownMoneyRange, type ConfidenceV1, type EvidenceRefV1, type MoneyRangeV1 } from "@/lib/financial-intelligence/contracts";
import {
  GOAL_FEASIBILITY_CONTRACT_VERSION_V1,
  sortPathsForAssumptionsV1,
  type GoalFeasibilityAssumptionSetV1,
  type GoalFeasibilityPathV1,
  type GoalFeasibilitySnapshotV1
} from "./contracts";

const evidence_refs: EvidenceRefV1[] = [
  { ref_id: "goal-feasibility-fixture-strategy", source: "fixture", notes: "Synthetic strategy evidence for deterministic path feasibility tests." },
  { ref_id: "goal-feasibility-fixture-economics", source: "fixture", notes: "Synthetic economics evidence; unknowns remain UNKNOWN instead of zero-filled." },
  { ref_id: "goal-feasibility-fixture-capacity", source: "fixture", notes: "Synthetic artist capacity evidence for production constraint tests." }
];

const confidence: ConfidenceV1 = {
  level: "MEDIUM",
  reasons: ["fixture_contains_path_economics_capacity_ladder_and_bottleneck"],
  qualifiers: ["Target state is aspirational; this fixture does not forecast fame, wealth, prestige, or network effects."]
};

const usd = (low_cents: number, high_cents: number, refs = ["goal-feasibility-fixture-economics"]): MoneyRangeV1 =>
  moneyRange({ low_cents, high_cents, coverage_state: "PARTIAL", evidence_refs: refs });

const unknown = (refs = ["goal-feasibility-fixture-economics"]): MoneyRangeV1 => unknownMoneyRange(refs);

const TARGET_STATE = "Build a premium creative enterprise with durable pricing power, cultural authority, and optional enterprise value without treating aspiration as forecast.";

const HIGH_END_ORIGINAL_ART: GoalFeasibilityPathV1 = {
  path_id: "path-high-end-original-art-concentration",
  strategy_kind: "HIGH_END_ORIGINAL_ART_CONCENTRATION",
  TARGET_STATE,
  FEASIBILITY_CLASS: "STRETCH",
  REQUIRED_SCALE_RANGE: usd(25000000, 75000000),
  CURRENT_TRAJECTORY: {
    state: "CAPACITY_CONSTRAINED",
    summary: "Craft authority can support premium originals, but hand-production throughput limits scale.",
    evidence_refs: ["goal-feasibility-fixture-capacity"]
  },
  GAP_TO_TARGET: {
    severity: "STRUCTURAL",
    enterprise_value_range: unknown(),
    annual_revenue_range: usd(1500000, 5000000),
    cash_flow_range: unknown(),
    personal_equity_range: unknown(),
    notes: ["Original-art revenue is not the same as enterprise value.", "Cash flow depends on sell-through, deposits, production time, and collector concentration."]
  },
  PATHWAYS: ["Raise original price floor through scarcity.", "Concentrate production on culturally durable flagship subjects.", "Use private collector access instead of broad availability."],
  REQUIRED_ASSETS: [
    { asset_id: "asset-collector-access", label: "Verified elite collector access", state: "PARTIAL", why_it_matters: "High-end originals require buyers with capacity and conviction.", evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { asset_id: "asset-scarcity-discipline", label: "Scarcity discipline", state: "PRESENT", why_it_matters: "The path breaks if volume messaging erodes rarity.", evidence_refs: ["goal-feasibility-fixture-strategy"] }
  ],
  CAPACITY_CONSTRAINTS: [
    {
      constraint_id: "constraint-artist-original-throughput",
      severity: "BLOCKING",
      summary: "Artist-production-only output cannot scale infinitely.",
      creative_hours_range: timeRange({ low_hours: 900, high_hours: 1600, coverage_state: "PARTIAL", evidence_refs: ["goal-feasibility-fixture-capacity"] }),
      evidence_refs: ["goal-feasibility-fixture-capacity"]
    }
  ],
  CAPITAL_OR_ECONOMIC_ASSUMPTIONS: [
    { assumption_id: "assumption-price-floor", label: "Average original prices must rise materially.", value_range: usd(7500000, 25000000), qualitative_only: false, notes: ["Range is fixture-only and not a current price recommendation."] },
    { assumption_id: "assumption-prestige", label: "Prestige lift is qualitative until supported by observed demand.", value_range: unknown(), qualitative_only: true, notes: ["Do not dollarize reputation or network effects without evidence."] }
  ],
  MILESTONE_LADDER: [
    { milestone_id: "original-ladder-1", order: 1, label: "Define scarcity-safe flagship offer", success_signal: "Offer has no discount or volume framing.", target_window_days: 14, evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { milestone_id: "original-ladder-2", order: 2, label: "Validate three qualified collector routes", success_signal: "At least one route reaches a real buyer/advisor.", target_window_days: 45, evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { milestone_id: "original-ladder-3", order: 3, label: "Close or disprove premium original demand", success_signal: "Deposit, signed intent, or clear no-go from qualified buyers.", target_window_days: 120, evidence_refs: ["goal-feasibility-fixture-economics"] }
  ],
  BIGGEST_BOTTLENECK: "Original production throughput and qualified buyer access.",
  PHASE_CHANGE_OPPORTUNITY: {
    trigger: "A qualified collector channel repeatedly supports higher original prices without accessibility messaging.",
    opportunity: "Shift from production volume to price-floor and access-quality compounding.",
    not_guaranteed: true
  },
  NEXT_HIGH_LEVERAGE_MOVE: {
    action: "Build one scarcity-safe flagship original offer and qualify three elite buyer routes.",
    rationale: "It tests both price power and access before increasing production commitments.",
    requires_keegan_approval: false
  },
  RISK_OF_RUIN: { level: "MEDIUM", notes: ["Overcommitting originals can damage delivery trust and creative capacity."], cash_at_risk_range: usd(0, 500000) },
  CONFIDENCE: confidence,
  WHAT_WOULD_CHANGE_THE_PATH: ["Confirmed institutional demand for one subject", "Evidence that price floor can rise without reducing qualified demand", "Production support that preserves craftsmanship"],
  evidence_refs: ["goal-feasibility-fixture-strategy", "goal-feasibility-fixture-economics", "goal-feasibility-fixture-capacity"]
};

const LICENSING_IP_PLATFORM: GoalFeasibilityPathV1 = {
  path_id: "path-licensing-ip-platform-leverage",
  strategy_kind: "LICENSING_IP_PLATFORM_LEVERAGE",
  TARGET_STATE,
  FEASIBILITY_CLASS: "SPECULATIVE",
  REQUIRED_SCALE_RANGE: usd(10000000, 100000000),
  CURRENT_TRAJECTORY: {
    state: "UNKNOWN",
    summary: "Platform/IP leverage may scale beyond studio hours, but access, rights, economics, and brand fit are not yet proven.",
    evidence_refs: ["goal-feasibility-fixture-strategy"]
  },
  GAP_TO_TARGET: {
    severity: "HIGH",
    enterprise_value_range: unknown(),
    annual_revenue_range: unknown(),
    cash_flow_range: unknown(),
    personal_equity_range: unknown(),
    notes: ["Licensing revenue, platform valuation, and personal equity are separate economics.", "Rights and distribution evidence are missing."]
  },
  PATHWAYS: ["Convert iconic artwork/story into controlled licensing packages.", "Build platform distribution around premium narrative assets.", "Pursue IP only where it strengthens scarcity and authority."],
  REQUIRED_ASSETS: [
    { asset_id: "asset-ip-rights-map", label: "Rights and licensing map", state: "MISSING", why_it_matters: "Raw art or articles cannot become a licensing path without rights and synthesis.", evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { asset_id: "asset-platform-distribution", label: "Platform distribution", state: "PARTIAL", why_it_matters: "Leverage requires repeatable distribution, not one-off attention.", evidence_refs: ["goal-feasibility-fixture-strategy"] }
  ],
  CAPACITY_CONSTRAINTS: [
    {
      constraint_id: "constraint-business-development-access",
      severity: "HIGH",
      summary: "Licensing depends on counterpart access and terms more than studio output.",
      creative_hours_range: timeRange({ low_hours: 120, high_hours: 260, coverage_state: "PARTIAL", evidence_refs: ["goal-feasibility-fixture-capacity"] }),
      evidence_refs: ["goal-feasibility-fixture-capacity"]
    }
  ],
  CAPITAL_OR_ECONOMIC_ASSUMPTIONS: [
    { assumption_id: "assumption-rights-economics", label: "Rights economics remain unvalidated.", value_range: unknown(), qualitative_only: false, notes: ["UNKNOWN is preserved until a specific licensing counterparty and terms exist."] },
    { assumption_id: "assumption-network-effect", label: "Network effects are qualitative.", value_range: unknown(), qualitative_only: true, notes: ["No false precision for platform prestige or network compounding."] }
  ],
  MILESTONE_LADDER: [
    { milestone_id: "license-ladder-1", order: 1, label: "Map rights-safe licensing surfaces", success_signal: "Clear list of what can and cannot be licensed.", target_window_days: 21, evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { milestone_id: "license-ladder-2", order: 2, label: "Validate one premium-aligned partner thesis", success_signal: "Partner type strengthens prestige instead of volume exposure.", target_window_days: 60, evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { milestone_id: "license-ladder-3", order: 3, label: "Obtain real terms or kill the path", success_signal: "Specific economics, rights, and brand control terms are known.", target_window_days: 150, evidence_refs: ["goal-feasibility-fixture-economics"] }
  ],
  BIGGEST_BOTTLENECK: "Rights-safe premium distribution and counterpart access.",
  PHASE_CHANGE_OPPORTUNITY: {
    trigger: "A premium-aligned partner offers rights-safe terms with brand control.",
    opportunity: "Scale beyond artist hours while preserving scarcity.",
    not_guaranteed: true
  },
  NEXT_HIGH_LEVERAGE_MOVE: {
    action: "Create a rights-safe licensing/IP surface map before pitching.",
    rationale: "It prevents raw or unsupported assets from bypassing synthesis into a candidate path.",
    requires_keegan_approval: false
  },
  RISK_OF_RUIN: { level: "HIGH", notes: ["Bad licensing can dilute premium positioning or create rights exposure."], cash_at_risk_range: unknown() },
  CONFIDENCE: { ...confidence, level: "LOW", qualifiers: [...confidence.qualifiers, "Licensing path is deliberately speculative until rights and partner terms are known."] },
  WHAT_WOULD_CHANGE_THE_PATH: ["Confirmed rights-safe partner terms", "Strong platform distribution evidence", "Proof that licensing reinforces scarcity rather than accessibility"],
  evidence_refs: ["goal-feasibility-fixture-strategy", "goal-feasibility-fixture-economics"]
};

const DIVERSIFIED_ENTERPRISE: GoalFeasibilityPathV1 = {
  path_id: "path-diversified-creative-enterprise",
  strategy_kind: "DIVERSIFIED_CREATIVE_ENTERPRISE",
  TARGET_STATE,
  FEASIBILITY_CLASS: "PLAUSIBLE",
  REQUIRED_SCALE_RANGE: usd(15000000, 85000000),
  CURRENT_TRAJECTORY: {
    state: "BEHIND",
    summary: "A diversified enterprise can reduce dependence on original output, but it needs operating support and disciplined product boundaries.",
    evidence_refs: ["goal-feasibility-fixture-strategy"]
  },
  GAP_TO_TARGET: {
    severity: "HIGH",
    enterprise_value_range: unknown(),
    annual_revenue_range: usd(1000000, 7000000),
    cash_flow_range: unknown(),
    personal_equity_range: unknown(),
    notes: ["Enterprise value depends on repeatability, margin, transferability, and defensibility.", "Revenue and cash flow must stay distinct from personal equity."]
  },
  PATHWAYS: ["Use originals as authority anchors.", "Add tightly controlled editions or collaborations only where they increase prestige.", "Build operating support around sales, evidence, and relationship intelligence."],
  REQUIRED_ASSETS: [
    { asset_id: "asset-operating-system", label: "Operating support system", state: "PARTIAL", why_it_matters: "Diversification requires repeatable execution without pulling Keegan into low-leverage work.", evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { asset_id: "asset-offer-architecture", label: "Offer architecture", state: "PARTIAL", why_it_matters: "Revenue layers must not blur scarcity or discount the core brand.", evidence_refs: ["goal-feasibility-fixture-strategy"] }
  ],
  CAPACITY_CONSTRAINTS: [
    {
      constraint_id: "constraint-founder-attention",
      severity: "HIGH",
      summary: "The path can scale only if operating load is delegated or systematized.",
      creative_hours_range: timeRange({ low_hours: 180, high_hours: 360, coverage_state: "PARTIAL", evidence_refs: ["goal-feasibility-fixture-capacity"] }),
      evidence_refs: ["goal-feasibility-fixture-capacity"]
    }
  ],
  CAPITAL_OR_ECONOMIC_ASSUMPTIONS: [
    { assumption_id: "assumption-layered-revenue", label: "Layered revenue requires controlled boundaries.", value_range: usd(500000, 4000000), qualitative_only: false, notes: ["Fixture range is a path requirement, not a forecast."] },
    { assumption_id: "assumption-enterprise-value", label: "Enterprise value is UNKNOWN until repeatable margins and transferability are evidenced.", value_range: unknown(), qualitative_only: false, notes: ["Do not treat revenue as enterprise value."] }
  ],
  MILESTONE_LADDER: [
    { milestone_id: "enterprise-ladder-1", order: 1, label: "Define one premium-safe secondary revenue layer", success_signal: "Layer strengthens scarcity and does not require discount messaging.", target_window_days: 30, evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { milestone_id: "enterprise-ladder-2", order: 2, label: "Install relationship/evidence operating rhythm", success_signal: "Weekly decision loop surfaces qualified opportunities.", target_window_days: 75, evidence_refs: ["goal-feasibility-fixture-strategy"] },
    { milestone_id: "enterprise-ladder-3", order: 3, label: "Prove repeatable margin without creative overload", success_signal: "Revenue layer repeats while creative capacity stays below overload.", target_window_days: 180, evidence_refs: ["goal-feasibility-fixture-economics", "goal-feasibility-fixture-capacity"] }
  ],
  BIGGEST_BOTTLENECK: "Founder attention and offer architecture discipline.",
  PHASE_CHANGE_OPPORTUNITY: {
    trigger: "One prestige-safe revenue layer repeats without consuming original-art production capacity.",
    opportunity: "Compound enterprise value through repeatable operating assets rather than only more originals.",
    not_guaranteed: true
  },
  NEXT_HIGH_LEVERAGE_MOVE: {
    action: "Design one premium-safe secondary layer with explicit capacity and brand guardrails.",
    rationale: "It tests scalable economics while protecting the original-art authority engine.",
    requires_keegan_approval: false
  },
  RISK_OF_RUIN: { level: "MEDIUM", notes: ["Poorly bounded diversification can dilute positioning and overload attention."], cash_at_risk_range: usd(0, 1000000) },
  CONFIDENCE: confidence,
  WHAT_WOULD_CHANGE_THE_PATH: ["Operating support becomes strong", "Secondary layer shows repeatable margin", "Brand signal weakens from too many offers"],
  evidence_refs: ["goal-feasibility-fixture-strategy", "goal-feasibility-fixture-economics", "goal-feasibility-fixture-capacity"]
};

export const GOAL_FEASIBILITY_BASE_ASSUMPTIONS_V1: GoalFeasibilityAssumptionSetV1 = {
  assumption_set_id: "assumptions-base-capacity-constrained",
  label: "Base case with artist production constraint and partial operating support",
  max_originals_per_year: 6,
  licensing_access: "PARTIAL",
  platform_distribution: "MEDIUM",
  enterprise_operating_support: "PARTIAL"
};

export const GOAL_FEASIBILITY_LICENSING_UPSIDE_ASSUMPTIONS_V1: GoalFeasibilityAssumptionSetV1 = {
  assumption_set_id: "assumptions-licensing-access-upside",
  label: "Licensing upside case with strong rights-safe access and platform distribution",
  max_originals_per_year: 6,
  licensing_access: "STRONG",
  platform_distribution: "HIGH",
  enterprise_operating_support: "PARTIAL"
};

const PATHS = [HIGH_END_ORIGINAL_ART, LICENSING_IP_PLATFORM, DIVERSIFIED_ENTERPRISE];

export function buildGoalFeasibilitySnapshotFixtureV1(assumption_set: GoalFeasibilityAssumptionSetV1): GoalFeasibilitySnapshotV1 {
  const ordered = sortPathsForAssumptionsV1(PATHS, assumption_set);
  return {
    contract_version: GOAL_FEASIBILITY_CONTRACT_VERSION_V1,
    snapshot_id: `goal-feasibility-${assumption_set.assumption_set_id}`,
    as_of: "2026-08-19",
    source: "fixture",
    TARGET_STATE,
    assumption_set,
    PATHS: ordered,
    PREFERRED_PATH_ORDER: ordered.map((path) => path.path_id),
    capacity_constrained_case: {
      path_id: HIGH_END_ORIGINAL_ART.path_id,
      artist_production_only: true,
      can_be_treated_as_infinite_scale: false,
      maximum_originals_per_year: assumption_set.max_originals_per_year ?? 6,
      why_not_scalable: ["Each original requires scarce Keegan studio hours.", "More output can reduce scarcity and delivery quality.", "Production throughput cannot be treated like software distribution."]
    },
    guardrails: {
      aspiration_is_not_forecast: true,
      guaranteed_fame_or_wealth_language_allowed: false,
      prestige_network_effects_are_qualitative: true,
      raw_revenue_is_not_enterprise_value: true
    },
    evidence_refs
  };
}

export const GOAL_FEASIBILITY_BASE_FIXTURE_V1 = buildGoalFeasibilitySnapshotFixtureV1(GOAL_FEASIBILITY_BASE_ASSUMPTIONS_V1);
export const GOAL_FEASIBILITY_LICENSING_UPSIDE_FIXTURE_V1 = buildGoalFeasibilitySnapshotFixtureV1(GOAL_FEASIBILITY_LICENSING_UPSIDE_ASSUMPTIONS_V1);

export const GOAL_FEASIBILITY_FIXTURES_V1 = [
  GOAL_FEASIBILITY_BASE_FIXTURE_V1,
  GOAL_FEASIBILITY_LICENSING_UPSIDE_FIXTURE_V1
].sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id));
