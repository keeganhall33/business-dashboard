import type { Opportunity } from "@/lib/types/dashboard";

export type ExecutiveOpportunityEvidenceStateV1 =
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type ExecutiveOpportunityPortfolioSortV1 =
  | "SOURCE_ORDER"
  | "NAME"
  | "DUE_SOONEST"
  | "LAST_VERIFIED_DESC";

export type ExecutiveOpportunityPortfolioItemV1 = {
  id: string;
  sourceOrder: number;
  title: string;
  organization: string | null;
  opportunityType: string;
  status: string;
  evidenceState: ExecutiveOpportunityEvidenceStateV1;
  supportedValue: string | null;
  prestigeScore: string | null;
  probabilityScore: string | null;
  timing: string | null;
  lastVerified: string | null;
  effortSignal: "NEXT_STEP_KNOWN" | "UNKNOWN";
  nextMove: string;
  detailHref: string;
};

export type ExecutiveOpportunityPortfolioV1 = {
  contractVersion: "executive_opportunity_portfolio_v1";
  items: readonly ExecutiveOpportunityPortfolioItemV1[];
  summary: {
    total: number;
    verificationWatch: number;
    withTiming: number;
    withSupportedValue: number;
  };
};

export type ExecutiveOpportunityPortfolioFilterV1 = {
  query?: string | null;
  evidenceState?: ExecutiveOpportunityEvidenceStateV1 | "ALL" | null;
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

function boundedScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function supportedMoney(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function supportedPercent(value: unknown): string | null {
  const score = boundedScore(value);
  return score == null ? null : `${Math.round(score * 100)}%`;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function evidenceStateFromOpportunity(opportunity: Opportunity): ExecutiveOpportunityEvidenceStateV1 {
  const sourceState = opportunity.status.trim().toUpperCase();
  if (sourceState.includes("CONFLICT")) return "CONFLICTED";
  if (sourceState.includes("STALE")) return "STALE";
  if (sourceState.includes("UNKNOWN") || sourceState.includes("UNVERIFIED")) return "UNKNOWN";
  return "INFERRED";
}

function detailHref(id: string): string {
  return `/opportunities-actions/opportunity/${encodeURIComponent(id)}`;
}

export function buildExecutiveOpportunityPortfolioV1(
  opportunities: readonly Opportunity[] | null | undefined
): ExecutiveOpportunityPortfolioV1 {
  if (opportunities == null) {
    return {
      contractVersion: "executive_opportunity_portfolio_v1",
      items: [],
      summary: { total: 0, verificationWatch: 0, withTiming: 0, withSupportedValue: 0 }
    };
  }
  if (!Array.isArray(opportunities)) throw new Error("opportunities must be an array");

  const seen = new Set<string>();
  const items = opportunities.map((opportunity, sourceOrder) => {
    if (opportunity == null || typeof opportunity !== "object" || Array.isArray(opportunity)) {
      throw new Error(`opportunities[${sourceOrder}] must be an object`);
    }
    const id = requiredText(opportunity.id, `opportunities[${sourceOrder}].id`);
    if (seen.has(id)) throw new Error(`duplicate opportunity id ${id}`);
    seen.add(id);

    const title = requiredText(opportunity.name, `opportunities[${sourceOrder}].name`);
    const opportunityType = requiredText(
      opportunity.opportunityType,
      `opportunities[${sourceOrder}].opportunityType`
    );
    const status = requiredText(opportunity.status, `opportunities[${sourceOrder}].status`);
    const nextStep = optionalText(opportunity.nextStep);

    return {
      id,
      sourceOrder,
      title,
      organization: optionalText(opportunity.organization),
      opportunityType,
      status,
      evidenceState: evidenceStateFromOpportunity(opportunity),
      supportedValue: supportedMoney(opportunity.valueEstimate),
      prestigeScore: supportedPercent(opportunity.prestigeScore),
      probabilityScore: supportedPercent(opportunity.probabilityScore),
      timing: dateOnly(opportunity.nextStepDueAt),
      lastVerified: dateOnly(opportunity.lastVerifiedAt),
      effortSignal: nextStep ? "NEXT_STEP_KNOWN" as const : "UNKNOWN" as const,
      nextMove: nextStep ?? "Verify the next step before acting.",
      detailHref: detailHref(id)
    };
  });

  const verificationWatch = items.filter((item) =>
    item.evidenceState === "UNKNOWN" ||
    item.evidenceState === "STALE" ||
    item.evidenceState === "CONFLICTED"
  ).length;

  return {
    contractVersion: "executive_opportunity_portfolio_v1",
    items,
    summary: {
      total: items.length,
      verificationWatch,
      withTiming: items.filter((item) => item.timing != null).length,
      withSupportedValue: items.filter((item) => item.supportedValue != null).length
    }
  };
}

export function sortExecutiveOpportunityPortfolioV1(
  items: readonly ExecutiveOpportunityPortfolioItemV1[],
  sort: ExecutiveOpportunityPortfolioSortV1 = "SOURCE_ORDER"
): ExecutiveOpportunityPortfolioItemV1[] {
  const next = [...items];
  if (sort === "SOURCE_ORDER") return next.sort((a, b) => a.sourceOrder - b.sourceOrder);
  if (sort === "NAME") {
    return next.sort((a, b) => a.title.localeCompare(b.title) || a.sourceOrder - b.sourceOrder);
  }
  if (sort === "DUE_SOONEST") {
    return next.sort((a, b) => {
      if (a.timing == null && b.timing == null) return a.sourceOrder - b.sourceOrder;
      if (a.timing == null) return 1;
      if (b.timing == null) return -1;
      return a.timing.localeCompare(b.timing) || a.sourceOrder - b.sourceOrder;
    });
  }
  return next.sort((a, b) => {
    if (a.lastVerified == null && b.lastVerified == null) return a.sourceOrder - b.sourceOrder;
    if (a.lastVerified == null) return 1;
    if (b.lastVerified == null) return -1;
    return b.lastVerified.localeCompare(a.lastVerified) || a.sourceOrder - b.sourceOrder;
  });
}

export function filterExecutiveOpportunityPortfolioV1(
  items: readonly ExecutiveOpportunityPortfolioItemV1[],
  filter: ExecutiveOpportunityPortfolioFilterV1 = {}
): ExecutiveOpportunityPortfolioItemV1[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  const evidenceState = filter.evidenceState ?? "ALL";

  return items.filter((item) => {
    if (evidenceState !== "ALL" && item.evidenceState !== evidenceState) return false;
    if (!query) return true;
    return [item.title, item.organization, item.opportunityType, item.status, item.nextMove]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(query));
  });
}
