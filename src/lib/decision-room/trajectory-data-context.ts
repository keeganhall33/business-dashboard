import type { DecisionRoomStrategicContextV1, DecisionRoomViewModelV1 } from "./contracts";

function cloneDecisionRoomStrategicContextV1(
  input: DecisionRoomStrategicContextV1
): DecisionRoomStrategicContextV1 {
  return {
    trajectory: {
      ...input.trajectory,
      preferred_path: { ...input.trajectory.preferred_path },
      what_to_ignore: [...input.trajectory.what_to_ignore],
      fog_of_war: [...input.trajectory.fog_of_war]
    },
    acquisition: {
      ...input.acquisition,
      critical_gap: input.acquisition.critical_gap
        ? { ...input.acquisition.critical_gap }
        : null,
      next_best_acquisition_action: {
        ...input.acquisition.next_best_acquisition_action
      },
      conflicts: input.acquisition.conflicts.map((conflict) => ({ ...conflict }))
    }
  };
}

export function buildDecisionRoomStrategicContextV1(
  canonicalInput?: DecisionRoomStrategicContextV1
): DecisionRoomStrategicContextV1 | undefined {
  if (!canonicalInput) return undefined;
  return cloneDecisionRoomStrategicContextV1(canonicalInput);
}

export function withDecisionRoomStrategicContextV1(
  decision: DecisionRoomViewModelV1,
  canonicalInput?: DecisionRoomStrategicContextV1
): DecisionRoomViewModelV1 {
  const strategicContext = buildDecisionRoomStrategicContextV1(canonicalInput);
  if (!strategicContext) {
    const { strategic_context: _unsupportedContext, ...withoutContext } = decision;
    return withoutContext;
  }

  return {
    ...decision,
    strategic_context: strategicContext
  };
}
