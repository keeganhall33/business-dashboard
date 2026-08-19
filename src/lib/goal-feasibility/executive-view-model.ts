import {
  GOAL_FEASIBILITY_EXECUTIVE_VIEW_VERSION_V1,
  type GoalFeasibilityExecutiveViewModelV1,
  type GoalFeasibilitySnapshotV1
} from "./contracts";

export function toGoalFeasibilityExecutiveViewModelV1(snapshot: GoalFeasibilitySnapshotV1): GoalFeasibilityExecutiveViewModelV1 {
  const [topPath] = snapshot.PATHS;
  if (!topPath) {
    throw new Error("GOAL_FEASIBILITY_EMPTY_PATHS");
  }

  return {
    view_version: GOAL_FEASIBILITY_EXECUTIVE_VIEW_VERSION_V1,
    snapshot_id: snapshot.snapshot_id,
    target_state: snapshot.TARGET_STATE,
    preferred_path_order: [...snapshot.PREFERRED_PATH_ORDER],
    top_path: {
      path_id: topPath.path_id,
      strategy_kind: topPath.strategy_kind,
      feasibility_class: topPath.FEASIBILITY_CLASS,
      bottleneck: topPath.BIGGEST_BOTTLENECK,
      next_high_leverage_move: topPath.NEXT_HIGH_LEVERAGE_MOVE.action,
      confidence: topPath.CONFIDENCE
    },
    milestone_ladder: [...topPath.MILESTONE_LADDER].sort((a, b) => a.order - b.order),
    capacity_warning: snapshot.capacity_constrained_case.why_not_scalable.join(" "),
    what_would_change_the_path: [...topPath.WHAT_WOULD_CHANGE_THE_PATH],
    keegan_action_required: "NO"
  };
}
