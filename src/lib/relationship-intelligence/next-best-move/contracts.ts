import type { RelationshipTruthStateV1 } from "@/lib/relationship-intelligence/contracts";

export const RELATIONSHIP_NEXT_BEST_MOVE_VERSION_V1 = "relationship_next_best_move_v1.0" as const;
export const RELATIONSHIP_NEXT_BEST_MOVE_VIEW_VERSION_V1 = "relationship_next_best_move_view_v1.0" as const;

export type RelationshipNextBestMoveEvidenceStateV1 = RelationshipTruthStateV1;
export type RelationshipInteractionFreshnessV1 = "FRESH" | "STALE" | "UNKNOWN" | "CONFLICTED";

export type RelationshipNextBestMoveTargetInputV1 = {
  target_id: string;
  target_label: string;
  crm_segment: "COLLECTOR" | "CULTURAL_BRIDGE" | "MEDIA_PLATFORM" | "BRAND_PARTNER" | "UNKNOWN";
  relationship_state: RelationshipNextBestMoveEvidenceStateV1;
  relationship_state_detail: string;
  warm_path: {
    introducer_name: string | null;
    path_detail: string;
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
  };
  last_meaningful_interaction: {
    happened_at: string | null;
    label: string;
    freshness: RelationshipInteractionFreshnessV1;
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
  };
  active_ask_or_commitment: {
    summary: string | null;
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
  };
  why_relationship_matters: string;
  cultural_power_map_context: {
    role: "AMPLIFIER" | "BRIDGE" | "DECISION_MAKER" | "TASTE_SIGNAL" | "UNKNOWN";
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
    detail: string;
  };
  timing_window: {
    label: string | null;
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
    rationale: string;
  };
  key_unknown_or_blocker: string;
  evidence_refs: string[];
  what_would_change_the_recommendation: string[];
};

export type RelationshipNextBestMoveTargetViewV1 = {
  target_id: string;
  target_label: string;
  crm_segment: RelationshipNextBestMoveTargetInputV1["crm_segment"];
  relationship_state: RelationshipNextBestMoveEvidenceStateV1;
  relationship_state_detail: string;
  warm_path: {
    introducer_name: string | null;
    label: string;
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
  };
  last_meaningful_interaction: {
    happened_at: string | null;
    label: string;
    freshness: RelationshipInteractionFreshnessV1;
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
  };
  active_ask_or_commitment: {
    summary: string | null;
    evidence_state: RelationshipNextBestMoveEvidenceStateV1;
  };
  why_relationship_matters: string;
  cultural_power_map_context: RelationshipNextBestMoveTargetInputV1["cultural_power_map_context"];
  next_best_move: string;
  timing_window: RelationshipNextBestMoveTargetInputV1["timing_window"];
  key_unknown_or_blocker: string;
  evidence_refs: string[];
  what_would_change_the_recommendation: string[];
  dashboard_flags: {
    no_contact_strength_score: true;
    no_access_probability: true;
    no_outreach_performed: true;
    no_private_account_connection: true;
    no_durable_write: true;
    unknown_stale_conflicted_explicit: boolean;
  };
};

export type RelationshipNextBestMoveViewModelV1 = {
  view_version: typeof RELATIONSHIP_NEXT_BEST_MOVE_VIEW_VERSION_V1;
  generated_at: string;
  source_mode: "DETERMINISTIC_FIXTURE";
  targets: RelationshipNextBestMoveTargetViewV1[];
  strategy_engine_packet: {
    target_count: number;
    ready_for_internal_planning_count: number;
    blocked_or_unknown_count: number;
    next_moves: Array<{
      target_id: string;
      target_label: string;
      next_best_move: string;
      evidence_state: RelationshipNextBestMoveEvidenceStateV1;
      timing_window: string | null;
      key_unknown_or_blocker: string;
    }>;
  };
  dashboard_flags: {
    crm_workspace_consumable: true;
    strategy_engine_consumable: true;
    no_external_action: true;
    keegan_action_required: "NO";
  };
};
