import type { ChangeInsight, ChangeInsightsSnapshot, MetaAdsSnapshot, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

type Params = {
  websiteCurrent?: WebsiteConversionSnapshot | null;
  websitePrevious?: WebsiteConversionSnapshot | null;
  metaCurrent?: MetaAdsSnapshot | null;
  metaPrevious?: MetaAdsSnapshot | null;
  maxInsights?: number;
};

export function buildChangeInsightsSnapshot(params: Params): ChangeInsightsSnapshot | null {
  const maxInsights = Math.max(1, Math.min(params.maxInsights ?? 5, 8));

  const websiteInsights = buildWebsiteInsights(params.websiteCurrent ?? null, params.websitePrevious ?? null);
  const metaInsights = buildMetaInsights(params.metaCurrent ?? null, params.metaPrevious ?? null);

  const insights = [...websiteInsights, ...metaInsights]
    .filter((item): item is ChangeInsight => Boolean(item))
    .slice(0, maxInsights);

  const currentGeneratedAt = params.websiteCurrent?.generatedAt ?? params.metaCurrent?.generatedAt;
  if (!currentGeneratedAt) return null;

  const previousGeneratedAt = params.websitePrevious?.generatedAt ?? params.metaPrevious?.generatedAt ?? null;

  if (!previousGeneratedAt) {
    return {
      generatedAt: currentGeneratedAt,
      previousGeneratedAt: null,
      insights: []
    };
  }

  return {
    generatedAt: currentGeneratedAt,
    previousGeneratedAt,
    insights
  };
}

function buildWebsiteInsights(current: WebsiteConversionSnapshot | null, previous: WebsiteConversionSnapshot | null): ChangeInsight[] {
  if (!current || !previous) return [];

  const sessions = metricDelta({
    id: "website-sessions",
    label: "Website sessions",
    source: "website",
    unit: "count",
    current: current.ga4?.sessions ?? null,
    previous: previous.ga4?.sessions ?? null,
    interpretationPositive: "Traffic is up versus the prior snapshot.",
    interpretationNegative: "Traffic is down versus the prior snapshot.",
    interpretationFlat: "Traffic is flat versus the prior snapshot."
  });

  const revenue = metricDelta({
    id: "website-revenue",
    label: "Website revenue",
    source: "website",
    unit: "currency",
    current: current.wooCommerce?.totalRevenue ?? null,
    previous: previous.wooCommerce?.totalRevenue ?? null,
    interpretationPositive: "Revenue is up versus the prior snapshot.",
    interpretationNegative: "Revenue is down versus the prior snapshot.",
    interpretationFlat: "Revenue is flat versus the prior snapshot."
  });

  const conversion = rateDelta({
    id: "website-session-to-purchase",
    label: "Session → purchase rate",
    source: "website",
    currentRate: current.ga4?.funnelRates?.sessionToPurchase ?? null,
    previousRate: previous.ga4?.funnelRates?.sessionToPurchase ?? null
  });

  // Stable ordering: revenue, conversion, sessions.
  return [revenue, conversion, sessions].filter((item): item is ChangeInsight => Boolean(item));
}

function buildMetaInsights(current: MetaAdsSnapshot | null, previous: MetaAdsSnapshot | null): ChangeInsight[] {
  if (!current || !previous) return [];

  const spend = metricDelta({
    id: "meta-spend",
    label: "Meta spend",
    source: "meta",
    unit: "currency",
    current: current.summary?.spend ?? null,
    previous: previous.summary?.spend ?? null,
    interpretationPositive: "Spend increased versus the prior snapshot.",
    interpretationNegative: "Spend decreased versus the prior snapshot.",
    interpretationFlat: "Spend is flat versus the prior snapshot."
  });

  const roas = metricDelta({
    id: "meta-roas",
    label: "Meta ROAS",
    source: "meta",
    unit: "percent",
    current: current.summary?.roas ?? null,
    previous: previous.summary?.roas ?? null,
    interpretationPositive: "ROAS improved versus the prior snapshot.",
    interpretationNegative: "ROAS declined versus the prior snapshot.",
    interpretationFlat: "ROAS is flat versus the prior snapshot."
  });

  return [roas, spend].filter((item): item is ChangeInsight => Boolean(item));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

type MetricDeltaParams = {
  id: string;
  label: string;
  source: ChangeInsight["source"];
  unit: ChangeInsight["unit"];
  current: unknown;
  previous: unknown;
  interpretationPositive: string;
  interpretationNegative: string;
  interpretationFlat: string;
};

function metricDelta(params: MetricDeltaParams): ChangeInsight | null {
  const current = toNumber(params.current);
  const previous = toNumber(params.previous);
  if (current == null || previous == null) return null;

  const delta = current - previous;
  const direction: ChangeInsight["direction"] = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const deltaPercent = previous === 0 ? null : delta / previous;

  const interpretation =
    direction === "up" ? params.interpretationPositive : direction === "down" ? params.interpretationNegative : params.interpretationFlat;

  return {
    id: params.id,
    label: params.label,
    source: params.source,
    unit: params.unit,
    current,
    previous,
    delta,
    deltaPercent,
    direction,
    interpretation
  };
}

type RateDeltaParams = {
  id: string;
  label: string;
  source: ChangeInsight["source"];
  currentRate: unknown;
  previousRate: unknown;
};

function rateDelta(params: RateDeltaParams): ChangeInsight | null {
  const current = toNumber(params.currentRate);
  const previous = toNumber(params.previousRate);
  if (current == null || previous == null) return null;

  const delta = current - previous;
  const direction: ChangeInsight["direction"] = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const deltaPercent = previous === 0 ? null : delta / previous;

  const interpretation =
    direction === "up"
      ? "Conversion improved versus the prior snapshot."
      : direction === "down"
        ? "Conversion declined versus the prior snapshot."
        : "Conversion is flat versus the prior snapshot.";

  return {
    id: params.id,
    label: params.label,
    source: params.source,
    unit: "percent",
    current,
    previous,
    delta,
    deltaPercent,
    direction,
    interpretation
  };
}
