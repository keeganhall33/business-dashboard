import type {
  ChangeInsight,
  MarketingCommandSnapshot,
  MetaAdsSnapshot,
  ProductConversionIntelligence,
  ProductConversionRow,
  SocialContentSnapshot,
  WebsiteConversionSnapshot
} from "@/lib/types/dashboard";

const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export type ChangeInsightParams = {
  websiteCurrent?: WebsiteConversionSnapshot | null;
  websitePrevious?: WebsiteConversionSnapshot | null;
  productCurrent?: ProductConversionIntelligence | null;
  productPrevious?: ProductConversionIntelligence | null;
  metaCurrent?: MetaAdsSnapshot | null;
  metaPrevious?: MetaAdsSnapshot | null;
  marketingCurrent?: MarketingCommandSnapshot | null;
  marketingPrevious?: MarketingCommandSnapshot | null;
  socialCurrent?: SocialContentSnapshot | null;
  socialPrevious?: SocialContentSnapshot | null;
};

export function buildChangeInsights(params: ChangeInsightParams): ChangeInsight[] {
  const insights: ChangeInsight[] = [];

  insights.push(...buildWebsiteInsights(params.websiteCurrent, params.websitePrevious));
  insights.push(...buildProductInsights(params.productCurrent, params.productPrevious));
  insights.push(...buildMetaInsights(params.metaCurrent, params.metaPrevious));
  insights.push(...buildMarketingInsights(params.marketingCurrent));
  insights.push(...buildSocialInsights(params.socialCurrent, params.socialPrevious));

  const filtered = insights.filter(Boolean);
  if (!filtered.length) {
    filtered.push({
      id: "change-no-history",
      title: "Waiting for historical comparisons",
      detail: "Once two full snapshots are captured, this panel will highlight the biggest swings automatically.",
      deltaLabel: "History unavailable",
      tone: "neutral",
      source: "Dashboard",
      comparisonLabel: "NO_HISTORY_YET",
      badges: ["NO_HISTORY_YET"]
    });
  }

  return filtered.slice(0, 5);
}

function buildWebsiteInsights(current?: WebsiteConversionSnapshot | null, previous?: WebsiteConversionSnapshot | null): ChangeInsight[] {
  if (!current) {
    return [
      {
        id: "website-missing",
        title: "Website snapshot missing",
        detail: "Run website:run to capture GA4 + Woo telemetry.",
        deltaLabel: "—",
        tone: "neutral",
        source: "Website snapshot",
        comparisonLabel: "NO_HISTORY_YET",
        badges: ["NO_HISTORY_YET"]
      }
    ];
  }
  if (!previous) {
    return [
      {
        id: "website-history",
        title: "Need another website snapshot",
        detail: "After the next run we can highlight traffic and conversion swings automatically.",
        deltaLabel: "Waiting on history",
        tone: "neutral",
        source: "Website snapshot",
        comparisonLabel: "NO_HISTORY_YET",
        badges: ["NO_HISTORY_YET"]
      }
    ];
  }

  const currentGa = current.ga4 ?? {};
  const prevGa = previous.ga4 ?? {};

  const metrics = [
    buildMetricDelta({ key: "sessions", label: "Traffic", current: currentGa.sessions, previous: prevGa.sessions, positiveAction: "Traffic inflection is strong — keep budget on winning stories.", negativeAction: "Traffic slipped — prioritize an email send or Meta boost.", unit: "sessions" }),
    buildMetricDelta({ key: "view_item", label: "Product views", current: currentGa.viewItemEvents, previous: prevGa.viewItemEvents, positiveAction: "Product storytelling is landing — keep feeding it.", negativeAction: "Product interest is cooling — refresh hero copy and reels.", unit: "views" }),
    buildMetricDelta({ key: "add_to_cart", label: "Add to cart", current: currentGa.addToCartEvents, previous: prevGa.addToCartEvents, positiveAction: "Cart volume is up — retarget while intent is high.", negativeAction: "Cart adds dropped — tighten PDP CTAs and urgency.", unit: "carts" }),
    buildRateDelta({ key: "cart_to_checkout", label: "Cart → checkout", currentNumerator: currentGa.beginCheckoutEvents, currentDenominator: currentGa.addToCartEvents, previousNumerator: prevGa.beginCheckoutEvents, previousDenominator: prevGa.addToCartEvents, positiveAction: "Cart experience is cleaner — keep the drawer fast.", negativeAction: "Most carts never reach checkout — audit drawer buttons + shipping preview." }),
    buildRateDelta({ key: "checkout_to_purchase", label: "Checkout → purchase", currentNumerator: currentGa.ecommercePurchases, currentDenominator: currentGa.beginCheckoutEvents, previousNumerator: prevGa.ecommercePurchases, previousDenominator: prevGa.beginCheckoutEvents, positiveAction: "Checkout trust is improving — safe to scale promo.", negativeAction: "Checkout completion fell — QA payments + show shipping upfront." }),
    buildMetricDelta({ key: "revenue", label: "Revenue", current: current.wooCommerce?.totalRevenue, previous: previous.wooCommerce?.totalRevenue, positiveAction: "Revenue momentum is up — keep the hero offer running.", negativeAction: "Revenue dipped — focus on the top converting piece.", unit: "currency" }),
    buildMetricDelta({ key: "orders", label: "Orders", current: current.wooCommerce?.orderCount, previous: previous.wooCommerce?.orderCount, positiveAction: "Order count rising — make sure fulfillment keeps up.", negativeAction: "Orders slipped — inspect funnel leaks before scaling.", unit: "orders" }),
    buildMetricDelta({ key: "aov", label: "Average order value", current: current.wooCommerce?.averageOrderValue, previous: previous.wooCommerce?.averageOrderValue, positiveAction: "Bundles + upsells are working.", negativeAction: "AOV fell — reintroduce bundles or framed options.", unit: "currency" })
  ].filter((metric): metric is MetricDelta => Boolean(metric));

  const comparisonLabel = buildComparisonLabel("Website", previous.generatedAt);
  const insights: ChangeInsight[] = [];
  const sorted = metrics
    .filter((metric) => metric.percentChange != null)
    .sort((a, b) => Math.abs((b.percentChange ?? 0)) - Math.abs((a.percentChange ?? 0)));

  if (sorted[0]) {
    insights.push(metricToInsight(sorted[0], comparisonLabel));
  }

  const checkoutMetric = metrics.find((metric) => metric.key === "checkout_to_purchase" && metric.percentChange != null);
  if (checkoutMetric && (checkoutMetric.percentChange ?? 0) <= -0.15) {
    insights.push(
      metricToInsight(
        checkoutMetric,
        comparisonLabel,
        "negative",
        "Checkout completion is sliding despite traffic. Fix trust badges, payment options, and tax/shipping transparency before scaling spend."
      )
    );
  }

  return insights;
}

function buildProductInsights(
  current?: ProductConversionIntelligence | null,
  previous?: ProductConversionIntelligence | null
): ChangeInsight[] {
  if (!current || !current.rows.length) {
    return [
      {
        id: "product-missing",
        title: "Product conversion unavailable",
        detail: "Run pnpm products:run to generate GA4 + Woo product data.",
        deltaLabel: "—",
        tone: "neutral",
        source: "Product conversion",
        comparisonLabel: "NO_HISTORY_YET",
        badges: ["WOO_ONLY"]
      }
    ];
  }

  if (!previous || !previous.rows.length) {
    return [
      {
        id: "product-history",
        title: "Awaiting prior product snapshot",
        detail: "We’ll call out hero movers once two snapshots exist.",
        deltaLabel: "Waiting on history",
        tone: "neutral",
        source: "Product conversion",
        comparisonLabel: "NO_HISTORY_YET",
        badges: ["NO_HISTORY_YET"]
      }
    ];
  }

  const currentMap = indexProductRows(current.rows);
  const previousMap = indexProductRows(previous.rows);
  const deltas: Array<{ row: ProductConversionRow; deltaRevenue: number }> = [];
  currentMap.forEach((row, key) => {
    const prevRow = previousMap.get(key);
    const currentRevenue = getRangeMetric(row, "7d", "wooRevenue") ?? 0;
    const previousRevenue = prevRow ? getRangeMetric(prevRow, "7d", "wooRevenue") ?? 0 : 0;
    const deltaRevenue = currentRevenue - previousRevenue;
    if (deltaRevenue !== 0) {
      deltas.push({ row, deltaRevenue });
    }
  });

  if (!deltas.length) return [];

  deltas.sort((a, b) => Math.abs(b.deltaRevenue) - Math.abs(a.deltaRevenue));
  const top = deltas[0];
  const tone = top.deltaRevenue >= 0 ? "positive" : "negative";
  const detail = top.deltaRevenue >= 0
    ? `${top.row.productName} added ${currencyFormatter.format(top.deltaRevenue)} vs. last snapshot. Keep it in the hero slot + email.`
    : `${top.row.productName} fell ${currencyFormatter.format(Math.abs(top.deltaRevenue))} vs. last snapshot. Revisit PDP story and retarget interested visitors.`;

  return [
    {
      id: `product-${top.row.productId ?? top.row.slug ?? "delta"}`,
      title: tone === "positive" ? `Promote ${top.row.productName}` : `Fix ${top.row.productName}`,
      detail,
      deltaLabel: `${top.deltaRevenue >= 0 ? "+" : "-"}${currencyFormatter.format(Math.abs(top.deltaRevenue))} revenue vs prior 7d`,
      tone,
      source: "Woo + GA4 product feed",
      comparisonLabel: "Compared to previous product snapshot",
      badges: ["LIVE_DELTA", "JOINED"]
    }
  ];
}

function buildMetaInsights(current?: MetaAdsSnapshot | null, previous?: MetaAdsSnapshot | null): ChangeInsight[] {
  if (!current || !current.summary) return [];
  if (!previous || !previous.summary) {
    return [
      {
        id: "meta-history",
        title: "Meta spend snapshot ready",
        detail: "Next run will compare spend & ROAS vs. the previous window.",
        deltaLabel: `${currencyFormatter.format(current.summary.spend ?? 0)} spend this window`,
        tone: "neutral",
        source: "Meta Ads",
        comparisonLabel: "NO_HISTORY_YET",
        badges: ["NO_HISTORY_YET"]
      }
    ];
  }

  const spendDelta = buildMetricDelta({ key: "meta-spend", label: "Meta spend", current: current.summary.spend, previous: previous.summary.spend, positiveAction: "Spend scaled with results — keep budget steady.", negativeAction: "Spend down — ensure remarketing stays on.", unit: "currency" });
  const roasDelta = buildMetricDelta({ key: "meta-roas", label: "ROAS", current: current.summary.roas, previous: previous.summary.roas, positiveAction: "ROAS is healthy — safe to reintroduce prospecting.", negativeAction: "ROAS slipped — refresh creative + fix attribution.", unit: "percent" });

  const insights: ChangeInsight[] = [];
  if (spendDelta && spendDelta.percentChange != null) {
    insights.push(metricToInsight(spendDelta, buildComparisonLabel("Meta", previous.generatedAt)));
  }
  if (roasDelta && roasDelta.percentChange != null) {
    insights.push(metricToInsight(roasDelta, buildComparisonLabel("Meta", previous.generatedAt)));
  }
  return insights.slice(0, 1);
}

function buildMarketingInsights(marketing?: MarketingCommandSnapshot | null): ChangeInsight[] {
  if (!marketing?.metricDeltas?.length) return [];
  const deltas = [...marketing.metricDeltas].sort((a, b) => Math.abs((b.percentChange ?? 0)) - Math.abs((a.percentChange ?? 0)));
  const top = deltas[0];
  if (!top || top.percentChange == null) return [];
  const direction = top.percentChange >= 0 ? "positive" : "negative";
  const detail = `${top.label} is ${top.percentChange >= 0 ? "up" : "down"} ${Math.abs(top.percentChange).toFixed(2)}% vs. prior ${marketing.range?.preset ?? "window"}.`;
  return [
    {
      id: `marketing-${top.metric}`,
      title: `${top.label} ${top.percentChange >= 0 ? "surged" : "fell"}`,
      detail,
      deltaLabel: `${top.percentChange >= 0 ? "+" : "-"}${Math.abs(top.percentChange).toFixed(2)}% vs prior`,
      tone: direction === "positive" ? "positive" : "negative",
      source: "Marketing Command",
      comparisonLabel: "Compared to previous Marketing Command window",
      badges: ["COMPARED_TO_PREVIOUS_SNAPSHOT"]
    }
  ];
}

function buildSocialInsights(current?: SocialContentSnapshot | null, previous?: SocialContentSnapshot | null): ChangeInsight[] {
  if (!current?.posts?.length) return [];
  if (!previous?.posts?.length) {
    return [
      {
        id: "social-history",
        title: "Social baseline captured",
        detail: "Next social scrape will highlight which formats are accelerating or fading.",
        deltaLabel: `${current.posts.length} posts scanned`,
        tone: "neutral",
        source: "Instagram",
        comparisonLabel: "NO_HISTORY_YET",
        badges: ["NO_HISTORY_YET"]
      }
    ];
  }
  const currentTop = pickTopPost(current.posts);
  const previousTop = pickTopPost(previous.posts);
  if (!currentTop || !previousTop) return [];
  const engagementDelta = currentTop.engagement - previousTop.engagement;
  if (engagementDelta === 0) return [];
  return [
    {
      id: "social-top-post",
      title: engagementDelta > 0 ? "Latest reel is outperforming" : "Recent content cooling",
      detail: engagementDelta > 0
        ? `Top post drove ${currentTop.engagement.toLocaleString()} interactions vs. ${previousTop.engagement.toLocaleString()} last time. Repurpose it into email + Meta now.`
        : `Top post engagement fell from ${previousTop.engagement.toLocaleString()} to ${currentTop.engagement.toLocaleString()}. Refresh hook and try a tighter cold-open.`,
      deltaLabel: `${engagementDelta > 0 ? "+" : "-"}${Math.abs(engagementDelta).toLocaleString()} interactions`,
      tone: engagementDelta > 0 ? "positive" : "negative",
      source: "Instagram",
      comparisonLabel: "Compared to previous scrape",
      badges: ["LIVE_DELTA"]
    }
  ];
}

function buildMetricDelta(input: {
  key: string;
  label: string;
  current?: number | null;
  previous?: number | null;
  positiveAction: string;
  negativeAction: string;
  unit: "currency" | "percent" | "sessions" | "views" | "carts" | "orders" | string;
}): MetricDelta | null {
  const current = toNumber(input.current);
  const previous = toNumber(input.previous);
  if (current == null || previous == null) return null;
  const delta = current - previous;
  const percentChange = previous !== 0 ? delta / Math.abs(previous) : null;
  return {
    key: input.key,
    label: input.label,
    current,
    previous,
    delta,
    percentChange,
    positiveAction: input.positiveAction,
    negativeAction: input.negativeAction,
    unit: input.unit
  };
}

function buildRateDelta(input: {
  key: string;
  label: string;
  currentNumerator?: number | null;
  currentDenominator?: number | null;
  previousNumerator?: number | null;
  previousDenominator?: number | null;
  positiveAction: string;
  negativeAction: string;
}): MetricDelta | null {
  const current = calculateRate(toNumber(input.currentNumerator), toNumber(input.currentDenominator));
  const previous = calculateRate(toNumber(input.previousNumerator), toNumber(input.previousDenominator));
  if (current == null || previous == null) return null;
  const delta = current - previous;
  const percentChange = previous !== 0 ? delta / Math.abs(previous) : null;
  return {
    key: input.key,
    label: input.label,
    current,
    previous,
    delta,
    percentChange,
    positiveAction: input.positiveAction,
    negativeAction: input.negativeAction,
    unit: "percent"
  };
}

type MetricDelta = {
  key: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
  percentChange: number | null;
  positiveAction: string;
  negativeAction: string;
  unit: string;
};

function toNumber(value?: number | string | null) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function calculateRate(value?: number | null, total?: number | null) {
  if (value == null || total == null || total === 0) return null;
  return value / total;
}

function metricToInsight(metric: MetricDelta, comparisonLabel: string, forcedTone?: "positive" | "negative", forcedDetail?: string): ChangeInsight {
  const tone: "positive" | "negative" = forcedTone ?? (metric.delta >= 0 ? "positive" : "negative");
  const detail = forcedDetail ?? (metric.delta >= 0 ? metric.positiveAction : metric.negativeAction);
  const deltaLabel = metric.unit === "currency"
    ? `${metric.delta >= 0 ? "+" : "-"}${currencyFormatter.format(Math.abs(metric.delta))}`
    : metric.unit === "percent"
      ? `${metric.delta >= 0 ? "+" : "-"}${percentFormatter.format(Math.abs(metric.delta))}`
      : `${metric.delta >= 0 ? "+" : "-"}${Math.abs(metric.delta).toLocaleString()} ${metric.unit}`;
  const percentLabel = metric.percentChange != null ? ` (${percentFormatter.format(Math.abs(metric.percentChange))} vs prior)` : "";
  return {
    id: `delta-${metric.key}`,
    title: `${metric.label} ${metric.delta >= 0 ? "improved" : "slipped"}`,
    detail,
    deltaLabel: `${deltaLabel}${percentLabel}`,
    tone,
    source: "GA4 + Woo",
    comparisonLabel,
    badges: ["LIVE_DELTA", "COMPARED_TO_PREVIOUS_SNAPSHOT"]
  };
}

function buildComparisonLabel(source: string, previousGeneratedAt?: string | null) {
  if (!previousGeneratedAt) return `${source} · COMPARED_TO_PREVIOUS_SNAPSHOT`;
  const formatted = new Date(previousGeneratedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${source} · Compared to snapshot ${formatted}`;
}

function indexProductRows(rows: ProductConversionRow[]) {
  const map = new Map<string, ProductConversionRow>();
  rows.forEach((row) => {
    const key = row.productId != null ? String(row.productId) : row.slug ?? row.productName;
    map.set(key, row);
  });
  return map;
}

function getRangeMetric(row: ProductConversionRow, range: RangeLabel, field: keyof ProductConversionRow["ranges"][number]) {
  const snapshot = row.ranges.find((entry) => entry.range === range);
  if (!snapshot) return null;
  const record = snapshot as unknown as Record<string, number | null | undefined>;
  return record[field as string] ?? null;
}

type RangeLabel = "7d" | "30d";

type TopPost = {
  engagement: number;
};

function pickTopPost(posts: SocialContentSnapshot["posts"]): TopPost | null {
  if (!Array.isArray(posts) || !posts.length) return null;
  const scored = posts.map((post) => ({
    post,
    engagement:
      (post.metrics.likes ?? 0) +
      (post.metrics.comments ?? 0) +
      (post.metrics.shares ?? 0) +
      (post.metrics.saves ?? 0)
  }));
  const top = scored.sort((a, b) => b.engagement - a.engagement)[0];
  if (!top) return null;
  return { engagement: top.engagement };
}
