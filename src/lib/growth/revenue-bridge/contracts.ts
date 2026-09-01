import type { ConfidenceV1, EvidenceRefV1, MoneyRangeV1, TimeRangeV1 } from "@/lib/financial-intelligence/contracts";

export const REVENUE_BRIDGE_CONTRACT_VERSION_V1 = "revenue_bridge_v1.0" as const;
export const REVENUE_BRIDGE_PROJECTION_VERSION_V1 = "revenue_bridge_projection_v1.0" as const;

export type RevenueBridgeTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type RevenueBridgePathKindV1 = "ARTIST_HOURS_HEAVY_ORIGINALS" | "LICENSING_IP_COLLECTIBLES" | "PARTNERSHIPS_DISTRIBUTION_DIRECT_COLLECTOR";
export type RevenueBridgePathStageV1 = "DO_NOW" | "VALIDATE" | "INCUBATE" | "DEFER";
export type RevenueBridgeGapSeverityV1 = "LOW" | "MODERATE" | "HIGH" | "STRUCTURAL" | "UNKNOWN";

export type RevenueBridgeAssumptionsV1 = {
  assumption_set_id: string;
  label: string;
  artist_hours_available_range: TimeRangeV1;
  max_originals_or_commissions_per_year: number | null;
  licensing_economics_state: RevenueBridgeTruthStateV1;
  partner_distribution_evidence_state: RevenueBridgeTruthStateV1;
  direct_collector_pipeline_state: RevenueBridgeTruthStateV1;
  operating_support_state: "NONE" | "PARTIAL" | "STRONG" | "UNKNOWN";
};

export type RevenueBridgeTargetStateV1 = {
  label: string;
  annual_revenue_objective: MoneyRangeV1;
  objective_not_forecast: true;
  horizon_months: number;
  truth_state: RevenueBridgeTruthStateV1;
};

export type RevenueBridgeCurrentTrajectoryV1 = {
  summary: string;
  annual_revenue_range: MoneyRangeV1;
  confidence: ConfidenceV1;
  truth_state: RevenueBridgeTruthStateV1;
};

export type RevenueBridgePathV1 = {
  path_id: string;
  kind: RevenueBridgePathKindV1;
  label: string;
  stage: RevenueBridgePathStageV1;
  WHAT_CHANGED: string;
  WHY_IT_MATTERS: string;
  revenue_contribution_range: MoneyRangeV1;
  artist_hours_required_range: TimeRangeV1;
  scalability_ceiling: {
    artist_hours_bound: boolean;
    can_be_treated_as_infinite_scale: false;
    summary: string;
  };
  prestige_or_relationship_upside: {
    summary: string;
    qualitative_only: true;
    truth_state: RevenueBridgeTruthStateV1;
  };
  key_economic_unknown: string;
  confidence: ConfidenceV1;
  truth_state: RevenueBridgeTruthStateV1;
  BOTTLENECK: string;
  NEXT_MILESTONE: string;
  LEADING_INDICATORS: string[];
  WHAT_WOULD_CHANGE_PATH: string[];
  evidence_refs: string[];
};

export type RevenueBridgeSnapshotV1 = {
  contract_version: typeof REVENUE_BRIDGE_CONTRACT_VERSION_V1;
  bridge_id: string;
  as_of: string;
  source: "fixture" | "adapter";
  TARGET_STATE: RevenueBridgeTargetStateV1;
  CURRENT_TRAJECTORY: RevenueBridgeCurrentTrajectoryV1;
  GAP: {
    severity: RevenueBridgeGapSeverityV1;
    summary: string;
    annual_revenue_gap_range: MoneyRangeV1;
    truth_state: RevenueBridgeTruthStateV1;
  };
  assumption_set: RevenueBridgeAssumptionsV1;
  PATHS: RevenueBridgePathV1[];
  PATH_ORDER: string[];
  BOTTLENECK: string;
  NEXT_MILESTONE: string;
  LEADING_INDICATORS: string[];
  WHAT_WOULD_CHANGE_PATH: string[];
  truth_state: RevenueBridgeTruthStateV1;
  confidence: ConfidenceV1;
  guardrails: {
    target_is_objective_not_forecast: true;
    unknown_economics_are_not_zero: true;
    artist_hours_heavy_path_not_infinite_scale: true;
    prestige_and_relationship_upside_qualitative_until_supported: true;
    keegan_action_required: "NO";
  };
  evidence_refs: EvidenceRefV1[];
};

export type RevenueBridgeProjectionV1 = {
  view_version: typeof REVENUE_BRIDGE_PROJECTION_VERSION_V1;
  bridge_id: string;
  target_state: RevenueBridgeSnapshotV1["TARGET_STATE"];
  current_trajectory: RevenueBridgeSnapshotV1["CURRENT_TRAJECTORY"];
  gap: RevenueBridgeSnapshotV1["GAP"];
  ordered_paths: Array<{
    path_id: string;
    label: string;
    kind: RevenueBridgePathKindV1;
    stage: RevenueBridgePathStageV1;
    why_it_matters: string;
    revenue_contribution_range: MoneyRangeV1;
    artist_hours_required_range: TimeRangeV1;
    bottleneck: string;
    next_milestone: string;
    leading_indicators: string[];
    what_would_change_path: string[];
    truth_state: RevenueBridgeTruthStateV1;
    confidence: ConfidenceV1;
  }>;
  bottleneck: string;
  next_milestone: string;
  leading_indicators: string[];
  what_would_change_path: string[];
  truth_state: RevenueBridgeTruthStateV1;
  confidence: ConfidenceV1;
  keegan_action_required: "NO";
};

const confidenceScore: Record<ConfidenceV1["level"], number> = {
  HIGH: 18,
  MEDIUM: 11,
  LOW: 5,
  UNKNOWN: 0
};

const truthScore: Record<RevenueBridgeTruthStateV1, number> = {
  KNOWN: 14,
  INFERRED: 9,
  STALE: 3,
  UNKNOWN: 0,
  CONFLICTED: -8
};

const stageScore: Record<RevenueBridgePathStageV1, number> = {
  DO_NOW: 14,
  VALIDATE: 10,
  INCUBATE: 4,
  DEFER: -4
};

function hasKnownMoney(range: MoneyRangeV1): boolean {
  return range.low_cents !== null || range.high_cents !== null;
}

function highBoundCents(range: MoneyRangeV1): number {
  return range.high_cents ?? range.low_cents ?? 0;
}

function highHours(range: TimeRangeV1): number {
  return range.high_hours ?? range.low_hours ?? 0;
}

export function scoreRevenueBridgePathV1(path: RevenueBridgePathV1, assumptions: RevenueBridgeAssumptionsV1): number {
  const knownEconomicsBonus = hasKnownMoney(path.revenue_contribution_range) ? Math.min(28, highBoundCents(path.revenue_contribution_range) / 100000) : -18;
  const confidenceBonus = confidenceScore[path.confidence.level];
  const truthBonus = truthScore[path.truth_state];
  const stageBonus = stageScore[path.stage];
  const capacityPenalty = path.scalability_ceiling.artist_hours_bound ? Math.min(35, highHours(path.artist_hours_required_range) / 25) : 0;
  const overloadPenalty =
    path.kind === "ARTIST_HOURS_HEAVY_ORIGINALS" && assumptions.max_originals_or_commissions_per_year !== null && assumptions.max_originals_or_commissions_per_year < 8 ? 24 : 0;
  const artistCapacityUpsideBonus =
    path.kind === "ARTIST_HOURS_HEAVY_ORIGINALS" && assumptions.max_originals_or_commissions_per_year !== null && assumptions.max_originals_or_commissions_per_year >= 10 ? 55 : 0;
  const licensingBonus =
    path.kind === "LICENSING_IP_COLLECTIBLES" && assumptions.licensing_economics_state === "KNOWN" ? 34 : assumptions.licensing_economics_state === "UNKNOWN" ? -12 : 0;
  const distributionBonus =
    path.kind === "PARTNERSHIPS_DISTRIBUTION_DIRECT_COLLECTOR" &&
    (assumptions.partner_distribution_evidence_state === "KNOWN" || assumptions.direct_collector_pipeline_state === "KNOWN")
      ? 18
      : 0;
  const operatingBonus =
    path.kind !== "ARTIST_HOURS_HEAVY_ORIGINALS" && assumptions.operating_support_state === "STRONG" ? 10 : assumptions.operating_support_state === "NONE" ? -8 : 0;

  return knownEconomicsBonus + confidenceBonus + truthBonus + stageBonus + artistCapacityUpsideBonus + licensingBonus + distributionBonus + operatingBonus - capacityPenalty - overloadPenalty;
}

export function orderRevenueBridgePathsV1(paths: RevenueBridgePathV1[], assumptions: RevenueBridgeAssumptionsV1): RevenueBridgePathV1[] {
  return [...paths].sort((a, b) => {
    const scoreDelta = scoreRevenueBridgePathV1(b, assumptions) - scoreRevenueBridgePathV1(a, assumptions);
    return scoreDelta === 0 ? a.path_id.localeCompare(b.path_id) : scoreDelta;
  });
}
