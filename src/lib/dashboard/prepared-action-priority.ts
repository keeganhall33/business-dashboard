import type { PreparedAction } from "@/lib/types/dashboard";
import { formatEstimatedImpact, formatRiskIfIgnored, isActionStale, isTestAction } from "./prepared-action-utils";

export type PrioritizedAction = PreparedAction & {
  priorityScore: number;
  priorityLabel: "do_next" | "review_soon" | "backlog" | "blocked";
  dataWarning?: string;
  expectedUpside?: string;
  riskIfIgnored?: string;
  isInternal?: boolean;
};

const RISK_WEIGHT: Record<PreparedAction["riskLevel"], number> = {
  high: 3,
  medium: 2,
  low: 1
};

const CONFIDENCE_WEIGHT: Record<PreparedAction["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1
};

const CATEGORY_WEIGHT: Record<PreparedAction["category"], number> = {
  product: 3,
  website: 3,
  email: 2,
  meta: 1,
  tracking: 1,
  collector: 2,
  operations: 1,
  partnership: 3
};

export function prioritizePreparedActions(actions: PreparedAction[]): PrioritizedAction[] {
  return actions.map((action) => {
    const result = computeScore(action);
    return {
      ...action,
      priorityScore: result.score,
      priorityLabel: labelForScore({ action, score: result.score, dataWarning: result.dataWarning, isInternal: result.isInternal }),
      dataWarning: result.dataWarning,
      expectedUpside: result.expectedUpside,
      riskIfIgnored: result.riskIfIgnored,
      isInternal: result.isInternal
    };
  });
}

function computeScore(action: PreparedAction) {
  let score = 0;
  score += RISK_WEIGHT[action.riskLevel] ?? 0;
  score += CONFIDENCE_WEIGHT[action.confidence] ?? 0;
  score += CATEGORY_WEIGHT[action.category] ?? 0;
  if (!action.dataLight) score += 1;
  if (action.sourcePanel === "social_content" || action.sourcePanel === "partnership_feed") score += 1;

  const estimatedUpside = formatEstimatedImpact(action);
  if (/\$|revenue|sales|deal|collector|partnership|audience/i.test(estimatedUpside)) {
    score += 2;
  }
  if (/outreach|deck|brief|call|follow|proposal/i.test(action.requiredApprovalAction ?? "")) {
    score += 1;
  }

  const stale = isActionStale(action);
  const isInternal = isTestAction(action);
  let dataWarning: string | undefined;
  if (stale) {
    score -= 2;
    dataWarning = "Source snapshot stale";
  }
  if (action.dataLight) {
    score -= 1;
    dataWarning = dataWarning ?? "Needs evidence";
  }
  if (isInternal) {
    score -= 3;
    dataWarning = dataWarning ?? "Internal/test action";
  }

  const createdAt = action.createdAt ? new Date(action.createdAt) : null;
  if (createdAt) {
    const ageDays = (Date.now() - createdAt.getTime()) / 86400000;
    if (ageDays <= 3) score += 2;
    else if (ageDays <= 7) score += 1;
    else score -= 1;
  }

  if (score < 0) score = 0;

  return {
    score,
    dataWarning,
    expectedUpside: estimatedUpside,
    riskIfIgnored: formatRiskIfIgnored(action),
    isInternal
  };
}

function labelForScore({
  action,
  score,
  dataWarning,
  isInternal
}: {
  action: PreparedAction;
  score: number;
  dataWarning?: string;
  isInternal: boolean;
}): PrioritizedAction["priorityLabel"] {
  if (isInternal) return "backlog";
  if (dataWarning === "Source snapshot stale") {
    return score >= 9 ? "review_soon" : "backlog";
  }
  if (action.dataLight && action.confidence === "low") return "blocked";
  if (score >= 11) return "do_next";
  if (score >= 7) return "review_soon";
  return "backlog";
}
