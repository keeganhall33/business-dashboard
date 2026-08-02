import type { DashboardOverviewResponse, MetaAdsSnapshot } from "@/lib/types/dashboard";
import type { ConfidenceEntry, ConfidenceSummary, ConfidenceState } from "@/lib/data-confidence";

export type CoverageState = "complete" | "partial" | "unavailable";
export type ConfidenceLevel = "high" | "moderate" | "low" | "unavailable";

export type BusinessConsequence = {
  summary: string;
  decisionsAffected: string[];
};

export type NextAction = {
  title: string;
  href?: string;
  detail?: string;
};

export type DomainTruth = {
  domainId: string;
  label: string;
  coverage: CoverageState;
  freshness: "fresh" | "stale" | "unavailable";
  confidence: ConfidenceLevel;
  consequence: BusinessConsequence;
  nextAction?: NextAction;
};

export type MetricTruth = {
  metricId: string;
  label: string;
  reportingPeriod: "selected" | "snapshot";
  source: string;
  coverage: CoverageState;
  confidence: ConfidenceLevel;
  hasDefensibleValue: boolean;
  consequence: BusinessConsequence;
  nextAction?: NextAction;
};

export type DegradedMode = {
  active: boolean;
  reason: string;
  unavailableDomains: DomainTruth[];
  stillWorks: DomainTruth[];
  consequence: BusinessConsequence;
  nextAction?: NextAction;
};

export type DashboardTruthState = {
  degraded: DegradedMode;
  domains: Record<string, DomainTruth>;
  metrics: Record<string, MetricTruth>;
};

function stateToCoverage(state: ConfidenceState): CoverageState {
  if (state === "trusted") return "complete";
  if (state === "usable_with_caveats" || state === "stale" || state === "conflicting") return "partial";
  return "unavailable";
}

function stateToFreshness(state: ConfidenceState): DomainTruth["freshness"] {
  if (state === "stale") return "stale";
  if (state === "unavailable" || state === "insufficient_evidence") return "unavailable";
  return "fresh";
}

function stateToConfidence(state: ConfidenceState): ConfidenceLevel {
  if (state === "trusted") return "high";
  if (state === "usable_with_caveats" || state === "stale") return "moderate";
  if (state === "conflicting") return "low";
  return "unavailable";
}

function domainFromEntry(entry: ConfidenceEntry): DomainTruth {
  const coverage = stateToCoverage(entry.state);
  const confidence = stateToConfidence(entry.state);

  const consequenceSummary = entry.executiveImpact?.trim() || entry.decisionImpact?.trim() || `${entry.label} affects executive reporting.`;
  const decisions = entry.decisionImpact ? [entry.decisionImpact] : [];

  return {
    domainId: entry.id,
    label: entry.label,
    coverage,
    freshness: stateToFreshness(entry.state),
    confidence,
    consequence: {
      summary: consequenceSummary,
      decisionsAffected: decisions
    },
    nextAction: entry.recommendedAction
      ? {
          title: entry.recommendedAction,
          href: "/data"
        }
      : undefined
  };
}

function summarizeDegradedMode(input: {
  confidence: ConfidenceSummary;
  meta: MetaAdsSnapshot | null;
}): DegradedMode {
  const domains = input.confidence.entries.map(domainFromEntry);
  const critical = domains.filter((d) => d.domainId === "woo" || d.domainId === "ga4");
  const criticalUnavailable = critical.filter((d) => d.coverage === "unavailable");

  // Still works: allow Meta delivery to be considered “working” even if attribution is unavailable.
  const metaDomain = domains.find((d) => d.domainId === "meta");
  const metaDeliveryWorking = Boolean(
    input.meta &&
      (input.meta.summary?.spend != null || input.meta.summary?.impressions != null || input.meta.summary?.clicks != null)
  );

  const active = criticalUnavailable.length > 0;
  if (!active) {
    return {
      active: false,
      reason: "",
      unavailableDomains: [],
      stillWorks: [],
      consequence: { summary: "", decisionsAffected: [] }
    };
  }

  const unavailableDomains = domains.filter((d) => d.coverage === "unavailable" && (d.domainId === "woo" || d.domainId === "ga4" || d.domainId === "meta"));
  const stillWorks: DomainTruth[] = [];
  if (metaDomain && metaDeliveryWorking) {
    stillWorks.push({
      ...metaDomain,
      coverage: metaDomain.coverage === "unavailable" ? "partial" : metaDomain.coverage,
      confidence: metaDomain.confidence === "unavailable" ? "low" : metaDomain.confidence,
      consequence: {
        summary: "Meta delivery data is still current.",
        decisionsAffected: []
      }
    });
  }

  const reasons = criticalUnavailable.map((d) => d.label);
  const reason = `Limited reporting: ${reasons.join(" and ")} unavailable.`;
  const consequence: BusinessConsequence = {
    summary: "Revenue, orders, sessions, and conversion decisions cannot be fully verified until sources recover.",
    decisionsAffected: unavailableDomains.flatMap((d) => d.consequence.decisionsAffected).slice(0, 5)
  };

  const nextAction = criticalUnavailable[0]?.nextAction;

  const normalizedNextAction = nextAction?.href
    ? {
        title: "Restore WooCommerce connection",
        href: nextAction.href,
        detail: "Restores revenue, orders, conversion, and executive reporting."
      }
    : nextAction;

  return {
    active: true,
    reason,
    unavailableDomains,
    stillWorks,
    consequence,
    nextAction: normalizedNextAction
  };
}

export function buildDashboardTruthState(input: {
  data: DashboardOverviewResponse;
  confidence: ConfidenceSummary;
}): DashboardTruthState {
  const byId = new Map(input.confidence.entries.map((e) => [e.id, e] as const));
  const domains: Record<string, DomainTruth> = {};
  for (const e of input.confidence.entries) {
    domains[e.id] = domainFromEntry(e);
  }

  const degraded = summarizeDegradedMode({ confidence: input.confidence, meta: input.data.metaAds ?? null });

  const metrics: Record<string, MetricTruth> = {
    revenue: {
      metricId: "revenue",
      label: "Revenue",
      reportingPeriod: "selected",
      source: "Woo",
      coverage: domains.woo?.coverage ?? "unavailable",
      confidence: domains.woo?.confidence ?? "unavailable",
      hasDefensibleValue: Boolean(input.data.commerceTelemetry?.woo?.summary?.revenue != null),
      consequence: domains.woo?.consequence ?? { summary: "Revenue decisions may be inaccurate.", decisionsAffected: [] },
      nextAction: domains.woo?.nextAction
    },
    orders: {
      metricId: "orders",
      label: "Orders",
      reportingPeriod: "selected",
      source: "Woo",
      coverage: domains.woo?.coverage ?? "unavailable",
      confidence: domains.woo?.confidence ?? "unavailable",
      hasDefensibleValue: Boolean(input.data.commerceTelemetry?.woo?.summary?.orders != null),
      consequence: domains.woo?.consequence ?? { summary: "Order trends cannot be verified.", decisionsAffected: [] },
      nextAction: domains.woo?.nextAction
    },
    sessions: {
      metricId: "sessions",
      label: "Sessions",
      reportingPeriod: "selected",
      source: "GA4",
      coverage: domains.ga4?.coverage ?? "unavailable",
      confidence: domains.ga4?.confidence ?? "unavailable",
      hasDefensibleValue: Boolean(input.data.commerceTelemetry?.ga4?.summary?.sessions != null),
      consequence: domains.ga4?.consequence ?? { summary: "Traffic and conversion cannot be verified.", decisionsAffected: [] },
      nextAction: domains.ga4?.nextAction
    },
    metaDelivery: {
      metricId: "metaDelivery",
      label: "Meta delivery",
      reportingPeriod: "snapshot",
      source: "Meta",
      coverage: domains.meta?.coverage ?? "unavailable",
      confidence: domains.meta?.confidence ?? "unavailable",
      hasDefensibleValue: Boolean(input.data.metaAds?.summary?.spend != null || input.data.metaAds?.summary?.clicks != null),
      consequence: domains.meta?.consequence ?? { summary: "Paid media delivery decisions may be inaccurate.", decisionsAffected: [] },
      nextAction: domains.meta?.nextAction
    },
    metaAttribution: {
      metricId: "metaAttribution",
      label: "Meta purchase attribution",
      reportingPeriod: "snapshot",
      source: "Meta",
      coverage: input.data.metaAds?.summary?.purchases != null || input.data.metaAds?.summary?.roas != null ? "partial" : "unavailable",
      confidence: input.data.metaAds?.summary?.purchases != null || input.data.metaAds?.summary?.roas != null ? "low" : "unavailable",
      hasDefensibleValue: Boolean(input.data.metaAds?.summary?.purchases != null || input.data.metaAds?.summary?.roas != null),
      consequence: {
        summary: "Advertising efficiency decisions cannot be verified without purchase attribution.",
        decisionsAffected: []
      },
      nextAction: domains.meta?.nextAction
    }
  };

  // If a metric cannot be trusted, it must not be represented as a numeric zero.
  // Panels must check hasDefensibleValue before rendering numeric values.

  void byId;
  return { degraded, domains, metrics };
}
