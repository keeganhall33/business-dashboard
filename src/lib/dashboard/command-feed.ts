import type { MarketingCommandInsight, MarketingCommandSnapshot } from "@/lib/types/dashboard";

export type CommandFeedPriority = "DO_NOW" | "WATCH" | "FYI";
export type CommandFeedCategory = "Revenue" | "Promotion" | "Paid" | "Funnel" | "Ops" | "Partnership" | "Geography";

export type CommandFeedCard = {
  id: string;
  priority: CommandFeedPriority;
  category: CommandFeedCategory;
  action: string;
  why: string;
  evidence: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  consequence: string;
  supportingLink?: { label: string; href: string } | null;
};

const priorityOrder: Record<CommandFeedPriority, number> = {
  DO_NOW: 0,
  WATCH: 1,
  FYI: 2
};

const severityPriority: Record<"LOW" | "MEDIUM" | "HIGH", CommandFeedPriority> = {
  HIGH: "DO_NOW",
  MEDIUM: "WATCH",
  LOW: "FYI"
};

const severityConsequence: Record<CommandFeedPriority, string> = {
  DO_NOW: "Ignoring this risks near-term revenue or momentum.",
  WATCH: "Monitor; letting this slide could become a revenue drag.",
  FYI: "No immediate action, but log it so it doesn’t surprise you later."
};

const metricCategoryHints: Record<string, CommandFeedCategory> = {
  revenue: "Revenue",
  woo: "Revenue",
  funnel: "Funnel",
  checkout: "Funnel",
  meta: "Paid",
  ads: "Paid",
  creative: "Paid",
  product: "Promotion",
  hero: "Promotion",
  email: "Promotion",
  site: "Promotion",
  automation: "Ops",
  cron: "Ops",
  partnership: "Partnership",
  collector: "Partnership",
  geography: "Geography"
};

function mapCategoryFromId(id?: string | null): CommandFeedCategory | null {
  if (!id) return null;
  const lowered = id.toLowerCase();
  if (lowered.includes("funnel")) return "Funnel";
  if (lowered.includes("meta")) return "Paid";
  if (lowered.includes("product")) return "Promotion";
  if (lowered.includes("partnership")) return "Partnership";
  if (lowered.includes("collector")) return "Partnership";
  if (lowered.includes("geo")) return "Geography";
  return null;
}

function mapCategoryFromMetric(metric?: string | null): CommandFeedCategory | null {
  if (!metric) return null;
  const lowered = metric.toLowerCase();
  for (const [hint, category] of Object.entries(metricCategoryHints)) {
    if (lowered.includes(hint)) {
      return category;
    }
  }
  return null;
}

function formatEvidence(insight: MarketingCommandInsight) {
  const evidence: string[] = [];
  if (insight.triggerMetrics) {
    const [key, value] = Object.entries(insight.triggerMetrics)[0] ?? [];
    if (key) {
      evidence.push(`${key.replaceAll("_", " ")}: ${value}`);
    }
  }
  if (insight.sourcesUsed?.length) {
    evidence.push(`Sources: ${insight.sourcesUsed.join(", ")}`);
  }
  if (insight.range) {
    evidence.push(`Window ${insight.range.startDate} → ${insight.range.endDate}`);
  }
  return evidence;
}

function toCommandCategory(options: { insightId?: string | null; metric?: string | null }): CommandFeedCategory {
  return (
    mapCategoryFromId(options.insightId) ||
    mapCategoryFromMetric(options.metric) ||
    "Revenue"
  );
}

export function buildCommandFeedCards(snapshot?: MarketingCommandSnapshot | null, opts?: { limit?: number }) {
  if (!snapshot) return [];
  const limit = opts?.limit ?? 5;
  const cards: CommandFeedCard[] = [];

  for (const insight of snapshot.topConnectedInsights ?? []) {
    const priority = severityPriority[insight.severity ?? "LOW"] ?? "WATCH";
    cards.push({
      id: `insight-${insight.id}`,
      priority,
      category: toCommandCategory({ insightId: insight.id }),
      action: insight.recommendedAction || insight.title || "Review insight",
      why: insight.insight || insight.title || "Insight triggered",
      evidence: formatEvidence(insight),
      confidence: insight.confidence ?? "MEDIUM",
      consequence: severityConsequence[priority]
    });
  }

  for (const action of snapshot.actions ?? []) {
    const category = toCommandCategory({ metric: action.metric });
    cards.push({
      id: `action-${action.metric}-${action.title}`,
      priority: "DO_NOW",
      category,
      action: action.title,
      why: action.detail,
      evidence: [action.metric.replaceAll("_", " ")],
      confidence: "HIGH",
      consequence: "Skipping this stalls the highlighted metric."
    });
  }

  for (const risk of snapshot.risks ?? []) {
    cards.push({
      id: `risk-${risk}`,
      priority: "WATCH",
      category: "Revenue",
      action: `Mitigate: ${risk}`,
      why: "Risk surfaced in marketing command",
      evidence: [],
      confidence: "MEDIUM",
      consequence: "If ignored, the risk could become a revenue leak."
    });
  }

  for (const monitor of snapshot.monitorTomorrow ?? []) {
    cards.push({
      id: `monitor-${monitor}`,
      priority: "FYI",
      category: "Promotion",
      action: monitor,
      why: "Flagged for tomorrow",
      evidence: [],
      confidence: "LOW",
      consequence: "Low urgency, but log it for tomorrow's review."
    });
  }

  const sorted = cards
    .filter((card, index, arr) => arr.findIndex((item) => item.id === card.id) === index)
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return sorted.slice(0, limit);
}
