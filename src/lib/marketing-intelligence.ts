import type { CommerceTelemetry, MetaAdsSnapshot } from "@/lib/types/dashboard";

export type MarketingAction = {
  id: string;
  title: string;
  recommendation: string;
  evidence: string;
  expectedImpact: string;
  confidence: number; // 0-1 heuristic
  confidenceLabel: string;
  urgency: "Today" | "This week" | "This month";
};

export type MarketingInsights = {
  attentionHeadline: string;
  attentionEvidence: string[];
  drivers: string[];
  outlook: string;
  actions: MarketingAction[];
  metrics: Array<{ label: string; value: string; delta?: string }>;
  evidenceSources: string[];
};

export function buildMarketingInsights({
  commerceTelemetry,
  metaAds
}: {
  commerceTelemetry?: CommerceTelemetry;
  metaAds?: MetaAdsSnapshot | null;
}): MarketingInsights {
  const actions: MarketingAction[] = [];
  const drivers: string[] = [];
  const evidenceSources: Set<string> = new Set();

  const ga4 = commerceTelemetry?.ga4;
  const gaSeries = ga4?.timeseries ?? [];
  const sessionsTrend = computeTrend(gaSeries.map((point) => point.sessions));
  const revenueTrend = computeTrend(gaSeries.map((point) => point.revenue));

  if (ga4?.summary) {
    evidenceSources.add("GA4");
  }

  if (sessionsTrend && sessionsTrend.delta <= -0.15 && meetsVolumeGuard(sessionsTrend, 500, 100)) {
    const headline = `GA4 sessions down ${formatPercent(sessionsTrend.delta)} vs range start`;
    drivers.push(headline);
    actions.push({
      id: "ga4-sessions",
      title: "Stabilize acquisition",
      recommendation: "Audit paid + referral sources, shift spend to high-intent audiences, and refresh top landing pages.",
      evidence: headline,
      expectedImpact: "Restore top-of-funnel volume by ~15%",
      confidence: Math.min(0.95, Math.abs(sessionsTrend.delta) + 0.5),
      confidenceLabel: "Heuristic rule",
      urgency: "This week"
    });
  }

  if (revenueTrend && revenueTrend.delta <= -0.1 && meetsVolumeGuard(revenueTrend, 5000, 1000)) {
    const lostRevenue = Math.max(0, (revenueTrend.first ?? 0) - (revenueTrend.last ?? 0));
    const headline = `GA4 web revenue down ${formatPercent(revenueTrend.delta)} during the range`;
    drivers.push(headline);
    actions.push({
      id: "ga4-revenue",
      title: "Protect conversion revenue",
      recommendation: "Add a limited-time offer to the highest converting funnel and retarget engaged visitors immediately.",
      evidence: headline,
      expectedImpact: `Potentially recover ~$${Math.round(lostRevenue)}`,
      confidence: Math.min(0.95, Math.abs(revenueTrend.delta) + 0.55),
      confidenceLabel: "Heuristic rule",
      urgency: "This week"
    });
  }

  const metaIsLive = metaAds?.summary && metaAds.status === "LIVE";
  if (metaIsLive) {
    evidenceSources.add("Meta Ads");
    const spend = metaAds.summary.spend ?? 0;
    const roas = metaAds.summary.roas ?? null;
    if (spend > 500 && (roas == null || roas < 1.5)) {
      const weakestCampaign = [...(metaAds.campaigns ?? [])].sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))[0];
      const campaignEvidence = weakestCampaign
        ? `${weakestCampaign.campaignName}: spend ${currency(weakestCampaign.spend)} • ROAS ${formatNumber(weakestCampaign.roas)}.`
        : "Campaign-level ROAS below target.";
      drivers.push(`Meta spend ${currency(spend)} with ROAS ${formatNumber(roas)}.`);
      actions.push({
        id: "meta-roas",
        title: "Reallocate underperforming Meta campaigns",
        recommendation: weakestCampaign
          ? `Reduce spend on ${weakestCampaign.campaignName} and shift budget to campaigns with ROAS > 1.5x.`
          : "Audit active campaigns and reallocate any ROAS < 1.5x until creative refresh completes.",
        evidence: campaignEvidence,
        expectedImpact: `Reduce wasted spend by ~$${Math.round(spend * (1 - (roas ?? 0) / 1.5))}`,
        confidence: 0.8,
        confidenceLabel: "Heuristic rule",
        urgency: "Today"
      });
    }

    if (spend > 0 && (metaAds.summary.purchases ?? 0) === 0) {
      drivers.push("Meta spend is not generating reported purchases.");
      actions.push({
        id: "meta-no-purchase",
        title: "Investigate Meta conversion tracking/performance",
        recommendation:
          "Verify pixel + Conversions API, confirm attribution windows, and confirm campaigns have had enough time/volume to convert.",
        evidence: `Meta reported ${currency(spend)} spend with zero purchases in ${metaAds.range}d window`,
        expectedImpact: "Restore trust in paid efficiency data and unlock optimization decisions",
        confidence: 0.7,
        confidenceLabel: "Heuristic rule",
        urgency: "This week"
      });
    }
  }

  const metrics: Array<{ label: string; value: string; delta?: string }> = [];
  if (ga4?.summary) {
    metrics.push({ label: "GA4 web revenue", value: currency(ga4.summary.revenue ?? 0), delta: formatPercent(revenueTrend?.delta ?? null) });
    metrics.push({ label: "GA4 sessions", value: formatNumber(ga4.summary.sessions), delta: formatPercent(sessionsTrend?.delta ?? null) });
  }
  if (metaAds?.summary) {
    metrics.push({ label: "Meta spend", value: currency(metaAds.summary.spend ?? 0) });
    metrics.push({ label: "Meta ROAS", value: formatNumber(metaAds.summary.roas) });
  }

  const sortedActions = dedupeActions(actions).slice(0, 3);
  const topAction = sortedActions[0];
  const attentionHeadline = topAction
    ? `${topAction.title}: ${topAction.evidence}`
    : "Marketing steady. No urgent issues detected.";

  const attentionEvidence = topAction ? [topAction.evidence] : ["GA4 + Meta telemetry report no material swings."];
  if (drivers.length === 0 && topAction) drivers.push(topAction.evidence);

  const outlook = topAction
    ? `If successful, this action could ${topAction.expectedImpact.toLowerCase()}.`
    : "Trajectory is stable; maintain current channel mix while monitoring acquisition cost.";

  return {
    attentionHeadline,
    attentionEvidence,
    drivers: drivers.slice(0, 3),
    outlook,
    actions: sortedActions,
    metrics,
    evidenceSources: Array.from(evidenceSources)
  };
}

function computeTrend(series: number[]) {
  if (!series || series.length < 2) return null;
  const first = series.find((value) => value != null && Number.isFinite(value));
  const last = [...series].reverse().find((value) => value != null && Number.isFinite(value));
  if (first == null || last == null || first === 0) return null;
  return { first, last, delta: (last - first) / first };
}

function meetsVolumeGuard(trend: { first: number; last: number }, minBaseline: number, minAbsoluteChange: number) {
  const absoluteChange = Math.abs(trend.last - trend.first);
  return trend.first >= minBaseline && absoluteChange >= minAbsoluteChange;
}

function formatPercent(value: number | null) {
  if (value == null) return "0%";
  const pct = Math.round(value * 100);
  return `${pct}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
function currency(value: number | null | undefined) {
  return USD.format(value ?? 0);
}

function dedupeActions(actions: MarketingAction[]) {
  const seen = new Set<string>();
  const results: MarketingAction[] = [];
  for (const action of actions) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    results.push(action);
  }
  return results;
}
