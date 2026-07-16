import type { IndustryPulseSnapshot } from "@/lib/types/dashboard";

export type IndustryPulseOpportunity = {
  id: string;
  headline: string;
  publishedLabel: string;
  category: string;
  concept: string;
  whyItMatters: string;
  commercialRoute: string;
  licensingRisk: string;
  expectedImpact: string;
  nextAction: string;
  contactStatus: string;
  confidence: string;
  urgency: string;
  sourceUrl: string | null;
  provenance: string;
};

export function buildIndustryOpportunities(snapshot: IndustryPulseSnapshot): IndustryPulseOpportunity[] {
  const filtered = (snapshot.alerts ?? [])
    .filter((alert) => alert && isValidOpportunity(alert))
    .map((alert) => ({ alert, score: scoreOpportunity(alert) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => toOpportunity(entry.alert));
  return filtered;
}

function isValidOpportunity(alert: IndustryPulseSnapshot["alerts"][number]) {
  if (!alert) return false;
  if (!alert.title || !alert.date || !alert.source || !alert.whyItMatters || !alert.opportunity) return false;
  if (!alert.recommendedAction || alert.confidence === "low") return false;
  const published = new Date(alert.date).getTime();
  const now = Date.now();
  const ageDays = (now - published) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays > 14) return false;
  return true;
}

function scoreOpportunity(alert: IndustryPulseSnapshot["alerts"][number]) {
  const urgencyScore = alert.urgency === "high" ? 3 : alert.urgency === "medium" ? 2 : 1;
  const confidenceScore = alert.confidence === "high" ? 3 : 2;
  const impactScore = alert.opportunity?.toLowerCase().includes("collaboration") ? 3 : 2;
  return urgencyScore * 2 + confidenceScore * 2 + impactScore;
}

function toOpportunity(alert: IndustryPulseSnapshot["alerts"][number]): IndustryPulseOpportunity {
  const published = new Date(alert.date);
  return {
    id: alert.title ?? crypto.randomUUID(),
    headline: alert.title ?? "Untitled opportunity",
    publishedLabel: published.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? alert.date,
    category: alert.category,
    concept: alert.opportunity,
    whyItMatters: alert.whyItMatters,
    commercialRoute: alert.category,
    licensingRisk: alert.status ? `Status: ${alert.status}` : "Verify rights with source",
    expectedImpact: alert.urgency === "high" ? "High" : "Moderate",
    nextAction: alert.recommendedAction,
    contactStatus: alert.owner ? `Owned by ${alert.owner}` : "Contact research required",
    confidence: alert.confidence ?? "Unknown",
    urgency: alert.urgency ?? "low",
    sourceUrl: alert.sourceUrl ?? null,
    provenance: alert.source ?? "Unknown source"
  };
}
