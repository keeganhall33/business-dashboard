import type {
  ExecutiveGoalsCapacityViewModelV1,
  GoalsPortfolioCapacitySnapshotV1,
  PortfolioConflictSeverityV1
} from "./contracts";

const severityOrder: Record<PortfolioConflictSeverityV1, number> = {
  NONE: 0,
  WATCH: 1,
  BLOCKING: 2
};

function highestConflictSeverity(snapshot: GoalsPortfolioCapacitySnapshotV1): PortfolioConflictSeverityV1 {
  return snapshot.conflicts.reduce<PortfolioConflictSeverityV1>(
    (highest, conflict) => (severityOrder[conflict.severity] > severityOrder[highest] ? conflict.severity : highest),
    "NONE"
  );
}

export function toExecutiveGoalsCapacityViewModelV1(
  snapshot: GoalsPortfolioCapacitySnapshotV1
): ExecutiveGoalsCapacityViewModelV1 {
  const severity = highestConflictSeverity(snapshot);
  const firstConflict = snapshot.conflicts.find((item) => item.severity === severity);

  return {
    view_version: "executive_goals_capacity_view_v1.0",
    snapshot_id: snapshot.snapshot_id,
    headline: `${snapshot.ACTIVE_BETS.length} active strategic bets; bottleneck: ${snapshot.CURRENT_BOTTLENECK}.`,
    portfolio_state: snapshot.ATTENTION_CAPACITY_LOAD.state,
    active_bets: snapshot.ACTIVE_BETS.map((bet) => ({
      bet_id: bet.bet_id,
      title: bet.title,
      confidence: bet.CONFIDENCE.level,
      current_bottleneck: bet.CURRENT_BOTTLENECK,
      next_action: bet.NEXT_PORTFOLIO_ACTION.label,
      cash_requirement: bet.CASH_REQUIREMENT_RANGE,
      creative_hours: bet.CREATIVE_HOURS_RANGE,
      qualitative_upside: bet.EXPECTED_UPSIDE.qualitative_objectives.map((objective) => objective.label),
      what_to_ignore: bet.WHAT_TO_IGNORE
    })).sort((a, b) => a.bet_id.localeCompare(b.bet_id)),
    overload_or_conflict: {
      visible: severity !== "NONE" || snapshot.ATTENTION_CAPACITY_LOAD.state === "OVERLOADED",
      severity,
      summary: firstConflict?.summary ?? (snapshot.ATTENTION_CAPACITY_LOAD.state === "OVERLOADED" ? snapshot.CURRENT_BOTTLENECK : "No overload conflict in this fixture.")
    },
    what_to_ignore: snapshot.WHAT_TO_IGNORE,
    next_portfolio_action: snapshot.NEXT_PORTFOLIO_ACTION.label,
    keegan_action_required: "NO"
  };
}

export function toExecutiveGoalsCapacityViewModelsV1(
  snapshots: GoalsPortfolioCapacitySnapshotV1[]
): ExecutiveGoalsCapacityViewModelV1[] {
  return snapshots.map(toExecutiveGoalsCapacityViewModelV1).sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id));
}
