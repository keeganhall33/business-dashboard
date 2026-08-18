import type { DecisionRoomFixtureV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import type { DecisionRoomAssumptionV1, DecisionRoomViewModelV1 } from "./contracts";
import { DECISION_ROOM_FIXTURE_V1 } from "./fixtures";

export type DecisionRoomDashboardModelV1 = DecisionRoomViewModelV1 | DecisionRoomFixtureV1;

function isDecisionRoomViewModelV1(decision: DecisionRoomDashboardModelV1): decision is DecisionRoomViewModelV1 {
  return "contract_version" in decision && decision.contract_version === "decision_room_view_model_v1";
}

function legacyAssumptionToDecisionRoom(item: DecisionRoomFixtureV1["assumptions"][number]): DecisionRoomAssumptionV1 {
  return {
    assumption_id: item.id,
    label: item.label,
    truth_state: item.status === "KNOWN" ? "KNOWN" : item.status === "NEEDS_REVIEW" ? "CONFLICTED" : "UNKNOWN",
    evidence_refs: [],
    why_it_matters: item.status === "UNKNOWN" ? "UNKNOWN remains visible in the Decision Room." : "Legacy shell assumption carried forward."
  };
}

export function toDecisionRoomViewModelV1(decision: DecisionRoomDashboardModelV1): DecisionRoomViewModelV1 {
  if (isDecisionRoomViewModelV1(decision)) return decision;

  return {
    ...DECISION_ROOM_FIXTURE_V1,
    decision_id: decision.decision_id,
    breadcrumb: decision.breadcrumb,
    current_recommendation: {
      recommendation_id: decision.decision_id,
      title: decision.title.replace(/^Decision Room:\s*/i, ""),
      summary: decision.recommendation_summary,
      next_action: decision.primary_action
    },
    evidence_refs: decision.evidence.map((item) => ({
      ref_id: item.id,
      label: item.label,
      provenance: "MANUAL_FIXTURE",
      truth_state: /unknown/i.test(item.detail) ? "UNKNOWN" : "INFERRED",
      detail: item.detail
    })),
    assumptions_unknowns: decision.assumptions.map(legacyAssumptionToDecisionRoom),
    next_action: decision.primary_action
  };
}
