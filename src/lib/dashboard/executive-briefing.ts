import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";
import { getMaterialMovements } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary, ConfidenceEntry } from "@/lib/data-confidence";
import type { ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import type { DashboardTruthState } from "@/lib/dashboard/truth-state";

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
  decisionLimitations: string[];
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
  // If the dashboard is in degraded mode, we must not claim verified change.
  // The caller should short-circuit this, but keep it defensive.
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

function pickAttention(
  summary: ExecutiveSummary | null,
  confidence: ConfidenceSummary,
  options?: { omitDomains?: Array<ConfidenceEntry["id"]> }
): ExecutiveBriefingBlock {
  const businessRisks: string[] = [];

  if (summary) {
    const revenue = summary.metrics.revenue.deltaPercent;
    const orders = summary.metrics.orders.deltaPercent;
    if (typeof revenue === "number" && revenue <= -0.1) businessRisks.push("Revenue declined materially versus the comparable period.");
    if (typeof orders === "number" && orders <= -0.1) businessRisks.push("Orders declined materially versus the comparable period.");
  }

  const omit = new Set(options?.omitDomains ?? []);
  const dataIssues = confidence.entries
    .filter((e) => e.state !== "trusted")
    .filter((e) => !omit.has(e.id))
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

function pickVerifiedBasis(confidence: ConfidenceSummary): string | null {
  const trusted = new Set(confidence.trustedSources ?? []);
  const basis: string[] = [];

  if (trusted.has("Woo")) basis.push("commerce");
  if (trusted.has("GA4")) basis.push("traffic");

  if (basis.length) return `Verified: ${basis.join(" + ")}.`;
  if (trusted.size) return `Verified: ${Array.from(trusted).join(", ")}.`;
  return null;
}

function pickDecisionLimitations(confidence: ConfidenceSummary): {
  limitations: string[];
  omitDomains: Array<ConfidenceEntry["id"]>;
} {
  const limitations: string[] = [];
  const omitDomains: Array<ConfidenceEntry["id"]> = [];

  const meta = confidence.entries.find((e) => e.id === "meta");
  if (meta && (meta.state === "unavailable" || meta.state === "insufficient_evidence" || meta.state === "conflicting")) {
    limitations.push("Limits: marketing efficiency (ROAS, attributed conversions) cannot be evaluated — Meta attribution unavailable.");
    omitDomains.push("meta");
  }

  return { limitations, omitDomains };
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
  truth: DashboardTruthState;
}): ExecutiveBriefingModel {
  if (input.truth.degraded.active) {
    return {
      health: {
        title: "Business health",
        tone: "amber",
        lines: ["Limited reporting", input.truth.degraded.consequence.summary]
      },
      changed: {
        title: "What changed",
        tone: "zinc",
        lines: ["Unable to verify changes for this period."]
      },
      attention: pickAttention(input.summary, input.confidence),
      nextMove: pickNextMove(input.actions, input.confidence),
      decisionLimitations: []
    };
  }

  const { limitations: decisionLimitations, omitDomains } = pickDecisionLimitations(input.confidence);
  const verifiedBasis = pickVerifiedBasis(input.confidence);
  const health = pickHealth(input.summary);
  const healthLines = [
    health.lines[0],
    verifiedBasis,
    health.lines[1],
    ...decisionLimitations
  ].filter(Boolean) as string[];

  return {
    health: { ...health, lines: healthLines },
    changed: pickChanges(input.summary),
    attention: pickAttention(input.summary, input.confidence, { omitDomains }),
    nextMove: pickNextMove(input.actions, input.confidence),
    decisionLimitations
  };
}
