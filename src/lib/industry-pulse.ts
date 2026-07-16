import type { IndustryPulseSnapshot } from "@/lib/types/dashboard";

export type IndustryPulseOpportunity = {
  id: string;
  concept: string;
  sourceHeadline: string;
  sourceUrl: string | null;
  publishedLabel: string;
  whyItMatters: string;
  commercialRoute: string;
  licensingRisk: string;
  licensingScore: number;
  expectedImpact: string;
  impactScore: number;
  nextAction: string;
  contactStatus: string;
  confidence: string;
  confidenceScore: number;
  urgency: string;
  urgencyScore: number;
  freshnessDays: number;
  opportunityScore: number;
  provenance: string;
  supportingEvidence: string;
};

export function buildIndustryOpportunities(snapshot: IndustryPulseSnapshot): IndustryPulseOpportunity[] {
  return (snapshot.alerts ?? [])
    .filter((alert) => alert && isValidOpportunity(alert))
    .map((alert) => toOpportunity(alert))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);
}

function isValidOpportunity(alert: IndustryPulseSnapshot["alerts"][number]) {
  if (!alert) return false;
  if (!alert.opportunity || !alert.whyItMatters || !alert.recommendedAction || !alert.source) return false;
  if (alert.confidence === "low") return false;
  const ageDays = getAgeInDays(alert.date);
  const freshnessLimit = categoryFreshnessLimit(alert.category, alert.opportunity);
  if (ageDays > freshnessLimit) return false;
  return true;
}

function toOpportunity(alert: IndustryPulseSnapshot["alerts"][number]): IndustryPulseOpportunity {
  const published = new Date(alert.date);
  const freshnessDays = getAgeInDays(alert.date);
  const freshnessLimit = categoryFreshnessLimit(alert.category, alert.opportunity);
  const freshnessScore = normalize(1 - freshnessDays / freshnessLimit);
  const urgencyScore = urgencyToScore(alert.urgency);
  const { label: licensingRisk, score: licensingScore } = licensingAssessment(alert.status);
  const { label: expectedImpact, score: impactScore } = impactAssessment(alert);
  const confidenceScore = confidenceToScore(alert.confidence);
  const opportunityScore = Math.round(
    urgencyScore * 20 +
      impactScore * 25 +
      confidenceScore * 20 +
      licensingScore * 15 +
      freshnessScore * 20
  );

  return {
    id: alert.title ?? crypto.randomUUID(),
    concept: alert.opportunity,
    sourceHeadline: alert.title ?? alert.source ?? "Untitled source",
    sourceUrl: alert.sourceUrl ?? null,
    publishedLabel: published.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    whyItMatters: alert.whyItMatters,
    commercialRoute: resolveCommercialRoute(alert),
    licensingRisk,
    licensingScore,
    expectedImpact,
    impactScore,
    nextAction: alert.recommendedAction,
    contactStatus: resolveContactStatus(alert),
    confidence: formatConfidence(alert.confidence, confidenceScore),
    confidenceScore,
    urgency: alert.urgency,
    urgencyScore,
    freshnessDays,
    opportunityScore,
    provenance: buildProvenance(alert, published),
    supportingEvidence: alert.summary ?? `${alert.related?.length ?? 0} supporting references`
  };
}

function getAgeInDays(date: string) {
  const published = new Date(date).getTime();
  if (Number.isNaN(published)) return Number.POSITIVE_INFINITY;
  return (Date.now() - published) / 86400000;
}

function categoryFreshnessLimit(category: string, concept: string) {
  const normalized = category?.toLowerCase() ?? "";
  if (normalized.includes("sports")) return 4;
  if (normalized.includes("live") || concept.toLowerCase().includes("event")) return 3;
  if (normalized.includes("licensing")) return 21;
  if (normalized.includes("brand") || normalized.includes("partnership")) return 14;
  return 7;
}

function urgencyToScore(urgency: string | undefined) {
  if (!urgency) return 30;
  if (urgency.toLowerCase() === "high") return 100;
  if (urgency.toLowerCase() === "medium") return 65;
  return 40;
}

function licensingAssessment(status: string | undefined) {
  if (!status) return { label: "Verify rights", score: 50 };
  const normalized = status.toLowerCase();
  if (normalized.includes("approved") || normalized.includes("cleared")) {
    return { label: "Rights confirmed", score: 95 };
  }
  if (normalized.includes("review")) {
    return { label: "Rights in review", score: 70 };
  }
  if (normalized.includes("blocked") || normalized.includes("denied")) {
    return { label: "Rights blocked", score: 20 };
  }
  if (normalized.includes("to_verify") || normalized.includes("pending")) {
    return { label: "Rights to verify", score: 55 };
  }
  return { label: status, score: 50 };
}

function impactAssessment(alert: IndustryPulseSnapshot["alerts"][number]) {
  const text = `${alert.category} ${alert.opportunity}`.toLowerCase();
  if (text.includes("partnership") || text.includes("brand") || text.includes("campaign")) {
    return { label: "High revenue upside", score: 90 };
  }
  if (text.includes("charity") || text.includes("community")) {
    return { label: "Cultural impact opportunity", score: 70 };
  }
  if (text.includes("licensing") || text.includes("collectible")) {
    return { label: "Mid-term licensing", score: 80 };
  }
  return { label: "Moderate upside", score: 60 };
}

function formatConfidence(confidence: string | undefined, score: number) {
  if (!confidence) return "Unknown";
  const percent = Math.round(score);
  return `${confidence} (${percent}%)`;
}

function confidenceToScore(confidence: string | undefined) {
  if (!confidence) return 50;
  if (confidence.toLowerCase() === "high") return 90;
  if (confidence.toLowerCase() === "medium") return 70;
  return 50;
}

function resolveCommercialRoute(alert: IndustryPulseSnapshot["alerts"][number]) {
  const text = `${alert.category} ${alert.opportunity}`.toLowerCase();
  if (text.includes("print")) return "Limited edition print";
  if (text.includes("partnership")) return "Brand partnership";
  if (text.includes("charity") || text.includes("foundation")) return "Charity collaboration";
  if (text.includes("commission") || text.includes("corporate")) return "Corporate commission";
  if (text.includes("nil") || text.includes("athlete")) return "NIL opportunity";
  return "Original release";
}

function resolveContactStatus(alert: IndustryPulseSnapshot["alerts"][number]) {
  const normalized = alert.status?.toLowerCase() ?? "";
  if (normalized.includes("conversation")) return "Conversation active";
  if (normalized.includes("waiting")) return "Waiting on response";
  if (normalized.includes("outreach_sent")) return "Outreach sent";
  if (normalized.includes("outreach_ready")) return "Outreach ready";
  if (normalized.includes("contact_identified")) return "Contact identified";
  if (normalized.includes("research")) return "Research in progress";
  if (normalized.includes("closed")) return "Closed";
  if (alert.owner) return `Contact identified (${alert.owner})`;
  return "Not researched";
}

function buildProvenance(alert: IndustryPulseSnapshot["alerts"][number], published: Date) {
  const publishedLabel = published.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const evidenceCount = alert.related?.length ?? 0;
  return `${alert.source.toUpperCase()} • Published ${publishedLabel} • ${evidenceCount} supporting links`;
}

function normalize(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value)) * 100;
}
