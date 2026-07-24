import type { PreparedAction } from "@/lib/types/dashboard";

const TEST_PATTERNS = [
  /\bdedupe\b/i,
  /phasea smoke/i,
  /smoke test/i,
  /seed run/i,
  /\bqa smoke\b/i,
  /\btest\b/i,
  /internal smoke/i,
  /demo-only/i,
  /playground check/i
];

export function isTestAction(action: PreparedAction) {
  const haystack = [action.title, action.dedupeKey, action.requiredApprovalAction, action.sourcePanel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return TEST_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function actionSnapshotStalenessHours(action: PreparedAction) {
  if (!action.sourceSnapshotAt) return Number.POSITIVE_INFINITY;
  const ts = new Date(action.sourceSnapshotAt).getTime();
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return (Date.now() - ts) / 36e5;
}

export function isActionStale(action: PreparedAction, thresholdHours = 72) {
  return actionSnapshotStalenessHours(action) > thresholdHours;
}

export function formatEstimatedImpact(action: PreparedAction) {
  if (action.estimatedImpact?.trim()) return action.estimatedImpact.trim();
  const why = action.whyItMatters ?? "";
  if (/\$[0-9]/.test(why)) return why;
  switch (action.riskLevel) {
    case "high":
      return "High upside if executed promptly";
    case "medium":
      return "Meaningful lift if actioned";
    default:
      return "Incremental improvement";
  }
}

export function formatRiskIfIgnored(action: PreparedAction) {
  switch (action.riskLevel) {
    case "high":
      return "High risk: delaying could cost revenue or prestige.";
    case "medium":
      return "Moderate risk: momentum could cool off.";
    default:
      return "Low risk if delayed, but still worth logging.";
  }
}
