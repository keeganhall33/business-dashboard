import type {
  ProductConversionIntelligence,
  ProductConversionRow,
  WebsiteConversionSnapshot,
  WooSummary
} from "@/lib/types/dashboard";

export type PriorityInsight = {
  id: string;
  priority: number;
  title: string;
  whyItMatters: string;
  action: string;
  confidence: "high" | "medium" | "low";
  source: string;
};

export type FunnelMetricInsight = {
  key: string;
  label: string;
  valueLabel: string;
  rateLabel?: string;
  status: "good" | "watch" | "risk" | "missing";
  summary: string;
  action: string;
};

export type MarketingActionInsight = {
  id: string;
  channel: string;
  recommendation: string;
  reason: string;
  confidence: "high" | "medium" | "low";
};

export type ProductCallout = {
  id: string;
  label: string;
  summary: string;
  recommendedAction: string;
  source: string;
};

export type DataLabel = {
  id: string;
  label: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
  detail?: string;
};

const RATE_THRESHOLDS = {
  overall: { warning: 0.006, good: 0.01 },
  viewToCart: { warning: 0.08, good: 0.15 },
  cartToCheckout: { warning: 0.35, good: 0.55 },
  checkoutToPurchase: { warning: 0.55, good: 0.75 }
};

export function buildWebsiteDecisionInsights({
  websiteSnapshot,
  wooSummary,
  productConversion
}: {
  websiteSnapshot: WebsiteConversionSnapshot | null;
  wooSummary: WooSummary | null;
  productConversion: ProductConversionIntelligence | null;
}) {
  const priorities = buildPriorities(websiteSnapshot, wooSummary, productConversion);
  const funnelMetrics = buildFunnelMetrics(websiteSnapshot);
  const productCallouts = buildProductCallouts(websiteSnapshot, productConversion);
  const marketingActions = buildMarketingActions(productCallouts, funnelMetrics);
  const dataLabels = buildDataLabels(websiteSnapshot);

  return {
    priorities,
    funnelMetrics,
    productCallouts,
    marketingActions,
    dataLabels
  };
}

function buildPriorities(
  websiteSnapshot: WebsiteConversionSnapshot | null,
  wooSummary: WooSummary | null,
  productConversion: ProductConversionIntelligence | null
): PriorityInsight[] {
  const priorities: PriorityInsight[] = [];
  const funnel = buildFunnelMetrics(websiteSnapshot);
  const riskMetrics = funnel.filter((metric) => metric.status === "risk" || metric.status === "missing");
  const watchMetrics = funnel.filter((metric) => metric.status === "watch");

  if (!websiteSnapshot) {
    priorities.push({
      id: "missing-snapshot",
      priority: 1,
      title: "Website telemetry missing",
      whyItMatters: "Command decisions require live GA4 + Woo snapshots.",
      action: "Re-run website:run or fix GA4 ingestion before taking action.",
      confidence: "medium",
      source: "Website snapshot"
    });
    return priorities;
  }

  const checkoutRisk = riskMetrics.find((metric) => metric.key === "checkoutToPurchase");
  if (checkoutRisk) {
    priorities.push({
      id: "checkout-risk",
      priority: 1,
      title: "Checkout drop-off is high",
      whyItMatters: checkoutRisk.summary,
      action: checkoutRisk.action,
      confidence: "high",
      source: "GA4 checkout funnel"
    });
  }

  const cartRisk = riskMetrics.find((metric) => metric.key === "viewToCart");
  if (cartRisk) {
    priorities.push({
      id: "cart-risk",
      priority: priorities.length + 1,
      title: "Product views are not converting to adds",
      whyItMatters: cartRisk.summary,
      action: cartRisk.action,
      confidence: "medium",
      source: "GA4 product interest"
    });
  }

  const trafficPriority = buildTrafficPriority(websiteSnapshot);
  if (trafficPriority) priorities.push(trafficPriority);

  const productMover = buildProductPriority(productConversion, websiteSnapshot);
  if (productMover) priorities.push(productMover);

  if (!priorities.length && watchMetrics.length) {
    const watch = watchMetrics[0];
    priorities.push({
      id: `watch-${watch.key}`,
      priority: 1,
      title: `${watch.label} needs attention`,
      whyItMatters: watch.summary,
      action: watch.action,
      confidence: "medium",
      source: "GA4 funnel"
    });
  }

  if (!priorities.length) {
    priorities.push({
      id: "steady",
      priority: 1,
      title: "Conversion steady — focus on growth",
      whyItMatters: "Funnel metrics are within target bands.",
      action: "Ship the next promo or campaign to add volume.",
      confidence: "medium",
      source: "GA4 funnel"
    });
  }

  return priorities.slice(0, 5);
}

function buildFunnelMetrics(snapshot: WebsiteConversionSnapshot | null): FunnelMetricInsight[] {
  if (!snapshot?.ga4) return [];
  const sessions = toNumber(snapshot.ga4.sessions);
  const views = toNumber(snapshot.ga4.viewItemEvents);
  const addToCart = toNumber(snapshot.ga4.addToCartEvents);
  const beginCheckout = toNumber(snapshot.ga4.beginCheckoutEvents);
  const purchases = toNumber(snapshot.ga4.ecommercePurchases);

  const metrics: FunnelMetricInsight[] = [];

  metrics.push(
    buildMetric("sessions", "Sessions", sessions, null, {
      missingCopy: "GA4 sessions missing",
      watchCopy: "Volume is thin — campaigns should push fresh traffic.",
      riskCopy: "Sessions extremely low — site needs traffic immediately.",
      action: "Promote hero story on email & Meta to replenish traffic.",
      thresholds: { good: 2200, warning: 1600, risk: 600 }
    })
  );

  metrics.push(
    buildMetric("viewToCart", "Product views → add to cart", addToCart, views, {
      missingCopy: "Need GA4 add_to_cart + view_item data",
      watchCopy: "Only ~10% of viewers add — tighten product story & CTAs.",
      riskCopy: "Product interest not converting. Refresh hero copy, price framing, and urgency.",
      action: "Test short hero copy + trust badges on product pages.",
      thresholds: RATE_THRESHOLDS.viewToCart,
      formatRate: true
    })
  );

  metrics.push(
    buildMetric("cartToCheckout", "Add to cart → begin checkout", beginCheckout, addToCart, {
      missingCopy: "Need begin_checkout event",
      watchCopy: "Cart drawer friction detected. Review shipping preview + extraneous steps.",
      riskCopy: "Most carts never reach checkout — checkout button, payment, or shipping preview is breaking.",
      action: "Run checkout drawer walkthrough, simplify steps, show shipping upfront.",
      thresholds: RATE_THRESHOLDS.cartToCheckout,
      formatRate: true
    })
  );

  metrics.push(
    buildMetric("checkoutToPurchase", "Begin checkout → purchase", purchases, beginCheckout, {
      missingCopy: "Need GA4 purchase vs checkout events",
      watchCopy: "Checkout completion under 60% — audit payment trust signals.",
      riskCopy: "Checkout completion critical — inspect tax/shipping surprises & payment reliability.",
      action: "QA checkout flow (desktop + mobile), fix trust badges, enable Shop Pay / PayPal.",
      thresholds: RATE_THRESHOLDS.checkoutToPurchase,
      formatRate: true
    })
  );

  metrics.push(
    buildMetric("overall", "Sessions → purchase", purchases, sessions, {
      missingCopy: "Need GA4 purchase + session data",
      watchCopy: "Overall CVR under 1% — keep focus on checkout fixes.",
      riskCopy: "Overall CVR under 0.4% — pause ad scale until fixed.",
      action: "Hold spend, run checkout + PDP fixes, then re-evaluate.",
      thresholds: RATE_THRESHOLDS.overall,
      formatRate: true,
      showPercent: true
    })
  );

  if (snapshot.wooCommerce?.totalRevenue != null && snapshot.wooCommerce?.orderCount != null) {
    const aov = snapshot.wooCommerce.totalRevenue / Math.max(1, snapshot.wooCommerce.orderCount);
    metrics.push({
      key: "aov",
      label: "Average order value",
      valueLabel: `$${aov.toFixed(0)}`,
      rateLabel: undefined,
      status: "good",
      summary: "Woo order mix stable.",
      action: "Bundle hero print + accessory to lift AOV further."
    });
  }

  return metrics;
}

function buildMetric(
  key: string,
  label: string,
  numerator: number | null,
  denominator: number | null,
  opts: {
    missingCopy: string;
    watchCopy: string;
    riskCopy: string;
    action: string;
    thresholds?: { warning: number; good: number; risk?: number } | null;
    formatRate?: boolean;
    showPercent?: boolean;
  }
): FunnelMetricInsight {
  if (!numerator || !denominator || denominator === 0) {
    return {
      key,
      label,
      valueLabel: "—",
      rateLabel: undefined,
      status: "missing",
      summary: opts.missingCopy,
      action: "Fix GA4 instrumentation."
    };
  }

  const rate = numerator / denominator;
  const thresholds = opts.thresholds;
  let status: FunnelMetricInsight["status"] = "good";
  if (thresholds) {
    const riskThreshold = "risk" in thresholds ? thresholds.risk! : thresholds.warning / 1.5;
    if (rate < riskThreshold) status = "risk";
    else if (rate < thresholds.warning) status = "watch";
  }

  const summary = status === "risk" ? opts.riskCopy : status === "watch" ? opts.watchCopy : "On target.";
  const valueLabel = opts.formatRate || opts.showPercent ? formatPercent(rate) : formatNumber(numerator);
  const rateLabel = opts.formatRate ? `${formatPercent(rate)} of previous stage` : undefined;

  return {
    key,
    label,
    valueLabel,
    rateLabel,
    status,
    summary,
    action: opts.action
  };
}

function buildProductCallouts(
  snapshot: WebsiteConversionSnapshot | null,
  productConversion: ProductConversionIntelligence | null
): ProductCallout[] {
  const callouts: ProductCallout[] = [];
  const topProducts = snapshot?.wooCommerce?.topProducts ?? [];

  if (topProducts.length) {
    const hero = topProducts[0];
    callouts.push({
      id: "hero",
      label: `${hero.name} leading revenue`,
      summary: `${hero.units} orders · $${hero.revenue?.toFixed(0) ?? "0"} in the last window.`,
      recommendedAction: "Feature this piece in email + Meta carousel today.",
      source: "Woo top products"
    });
  }

  const laggard = productConversion?.rows?.find((row) => row.classification === "HIGH_TRAFFIC_LOW_SALES");
  if (laggard) {
    callouts.push({
      id: `laggard-${laggard.slug}`,
      label: `${laggard.productName} getting views, not sales`,
      summary: laggard.summary,
      recommendedAction: laggard.recommendedAction,
      source: "Product conversion intelligence"
    });
  }

  const highCart = productConversion?.rows?.find((row) => row.classification === "HIGH_CARTS_LOW_SALES");
  if (highCart) {
    callouts.push({
      id: `cart-${highCart.slug}`,
      label: `${highCart.productName} stalls in checkout`,
      summary: highCart.summary,
      recommendedAction: highCart.recommendedAction,
      source: "Product conversion intelligence"
    });
  }

  return callouts.slice(0, 4);
}

function buildMarketingActions(
  productCallouts: ProductCallout[],
  funnelMetrics: FunnelMetricInsight[]
): MarketingActionInsight[] {
  const actions: MarketingActionInsight[] = [];
  const checkoutRisk = funnelMetrics.find((metric) => metric.key === "checkoutToPurchase" && metric.status === "risk");
  if (checkoutRisk) {
    actions.push({
      id: "checkout-audit",
      channel: "Website",
      recommendation: "Run full checkout audit",
      reason: checkoutRisk.summary,
      confidence: "high"
    });
  }

  const trafficWatch = funnelMetrics.find((metric) => metric.key === "sessions" && metric.status !== "good");
  if (trafficWatch) {
    actions.push({
      id: "traffic",
      channel: "Email + Meta",
      recommendation: "Ship hero story to drive intent traffic",
      reason: trafficWatch.summary,
      confidence: "medium"
    });
  }

  productCallouts.slice(0, 2).forEach((callout, index) => {
    actions.push({
      id: `product-${callout.id}`,
      channel: index === 0 ? "Email" : "Meta",
      recommendation: callout.recommendedAction,
      reason: callout.summary,
      confidence: "medium"
    });
  });

  return actions.slice(0, 4);
}

function buildDataLabels(snapshot: WebsiteConversionSnapshot | null): DataLabel[] {
  const labels: DataLabel[] = [];
  if (!snapshot) {
    labels.push({ id: "no-snapshot", label: "Website snapshot missing", tone: "rose" });
    return labels;
  }

  if (!snapshot.ga4) {
    labels.push({ id: "ga4-missing", label: "GA4 events missing", tone: "rose", detail: "Manual decisions only" });
  } else {
    if (snapshot.ga4.addToCartEvents == null || snapshot.ga4.beginCheckoutEvents == null || snapshot.ga4.ecommercePurchases == null) {
      labels.push({ id: "ga4-partial", label: "GA4 funnel partial", tone: "amber", detail: "Track add_to_cart + checkout" });
    }
  }

  const ageHours = snapshot.generatedAt ? (Date.now() - new Date(snapshot.generatedAt).getTime()) / 3600000 : null;
  if (ageHours != null) {
    if (ageHours > 24) {
      labels.push({ id: "stale", label: `Website data ${Math.round(ageHours)}h old`, tone: "amber" });
    } else {
      labels.push({ id: "fresh", label: "Website data fresh", tone: "emerald" });
    }
  }

  return labels;
}

function buildTrafficPriority(snapshot: WebsiteConversionSnapshot | null): PriorityInsight | null {
  if (!snapshot?.ga4) return null;
  const sessions = toNumber(snapshot.ga4.sessions);
  if (!sessions) return null;
  if (sessions >= 1600) return null;
  return {
    id: "traffic",
    priority: 3,
    title: "Volume is thin",
    whyItMatters: `Only ${sessions.toLocaleString()} sessions in the decision window.`,
    action: "Launch fresh traffic driver (email send or Meta retargeting).",
    confidence: "medium",
    source: "GA4 sessions"
  };
}

function buildProductPriority(
  productConversion: ProductConversionIntelligence | null,
  snapshot: WebsiteConversionSnapshot | null
): PriorityInsight | null {
  const laggard = productConversion?.rows?.find((row) => row.classification === "HIGH_TRAFFIC_LOW_SALES");
  if (laggard) {
    return {
      id: `product-${laggard.slug}`,
      priority: 4,
      title: `${laggard.productName} has demand but no sales`,
      whyItMatters: laggard.summary,
      action: laggard.recommendedAction,
      confidence: laggard.confidence,
      source: "Product conversion intelligence"
    };
  }

  if (snapshot?.wooCommerce?.topProducts?.[0]) {
    const hero = snapshot.wooCommerce.topProducts[0];
    return {
      id: `hero-${hero.name}`,
      priority: 4,
      title: `Lean on ${hero.name}`,
      whyItMatters: `${hero.name} drove ${hero.revenue?.toFixed(0) ?? "—"} revenue recently.`,
      action: "Add it to the hero slot + social reels today.",
      confidence: "medium",
      source: "Woo top products"
    };
  }

  return null;
}

function toNumber(value?: number | null) {
  if (value == null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}
