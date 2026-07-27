import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import { getMaterialMovements } from "@/lib/dashboard/executive-summary";

export type ForwardStrategyCopy = {
  risks: string[];
  nextAction: string;
};

export function buildForwardStrategyCopy(summary: ExecutiveSummary | null): ForwardStrategyCopy {
  if (!summary) {
    return {
      risks: ["Risk assessment is unavailable because comparable prior-period data is incomplete."],
      nextAction: "No evidence-backed next action is available for this period."
    };
  }

  const movements = getMaterialMovements(summary);
  const declines = movements.filter((m) => m.deltaPercent < 0);

  if (declines.length === 0) {
    return {
      risks: ["No material risk movement was detected for this comparison period."],
      nextAction: "No evidence-backed next action is available for this period."
    };
  }

  const top = declines.slice(0, 3);
  const risks = top.map((m) => `${m.label} down ${(Math.abs(m.deltaPercent) * 100).toFixed(1)}% versus the comparison window.`);

  const sessions = summary.metrics.sessions.deltaPercent;
  const purchaseConv = summary.metrics.purchaseConversion.deltaPercent;
  const aov = summary.metrics.aov.deltaPercent;
  const orders = summary.metrics.orders.deltaPercent;

  const stableBand = 0.03; // 3% ~= stable
  const isStable = (value: number | null) => value != null && Number.isFinite(value) && Math.abs(value) < stableBand;
  const isDown = (value: number | null) => value != null && Number.isFinite(value) && value <= -0.1;

  let nextAction = "No evidence-backed next action is available for this period.";
  if (isDown(sessions) && isStable(purchaseConv)) {
    nextAction = "Sessions declined materially while purchase conversion remained stable. Review traffic acquisition and campaign delivery to restore session volume.";
  } else if (isDown(purchaseConv)) {
    nextAction = "Purchase conversion declined materially. Inspect checkout and funnel completion to identify drop-off and restore conversion efficiency.";
  } else if (isDown(aov)) {
    nextAction = "Average order value declined materially. Review product mix and discounting because lower AOV reduces revenue even if traffic holds.";
  } else if (isDown(orders) && isStable(sessions)) {
    nextAction = "Orders declined materially while sessions were roughly stable. Inspect offer clarity and purchase conversion drivers to recover order volume.";
  }

  return { risks, nextAction };
}

