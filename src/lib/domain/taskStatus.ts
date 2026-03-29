import type { TaskStatus } from "@/lib/types/requests";

const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_review", "approved", "rejected"],
  in_review: ["approved", "rejected", "blocked"],
  approved: ["in_progress", "blocked", "rejected"],
  in_progress: ["blocked", "completed"],
  blocked: ["in_review", "approved", "rejected"],
  completed: [],
  rejected: []
};

export function canTransitionTaskStatus(current: TaskStatus, next: TaskStatus) {
  return allowedTransitions[current]?.includes(next) ?? false;
}
