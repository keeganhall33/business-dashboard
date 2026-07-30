import type { ActionLevel, ActionStatus } from "./action-contract";

export type Transition = {
  from_status: ActionStatus;
  to_status: ActionStatus;
  from_level: ActionLevel;
  to_level: ActionLevel;
};

export const VALID_TRANSITIONS: Transition[] = [
  // Core L0–L3 lifecycle
  { from_status: "recommended", to_status: "draft_prepared", from_level: "L1_RECOMMENDATION", to_level: "L2_DRAFT_PREPARED" },
  { from_status: "draft_prepared", to_status: "awaiting_approval", from_level: "L2_DRAFT_PREPARED", to_level: "L3_READY_FOR_APPROVAL" },
  { from_status: "awaiting_approval", to_status: "approved", from_level: "L3_READY_FOR_APPROVAL", to_level: "L4_APPROVED_FOR_EXECUTION" },
  { from_status: "awaiting_approval", to_status: "rejected", from_level: "L3_READY_FOR_APPROVAL", to_level: "L3_READY_FOR_APPROVAL" },
  { from_status: "awaiting_approval", to_status: "snoozed", from_level: "L3_READY_FOR_APPROVAL", to_level: "L3_READY_FOR_APPROVAL" },
  { from_status: "snoozed", to_status: "awaiting_approval", from_level: "L3_READY_FOR_APPROVAL", to_level: "L3_READY_FOR_APPROVAL" },
  { from_status: "approved", to_status: "execution_blocked", from_level: "L4_APPROVED_FOR_EXECUTION", to_level: "L4_APPROVED_FOR_EXECUTION" },

  // Synthetic measurement-only lane (no external execution)
  { from_status: "approved", to_status: "measuring", from_level: "L4_APPROVED_FOR_EXECUTION", to_level: "L5_EXECUTED_AND_MEASURED" },
  { from_status: "measuring", to_status: "successful", from_level: "L5_EXECUTED_AND_MEASURED", to_level: "L5_EXECUTED_AND_MEASURED" },
  { from_status: "measuring", to_status: "unsuccessful", from_level: "L5_EXECUTED_AND_MEASURED", to_level: "L5_EXECUTED_AND_MEASURED" },
  { from_status: "measuring", to_status: "inconclusive", from_level: "L5_EXECUTED_AND_MEASURED", to_level: "L5_EXECUTED_AND_MEASURED" },

  // Expiration + revalidation
  { from_status: "recommended", to_status: "expired", from_level: "L1_RECOMMENDATION", to_level: "L1_RECOMMENDATION" },
  { from_status: "draft_prepared", to_status: "expired", from_level: "L2_DRAFT_PREPARED", to_level: "L2_DRAFT_PREPARED" },
  { from_status: "awaiting_approval", to_status: "expired", from_level: "L3_READY_FOR_APPROVAL", to_level: "L3_READY_FOR_APPROVAL" },
  { from_status: "approved", to_status: "expired", from_level: "L4_APPROVED_FOR_EXECUTION", to_level: "L4_APPROVED_FOR_EXECUTION" },
  { from_status: "recommended", to_status: "needs_revalidation", from_level: "L1_RECOMMENDATION", to_level: "L1_RECOMMENDATION" },
  { from_status: "draft_prepared", to_status: "needs_revalidation", from_level: "L2_DRAFT_PREPARED", to_level: "L2_DRAFT_PREPARED" },
  { from_status: "awaiting_approval", to_status: "needs_revalidation", from_level: "L3_READY_FOR_APPROVAL", to_level: "L3_READY_FOR_APPROVAL" },
  { from_status: "snoozed", to_status: "needs_revalidation", from_level: "L3_READY_FOR_APPROVAL", to_level: "L3_READY_FOR_APPROVAL" },
  { from_status: "needs_revalidation", to_status: "awaiting_approval", from_level: "L3_READY_FOR_APPROVAL", to_level: "L3_READY_FOR_APPROVAL" }
];

export function isValidTransition(input: {
  from_status: ActionStatus;
  to_status: ActionStatus;
  from_level: ActionLevel;
  to_level: ActionLevel;
}): boolean {
  return VALID_TRANSITIONS.some(
    (t) =>
      t.from_status === input.from_status &&
      t.to_status === input.to_status &&
      t.from_level === input.from_level &&
      t.to_level === input.to_level
  );
}
