import type { SportsMilestone } from "@/lib/external-intelligence/milestones/contracts";
import { chooseProjectClass } from "@/lib/external-intelligence/milestones/horizon-engine";

export type ExecutiveEventEvidenceStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type ExecutiveEventPlanningWindowV1 =
  | "NOW"
  | "NEAR_TERM"
  | "PREPARE"
  | "EARLY"
  | "PAST"
  | "DATE_UNKNOWN";

export type ExecutiveEventSourceV1 = {
  id: string;
  title: string;
  eventDate: string | null;
  market: string | null;
  category: string | null;
  evidenceState: ExecutiveEventEvidenceStateV1;
  confidence: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  historicalSignificance: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  collectorRelevance: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  partnershipPotential: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  accessReadiness: "UNKNOWN" | "REVIEW_REQUIRED" | "SUPPORTED";
  rightsConsiderations: readonly string[];
  evidenceLabels: readonly string[];
  sourceIds: readonly string[];
  nextMove: string;
};

export type ExecutiveEventPortfolioItemV1 = ExecutiveEventSourceV1 & {
  sourceOrder: number;
  daysUntil: number | null;
  planningWindow: ExecutiveEventPlanningWindowV1;
  runwayLabel: string;
};

export type ExecutiveEventPortfolioV1 = {
  contractVersion: "executive_event_portfolio_v1";
  asOfDate: string;
  items: readonly ExecutiveEventPortfolioItemV1[];
  summary: {
    total: number;
    upcoming: number;
    next90Days: number;
    verificationWatch: number;
  };
};

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? value : null;
}

function normalizeAsOfDate(value: string): string {
  const parsed = dateOnly(value);
  if (!parsed) throw new Error("asOfDate must be YYYY-MM-DD");
  return parsed;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const to = Date.parse(`${toYmd}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

function planningWindow(daysUntil: number | null): ExecutiveEventPlanningWindowV1 {
  if (daysUntil == null) return "DATE_UNKNOWN";
  if (daysUntil < 0) return "PAST";
  if (daysUntil <= 30) return "NOW";
  if (daysUntil <= 90) return "NEAR_TERM";
  if (daysUntil <= 365) return "PREPARE";
  return "EARLY";
}

function runwayLabel(daysUntil: number | null): string {
  if (daysUntil == null) return "Date unknown";
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "1 day away";
  if (daysUntil > 1) return `${daysUntil} days away`;
  if (daysUntil === -1) return "1 day past";
  return `${Math.abs(daysUntil)} days past`;
}

function humanize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function upperImportance(value: "low" | "medium" | "high"): "LOW" | "MEDIUM" | "HIGH" {
  return value.toUpperCase() as "LOW" | "MEDIUM" | "HIGH";
}

function evidenceStateFromMilestone(milestone: SportsMilestone): ExecutiveEventEvidenceStateV1 {
  if (milestone.correction_status === "retracted" || milestone.review_status === "blocked") {
    return "CONFLICTED";
  }
  if (milestone.review_status !== "reviewed" || milestone.confidence !== "high") {
    return "INFERRED";
  }
  return "KNOWN";
}

function nextMoveFromMilestone(milestone: SportsMilestone): string {
  if (milestone.correction_status === "retracted" || milestone.review_status === "blocked") {
    return "Resolve the evidence conflict before planning around this window.";
  }
  if (milestone.review_status !== "reviewed" || milestone.confidence === "low") {
    return "Verify the milestone evidence before committing capacity.";
  }
  if (milestone.licensing_rights_considerations.length > 0) {
    return "Review rights and access constraints before developing an activation.";
  }

  const projectClass = chooseProjectClass(milestone);
  if (projectClass === "major_institutional_partnership") {
    return "Validate partner access and fit before allocating major-project capacity.";
  }
  if (projectClass === "original_artwork_no_formal_partnership") {
    return "Assess whether the window merits an original-art or collector activation.";
  }
  return "Monitor the window and verify whether a bounded activation is worthwhile.";
}

export function sportsMilestoneToExecutiveEventSourceV1(
  milestone: SportsMilestone
): ExecutiveEventSourceV1 {
  const primary = milestone.subject_entities[0];
  if (!primary) throw new Error(`milestone ${milestone.milestone_id} has no subject entity`);

  const title = optionalText(milestone.championship_or_achievement_type)
    ?? `${requiredText(primary.label, "subject label")} · ${humanize(milestone.milestone_type)}`;

  return {
    id: requiredText(milestone.milestone_id, "milestone_id"),
    title,
    eventDate: dateOnly(milestone.milestone_date),
    market: optionalText(milestone.geographic_market),
    category: humanize(milestone.milestone_type),
    evidenceState: evidenceStateFromMilestone(milestone),
    confidence: upperImportance(milestone.confidence),
    historicalSignificance: upperImportance(milestone.historical_significance),
    collectorRelevance: upperImportance(milestone.fan_collector_relevance),
    partnershipPotential: upperImportance(milestone.partnership_potential),
    accessReadiness: milestone.licensing_rights_considerations.length > 0 ? "REVIEW_REQUIRED" : "UNKNOWN",
    rightsConsiderations: [...milestone.licensing_rights_considerations],
    evidenceLabels: milestone.evidence_refs.map((evidence) => evidence.label),
    sourceIds: [...milestone.source_ids],
    nextMove: nextMoveFromMilestone(milestone)
  };
}

export function buildExecutiveEventPortfolioFromSourcesV1(
  sources: readonly ExecutiveEventSourceV1[] | null | undefined,
  asOfDate: string
): ExecutiveEventPortfolioV1 {
  const normalizedAsOf = normalizeAsOfDate(asOfDate);
  if (sources == null) {
    return {
      contractVersion: "executive_event_portfolio_v1",
      asOfDate: normalizedAsOf,
      items: [],
      summary: { total: 0, upcoming: 0, next90Days: 0, verificationWatch: 0 }
    };
  }
  if (!Array.isArray(sources)) throw new Error("event sources must be an array");

  const seen = new Set<string>();
  const items = sources.map((source, sourceOrder) => {
    if (source == null || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(`event sources[${sourceOrder}] must be an object`);
    }
    const id = requiredText(source.id, `event sources[${sourceOrder}].id`);
    if (seen.has(id)) throw new Error(`duplicate event source id ${id}`);
    seen.add(id);

    const eventDate = dateOnly(source.eventDate);
    const daysUntil = eventDate == null ? null : daysBetween(normalizedAsOf, eventDate);

    return {
      ...source,
      id,
      title: requiredText(source.title, `event sources[${sourceOrder}].title`),
      eventDate,
      market: optionalText(source.market),
      category: optionalText(source.category),
      sourceOrder,
      daysUntil,
      planningWindow: planningWindow(daysUntil),
      runwayLabel: runwayLabel(daysUntil),
      rightsConsiderations: [...source.rightsConsiderations],
      evidenceLabels: [...source.evidenceLabels],
      sourceIds: [...source.sourceIds]
    };
  });

  items.sort((a, b) => {
    if (a.eventDate == null && b.eventDate == null) {
      return a.sourceOrder - b.sourceOrder || a.title.localeCompare(b.title);
    }
    if (a.eventDate == null) return 1;
    if (b.eventDate == null) return -1;
    return a.eventDate.localeCompare(b.eventDate) || a.sourceOrder - b.sourceOrder;
  });

  return {
    contractVersion: "executive_event_portfolio_v1",
    asOfDate: normalizedAsOf,
    items,
    summary: {
      total: items.length,
      upcoming: items.filter((item) => item.daysUntil != null && item.daysUntil >= 0).length,
      next90Days: items.filter((item) => item.daysUntil != null && item.daysUntil >= 0 && item.daysUntil <= 90).length,
      verificationWatch: items.filter((item) => item.evidenceState !== "KNOWN").length
    }
  };
}

export function buildExecutiveEventPortfolioV1(
  milestones: readonly SportsMilestone[] | null | undefined,
  asOfDate: string
): ExecutiveEventPortfolioV1 {
  return buildExecutiveEventPortfolioFromSourcesV1(
    milestones?.map((milestone) => sportsMilestoneToExecutiveEventSourceV1(milestone)),
    asOfDate
  );
}
