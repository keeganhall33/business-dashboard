import type { OrchestrationTaskStatus } from "./types";

const TRANSITIONS: Record<OrchestrationTaskStatus, OrchestrationTaskStatus[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["RUNNING", "CANCELLED"],
  RUNNING: ["BLOCKED", "AWAITING_REVIEW", "AWAITING_HUMAN_APPROVAL", "FAILED"],
  BLOCKED: ["READY", "CANCELLED", "FAILED"],
  AWAITING_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "FAILED"],
  CHANGES_REQUESTED: ["READY", "CANCELLED"],
  APPROVED: ["COMPLETED"],
  AWAITING_HUMAN_APPROVAL: ["READY", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: []
};

export function canTransition(from: OrchestrationTaskStatus, to: OrchestrationTaskStatus) {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrchestrationTaskStatus, to: OrchestrationTaskStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} -> ${to}`);
  }
}

export const MAX_AUTONOMOUS_REVIEW_ITERATIONS_DEFAULT = 2;

