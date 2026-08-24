import {
  RELATIONSHIP_NEXT_BEST_MOVE_VIEW_VERSION_V1,
  type RelationshipNextBestMoveTargetInputV1,
  type RelationshipNextBestMoveTargetViewV1,
  type RelationshipNextBestMoveViewModelV1
} from "./contracts";

function hasExplicitRiskState(input: RelationshipNextBestMoveTargetInputV1): boolean {
  const states = [
    input.relationship_state,
    input.warm_path.evidence_state,
    input.last_meaningful_interaction.evidence_state,
    input.last_meaningful_interaction.freshness,
    input.active_ask_or_commitment.evidence_state,
    input.cultural_power_map_context.evidence_state,
    input.timing_window.evidence_state
  ];
  return states.some((state) => state === "UNKNOWN" || state === "STALE" || state === "CONFLICTED");
}

function nextBestMoveFor(input: RelationshipNextBestMoveTargetInputV1): string {
  if (input.relationship_state === "CONFLICTED" || input.warm_path.evidence_state === "CONFLICTED") {
    return "Resolve the conflicting relationship evidence before planning any outreach.";
  }
  if (input.warm_path.evidence_state === "KNOWN" && input.warm_path.introducer_name) {
    return `Prepare an internal value brief for ${input.warm_path.introducer_name} to review before any ask is made.`;
  }
  if (input.last_meaningful_interaction.freshness === "STALE" || input.relationship_state === "STALE") {
    return "Refresh the relationship context privately before deciding whether any ask is appropriate.";
  }
  if (input.warm_path.evidence_state === "UNKNOWN") {
    return "Map the missing warm path and define the smallest credible reason this relationship should care.";
  }
  return "Hold for internal planning until the relationship evidence supports a specific next move.";
}

function targetViewFor(input: RelationshipNextBestMoveTargetInputV1): RelationshipNextBestMoveTargetViewV1 {
  return {
    target_id: input.target_id,
    target_label: input.target_label,
    crm_segment: input.crm_segment,
    relationship_state: input.relationship_state,
    relationship_state_detail: input.relationship_state_detail,
    warm_path: {
      introducer_name: input.warm_path.introducer_name,
      label: input.warm_path.introducer_name
        ? `${input.warm_path.introducer_name}: ${input.warm_path.path_detail}`
        : input.warm_path.path_detail,
      evidence_state: input.warm_path.evidence_state
    },
    last_meaningful_interaction: { ...input.last_meaningful_interaction },
    active_ask_or_commitment: { ...input.active_ask_or_commitment },
    why_relationship_matters: input.why_relationship_matters,
    cultural_power_map_context: { ...input.cultural_power_map_context },
    next_best_move: nextBestMoveFor(input),
    timing_window: { ...input.timing_window },
    key_unknown_or_blocker: input.key_unknown_or_blocker,
    evidence_refs: [...input.evidence_refs].sort(),
    what_would_change_the_recommendation: [...input.what_would_change_the_recommendation],
    dashboard_flags: {
      no_contact_strength_score: true,
      no_access_probability: true,
      no_outreach_performed: true,
      no_private_account_connection: true,
      no_durable_write: true,
      unknown_stale_conflicted_explicit: hasExplicitRiskState(input)
    }
  };
}

export function buildRelationshipNextBestMoveViewModelV1(input: {
  targets: RelationshipNextBestMoveTargetInputV1[];
  generatedAt?: string;
}): RelationshipNextBestMoveViewModelV1 {
  const targets = input.targets.map(targetViewFor).sort((a, b) => a.target_id.localeCompare(b.target_id));
  const ready = targets.filter((target) => (
    target.relationship_state === "KNOWN" &&
    target.warm_path.evidence_state === "KNOWN" &&
    target.last_meaningful_interaction.freshness !== "STALE" &&
    target.active_ask_or_commitment.evidence_state !== "CONFLICTED"
  ));

  return {
    view_version: RELATIONSHIP_NEXT_BEST_MOVE_VIEW_VERSION_V1,
    generated_at: input.generatedAt ?? "2026-08-24T00:00:00.000Z",
    source_mode: "DETERMINISTIC_FIXTURE",
    targets,
    strategy_engine_packet: {
      target_count: targets.length,
      ready_for_internal_planning_count: ready.length,
      blocked_or_unknown_count: targets.length - ready.length,
      next_moves: targets.map((target) => ({
        target_id: target.target_id,
        target_label: target.target_label,
        next_best_move: target.next_best_move,
        evidence_state: target.relationship_state,
        timing_window: target.timing_window.label,
        key_unknown_or_blocker: target.key_unknown_or_blocker
      }))
    },
    dashboard_flags: {
      crm_workspace_consumable: true,
      strategy_engine_consumable: true,
      no_external_action: true,
      keegan_action_required: "NO"
    }
  };
}
