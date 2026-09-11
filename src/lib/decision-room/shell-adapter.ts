import type { AskJeevesControlV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import type { DecisionRoomViewModelV1 } from "./contracts";

export type DecisionRoomDashboardModelV1 =
  | DecisionRoomViewModelV1
  | {
      decision_id: string;
      contextual_ask: AskJeevesControlV1;
    };

function isDecisionRoomViewModelV1(decision: DecisionRoomDashboardModelV1): decision is DecisionRoomViewModelV1 {
  return "contract_version" in decision && decision.contract_version === "decision_room_view_model_v1";
}

function unavailableDecisionRoom(decisionId: string): DecisionRoomViewModelV1 {
  return {
    contract_version: "decision_room_view_model_v1",
    decision_id: decisionId,
    generated_at: "UNKNOWN",
    source_mode: "LIVE_DASHBOARD_OVERVIEW",
    breadcrumb: ["Decision Room"],
    current_recommendation: {
      recommendation_id: `${decisionId}-unavailable`,
      title: "Decision evidence unavailable",
      summary: "No canonical decision record is available for this room.",
      next_action: "Connect or refresh canonical decision evidence before acting."
    },
    confidence: "insufficient_evidence",
    evidence_refs: [
      {
        ref_id: `${decisionId}-missing-canonical-evidence`,
        label: "Canonical decision evidence",
        provenance: "DATA_CONFIDENCE",
        truth_state: "UNKNOWN",
        detail: "No canonical DecisionRoomViewModelV1 was supplied."
      }
    ],
    assumptions_unknowns: [
      {
        assumption_id: `${decisionId}-canonical-input-required`,
        label: "Canonical decision input required",
        truth_state: "UNKNOWN",
        evidence_refs: [`${decisionId}-missing-canonical-evidence`],
        why_it_matters: "A recommendation cannot be shown from legacy or fixture-backed defaults."
      }
    ],
    alternatives: [],
    opportunity_cost_note: "UNKNOWN until canonical decision evidence is available.",
    specialist_disagreement: [],
    strongest_argument_against: "UNKNOWN until canonical decision evidence is available.",
    weakest_assumption: {
      assumption_id: `${decisionId}-canonical-input-required`,
      label: "Canonical decision input required",
      truth_state: "UNKNOWN",
      evidence_refs: [`${decisionId}-missing-canonical-evidence`],
      why_it_matters: "A recommendation cannot be shown from legacy or fixture-backed defaults."
    },
    WHAT_WOULD_CHANGE_MY_MIND: ["A current canonical decision record with evidence provenance."],
    next_action: "Connect or refresh canonical decision evidence before acting.",
    approval_class: "L0_INSIGHT",
    challenge: {
      active: false,
      red_team_summary: "No challenge is available without canonical decision evidence.",
      recommendation_overwritten: false,
      disagreement_visible: true
    }
  };
}

export function toDecisionRoomViewModelV1(decision: DecisionRoomDashboardModelV1): DecisionRoomViewModelV1 {
  if (isDecisionRoomViewModelV1(decision)) return decision;
  return unavailableDecisionRoom(decision.decision_id);
}
