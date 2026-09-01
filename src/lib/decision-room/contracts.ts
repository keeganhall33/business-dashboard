import type { ActionLevel } from "@/lib/actions/action-contract";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { DecisionConversationViewModelV1 } from "@/components/intelligence/conversation/DecisionConversationViewModel";
import type { RecommendationRevisionResultV1 } from "@/lib/decision-intelligence/revision/contracts";

export type DecisionRoomTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "CONFLICTED";
export type DecisionRoomEvidenceProvenanceV1 =
  | "STRATEGY_FIXTURE"
  | "EVIDENCE_TRUST_FIXTURE"
  | "LEARNING_FIXTURE"
  | "FINANCIAL_FIXTURE"
  | "MANUAL_FIXTURE"
  | "DASHBOARD_OVERVIEW"
  | "FUSION_GOVERNED_COMMAND"
  | "DATA_CONFIDENCE";
export type DecisionRoomSpecialistV1 = "STRATEGY" | "DATA_EVIDENCE" | "LEARNING" | "FINANCIAL";

export type DecisionRoomEvidenceRefV1 = {
  ref_id: string;
  label: string;
  provenance: DecisionRoomEvidenceProvenanceV1;
  truth_state: DecisionRoomTruthStateV1;
  detail: string;
};

export type DecisionRoomAssumptionV1 = {
  assumption_id: string;
  label: string;
  truth_state: DecisionRoomTruthStateV1;
  evidence_refs: string[];
  why_it_matters: string;
};

export type DecisionRoomAlternativeV1 = {
  alternative_id: string;
  label: string;
  tradeoff: string;
  evidence_refs: string[];
};

export type DecisionRoomSpecialistDisagreementV1 = {
  specialist: DecisionRoomSpecialistV1;
  stance: "SUPPORTS" | "CHALLENGES" | "NEEDS_MORE_EVIDENCE";
  summary: string;
  evidence_refs: string[];
  visible_in_dashboard: true;
};

export type DecisionRoomRecommendationV1 = {
  recommendation_id: string;
  title: string;
  summary: string;
  next_action: string;
};

export type DecisionRoomStrategicContextV1 = {
  trajectory: {
    trajectory_id: string;
    target_state: string;
    preferred_path: {
      path_id: string;
      label: string;
      why_preferred: string;
    };
    current_bottleneck: string;
    next_high_leverage_move: string;
    what_to_ignore: string[];
    fog_of_war: string[];
    scouting_action: string;
  };
  acquisition: {
    map_id: string;
    decision_or_capability: string;
    coverage_state: string;
    source_health: string;
    freshness: string;
    approval_class: string;
    critical_gap: {
      fact_id: string;
      materiality: string;
      coverage_state: string;
      truth_state: string;
      why_it_matters: string;
    } | null;
    next_best_acquisition_action: {
      action_id: string;
      label: string;
      safety: string;
      rationale: string;
    };
    conflicts: Array<{
      conflict_id: string;
      summary: string;
      resolution_action: string;
    }>;
  };
};

export type DecisionRoomViewModelV1 = {
  contract_version: "decision_room_view_model_v1";
  decision_id: string;
  generated_at: string;
  source_mode: "DETERMINISTIC_FIXTURE" | "LIVE_DASHBOARD_OVERVIEW";
  breadcrumb: string[];
  current_recommendation: DecisionRoomRecommendationV1;
  confidence: ExplanationConfidence;
  evidence_refs: DecisionRoomEvidenceRefV1[];
  assumptions_unknowns: DecisionRoomAssumptionV1[];
  alternatives: DecisionRoomAlternativeV1[];
  opportunity_cost_note: string;
  specialist_disagreement: DecisionRoomSpecialistDisagreementV1[];
  strongest_argument_against: string;
  weakest_assumption: DecisionRoomAssumptionV1;
  WHAT_WOULD_CHANGE_MY_MIND: string[];
  next_action: string;
  approval_class: ActionLevel;
  strategic_context?: DecisionRoomStrategicContextV1;
  conversation_revision?: {
    conversation: DecisionConversationViewModelV1;
    new_information_preview: DecisionConversationViewModelV1;
    recommendation_revision: RecommendationRevisionResultV1;
  };
  challenge: {
    active: boolean;
    red_team_summary: string;
    recommendation_overwritten: false;
    disagreement_visible: true;
  };
};
