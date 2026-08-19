import type { ConfidenceV1, MoneyRangeV1, TimeRangeV1 } from "@/lib/financial-intelligence/contracts";

export const STRATEGIC_TRAJECTORY_CONTRACT_VERSION_V1 = "strategic_trajectory_v1.0" as const;
export const STRATEGIC_TRAJECTORY_VIEW_VERSION_V1 = "strategic_trajectory_view_v1.0" as const;

export type StrategicTrajectoryPathStatusV1 = "PREFERRED" | "VIABLE" | "SCOUT" | "REJECTED";
export type StrategicTrajectoryRiskLevelV1 = "LOW" | "MEDIUM" | "HIGH" | "UNBOUNDED" | "UNKNOWN";
export type StrategicTrajectoryTradeoffKindV1 = "PRESTIGE" | "NETWORK" | "SCARCITY" | "CAPACITY" | "CASH" | "LEARNING";

export type StrategicTrajectoryEvidenceRefV1 = {
  ref_id: string;
  source: "fixture" | "adapter" | "unknown";
  notes: string;
};

export type RequiredAssetV1 = {
  asset_id: string;
  label: string;
  present_state: "PRESENT" | "PARTIAL" | "MISSING" | "UNKNOWN";
  why_it_matters: string;
  evidence_refs: string[];
};

export type StrategicTrajectoryPathV1 = {
  path_id: string;
  label: string;
  status: StrategicTrajectoryPathStatusV1;
  strategy: string;
  prerequisites: string[];
  expected_tradeoffs: Array<{
    kind: StrategicTrajectoryTradeoffKindV1;
    summary: string;
    qualitative_only: boolean;
  }>;
  direct_financial_range: MoneyRangeV1;
  creative_hours_range: TimeRangeV1;
  downside: {
    level: StrategicTrajectoryRiskLevelV1;
    bounded: boolean;
    notes: string[];
  };
  prestige_effect: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    notes: string;
    qualitative_only: true;
  };
  network_effect: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    notes: string;
    qualitative_only: true;
  };
  why_preferred_or_not: string;
  evidence_refs: string[];
};

export type StrategicTrajectoryNewFactV1 = {
  fact_id: string;
  summary: string;
  evidence_refs: string[];
  changes_preferred_path_to: string | null;
  revision_reason: string;
};

export type StrategicTrajectoryRevisionV1 = {
  revision_id: string;
  previous_preferred_path_id: string;
  new_preferred_path_id: string;
  trigger_fact_id: string;
  previous_reason: string;
  revision_reason: string;
  evidence_refs: string[];
};

export type StrategicTrajectorySnapshotV1 = {
  contract_version: typeof STRATEGIC_TRAJECTORY_CONTRACT_VERSION_V1;
  trajectory_id: string;
  as_of: string;
  source: "fixture" | "adapter";
  TARGET_STATE: string;
  CURRENT_STATE: string;
  REQUIRED_ASSETS: RequiredAssetV1[];
  BOTTLENECK: string;
  PATHS: StrategicTrajectoryPathV1[];
  NEXT_HIGH_LEVERAGE_MOVE: string;
  COMPOUNDING_ASSET_CREATED: string;
  FOG_OF_WAR: string[];
  SCOUTING_ACTION: string;
  WHAT_TO_IGNORE: string[];
  REVISION_TRIGGER: string;
  PATH_REVISION_HISTORY: StrategicTrajectoryRevisionV1[];
  evidence_refs: StrategicTrajectoryEvidenceRefV1[];
  confidence: ConfidenceV1;
};

export type StrategicTrajectoryViewModelV1 = {
  view_version: typeof STRATEGIC_TRAJECTORY_VIEW_VERSION_V1;
  trajectory_id: string;
  target_state: string;
  current_state: string;
  required_assets: RequiredAssetV1[];
  current_bottleneck: string;
  preferred_path: StrategicTrajectoryPathV1;
  viable_paths: StrategicTrajectoryPathV1[];
  next_high_leverage_move: string;
  compounding_asset_created: string;
  fog_of_war: string[];
  scouting_action: string;
  what_to_ignore: string[];
  revision_trigger: string;
  path_revision_history: StrategicTrajectoryRevisionV1[];
  keegan_action_required: "NO";
  confidence: ConfidenceV1;
};

export function pathHasUnboundedDownside(path: StrategicTrajectoryPathV1): boolean {
  return path.downside.level === "UNBOUNDED" || path.downside.bounded === false;
}
