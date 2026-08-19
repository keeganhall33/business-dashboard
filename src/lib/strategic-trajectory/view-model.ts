import {
  STRATEGIC_TRAJECTORY_VIEW_VERSION_V1,
  pathHasUnboundedDownside,
  type StrategicTrajectoryNewFactV1,
  type StrategicTrajectoryRevisionV1,
  type StrategicTrajectorySnapshotV1,
  type StrategicTrajectoryViewModelV1
} from "./contracts";

function selectPreferredPath(snapshot: StrategicTrajectorySnapshotV1) {
  const preferred = snapshot.PATHS.find((path) => path.status === "PREFERRED");
  if (!preferred) {
    throw new Error(`Strategic trajectory ${snapshot.trajectory_id} has no preferred path.`);
  }

  if (pathHasUnboundedDownside(preferred)) {
    throw new Error(`Strategic trajectory ${snapshot.trajectory_id} cannot prefer unbounded downside path ${preferred.path_id}.`);
  }

  return preferred;
}

export function applyStrategicTrajectoryNewFactV1(
  snapshot: StrategicTrajectorySnapshotV1,
  newFact: StrategicTrajectoryNewFactV1
): StrategicTrajectorySnapshotV1 {
  if (newFact.changes_preferred_path_to === null) return snapshot;

  const previous = selectPreferredPath(snapshot);
  const next = snapshot.PATHS.find((path) => path.path_id === newFact.changes_preferred_path_to);

  if (!next) {
    throw new Error(`New fact ${newFact.fact_id} points to unknown path ${newFact.changes_preferred_path_to}.`);
  }

  if (pathHasUnboundedDownside(next)) {
    throw new Error(`New fact ${newFact.fact_id} cannot make unbounded downside path ${next.path_id} preferred.`);
  }

  const revision: StrategicTrajectoryRevisionV1 = {
    revision_id: `${snapshot.trajectory_id}::${newFact.fact_id}`,
    previous_preferred_path_id: previous.path_id,
    new_preferred_path_id: next.path_id,
    trigger_fact_id: newFact.fact_id,
    previous_reason: previous.why_preferred_or_not,
    revision_reason: newFact.revision_reason,
    evidence_refs: [...newFact.evidence_refs].sort()
  };

  return {
    ...snapshot,
    PATHS: snapshot.PATHS.map((path) => {
      if (path.path_id === next.path_id) return { ...path, status: "PREFERRED" as const, why_preferred_or_not: newFact.revision_reason };
      if (path.path_id === previous.path_id) return { ...path, status: "VIABLE" as const };
      return path;
    }).sort((a, b) => a.path_id.localeCompare(b.path_id)),
    NEXT_HIGH_LEVERAGE_MOVE: `Act on revised path: ${next.label}. ${snapshot.SCOUTING_ACTION}`,
    PATH_REVISION_HISTORY: [...snapshot.PATH_REVISION_HISTORY, revision].sort((a, b) => a.revision_id.localeCompare(b.revision_id))
  };
}

export function toStrategicTrajectoryViewModelV1(
  snapshot: StrategicTrajectorySnapshotV1
): StrategicTrajectoryViewModelV1 {
  const preferredPath = selectPreferredPath(snapshot);

  return {
    view_version: STRATEGIC_TRAJECTORY_VIEW_VERSION_V1,
    trajectory_id: snapshot.trajectory_id,
    target_state: snapshot.TARGET_STATE,
    current_state: snapshot.CURRENT_STATE,
    required_assets: [...snapshot.REQUIRED_ASSETS].sort((a, b) => a.asset_id.localeCompare(b.asset_id)),
    current_bottleneck: snapshot.BOTTLENECK,
    preferred_path: preferredPath,
    viable_paths: snapshot.PATHS.filter((path) => path.status !== "REJECTED").sort((a, b) => a.path_id.localeCompare(b.path_id)),
    next_high_leverage_move: snapshot.NEXT_HIGH_LEVERAGE_MOVE,
    compounding_asset_created: snapshot.COMPOUNDING_ASSET_CREATED,
    fog_of_war: [...snapshot.FOG_OF_WAR],
    scouting_action: snapshot.SCOUTING_ACTION,
    what_to_ignore: [...snapshot.WHAT_TO_IGNORE],
    revision_trigger: snapshot.REVISION_TRIGGER,
    path_revision_history: [...snapshot.PATH_REVISION_HISTORY].sort((a, b) => a.revision_id.localeCompare(b.revision_id)),
    keegan_action_required: "NO",
    confidence: snapshot.confidence
  };
}
