import { moneyRange, timeRange, unknownMoneyRange, type ConfidenceV1, type EvidenceRefV1, type MoneyRangeV1 } from "@/lib/financial-intelligence/contracts";
import {
  REVENUE_BRIDGE_CONTRACT_VERSION_V1,
  orderRevenueBridgePathsV1,
  type RevenueBridgeAssumptionsV1,
  type RevenueBridgeCurrentTrajectoryV1,
  type RevenueBridgePathV1,
  type RevenueBridgeSnapshotV1,
  type RevenueBridgeTargetStateV1
} from "./contracts";

const evidence_refs: EvidenceRefV1[] = [
  { ref_id: "revenue-bridge-fixture-target", source: "fixture", notes: "Synthetic target objective for deterministic revenue bridge tests." },
  { ref_id: "revenue-bridge-fixture-capacity", source: "fixture", notes: "Synthetic artist-time capacity evidence; not production telemetry." },
  { ref_id: "revenue-bridge-fixture-economics", source: "fixture", notes: "Synthetic economics evidence; UNKNOWN ranges stay UNKNOWN." },
  { ref_id: "revenue-bridge-fixture-distribution", source: "fixture", notes: "Synthetic distribution and collector-pipeline evidence." }
];

const confidence = (level: ConfidenceV1["level"], reasons: string[], qualifiers: string[] = []): ConfidenceV1 => ({
  level,
  reasons,
  qualifiers
});

const usd = (low_cents: number, high_cents: number, refs = ["revenue-bridge-fixture-economics"]): MoneyRangeV1 =>
  moneyRange({ low_cents, high_cents, coverage_state: "PARTIAL", evidence_refs: refs });

const unknown = (refs = ["revenue-bridge-fixture-economics"]): MoneyRangeV1 => unknownMoneyRange(refs);

const targetState: RevenueBridgeTargetStateV1 = {
  label: "Reach multi-million annual revenue while protecting premium scarcity and long-term brand equity.",
  annual_revenue_objective: usd(300000000, 700000000, ["revenue-bridge-fixture-target"]),
  objective_not_forecast: true,
  horizon_months: 36,
  truth_state: "INFERRED" as const
};

const currentTrajectory: RevenueBridgeCurrentTrajectoryV1 = {
  summary: "Current trajectory is authority-led but not yet proven as a repeatable multi-million revenue system.",
  annual_revenue_range: unknown(["revenue-bridge-fixture-economics"]),
  confidence: confidence("LOW", ["current_revenue_fixture_not_connected_to_live_finance"], ["current trajectory is not a forecast"]),
  truth_state: "UNKNOWN" as const
};

export const REVENUE_BRIDGE_BASE_ASSUMPTIONS_V1: RevenueBridgeAssumptionsV1 = {
  assumption_set_id: "revenue-bridge-base-capacity-constrained",
  label: "Base case with constrained artist output and UNKNOWN licensing economics",
  artist_hours_available_range: timeRange({ low_hours: 900, high_hours: 1300, coverage_state: "PARTIAL", evidence_refs: ["revenue-bridge-fixture-capacity"] }),
  max_originals_or_commissions_per_year: 6,
  licensing_economics_state: "UNKNOWN",
  partner_distribution_evidence_state: "INFERRED",
  direct_collector_pipeline_state: "INFERRED",
  operating_support_state: "PARTIAL"
};

export const REVENUE_BRIDGE_LICENSING_VALIDATED_ASSUMPTIONS_V1: RevenueBridgeAssumptionsV1 = {
  ...REVENUE_BRIDGE_BASE_ASSUMPTIONS_V1,
  assumption_set_id: "revenue-bridge-licensing-economics-known",
  label: "Licensing upside case with known rights-safe economics and stronger operating support",
  licensing_economics_state: "KNOWN",
  partner_distribution_evidence_state: "KNOWN",
  operating_support_state: "STRONG"
};

export const REVENUE_BRIDGE_ARTIST_CAPACITY_UPSIDE_ASSUMPTIONS_V1: RevenueBridgeAssumptionsV1 = {
  ...REVENUE_BRIDGE_BASE_ASSUMPTIONS_V1,
  assumption_set_id: "revenue-bridge-artist-capacity-upside",
  label: "Artist-hours upside case with higher production capacity but no infinite-scale assumption",
  artist_hours_available_range: timeRange({ low_hours: 1500, high_hours: 2100, coverage_state: "PARTIAL", evidence_refs: ["revenue-bridge-fixture-capacity"] }),
  max_originals_or_commissions_per_year: 12,
  licensing_economics_state: "UNKNOWN",
  partner_distribution_evidence_state: "STALE",
  direct_collector_pipeline_state: "STALE",
  operating_support_state: "PARTIAL"
};

const originalsPath: RevenueBridgePathV1 = {
  path_id: "path-artist-hours-heavy-originals-commissions",
  kind: "ARTIST_HOURS_HEAVY_ORIGINALS",
  label: "Artist-hours-heavy originals / commissions",
  stage: "VALIDATE",
  WHAT_CHANGED: "Originals can support price power, but the path is bounded by Keegan's studio hours.",
  WHY_IT_MATTERS: "This protects premium authority while preventing the model from pretending more handmade output scales like software.",
  revenue_contribution_range: usd(90000000, 250000000),
  artist_hours_required_range: timeRange({ low_hours: 1200, high_hours: 1900, coverage_state: "PARTIAL", evidence_refs: ["revenue-bridge-fixture-capacity"] }),
  scalability_ceiling: {
    artist_hours_bound: true,
    can_be_treated_as_infinite_scale: false,
    summary: "Every original or commission consumes scarce artist hours and can dilute scarcity if treated as volume."
  },
  prestige_or_relationship_upside: {
    summary: "Prestige upside is qualitative until observed collector demand supports it.",
    qualitative_only: true,
    truth_state: "INFERRED"
  },
  key_economic_unknown: "Actual sell-through, deposit timing, and direct production costs remain path-sensitive.",
  confidence: confidence("MEDIUM", ["originals_are_core_authority_engine", "capacity_constraint_explicit"], ["not a forecast and not a price change"]),
  truth_state: "INFERRED",
  BOTTLENECK: "Artist-time throughput and verified premium buyer depth.",
  NEXT_MILESTONE: "Validate one scarcity-safe flagship offer with qualified collector routes.",
  LEADING_INDICATORS: ["Qualified collector conversations", "Deposit-backed demand", "No discount or volume framing", "Creative-hour load stays below overload"],
  WHAT_WOULD_CHANGE_PATH: ["More verified premium buyer depth", "Production support that preserves craft", "Capacity overload or delayed delivery"],
  evidence_refs: ["revenue-bridge-fixture-capacity", "revenue-bridge-fixture-economics"]
};

const licensingPath: RevenueBridgePathV1 = {
  path_id: "path-licensing-ip-collectibles",
  kind: "LICENSING_IP_COLLECTIBLES",
  label: "Licensing / IP / collectibles",
  stage: "INCUBATE",
  WHAT_CHANGED: "Licensing can scale beyond studio hours, but rights-safe economics are UNKNOWN in the base case.",
  WHY_IT_MATTERS: "It could bridge revenue without multiplying originals, but bad terms could dilute the premium brand.",
  revenue_contribution_range: unknown(["revenue-bridge-fixture-economics"]),
  artist_hours_required_range: timeRange({ low_hours: 180, high_hours: 420, coverage_state: "PARTIAL", evidence_refs: ["revenue-bridge-fixture-capacity"] }),
  scalability_ceiling: {
    artist_hours_bound: false,
    can_be_treated_as_infinite_scale: false,
    summary: "Not artist-hour bound, but still limited by rights, partner quality, brand control, and demand evidence."
  },
  prestige_or_relationship_upside: {
    summary: "Partner and cultural upside remain qualitative until specific terms and demand evidence exist.",
    qualitative_only: true,
    truth_state: "UNKNOWN"
  },
  key_economic_unknown: "Licensing revenue share, rights control, minimum guarantees, production cost, and brand-control terms are UNKNOWN.",
  confidence: confidence("LOW", ["rights_safe_economics_missing"], ["preserve UNKNOWN rather than fake licensing precision"]),
  truth_state: "UNKNOWN",
  BOTTLENECK: "Rights-safe partner terms and premium distribution proof.",
  NEXT_MILESTONE: "Build a rights-safe licensing surface map and get one real terms benchmark.",
  LEADING_INDICATORS: ["Rights-safe surface identified", "Minimum guarantee or revenue-share terms known", "Brand-control provisions explicit", "Premium partner fit"],
  WHAT_WOULD_CHANGE_PATH: ["Known rights-safe economics", "Premium partner access", "Evidence collectibles strengthen scarcity rather than accessibility"],
  evidence_refs: ["revenue-bridge-fixture-economics", "revenue-bridge-fixture-distribution"]
};

const partnershipPath: RevenueBridgePathV1 = {
  path_id: "path-partnerships-distribution-direct-collector",
  kind: "PARTNERSHIPS_DISTRIBUTION_DIRECT_COLLECTOR",
  label: "Partnerships / distribution / direct-to-collector growth",
  stage: "DO_NOW",
  WHAT_CHANGED: "A partner and direct-collector path can expand revenue without making Keegan the only production bottleneck.",
  WHY_IT_MATTERS: "This is the nearest scalable bridge if it grows qualified demand and protects scarcity instead of chasing volume.",
  revenue_contribution_range: usd(150000000, 450000000),
  artist_hours_required_range: timeRange({ low_hours: 300, high_hours: 650, coverage_state: "PARTIAL", evidence_refs: ["revenue-bridge-fixture-capacity"] }),
  scalability_ceiling: {
    artist_hours_bound: false,
    can_be_treated_as_infinite_scale: false,
    summary: "Scale depends on qualified distribution, relationship trust, operational follow-through, and offer discipline."
  },
  prestige_or_relationship_upside: {
    summary: "Relationship upside is qualitative until verified introductions, commitments, or collector demand support it.",
    qualitative_only: true,
    truth_state: "INFERRED"
  },
  key_economic_unknown: "Partner economics and direct collector conversion remain partially known, not guaranteed.",
  confidence: confidence("MEDIUM", ["distribution_path_has_partial_evidence", "artist_capacity_load_is_lower_than_originals"], ["objective is not forecast"]),
  truth_state: "INFERRED",
  BOTTLENECK: "Qualified distribution access and direct collector conversion proof.",
  NEXT_MILESTONE: "Validate one premium-safe distribution route and one direct-collector conversion loop.",
  LEADING_INDICATORS: ["Qualified introductions", "Collector intent with budget", "Conversion without discounting", "Repeatable follow-up system"],
  WHAT_WOULD_CHANGE_PATH: ["Known partner economics", "Direct collector conversion improves", "Relationship access goes stale or conflicts"],
  evidence_refs: ["revenue-bridge-fixture-distribution", "revenue-bridge-fixture-economics", "revenue-bridge-fixture-capacity"]
};

function licensingKnownPath(): RevenueBridgePathV1 {
  return {
    ...licensingPath,
    stage: "DO_NOW",
    revenue_contribution_range: usd(250000000, 650000000),
    confidence: confidence("MEDIUM", ["rights_safe_economics_known", "premium_partner_distribution_known"], ["still not a forecast"]),
    truth_state: "KNOWN",
    prestige_or_relationship_upside: { ...licensingPath.prestige_or_relationship_upside, truth_state: "INFERRED" },
    key_economic_unknown: "Sell-through durability and long-term brand control still need proof."
  };
}

function pathsForAssumptions(assumptions: RevenueBridgeAssumptionsV1): RevenueBridgePathV1[] {
  const paths = [originalsPath, assumptions.licensing_economics_state === "KNOWN" ? licensingKnownPath() : licensingPath, partnershipPath];
  return orderRevenueBridgePathsV1(paths, assumptions);
}

export function buildRevenueBridgeFixtureV1(assumption_set: RevenueBridgeAssumptionsV1): RevenueBridgeSnapshotV1 {
  const ordered = pathsForAssumptions(assumption_set);
  const topPath = ordered[0];
  if (!topPath) throw new Error("REVENUE_BRIDGE_EMPTY_PATHS");

  return {
    contract_version: REVENUE_BRIDGE_CONTRACT_VERSION_V1,
    bridge_id: `revenue-bridge-${assumption_set.assumption_set_id}`,
    as_of: "2026-08-25",
    source: "fixture",
    TARGET_STATE: targetState,
    CURRENT_TRAJECTORY: currentTrajectory,
    GAP: {
      severity: "STRUCTURAL",
      summary: "The objective requires scalable revenue layers beyond current authority-led trajectory; this is a gap map, not a forecast.",
      annual_revenue_gap_range: unknown(["revenue-bridge-fixture-economics"]),
      truth_state: "UNKNOWN"
    },
    assumption_set,
    PATHS: ordered,
    PATH_ORDER: ordered.map((path) => path.path_id),
    BOTTLENECK: topPath.BOTTLENECK,
    NEXT_MILESTONE: topPath.NEXT_MILESTONE,
    LEADING_INDICATORS: [...topPath.LEADING_INDICATORS],
    WHAT_WOULD_CHANGE_PATH: [...topPath.WHAT_WOULD_CHANGE_PATH],
    truth_state: ordered.some((path) => path.truth_state === "UNKNOWN") ? "UNKNOWN" : "INFERRED",
    confidence: confidence("LOW", ["target_gap_and_some_path_economics_are_unknown"], ["dashboard projection only"]),
    guardrails: {
      target_is_objective_not_forecast: true,
      unknown_economics_are_not_zero: true,
      artist_hours_heavy_path_not_infinite_scale: true,
      prestige_and_relationship_upside_qualitative_until_supported: true,
      keegan_action_required: "NO"
    },
    evidence_refs
  };
}

export const REVENUE_BRIDGE_BASE_FIXTURE_V1 = buildRevenueBridgeFixtureV1(REVENUE_BRIDGE_BASE_ASSUMPTIONS_V1);
export const REVENUE_BRIDGE_LICENSING_VALIDATED_FIXTURE_V1 = buildRevenueBridgeFixtureV1(REVENUE_BRIDGE_LICENSING_VALIDATED_ASSUMPTIONS_V1);
export const REVENUE_BRIDGE_ARTIST_CAPACITY_UPSIDE_FIXTURE_V1 = buildRevenueBridgeFixtureV1(REVENUE_BRIDGE_ARTIST_CAPACITY_UPSIDE_ASSUMPTIONS_V1);

export const REVENUE_BRIDGE_FIXTURES_V1 = [
  REVENUE_BRIDGE_BASE_FIXTURE_V1,
  REVENUE_BRIDGE_LICENSING_VALIDATED_FIXTURE_V1,
  REVENUE_BRIDGE_ARTIST_CAPACITY_UPSIDE_FIXTURE_V1
].sort((a, b) => a.bridge_id.localeCompare(b.bridge_id));
