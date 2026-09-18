import type { ExecutiveHomeFixtureV1, ExecutiveCommandCenterTruthStateV1 } from "@/lib/executive-home/fixtures";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

type ApprovalEvidenceStateV1 = "KNOWN" | "UNKNOWN" | "CONFLICTED";

type ApprovalEvidenceV1 = {
  state: ApprovalEvidenceStateV1;
  actionQueueCount: number | null;
  bottleneckCount: number | null;
};

function validCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function evaluateExecutiveApprovalEvidenceV1(
  overview: DashboardOverviewResponse
): ApprovalEvidenceV1 {
  const actionQueueCount = validCount(overview.actionQueue?.needsApprovalTasks?.count);
  const bottleneckCount = validCount(overview.approvalBottlenecks?.pendingCount);

  if (actionQueueCount == null && bottleneckCount == null) {
    return { state: "UNKNOWN", actionQueueCount, bottleneckCount };
  }

  if (
    actionQueueCount != null &&
    bottleneckCount != null &&
    actionQueueCount !== bottleneckCount
  ) {
    return { state: "CONFLICTED", actionQueueCount, bottleneckCount };
  }

  return { state: "KNOWN", actionQueueCount, bottleneckCount };
}

function commandTruthState(state: ApprovalEvidenceStateV1): ExecutiveCommandCenterTruthStateV1 {
  return state === "CONFLICTED" ? "CONFLICTED" : "UNKNOWN";
}

/**
 * Final fail-closed guard for the canonical Executive Home route.
 *
 * The legacy overview adapter historically collapsed missing approval evidence to
 * zero. That is unsafe at the executive surface because "no approval required"
 * is a material claim. This guard leaves verified counts untouched, but rewrites
 * only approval-related surfaces when the two canonical overview signals are
 * absent or disagree.
 *
 * This function is a pure projection. It does not approve, execute, persist, or
 * contact anyone.
 */
export function enforceExecutiveApprovalTruthV1<
  T extends { home: ExecutiveHomeFixtureV1 }
>(projection: T, overview: DashboardOverviewResponse): T {
  const evidence = evaluateExecutiveApprovalEvidenceV1(overview);
  if (evidence.state === "KNOWN") return projection;

  const conflicted = evidence.state === "CONFLICTED";
  const anyPositive =
    (evidence.actionQueueCount ?? 0) > 0 || (evidence.bottleneckCount ?? 0) > 0;
  const truthState = commandTruthState(evidence.state);
  const label = conflicted ? "Approval counts conflict" : "Approval status unknown";
  const detail = conflicted
    ? `Approval sources disagree (action queue=${evidence.actionQueueCount ?? "UNKNOWN"}, bottlenecks=${evidence.bottleneckCount ?? "UNKNOWN"}). Review the canonical approval queue before any external or irreversible action.`
    : "The live overview did not provide a valid approval count. Executive Home cannot claim that no Keegan approval is required.";

  const guardedHome: ExecutiveHomeFixtureV1 = {
    ...projection.home,
    command_center: {
      ...projection.home.command_center,
      kpis: projection.home.command_center.kpis.map((item) =>
        item.id === "keegan-review"
          ? {
              ...item,
              value: label,
              detail,
              trend: [],
              truth_state: truthState,
              last_updated: null,
              source: conflicted ? "conflicting approval sources" : "approval evidence unavailable"
            }
          : item
      ),
      keegan_actions: projection.home.command_center.keegan_actions.map((item) =>
        item.id === "approval-queue"
          ? {
              ...item,
              label,
              approval_state: anyPositive ? "KEEGAN_ACTION_REQUIRED" : "NONE",
              detail
            }
          : item
      ),
      intelligence_engine: projection.home.command_center.intelligence_engine.map((item) =>
        item.id === "execution"
          ? {
              ...item,
              status: conflicted ? "Approval evidence conflicted" : "Approval evidence unavailable",
              truth_state: truthState
            }
          : item
      )
    },
    cards: projection.home.cards.map((card) =>
      card.section === "KEEGAN_ACTION_REQUIRED"
        ? {
            ...card,
            title: label,
            summary: detail,
            state: conflicted ? "CONFLICTED" : "UNKNOWN",
            priority: anyPositive ? "DO_NOW" : "MONITOR",
            confidence: conflicted ? "LOW" : "UNKNOWN",
            approval_state: anyPositive ? "KEEGAN_ACTION_REQUIRED" : "NONE",
            freshness: "UNKNOWN",
            specialist_domain: "OPERATIONS",
            why: conflicted
              ? "Conflicting approval counts are preserved instead of choosing one source or coercing the result to zero."
              : "Unavailable approval evidence is preserved instead of coercing a missing count to zero.",
            evidence: conflicted
              ? [
                  `actionQueue.needsApprovalTasks.count=${evidence.actionQueueCount ?? "UNKNOWN"}`,
                  `approvalBottlenecks.pendingCount=${evidence.bottleneckCount ?? "UNKNOWN"}`
                ]
              : ["No valid approval count was present in the live dashboard overview."],
            next_action: anyPositive
              ? "Review the canonical approval queue before external or irreversible action."
              : "Verify approval-queue evidence before treating the queue as clear."
          }
        : card
    )
  };

  return { ...projection, home: guardedHome };
}
