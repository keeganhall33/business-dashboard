import type { ActionLevel } from "@/lib/actions/action-contract";
import type { ExecutiveActionQueueItemV1, StrategyTruthStateV1 } from "@/lib/strategy-engine/executive-action-queue-v1";
import { executiveActionQueueGoldenFixtureV1, formatExpectedUpsideRange } from "@/lib/strategy-engine/executive-action-queue-v1";

export type ActionWorkspaceDecisionStateV1 = "READY_FOR_REVIEW" | "APPROVE_DEMO" | "REJECT_DEMO" | "DEFER_DEMO";

export type ActionWorkspaceV1 = {
  workspace_id: string;
  source_action_id: string;
  OBJECTIVE: string;
  WHY_NOW: string;
  RECOMMENDATION: string;
  EVIDENCE: Array<{ id: string; label: string; source: string; note: string }>;
  CONFIDENCE_UNKNOWN: {
    confidence: string;
    truth_state: StrategyTruthStateV1;
    unknowns: string[];
    stale_or_conflicted: string[];
  };
  EXPECTED_UPSIDE: string;
  RISK: string;
  NEXT_ACTION: string;
  OWNER: string;
  APPROVAL_CLASS: ActionLevel;
  DEPENDENCIES: string[];
  SUCCESS_METRIC: string;
  EVALUATION_DATE: string;
  demo_controls: {
    enabled: true;
    non_mutating: true;
    states: ActionWorkspaceDecisionStateV1[];
  };
  keegan_action_required: "NO";
};

function riskFor(item: ExecutiveActionQueueItemV1): string {
  if (item.TRUTH_STATE === "UNKNOWN") return `UNKNOWN: ${item.KEY_UNCERTAINTY}`;
  if (item.APPROVAL_CLASS === "L2_DRAFT_PREPARED" || item.APPROVAL_CLASS === "L3_READY_FOR_APPROVAL") {
    return "Approval is required before any execution, spend, outreach, publishing, pricing, or production mutation.";
  }
  return item.WHAT_WOULD_CHANGE_THE_RECOMMENDATION;
}

export function toActionWorkspaceV1(item: ExecutiveActionQueueItemV1): ActionWorkspaceV1 {
  return {
    workspace_id: `action-workspace-${item.ACTION_ID}`,
    source_action_id: item.ACTION_ID,
    OBJECTIVE: item.WHY_IT_MATTERS,
    WHY_NOW: `${item.TIME_SENSITIVITY}: ${item.WHAT_CHANGED}`,
    RECOMMENDATION: item.RECOMMENDED_ACTION,
    EVIDENCE: item.EVIDENCE_REFS.map((evidence) => ({
      id: evidence.id,
      label: evidence.label,
      source: evidence.source,
      note: evidence.details?.fixture ? "Fixture evidence for read-only review." : "Evidence attached to recommendation."
    })),
    CONFIDENCE_UNKNOWN: {
      confidence: item.DISPLAY.confidence_label,
      truth_state: item.TRUTH_STATE,
      unknowns: item.TRUTH_STATE === "UNKNOWN" ? [item.KEY_UNCERTAINTY] : [],
      stale_or_conflicted: item.TRUTH_STATE === "UNKNOWN" ? ["UNKNOWN remains explicit; no false certainty."] : []
    },
    EXPECTED_UPSIDE: formatExpectedUpsideRange(item.EXPECTED_UPSIDE_RANGE),
    RISK: riskFor(item),
    NEXT_ACTION: item.NEXT_STEP,
    OWNER: item.DISPLAY.owner_label,
    APPROVAL_CLASS: item.APPROVAL_CLASS,
    DEPENDENCIES: item.EXPECTED_UPSIDE_RANGE.assumptions,
    SUCCESS_METRIC: item.SUCCESS_METRIC,
    EVALUATION_DATE: item.EVALUATION_WINDOW.end,
    demo_controls: {
      enabled: true,
      non_mutating: true,
      states: ["READY_FOR_REVIEW", "APPROVE_DEMO", "REJECT_DEMO", "DEFER_DEMO"]
    },
    keegan_action_required: "NO"
  };
}

export const ACTION_WORKSPACE_FIXTURE_V1 = toActionWorkspaceV1(executiveActionQueueGoldenFixtureV1.items[0]);
export const ACTION_WORKSPACE_UNKNOWN_FIXTURE_V1 = toActionWorkspaceV1(executiveActionQueueGoldenFixtureV1.items[2]);
