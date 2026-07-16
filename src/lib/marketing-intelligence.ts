import type { CommerceTelemetry, MetaAdsSnapshot } from "@/lib/types/dashboard";

export type MarketingAction = {
  id: string;
  title: string;
  recommendation: string;
  evidence: string;
  expectedImpact: string;
  confidence: number; // 0-1
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
  const sessionsDelta = percentChange(gaSeries.map((point) => point.sessions));
  const revenueDelta = percentChange(gaSeries.map((point) => point.revenue));

  if (ga4?.summary) {
    evidenceSources.add("GA4");
  }

  if (typeof sessionsDelta === "number" && sessionsDelta <= -0.15) {
    const headline = `Sessions down ${formatPercent(sessionsDelta)} vs range start`;
    drivers.push(headline);
    actions.push({
      id: "ga4-sessions",
      title: "Stabilize acquisition",
      recommendation: "Audit paid + referral sources, shift spend to high-intent audiences, and refresh top landing pages.",
      evidence: headline,
      expectedImpact: "Restore top-of-funnel volume by ~15%",
      confidence: Math.min(0.95, Math.abs(sessionsDelta) + 0.5),
      urgency: "This week"
    });
  }

  if (typeof revenueDelta === "number" && revenueDelta <= -0.1) {
    const headline = `GA4 revenue down ${formatPercent(revenueDelta)} within the range`;
    drivers.push(headline);
    actions.push({
      id: "ga4-revenue",
      title: "Protect conversion revenue",
      recommendation: "Add a limited-time offer to the highest converting funnel and retarget engaged visitors immediately.",
      evidence: headline,
      expectedImpact: "Recover ~$" + Math.abs(Math.round((ga4?.summary?.revenue ?? 0) * revenueDelta)) + " in lost revenue",
      confidence: Math.min(0.95, Math.abs(revenueDelta) + 0.55),
      urgency: "This week"
    });
  }

  if (metaAds?.summary) {
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
        title: "Pause underperforming Meta creative",
        recommendation: weakestCampaign
          ? `Pause ${weakestCampaign.campaignName} and reallocate spend toward proven offers.`
          : "Audit active campaigns and pause any ROAS < 1.5x until creative refresh completes.",
        evidence: campaignEvidence,
        expectedImpact: "Save $" + Math.round(spend * (1 - (roas ?? 0) / 1.5)) + " in wasted spend",
        confidence: 0.8,
        urgency: "Today"
      });
    }

    if (spend > 0 && (metaAds.summary.purchases ?? 0) === 0) {
      drivers.push("Meta spend is not generating reported purchases.");
      actions.push({
        id: "meta-no-purchase",
        title: "Fix Meta conversion tracking",
        recommendation: "Verify pixel + Conversions API, then sync Shopify/Woo conversions for accurate ROAS reporting.",
        evidence: `Meta reported ${currency(spend)} spend with zero purchases in ${metaAds.range}d window`,
        expectedImpact: "Restore confidence in paid efficiency decisions",
        confidence: 0.7,
        urgency: "This week"
      });
    }
  }

  const metrics: Array<{ label: string; value: string; delta?: string }> = [];
  if (ga4?.summary) {
    metrics.push({ label: "GA4 revenue", value: currency(ga4.summary.revenue ?? 0), delta: formatPercent(revenueDelta) });
    metrics.push({ label: "GA4 sessions", value: formatNumber(ga4.summary.sessions), delta: formatPercent(sessionsDelta) });
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
    ? `Expect ${topAction.expectedImpact.toLowerCase()} once this action completes.`
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

function percentChange(series: number[]) {
  if (!series || series.length < 2) return null;
  const first = series.find((value) => value != null && Number.isFinite(value));
  const last = [...series].reverse().find((value) => value != null && Number.isFinite(value));
  if (!first || !last || first === 0) return null;
  return (last - first) / first;
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
