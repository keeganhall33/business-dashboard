import { DATA_ACQUISITION_COVERAGE_FIXTURES_V1 } from "@/lib/data-acquisition/fixtures";
import { STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1 } from "@/lib/strategic-trajectory/fixtures";
import { toStrategicTrajectoryViewModelV1 } from "@/lib/strategic-trajectory/view-model";
import type { DecisionRoomStrategicContextV1, DecisionRoomViewModelV1 } from "./contracts";

const DECISION_CRITICAL_PUBLIC_RESEARCH_MAP_ID = "coverage-missing-public-research";

export function buildDecisionRoomStrategicContextV1(): DecisionRoomStrategicContextV1 {
  const trajectory = toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1);
  const acquisition = DATA_ACQUISITION_COVERAGE_FIXTURES_V1.find(
    (map) => map.map_id === DECISION_CRITICAL_PUBLIC_RESEARCH_MAP_ID
  );

  if (!acquisition) {
    throw new Error(`Missing data acquisition fixture ${DECISION_CRITICAL_PUBLIC_RESEARCH_MAP_ID}`);
  }

  const criticalGap = acquisition.CRITICAL_GAPS[0] ?? null;

  return {
    trajectory: {
      trajectory_id: trajectory.trajectory_id,
      target_state: trajectory.target_state,
      preferred_path: {
        path_id: trajectory.preferred_path.path_id,
        label: trajectory.preferred_path.label,
        why_preferred: trajectory.preferred_path.why_preferred_or_not
      },
      current_bottleneck: trajectory.current_bottleneck,
      next_high_leverage_move: trajectory.next_high_leverage_move,
      what_to_ignore: trajectory.what_to_ignore,
      fog_of_war: trajectory.fog_of_war,
      scouting_action: trajectory.scouting_action
    },
    acquisition: {
      map_id: acquisition.map_id,
      decision_or_capability: acquisition.DECISION_OR_CAPABILITY,
      coverage_state: acquisition.COVERAGE_STATE,
      source_health: acquisition.SOURCE_HEALTH,
      freshness: acquisition.FRESHNESS,
      approval_class: acquisition.APPROVAL_CLASS,
      critical_gap: criticalGap
        ? {
            fact_id: criticalGap.fact_id,
            materiality: criticalGap.materiality,
            coverage_state: criticalGap.coverage_state,
            truth_state: criticalGap.truth_state,
            why_it_matters: criticalGap.why_it_matters
          }
        : null,
      next_best_acquisition_action: {
        action_id: acquisition.NEXT_BEST_ACQUISITION_ACTION.action_id,
        label: acquisition.NEXT_BEST_ACQUISITION_ACTION.label,
        safety: acquisition.NEXT_BEST_ACQUISITION_ACTION.safety,
        rationale: acquisition.NEXT_BEST_ACQUISITION_ACTION.rationale
      },
      conflicts: acquisition.CONFLICTS.map((conflict) => ({
        conflict_id: conflict.conflict_id,
        summary: conflict.summary,
        resolution_action: conflict.resolution_action
      }))
    }
  };
}

export function withDecisionRoomStrategicContextV1(
  decision: DecisionRoomViewModelV1
): DecisionRoomViewModelV1 {
  return {
    ...decision,
    strategic_context: buildDecisionRoomStrategicContextV1()
  };
}
