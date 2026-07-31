import type { ExecutionState } from "@/lib/actions/execution/adapter-contract";

export type ExecutionTransition = { from: ExecutionState; to: ExecutionState };

export const VALID_EXECUTION_TRANSITIONS: ExecutionTransition[] = [
  { from: "requested", to: "dry_run_succeeded" },
  { from: "dry_run_succeeded", to: "confirmation_required" },
  { from: "confirmation_required", to: "confirmed" },

  { from: "confirmed", to: "queued" },
  { from: "queued", to: "started" },

  { from: "started", to: "succeeded" },
  { from: "started", to: "partial_succeeded" },
  { from: "started", to: "failed" },
  { from: "started", to: "timeout" },

  { from: "confirmed", to: "cancel_requested" },
  { from: "queued", to: "cancel_requested" },
  { from: "started", to: "cancel_requested" },
  { from: "cancel_requested", to: "cancelled" },

  { from: "failed", to: "rollback_requested" },
  { from: "partial_succeeded", to: "rollback_requested" },
  { from: "rollback_requested", to: "rolled_back" },
  { from: "rollback_requested", to: "rollback_failed" }
];

export function isValidExecutionTransition(input: { from: ExecutionState; to: ExecutionState }): boolean {
  if (input.to === "blocked") {
    // blocking is permitted from any active state
    return true;
  }
  return VALID_EXECUTION_TRANSITIONS.some((t) => t.from === input.from && t.to === input.to);
}
