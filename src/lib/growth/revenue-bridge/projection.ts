import { REVENUE_BRIDGE_PROJECTION_VERSION_V1, type RevenueBridgeProjectionV1, type RevenueBridgeSnapshotV1 } from "./contracts";

export function toRevenueBridgeProjectionV1(snapshot: RevenueBridgeSnapshotV1): RevenueBridgeProjectionV1 {
  const orderedPaths = snapshot.PATH_ORDER.map((pathId) => {
    const path = snapshot.PATHS.find((item) => item.path_id === pathId);
    if (!path) throw new Error(`REVENUE_BRIDGE_PATH_ORDER_UNKNOWN_PATH:${pathId}`);
    return path;
  });

  if (!orderedPaths.length) {
    throw new Error("REVENUE_BRIDGE_EMPTY_PATHS");
  }

  return {
    view_version: REVENUE_BRIDGE_PROJECTION_VERSION_V1,
    bridge_id: snapshot.bridge_id,
    target_state: snapshot.TARGET_STATE,
    current_trajectory: snapshot.CURRENT_TRAJECTORY,
    gap: snapshot.GAP,
    ordered_paths: orderedPaths.map((path) => ({
      path_id: path.path_id,
      label: path.label,
      kind: path.kind,
      stage: path.stage,
      why_it_matters: path.WHY_IT_MATTERS,
      revenue_contribution_range: path.revenue_contribution_range,
      artist_hours_required_range: path.artist_hours_required_range,
      bottleneck: path.BOTTLENECK,
      next_milestone: path.NEXT_MILESTONE,
      leading_indicators: [...path.LEADING_INDICATORS],
      what_would_change_path: [...path.WHAT_WOULD_CHANGE_PATH],
      truth_state: path.truth_state,
      confidence: path.confidence
    })),
    bottleneck: snapshot.BOTTLENECK,
    next_milestone: snapshot.NEXT_MILESTONE,
    leading_indicators: [...snapshot.LEADING_INDICATORS],
    what_would_change_path: [...snapshot.WHAT_WOULD_CHANGE_PATH],
    truth_state: snapshot.truth_state,
    confidence: snapshot.confidence,
    keegan_action_required: "NO"
  };
}
