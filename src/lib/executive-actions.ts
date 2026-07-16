import type { ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";

export function rankActions(actions: ExecutiveActionPlan[]) {
  return actions
    .slice()
    .sort((a, b) => (priorityScore(b) - priorityScore(a)) || (confidenceScore(b.confidence) - confidenceScore(a.confidence)));
}

export function formatConfidence(value: string) {
  if (!value) return "—";
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("high")) return "High";
  if (normalized.startsWith("medium")) return "Medium";
  if (normalized.startsWith("low")) return "Low";
  return value;
}

function priorityScore(action: ExecutiveActionPlan) {
  if (action.priority === "P1") return 3;
  if (action.priority === "P2") return 2;
  return 1;
}

function confidenceScore(value: string) {
  if (value?.toLowerCase().includes("high")) return 3;
  if (value?.toLowerCase().includes("medium")) return 2;
  return 1;
}
