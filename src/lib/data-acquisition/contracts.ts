import type {
  TrustSnapshotCoverageState,
  TrustSnapshotEvidenceQuality,
  TrustSnapshotFreshnessState,
  TrustSnapshotTruthState
} from "@/lib/data-evidence-trust-snapshot/contracts";

export const DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1 = "data_acquisition_coverage_map_v1.0" as const;
export const DATA_ACQUISITION_RESEARCH_QUEUE_VERSION_V1 = "data_acquisition_research_queue_v1.0" as const;

export type DataAcquisitionSourceClassV1 =
  | "FIRST_PARTY"
  | "PRIMARY"
  | "SECONDARY"
  | "PROXY"
  | "PROTECTED_PRIVATE";

export type DataAcquisitionSourceHealthV1 = "HEALTHY" | "STALE" | "DEGRADED" | "CONFLICTED" | "MISSING" | "APPROVAL_REQUIRED";
export type DataAcquisitionMaterialityV1 = "LOW" | "MEDIUM" | "HIGH" | "DECISION_CRITICAL";
export type DataAcquisitionValueOfInformationV1 = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DataAcquisitionCostOrEffortClassV1 = "LOW" | "MEDIUM" | "HIGH" | "NOT_WORTH_IT" | "APPROVAL_REQUIRED";
export type DataAcquisitionApprovalClassV1 = "NO_APPROVAL_NEEDED" | "KEEGAN_APPROVAL_REQUIRED";
export type DataAcquisitionActionSafetyV1 = "SAFE_PUBLIC_RESEARCH" | "READ_ONLY_INTERNAL_REVIEW" | "APPROVAL_GATED_PRIVATE_SOURCE" | "SUPPRESS";

export type RequiredFactV1 = {
  fact_id: string;
  label: string;
  materiality: DataAcquisitionMaterialityV1;
  truth_state: TrustSnapshotTruthState;
  coverage_state: TrustSnapshotCoverageState;
  why_required: string;
  covered_by_source_ids: string[];
};

export type CurrentSourceV1 = {
  source_id: string;
  label: string;
  SOURCE_CLASS: DataAcquisitionSourceClassV1;
  SOURCE_HEALTH: DataAcquisitionSourceHealthV1;
  FRESHNESS: TrustSnapshotFreshnessState;
  evidence_quality: TrustSnapshotEvidenceQuality;
  covers_fact_ids: string[];
  notes: string;
};

export type DataAcquisitionCriticalGapV1 = {
  fact_id: string;
  materiality: DataAcquisitionMaterialityV1;
  coverage_state: TrustSnapshotCoverageState;
  truth_state: TrustSnapshotTruthState;
  why_it_matters: string;
};

export type DataAcquisitionConflictV1 = {
  conflict_id: string;
  source_ids: string[];
  fact_ids: string[];
  summary: string;
  resolution_action: string;
};

export type DataAcquisitionCoverageMapV1 = {
  contract_version: typeof DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1;
  map_id: string;
  as_of: string;
  source: "fixture" | "adapter";
  DECISION_OR_CAPABILITY: string;
  REQUIRED_FACTS: RequiredFactV1[];
  CURRENT_SOURCES: CurrentSourceV1[];
  SOURCE_CLASS: DataAcquisitionSourceClassV1[];
  SOURCE_HEALTH: DataAcquisitionSourceHealthV1;
  FRESHNESS: TrustSnapshotFreshnessState;
  COVERAGE_STATE: TrustSnapshotCoverageState;
  CRITICAL_GAPS: DataAcquisitionCriticalGapV1[];
  CONFLICTS: DataAcquisitionConflictV1[];
  NEXT_BEST_ACQUISITION_ACTION: {
    action_id: string;
    label: string;
    safety: DataAcquisitionActionSafetyV1;
    rationale: string;
  };
  VALUE_OF_INFORMATION_QUALITATIVE: DataAcquisitionValueOfInformationV1;
  COST_OR_EFFORT_CLASS: DataAcquisitionCostOrEffortClassV1;
  STOP_RESEARCH_RULE: string;
  APPROVAL_CLASS: DataAcquisitionApprovalClassV1;
  evidence_refs: string[];
};

export type DataAcquisitionResearchQueueItemV1 = {
  map_id: string;
  decision_or_capability: string;
  next_best_action: DataAcquisitionCoverageMapV1["NEXT_BEST_ACQUISITION_ACTION"];
  value_of_information: DataAcquisitionValueOfInformationV1;
  cost_or_effort_class: DataAcquisitionCostOrEffortClassV1;
  approval_class: DataAcquisitionApprovalClassV1;
  critical_gap_fact_ids: string[];
  suppressed: boolean;
  suppression_reason: string | null;
};

export type DataAcquisitionResearchQueueV1 = {
  queue_version: typeof DATA_ACQUISITION_RESEARCH_QUEUE_VERSION_V1;
  generated_from_map_ids: string[];
  items: DataAcquisitionResearchQueueItemV1[];
  keegan_action_required: "NO";
};

export function hasUnknownRequiredFact(map: DataAcquisitionCoverageMapV1): boolean {
  return map.REQUIRED_FACTS.some((fact) => fact.truth_state === "UNKNOWN" || fact.truth_state === "NEEDS_RESEARCH");
}

export function requiresExplicitApproval(map: DataAcquisitionCoverageMapV1): boolean {
  return map.APPROVAL_CLASS === "KEEGAN_APPROVAL_REQUIRED" || map.COST_OR_EFFORT_CLASS === "APPROVAL_REQUIRED";
}
