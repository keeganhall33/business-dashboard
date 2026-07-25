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

  // Website snapshots do not currently include reliable reporting-period metadata.
  // To avoid misleading comparisons, Slice 1 only compares Meta snapshots where the range matches.
  const metaInsights = buildMetaInsights(params.metaCurrent ?? null, params.metaPrevious ?? null);

  const insights = [...metaInsights]
    .filter((item): item is ChangeInsight => Boolean(item))
    .slice(0, maxInsights);

  const currentGeneratedAt = params.metaCurrent?.generatedAt ?? params.websiteCurrent?.generatedAt;
  if (!currentGeneratedAt) return null;

  const previousGeneratedAt = params.metaPrevious?.generatedAt ?? null;

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

function buildMetaInsights(current: MetaAdsSnapshot | null, previous: MetaAdsSnapshot | null): ChangeInsight[] {
  if (!current || !previous) return [];
  if (typeof current.range !== "number" || typeof previous.range !== "number") return [];
  if (current.range !== previous.range) return [];

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
    unit: "multiplier",
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
  if (delta === 0) return null;
  const direction: ChangeInsight["direction"] = delta > 0 ? "up" : "down";

  const deltaPercent = previous === 0 ? null : delta / previous;

  const interpretation =
    direction === "up" ? params.interpretationPositive : params.interpretationNegative;

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
