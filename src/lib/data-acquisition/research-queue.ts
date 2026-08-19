import {
  DATA_ACQUISITION_RESEARCH_QUEUE_VERSION_V1,
  requiresExplicitApproval,
  type DataAcquisitionCoverageMapV1,
  type DataAcquisitionCostOrEffortClassV1,
  type DataAcquisitionMaterialityV1,
  type DataAcquisitionResearchQueueItemV1,
  type DataAcquisitionResearchQueueV1,
  type DataAcquisitionValueOfInformationV1
} from "./contracts";

const materialityRank: Record<DataAcquisitionMaterialityV1, number> = {
  DECISION_CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

const informationValueRank: Record<DataAcquisitionValueOfInformationV1, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

const effortRank: Record<DataAcquisitionCostOrEffortClassV1, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  APPROVAL_REQUIRED: 3,
  NOT_WORTH_IT: 4
};

function highestMaterialityRank(map: DataAcquisitionCoverageMapV1): number {
  if (map.CRITICAL_GAPS.length === 0) return materialityRank.LOW;
  return Math.min(...map.CRITICAL_GAPS.map((gap) => materialityRank[gap.materiality]));
}

function suppressionReason(map: DataAcquisitionCoverageMapV1): string | null {
  if (map.VALUE_OF_INFORMATION_QUALITATIVE === "LOW") return "Low value of information is suppressible.";
  if (map.COST_OR_EFFORT_CLASS === "NOT_WORTH_IT") return "Research cost/effort is not worth it for this decision.";
  if (map.NEXT_BEST_ACQUISITION_ACTION.safety === "SUPPRESS") return "Stop rule suppresses further research.";
  return null;
}

export function toDataAcquisitionResearchQueueItemV1(
  map: DataAcquisitionCoverageMapV1
): DataAcquisitionResearchQueueItemV1 {
  const reason = suppressionReason(map);

  return {
    map_id: map.map_id,
    decision_or_capability: map.DECISION_OR_CAPABILITY,
    next_best_action: map.NEXT_BEST_ACQUISITION_ACTION,
    value_of_information: map.VALUE_OF_INFORMATION_QUALITATIVE,
    cost_or_effort_class: map.COST_OR_EFFORT_CLASS,
    approval_class: map.APPROVAL_CLASS,
    critical_gap_fact_ids: map.CRITICAL_GAPS.map((gap) => gap.fact_id).sort(),
    suppressed: reason !== null,
    suppression_reason: reason
  };
}

export function buildDataAcquisitionResearchQueueV1(
  maps: DataAcquisitionCoverageMapV1[]
): DataAcquisitionResearchQueueV1 {
  const items = maps
    .map(toDataAcquisitionResearchQueueItemV1)
    .sort((a, b) => {
      const aMap = maps.find((map) => map.map_id === a.map_id)!;
      const bMap = maps.find((map) => map.map_id === b.map_id)!;
      return (
        Number(a.suppressed) - Number(b.suppressed) ||
        Number(requiresExplicitApproval(aMap)) - Number(requiresExplicitApproval(bMap)) ||
        highestMaterialityRank(aMap) - highestMaterialityRank(bMap) ||
        informationValueRank[a.value_of_information] - informationValueRank[b.value_of_information] ||
        effortRank[a.cost_or_effort_class] - effortRank[b.cost_or_effort_class] ||
        a.map_id.localeCompare(b.map_id)
      );
    });

  return {
    queue_version: DATA_ACQUISITION_RESEARCH_QUEUE_VERSION_V1,
    generated_from_map_ids: maps.map((map) => map.map_id).sort(),
    items,
    keegan_action_required: "NO"
  };
}
