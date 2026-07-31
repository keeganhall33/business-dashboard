import type { ExecutiveMetric } from "@/lib/dashboard/executive-summary";
import type { ConfidenceSummary, ConfidenceState, ConfidenceDomain } from "@/lib/data-confidence";
import { getDomainConfidence, mapStateToConfidenceLabel } from "@/lib/data-confidence";

type TruthCoverage = "complete" | "partial" | "unavailable" | "unknown";
type TruthFreshness = "fresh" | "stale" | "unavailable" | "unknown";
type TruthConfidence = "High" | "Medium" | "Low" | "Blocked";

function coverageLabel(coverage: TruthCoverage): string {
  if (coverage === "partial") return "Partial coverage";
  if (coverage === "complete") return "Complete coverage";
  if (coverage === "unavailable") return "Unavailable";
  return "Unknown coverage";
}

function freshnessLabel(freshness: TruthFreshness): string {
  if (freshness === "fresh") return "Fresh";
  if (freshness === "stale") return "Stale";
  if (freshness === "unavailable") return "Unavailable";
  return "Unknown";
}

function summarizeConfidence(label: TruthConfidence): string {
  if (label === "High") return "High confidence";
  if (label === "Medium") return "Moderate confidence";
  if (label === "Low") return "Low confidence";
  return "Confidence unavailable";
}

function mergeCoverage(a: TruthCoverage, b: TruthCoverage): TruthCoverage {
  // Monotonic toward caution.
  if (a === "unavailable" || b === "unavailable") return "unavailable";
  if (a === "partial" || b === "partial") return "partial";
  if (a === "unknown" || b === "unknown") return "unknown";
  return "complete";
}

function mergeFreshness(a: TruthFreshness, b: TruthFreshness): TruthFreshness {
  if (a === "unavailable" || b === "unavailable") return "unavailable";
  if (a === "stale" || b === "stale") return "stale";
  if (a === "unknown" || b === "unknown") return "unknown";
  return "fresh";
}

function mergeConfidence(a: TruthConfidence, b: TruthConfidence): TruthConfidence {
  const rank: Record<TruthConfidence, number> = { High: 3, Medium: 2, Low: 1, Blocked: 0 };
  return rank[a] <= rank[b] ? a : b;
}

function stateToFreshness(state: ConfidenceState | undefined): TruthFreshness {
  if (!state) return "unknown";
  if (state === "stale") return "stale";
  if (state === "unavailable" || state === "insufficient_evidence") return "unavailable";
  return "fresh";
}

function stateToCoverage(state: ConfidenceState | undefined): TruthCoverage {
  if (!state) return "unknown";
  if (state === "unavailable" || state === "insufficient_evidence") return "unavailable";
  if (state === "usable_with_caveats" || state === "conflicting" || state === "stale") return "partial";
  return "complete";
}

function domainConfidence(confidence: ConfidenceSummary, domain: ConfidenceDomain): {
  confidenceLabel: TruthConfidence;
  freshness: TruthFreshness;
  coverage: TruthCoverage;
} {
  const entry = getDomainConfidence(confidence, domain);
  const confidenceLabel = mapStateToConfidenceLabel(entry?.state);
  return {
    confidenceLabel,
    freshness: stateToFreshness(entry?.state),
    coverage: stateToCoverage(entry?.state)
  };
}

function metricDomains(metric: ExecutiveMetric): ConfidenceDomain[] {
  switch (metric.label) {
    case "Revenue":
    case "Orders":
    case "AOV":
      return ["woo"];
    case "Sessions":
      return ["ga4"];
    case "Purchase conversion":
      return ["woo", "ga4"];
    case "Funnel completion":
      return ["funnelkit"];
    default:
      return [];
  }
}

function domainLabel(domains: ConfidenceDomain[]): string {
  if (domains.length === 0) return "Source";
  const pretty = domains.map((d) => (d === "funnelkit" ? "Funnel" : d.toUpperCase()));
  return pretty.join("+");
}

export function formatExecutiveTruthLine(input: { metric: ExecutiveMetric; rangeLabel: string; confidence: ConfidenceSummary }): string {
  const domains = metricDomains(input.metric);
  const hasValue = input.metric.current != null;

  let coverage: TruthCoverage = hasValue ? "complete" : "unavailable";
  let freshness: TruthFreshness = "unknown";
  let confidenceLabel: TruthConfidence = hasValue ? "Medium" : "Blocked";

  if (domains.length) {
    const initial = domainConfidence(input.confidence, domains[0]);
    coverage = hasValue ? initial.coverage : "unavailable";
    freshness = initial.freshness;
    confidenceLabel = hasValue ? initial.confidenceLabel : "Blocked";
    for (const d of domains.slice(1)) {
      const next = domainConfidence(input.confidence, d);
      coverage = mergeCoverage(coverage, next.coverage);
      freshness = mergeFreshness(freshness, next.freshness);
      confidenceLabel = mergeConfidence(confidenceLabel, next.confidenceLabel);
    }
  }

  // If we have a value but the underlying domain confidence is blocked/unavailable,
  // never pair the value with an "Unavailable" status line.
  if (hasValue && (confidenceLabel === "Blocked" || coverage === "unavailable")) {
    coverage = "partial";
    confidenceLabel = confidenceLabel === "Blocked" ? "Low" : confidenceLabel;
    if (freshness === "unavailable") freshness = "unknown";
  }

  if (!hasValue) {
    return `${domainLabel(domains)} · Unavailable`;
  }

  // Keep line short and scanable.
  // Example target: "Partial coverage · Low confidence"
  const parts = [
    domainLabel(domains),
    coverageLabel(coverage),
    freshnessLabel(freshness),
    summarizeConfidence(confidenceLabel)
  ];

  return parts.join(" · ");
}
