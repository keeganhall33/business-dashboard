import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type {
  ExplainResponse,
  ExplanationConfidence,
  ExplanationDriver,
  ExplanationEvidenceItem,
  MetricExplanation
} from "./explanation-contract";
import { decomposeRevenue } from "./metric-decomposition";
import { detectOutliers } from "./anomaly-detection";
import { buildEvidenceTimeline } from "./evidence-timeline";

function confidenceFromScore(score: number): ExplanationConfidence {
  if (score >= 0.85) return "strongly_supported";
  if (score >= 0.65) return "likely";
  if (score >= 0.4) return "possible";
  return "insufficient_evidence";
}

function driverMagnitude(percent: number | null) {
  const p = Math.abs(percent ?? 0);
  if (!Number.isFinite(p)) return "minor" as const;
  if (p >= 25) return "major" as const;
  if (p >= 10) return "moderate" as const;
  return "minor" as const;
}

function buildMetricEvidence(id: string, label: string, source: ExplanationEvidenceItem["source"], details: Record<string, unknown>): ExplanationEvidenceItem {
  return { id, label, source, kind: "metric", details };
}

export function explainRevenueChange(params: {
  metric: string;
  currentRange: { startDate: string; endDate: string };
  comparisonRange: { startDate: string; endDate: string };
  current: DashboardOverviewResponse;
  previous: DashboardOverviewResponse;
}): ExplainResponse {
  const now = new Date().toISOString();

  const currentWoo = params.current.commerceTelemetry?.woo?.summary ?? null;
  const prevWoo = params.previous.commerceTelemetry?.woo?.summary ?? null;
  const currentGa = params.current.commerceTelemetry?.ga4?.summary ?? null;
  const prevGa = params.previous.commerceTelemetry?.ga4?.summary ?? null;

  const currentRevenueCents = currentWoo?.revenue != null ? Math.round(currentWoo.revenue * 100) : null;
  const prevRevenueCents = prevWoo?.revenue != null ? Math.round(prevWoo.revenue * 100) : null;
  const currentOrders = currentWoo?.orders ?? null;
  const prevOrders = prevWoo?.orders ?? null;
  const currentSessions = currentGa?.sessions ?? null;
  const prevSessions = prevGa?.sessions ?? null;

  const decomposition = decomposeRevenue({
    current: { revenueCents: currentRevenueCents, orders: currentOrders, sessions: currentSessions },
    previous: { revenueCents: prevRevenueCents, orders: prevOrders, sessions: prevSessions }
  });

  const evidence: ExplanationEvidenceItem[] = [
    buildMetricEvidence("woo:revenue", "Woo revenue (net)", "woo", {
      revenueCents: currentRevenueCents,
      previousRevenueCents: prevRevenueCents,
      definitionVersion: currentWoo?.definitionVersion ?? null,
      completeness: currentWoo?.completeness ?? null,
      coverageStart: currentWoo?.coverageStart ?? null,
      coverageEnd: currentWoo?.coverageEnd ?? null,
      asOf: currentWoo?.asOf ?? null
    }),
    buildMetricEvidence("ga4:sessions", "GA4 sessions", "ga4", {
      sessions: currentSessions,
      previousSessions: prevSessions
    })
  ];

  const missingSources: string[] = [];
  if (!currentWoo || currentRevenueCents == null) missingSources.push("woo");
  if (!currentGa || currentSessions == null) missingSources.push("ga4");

  const isAllZeroWindow =
    currentRevenueCents === 0 &&
    prevRevenueCents === 0 &&
    (currentOrders ?? 0) === 0 &&
    (prevOrders ?? 0) === 0 &&
    (currentSessions ?? 0) === 0 &&
    (prevSessions ?? 0) === 0;

  // Driver construction
  const driverMap: Record<string, ExplanationDriver> = {};
  for (const entry of decomposition.driverRanking) {
    const key = entry.key;
    const percent =
      key === "sessions"
        ? decomposition.sessions.percent
        : key === "conversion"
          ? decomposition.conversionRate.percent
          : decomposition.aovCents.percent;

    const direction = (percent ?? 0) > 0 ? "up" : (percent ?? 0) < 0 ? "down" : "flat";
    const magnitude = driverMagnitude(percent);
    const score = Math.min(1, entry.score / 100);
    const conf = confidenceFromScore(score);
    const reasons: string[] = [];
    if (percent == null) reasons.push("Insufficient baseline (zero or missing denominator)");
    if (decomposition.caveats.length) reasons.push(...decomposition.caveats);
    if (missingSources.includes("ga4") && key !== "aov") reasons.push("Traffic evidence missing (GA4 sessions unavailable)");

    driverMap[key] = {
      id: `driver_${key}`,
      label: key === "sessions" ? "Traffic (sessions)" : key === "conversion" ? "Conversion rate" : "Average order value",
      direction,
      magnitude,
      impactEstimate: {
        unit: key === "aov" ? "cents" : "percent",
        value: percent,
        note: percent == null ? "percent unavailable" : null
      },
      confidence: conf,
      confidenceReasons: reasons,
      evidence
    };
  }

  const sortedDrivers = [driverMap.sessions, driverMap.conversion, driverMap.aov].filter(Boolean);
  const primary = isAllZeroWindow ? null : (sortedDrivers[0] ?? null);
  const contributing = isAllZeroWindow ? [] : sortedDrivers.slice(1);

  const deltaCents = decomposition.revenue.deltaCents;
  const pctChange = decomposition.revenue.percent;

  // Outliers based on Woo daily revenue.
  const wooSeries = (params.current.commerceTelemetry?.woo?.timeseries ?? []).map((p) => ({ date: p.date, value: p.revenue }));
  const outliers = detectOutliers(wooSeries, { zThreshold: 3 });

  const outlierHypothesis = outliers.length
    ? {
        hypothesis: "A small number of outlier days (unusually large orders) distorted the period.",
        evidence_for: outliers.slice(0, 3).map((o) => `${o.date} revenue spike (${o.reason})`),
        evidence_against: [],
        effect_magnitude: "unknown",
        confidence: "possible" as const,
        conclusion: "inconclusive" as const
      }
    : null;

  const alternative_explanations: MetricExplanation["alternative_explanations"] = [
    {
      hypothesis: "Traffic changed materially",
      evidence_for: decomposition.sessions.percent != null ? [`Sessions change ${decomposition.sessions.percent.toFixed(1)}%`] : [],
      evidence_against: [],
      effect_magnitude: decomposition.sessions.percent != null ? `${decomposition.sessions.percent.toFixed(1)}%` : null,
      confidence: decomposition.sessions.percent != null ? "likely" : "insufficient_evidence",
      conclusion: decomposition.sessions.percent != null ? "supported" : "inconclusive"
    },
    {
      hypothesis: "Conversion rate changed materially",
      evidence_for:
        decomposition.conversionRate.percent != null ? [`Conversion change ${decomposition.conversionRate.percent.toFixed(1)}%`] : [],
      evidence_against: [],
      effect_magnitude: decomposition.conversionRate.percent != null ? `${decomposition.conversionRate.percent.toFixed(1)}%` : null,
      confidence: decomposition.conversionRate.percent != null ? "likely" : "insufficient_evidence",
      conclusion: decomposition.conversionRate.percent != null ? "supported" : "inconclusive"
    },
    {
      hypothesis: "Average order value changed materially",
      evidence_for: decomposition.aovCents.percent != null ? [`AOV change ${decomposition.aovCents.percent.toFixed(1)}%`] : [],
      evidence_against: [],
      effect_magnitude: decomposition.aovCents.percent != null ? `${decomposition.aovCents.percent.toFixed(1)}%` : null,
      confidence: decomposition.aovCents.percent != null ? "likely" : "insufficient_evidence",
      conclusion: decomposition.aovCents.percent != null ? "supported" : "inconclusive"
    }
  ];
  if (outlierHypothesis) alternative_explanations.push(outlierHypothesis);

  // Confidence: degrade if key sources missing.
  const confidenceReasons: string[] = [];
  let confScore = 0.7;
  if (isAllZeroWindow) {
    confScore = 0.15;
    confidenceReasons.push("Both periods are all-zero for revenue/orders/sessions; no meaningful signal to explain.");
  }
  if (missingSources.length) {
    confScore -= 0.25;
    confidenceReasons.push(`Missing sources: ${missingSources.join(", ")}`);
  }
  if ((currentOrders ?? 0) < 5 || (prevOrders ?? 0) < 5) {
    confScore -= 0.15;
    confidenceReasons.push("Small order counts reduce confidence.");
  }
  if (outliers.length) {
    confScore -= 0.1;
    confidenceReasons.push("Outliers detected; normalized view not yet available at order-level.");
  }
  const overallConfidence = confidenceFromScore(Math.max(0, Math.min(1, confScore)));

  const explanation: MetricExplanation = {
    metric: params.metric,
    current_period: params.currentRange,
    comparison_period: params.comparisonRange,
    absolute_change: deltaCents,
    percentage_change: pctChange,
    baseline: { currentValue: currentRevenueCents, previousValue: prevRevenueCents },
    primary_driver: primary,
    contributing_drivers: contributing,
    counteracting_drivers: [],
    possible_external_events: [],
    alternative_explanations,
    confidence: overallConfidence,
    confidence_reasons: confidenceReasons.length ? confidenceReasons : ["Derived from Woo + GA4 telemetry with known attribution limitations."],
    data_used: [
      { source: "Woo selected-range telemetry", notes: "Net revenue cents, order counts, coverage proof." },
      { source: "GA4 aggregate telemetry", notes: "Sessions summary when available." }
    ],
    data_missing: [
      "Email campaign telemetry",
      "Meta-to-Woo matchback attribution",
      "UTM/campaign taxonomy standardization",
      "Identity resolution",
      "Order-level outlier labeling (originals vs prints)"
    ],
    assumptions: ["Revenue decomposition uses sessions as traffic proxy and orders/sessions as purchase conversion."],
    limitations: ["Correlation does not prove causation. Meta performance cannot be assigned as incremental revenue without matchback."],
    recommended_follow_up: [
      "Confirm GA4 coverage for the range (sessions, funnel events)",
      "Inspect any outlier days in Woo timeseries",
      "Connect email telemetry to explain lifecycle-driven changes"
    ],
    evidence
  };

  const timeline = buildEvidenceTimeline({
    range: params.currentRange,
    commerceTelemetry: params.current.commerceTelemetry ?? null,
    metaSummary: params.current.metaAds?.summary ?? null,
    missingSources
  });

  return {
    ok: true,
    generatedAt: now,
    dataMode: params.current.dataMode,
    explanation,
    timeline: {
      window: params.currentRange,
      sources: timeline.sources,
      events: timeline.events
    }
  };
}
