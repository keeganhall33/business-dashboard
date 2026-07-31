import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import { getMaterialMovements } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary, ConfidenceEntry } from "@/lib/data-confidence";
import type { ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";

export type ExecutiveBriefingBlock = {
  title: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
  lines: string[];
};

export type ExecutiveBriefingModel = {
  health: ExecutiveBriefingBlock;
  changed: ExecutiveBriefingBlock;
  attention: ExecutiveBriefingBlock;
  nextMove: ExecutiveBriefingBlock;
};

function pickHealth(summary: ExecutiveSummary | null): ExecutiveBriefingBlock {
  if (!summary) {
    return {
      title: "Business health",
      tone: "amber",
      lines: ["Low confidence", "Comparable prior window unavailable."]
    };
  }

  const revenue = summary.metrics.revenue.deltaPercent;
  const orders = summary.metrics.orders.deltaPercent;

  const commerceDecline =
    (typeof revenue === "number" && revenue <= -0.1) ||
    (typeof orders === "number" && orders <= -0.1);
  const commerceGrowth =
    (typeof revenue === "number" && revenue >= 0.1) ||
    (typeof orders === "number" && orders >= 0.1);

  const tone: ExecutiveBriefingBlock["tone"] = commerceDecline ? "rose" : commerceGrowth ? "emerald" : "amber";
  const headline = commerceDecline ? "At risk" : commerceGrowth ? "Improving" : "Stable";

  const mostMaterial = getMaterialMovements(summary, 0.1)[0];
  const why = mostMaterial
    ? `${mostMaterial.label} moved ${mostMaterial.deltaPercent < 0 ? "down" : "up"} ${(Math.abs(mostMaterial.deltaPercent) * 100).toFixed(0)}% versus the comparable period.`
    : "No material verified changes versus the comparable period.";

  return {
    title: "Business health",
    tone,
    lines: [headline, why]
  };
}

function pickChanges(summary: ExecutiveSummary | null): ExecutiveBriefingBlock {
  if (!summary) {
    return {
      title: "What changed",
      tone: "zinc",
      lines: ["No material verified changes for this period."]
    };
  }

  const movements = getMaterialMovements(summary, 0.1);
  const lines = movements.slice(0, 3).map((m) => {
    const dir = m.deltaPercent < 0 ? "declined" : "increased";
    return `${m.label} ${dir} ${(Math.abs(m.deltaPercent) * 100).toFixed(0)}% versus the comparable period.`;
  });

  return {
    title: "What changed",
    tone: lines.length ? "amber" : "zinc",
    lines: lines.length ? lines : ["No material verified changes for this period."]
  };
}

function confidenceSeverity(entry: ConfidenceEntry): number {
  if (entry.state === "unavailable" || entry.state === "insufficient_evidence") return 100;
  if (entry.state === "conflicting") return 80;
  if (entry.state === "stale") return 70;
  if (entry.state === "usable_with_caveats") return 60;
  return 0;
}

function pickAttention(summary: ExecutiveSummary | null, confidence: ConfidenceSummary): ExecutiveBriefingBlock {
  const businessRisks: string[] = [];

  if (summary) {
    const revenue = summary.metrics.revenue.deltaPercent;
    const orders = summary.metrics.orders.deltaPercent;
    if (typeof revenue === "number" && revenue <= -0.1) businessRisks.push("Revenue declined materially versus the comparable period.");
    if (typeof orders === "number" && orders <= -0.1) businessRisks.push("Orders declined materially versus the comparable period.");
  }

  const dataIssues = confidence.entries
    .filter((e) => e.state !== "trusted")
    .slice()
    .sort((a, b) => confidenceSeverity(b) - confidenceSeverity(a))
    .map((e) => {
      // Keep plain-English; do not emit raw state names.
      const impact = e.decisionImpact || `${e.label} data requires review.`;
      return impact.replace(/; decisions relying on it are blocked\.?/gi, ".");
    });

  const lines = [...businessRisks, ...dataIssues].slice(0, 3);
  return {
    title: "Needs attention",
    tone: lines.length ? "amber" : "zinc",
    lines: lines.length ? lines : ["No verified issues require attention for this period."]
  };
}

function summarizeWhy(impact: string): string {
  return impact.replace(/; decisions relying on it are blocked\.?/gi, ".").trim();
}

function pickNextMove(actions: ExecutiveActionPlan[], confidence: ConfidenceSummary): ExecutiveBriefingBlock {
  const filtered = actions.filter((action) => {
    if (action.id === "scheduler" || action.id.startsWith("telemetry-")) return false;
    if (action.sourceDomain === "operations") return false;
    return Boolean(action.evidence?.trim());
  });

  const primary = filtered[0];
  if (!primary) {
    const top = confidence.topRisk;
    if (top?.recommendedAction) {
      return {
        title: "Recommended next move",
        tone: "amber",
        lines: [top.recommendedAction, top.decisionImpact ? summarizeWhy(top.decisionImpact) : ""].filter(Boolean).slice(0, 2)
      };
    }

    const firstIssue = confidence.entries.find((e) => e.state !== "trusted");
    if (firstIssue) {
      return {
        title: "Recommended next move",
        tone: "amber",
        lines: [firstIssue.recommendedAction ?? "Restore data confidence", summarizeWhy(firstIssue.decisionImpact || `${firstIssue.label} requires attention.`)].slice(0, 2)
      };
    }

    return {
      title: "Recommended next move",
      tone: "zinc",
      lines: ["No verified action recommended for this period."]
    };
  }

  const reason = primary.impact?.trim() || primary.evidence?.trim();
  const confidenceLine = primary.confidenceDetail?.trim() || `Confidence: ${primary.confidence}`;

  // If the action is blocked by missing data, the confidenceDetail should already explain the prerequisite.
  const lines = [primary.title, reason, confidenceLine].filter(Boolean).slice(0, 3);

  const tone: ExecutiveBriefingBlock["tone"] =
    primary.confidence === "High" ? "emerald" : primary.confidence === "Medium" ? "amber" : primary.confidence === "Low" ? "amber" : "zinc";

  return {
    title: "Recommended next move",
    tone,
    lines
  };
}

export function buildExecutiveBriefingModel(input: {
  summary: ExecutiveSummary | null;
  confidence: ConfidenceSummary;
  actions: ExecutiveActionPlan[];
}): ExecutiveBriefingModel {
  return {
    health: pickHealth(input.summary),
    changed: pickChanges(input.summary),
    attention: pickAttention(input.summary, input.confidence),
    nextMove: pickNextMove(input.actions, input.confidence)
  };
}
