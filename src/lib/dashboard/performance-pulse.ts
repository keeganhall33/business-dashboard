import type { HeaderMetric, PerformanceBaseline, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

export type BusinessPulseStatus = "on_plan" | "improving" | "slipping" | "missing";

export type PerformancePulseStat = {
  key: keyof PerformanceBaseline;
  label: string;
  currentValue: string;
  priorComparisonLabel: string;
  targetLabel?: string;
  status: BusinessPulseStatus;
  statusLabel: string;
  decision: string;
};

export type PerformancePulseSummary = {
  headline: string;
  status: BusinessPulseStatus;
  statusLabel: string;
  stats: PerformancePulseStat[];
  hasData: boolean;
  emptyReason?: string;
};

type MetricConfig = {
  key: keyof PerformanceBaseline;
  label: string;
  formatter: (value: number | null | undefined) => string;
  scoreboardTokens: string[];
  targetFallback: string;
  decisions: Record<BusinessPulseStatus, string>;
};

const statusLabels: Record<BusinessPulseStatus, string> = {
  slipping: "Slipping",
  missing: "Missing signal",
  improving: "Improving",
  on_plan: "On plan"
};

const metricConfigs: MetricConfig[] = [
  {
    key: "revenue",
    label: "Revenue",
    formatter: formatCurrency,
    scoreboardTokens: ["revenue", "sales"],
    targetFallback: "Target: hold ≥$20K in this window.",
    decisions: {
      slipping: "Revenue is slipping. Pull the Protect revenue Command Feed action and pair it with the checkout playbook.",
      improving: "Revenue is outrunning plan. Keep the Email hero live and prep the next hero slot now.",
      on_plan: "Revenue is on plan. Maintain the current hero + collector follow-up cadence.",
      missing: "Revenue signal missing. Re-run marketing + website agents so the scoreboard can refresh."
    }
  },
  {
    key: "orders",
    label: "Orders",
    formatter: formatNumber,
    scoreboardTokens: ["order"],
    targetFallback: "Target: ≥40 orders per window.",
    decisions: {
      slipping: "Orders dropped. Hit the warm collector list and push the Promote/Protect card tagged Email hero.",
      improving: "Order volume is improving. Keep nurturing recent buyers and capture testimonials.",
      on_plan: "Orders are steady. Keep Command Feed priorities moving and prep the next launch.",
      missing: "Orders signal missing. Need Woo snapshot before judging performance."
    }
  },
  {
    key: "aov",
    label: "Average order value",
    formatter: formatCurrency,
    scoreboardTokens: ["aov", "average"],
    targetFallback: "Target: ≥$500 average cart.",
    decisions: {
      slipping: "AOV is down. Bundle prints or add a premium upsell inside the hero flow.",
      improving: "AOV lift detected. Keep the high-ticket framing in place.",
      on_plan: "AOV is on plan. Monitor fulfillment quality so premium buyers stay confident.",
      missing: "AOV signal missing. Refresh Woo data to price against reality."
    }
  },
  {
    key: "conversion",
    label: "Conversion",
    formatter: formatPercent,
    scoreboardTokens: ["conversion"],
    targetFallback: "Target: ≥2.5% blended checkout conversion.",
    decisions: {
      slipping: "Conversion leak. Run the Funnel Leak playbook below and resolve the Command Feed funnel action.",
      improving: "Conversion is improving. Scale the proven offer without changing the checkout promise.",
      on_plan: "Conversion is on plan. Keep current offer + proof stack aligned.",
      missing: "Conversion signal missing. Need GA4 + Woo snapshots for an accurate read."
    }
  },
  {
    key: "sessions",
    label: "Sessions",
    formatter: formatNumber,
    scoreboardTokens: ["session", "traffic"],
    targetFallback: "Target: ≥1.8K quality sessions.",
    decisions: {
      slipping: "Traffic soft. Trigger the Paid test tag or ship an Email hero to refill the funnel.",
      improving: "Sessions are growing. Keep the paid + owned cadence steady.",
      on_plan: "Traffic is where we expect. Focus on the downstream moves above.",
      missing: "Traffic signal missing. Confirm GA4 tracking or Cloudflare logs before taking action."
    }
  }
];

export function buildPerformancePulseSummary(options: {
  websiteSnapshot?: WebsiteConversionSnapshot | null;
  baseline?: PerformanceBaseline | null;
  headerMetrics?: HeaderMetric[] | null;
}): PerformancePulseSummary {
  const { websiteSnapshot, baseline, headerMetrics } = options;
  const scoreboardMetrics = headerMetrics ?? [];

  if (!baseline && !websiteSnapshot && scoreboardMetrics.length === 0) {
    return {
      headline: "Need fresh data before judging performance.",
      status: "missing",
      statusLabel: statusLabels.missing,
      stats: [],
      hasData: false,
      emptyReason: "Run `pnpm marketing:run` and refresh the website agent so scoreboard metrics and baselines stay current."
    };
  }

  const stats: PerformancePulseStat[] = [];

  for (const config of metricConfigs) {
    const baselineEntry = baseline?.[config.key] ?? null;
    const baselineCurrent = typeof baselineEntry?.current === "number" ? baselineEntry.current : null;
    const baselinePrevious = typeof baselineEntry?.previous === "number" ? baselineEntry.previous : null;
    const fallbackValue = getFallbackValue(config.key, websiteSnapshot);
    const scoreboardMetric = findScoreboardMetric(scoreboardMetrics, config.scoreboardTokens);
    const scoreboardCurrent = typeof scoreboardMetric?.currentValue === "number" ? scoreboardMetric.currentValue : null;

    const currentValueRaw =
      baselineCurrent ??
      scoreboardCurrent ??
      (typeof fallbackValue === "number" ? fallbackValue : null);

    const percentChange = computePercentChange(currentValueRaw, baselinePrevious);
    const comparisonLabel = buildComparisonLabel(percentChange, scoreboardMetric?.deltaPercent ?? null);
    const targetLabel = buildTargetLabel(scoreboardMetric, config.targetFallback);
    const status = derivePlanStatus({ currentValue: currentValueRaw, percentChange, scoreboardStatus: scoreboardMetric?.status });

    stats.push({
      key: config.key,
      label: config.label,
      currentValue: config.formatter(currentValueRaw),
      priorComparisonLabel: comparisonLabel,
      targetLabel,
      status,
      statusLabel: statusLabels[status],
      decision: config.decisions[status]
    });
  }

  const prioritized = prioritizeStats(stats);
  const limited = limitedStats(prioritized, stats);
  const hasData = limited.some((stat) => stat.status !== "missing");
  const overallStatus = deriveOverallStatus(limited);

  return {
    headline: buildHeadline(overallStatus, limited),
    status: overallStatus,
    statusLabel: statusLabels[overallStatus],
    stats: limited,
    hasData,
    emptyReason: hasData ? undefined : "Need fresher website + scoreboard data before making a call."
  };
}

function findScoreboardMetric(metrics: HeaderMetric[], tokens: string[]) {
  if (!metrics.length) return null;
  const loweredTokens = tokens.map((token) => token.toLowerCase());
  return (
    metrics.find((metric) => metric.metricKey && loweredTokens.some((token) => metric.metricKey.toLowerCase().includes(token))) ??
    metrics.find((metric) => metric.metricName && loweredTokens.some((token) => metric.metricName.toLowerCase().includes(token))) ??
    null
  );
}

function buildComparisonLabel(percentChange: number | null, scoreboardDelta: number | null) {
  if (percentChange != null) {
    return `${formatPercentDelta(percentChange)} vs prior window`;
  }
  if (scoreboardDelta != null) {
    return `${formatPercentDelta(scoreboardDelta)} vs scoreboard target`;
  }
  return "Awaiting prior-window comparison";
}

function buildTargetLabel(metric: HeaderMetric | null, fallback: string) {
  if (!metric || metric.targetValue == null) {
    return fallback;
  }
  return `Target: ${formatByUnit(metric.targetValue, metric.unit)}`;
}

function prioritizeStats(stats: PerformancePulseStat[]) {
  const priority: Record<BusinessPulseStatus, number> = {
    slipping: 0,
    missing: 1,
    improving: 2,
    on_plan: 3
  };
  return [...stats].sort((a, b) => priority[a.status] - priority[b.status]);
}

function limitedStats(prioritized: PerformancePulseStat[], fullStats: PerformancePulseStat[]) {
  const ordered = new Map<string, PerformancePulseStat>();
  for (const stat of prioritized) {
    if (ordered.size >= 4) break;
    ordered.set(stat.key as string, stat);
  }
  if (!ordered.has("revenue")) {
    const revenueStat = fullStats.find((stat) => stat.key === "revenue");
    if (revenueStat) {
      ordered.set(revenueStat.key as string, revenueStat);
    }
  }
  const result = Array.from(ordered.values());
  return result.length ? result : fullStats.slice(0, 2);
}

function deriveOverallStatus(stats: PerformancePulseStat[]): BusinessPulseStatus {
  if (!stats.length) return "missing";
  if (stats.some((stat) => stat.status === "slipping")) return "slipping";
  if (stats.some((stat) => stat.status === "missing")) return "missing";
  if (stats.some((stat) => stat.status === "improving")) return "improving";
  return "on_plan";
}

function buildHeadline(status: BusinessPulseStatus, stats: PerformancePulseStat[]) {
  const listFor = (target: BusinessPulseStatus) =>
    stats.filter((stat) => stat.status === target).map((stat) => stat.label);
  switch (status) {
    case "slipping": {
      const slipping = listFor("slipping");
      return slipping.length ? `Slipping: ${slipping.join(" + ")}` : "Slipping – fix the highlighted leak.";
    }
    case "missing": {
      const missing = listFor("missing");
      return missing.length ? `Missing signal: ${missing.join(" + ")}` : "Missing signal – refresh data.";
    }
    case "improving": {
      const improving = listFor("improving");
      return improving.length ? `Improving: ${improving.join(" + ")}` : "Improving – keep pressure on.";
    }
    default:
      return "On plan – keep executing Command Feed priorities.";
  }
}

function derivePlanStatus(options: {
  currentValue: number | null;
  percentChange: number | null;
  scoreboardStatus?: HeaderMetric["status"] | null;
}): BusinessPulseStatus {
  const { currentValue, percentChange, scoreboardStatus } = options;
  if (currentValue == null) {
    return "missing";
  }
  if (scoreboardStatus === "critical" || scoreboardStatus === "warning") {
    return "slipping";
  }
  if (percentChange != null) {
    if (percentChange <= -5) {
      return "slipping";
    }
    if (percentChange >= 5) {
      return "improving";
    }
  }
  if (scoreboardStatus === "healthy" || scoreboardStatus === "on_track") {
    return "on_plan";
  }
  if (percentChange != null) {
    return percentChange >= 0 ? "on_plan" : "slipping";
  }
  return "on_plan";
}

function computePercentChange(currentValue: number | null, previousValue: number | null) {
  if (currentValue == null || previousValue == null || previousValue === 0) return null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

function getFallbackValue(metricKey: string, snapshot?: WebsiteConversionSnapshot | null) {
  const woo = snapshot?.wooCommerce;
  switch (metricKey) {
    case "revenue":
      return woo?.totalRevenue ?? null;
    case "orders":
      return woo?.orderCount ?? null;
    case "aov":
      return woo?.averageOrderValue ?? null;
    case "sessions":
      return snapshot?.ga4?.sessions ?? null;
    case "conversion":
      if (!woo || !snapshot?.ga4?.sessions) return null;
      if (!woo.orderCount || woo.orderCount <= 0) return null;
      if (!snapshot.ga4.sessions || snapshot.ga4.sessions <= 0) return null;
      return (woo.orderCount / snapshot.ga4.sessions) * 100;
    default:
      return null;
  }
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatPercentDelta(value: number) {
  const formatted = value.toFixed(1);
  return `${value >= 0 ? "+" : ""}${formatted}%`;
}

function formatByUnit(value: number | null | undefined, unit?: string | null) {
  if (value == null) return "—";
  if (!unit) return formatNumber(value);
  if (unit.toLowerCase().includes("usd") || unit.toLowerCase().includes("currency")) {
    return formatCurrency(value);
  }
  if (unit.toLowerCase().includes("percent")) {
    return formatPercent(value);
  }
  return formatNumber(value);
}
