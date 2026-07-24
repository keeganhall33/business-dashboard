import type {
  MetaAdsSnapshot,
  WebsiteConversionSnapshot,
  MarketingCommandInsight,
  MarketingCommandSnapshot,
  CommerceTelemetry,
  MarketingCommandMetricDelta,
  MarketingCommandProductMomentum,
  SalesGeographySnapshot
} from "../types/dashboard";

const FRESH_HOURS = 24;
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const GEOGRAPHY_DELTA_THRESHOLD = 100;

export type InsightContext = {
  range: MarketingCommandSnapshot["range"];
  website?: WebsiteConversionSnapshot | null;
  meta?: MetaAdsSnapshot | null;
  funnel?: CommerceTelemetry["funnel"] | null;
  previousWebsite?: WebsiteConversionSnapshot | null;
  previousMeta?: MetaAdsSnapshot | null;
  previousFunnel?: CommerceTelemetry["funnel"] | null;
  metricDeltas?: MarketingCommandMetricDelta[];
  productMomentum?: MarketingCommandProductMomentum;
  salesGeography?: SalesGeographySnapshot | null;
};

export function evaluateInsights(context: InsightContext): { top: MarketingCommandInsight[]; suppressed: MarketingCommandInsight[] } {
  const rules = [
    metaVolumeRule,
    metaSingleCampaignRule,
    cartCheckoutRule,
    wooVsGaRule,
    funnelDropOffRule,
    sessionsUpRevenueFlatRule,
    revenueDownSessionsFlatRule,
    aovDropRule,
    metaSpendUpNoPurchasesRule,
    metaCtrDownCpcUpRule,
    metaRoasDownRule,
    metaMomentumPositiveRule,
    productMomentumUnavailableRule,
    productWinnerRule,
    productLaggardRule,
    productNewBreakoutRule,
    productConcentrationRule,
    geographyAvailabilityRule,
    geographyConcentrationRule,
    geographyNewLocationRule,
    geographyRisingLocationRule,
    geographyDomesticDeltaRule,
    geographyInternationalDeltaRule
  ];
  const top: MarketingCommandInsight[] = [];
  const suppressed: MarketingCommandInsight[] = [];

  for (const rule of rules) {
    const result = rule(context);
    if (!result) continue;
    if (result.suppressReason) suppressed.push(result);
    else top.push(result);
  }

  return { top, suppressed };
}

function cartCheckoutRule(context: InsightContext): MarketingCommandInsight | null {
  const addToCart = context.website?.ga4?.addToCartEvents ?? null;
  const beginCheckout = context.website?.ga4?.beginCheckoutEvents ?? null;
  const timestamp = context.website?.generatedAt ?? null;
  const staleReason = freshnessGuard(timestamp);
  if (staleReason) {
    return buildInsightBase("cart_checkout_drop", context, {
      suppressReason: staleReason,
      sourcesUsed: ["GA4 add_to_cart", "GA4 begin_checkout"],
      triggerMetrics: { addToCart, beginCheckout }
    });
  }
  if (!addToCart || !beginCheckout || addToCart <= 0) return null;
  const ratio = beginCheckout / addToCart;
  if (ratio >= 0.6) return null;
  const confidence = ratio < 0.4 ? "HIGH" : "MEDIUM";
  return buildInsightBase("cart_checkout_drop", context, {
    title: "Cart → checkout is the biggest leak",
    insight: "Add-to-cart success isn’t translating into checkout starts.",
    recommendedAction: "Review checkout friction: shipping/tax surprise, payment flow, or page expectations.",
    sourcesUsed: ["GA4 add_to_cart", "GA4 begin_checkout"],
    triggerMetrics: { addToCart, beginCheckout, checkoutRetention: ratio },
    confidence,
    severity: "HIGH"
  });
}

function metaVolumeRule(context: InsightContext): MarketingCommandInsight | null {
  const meta = context.meta;
  if (!meta) return null;
  const timestamp = meta.generatedAt;
  const staleReason = freshnessGuard(timestamp);
  if (staleReason) {
    return buildInsightBase("meta_low_volume", context, {
      suppressReason: staleReason,
      sourcesUsed: ["Meta spend", "Meta purchases"],
      triggerMetrics: { spend: meta.summary?.spend ?? null, purchases: meta.summary?.purchases ?? null }
    });
  }
  const metaSummary = meta.summary ?? ({} as MetaAdsSnapshot["summary"]);
  const spend = metaSummary?.spend ?? null;
  const purchases = metaSummary?.purchases ?? null;
  if (!spend || spend <= 0 || purchases == null) return null;
  if (purchases >= 3) return null;
  return buildInsightBase("meta_low_volume", context, {
    title: "Meta spend has too little conversion volume",
    insight: `${purchases} purchases on ${formatCurrency(spend)} spend is too thin to scale confidently.`,
    recommendedAction: "Test fresh creative or landing page before increasing budget again.",
    sourcesUsed: ["Meta spend", "Meta purchases"],
    triggerMetrics: { spend, purchases },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function metaSingleCampaignRule(context: InsightContext): MarketingCommandInsight | null {
  const meta = context.meta;
  if (!meta) return null;
  const timestamp = meta.generatedAt;
  const staleReason = freshnessGuard(timestamp);
  if (staleReason) {
    return buildInsightBase("meta_single_campaign", context, {
      suppressReason: staleReason,
      sourcesUsed: ["Meta campaigns"],
      triggerMetrics: { campaignCount: meta.campaigns?.length ?? 0 }
    });
  }
  const campaignCount = meta.campaigns?.length ?? 0;
  if (campaignCount > 1) return null;
  return buildInsightBase("meta_single_campaign", context, {
    title: "Only one Meta campaign is active",
    insight: "Campaign variety is low; creative fatigue risk increases when all spend runs through a single campaign.",
    recommendedAction: "Launch a backup campaign/creative so performance isn’t tied to one ad set.",
    sourcesUsed: ["Meta campaigns"],
    triggerMetrics: { campaignCount },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function wooVsGaRule(context: InsightContext): MarketingCommandInsight | null {
  const gaPurchases = context.website?.ga4?.ecommercePurchases ?? null;
  const wooOrders = context.website?.wooCommerce?.orderCount ?? null;
  if (gaPurchases == null || wooOrders == null) return null;
  const timestamp = context.website?.generatedAt ?? null;
  const staleReason = freshnessGuard(timestamp);
  if (staleReason) {
    return buildInsightBase("woo_ga_mismatch", context, {
      suppressReason: staleReason,
      sourcesUsed: ["GA4 purchase", "Woo orders"],
      triggerMetrics: { gaPurchases, wooOrders }
    });
  }
  if (gaPurchases === 0) return null;
  const diffRatio = Math.abs(wooOrders - gaPurchases) / Math.max(wooOrders, gaPurchases);
  if (diffRatio <= 0.2) return null;
  return buildInsightBase("woo_ga_mismatch", context, {
    title: "WooCommerce orders outpace GA4 purchases",
    insight: `${wooOrders} Woo orders vs ${gaPurchases} GA4 purchases indicates tracking still diverges even in the same window.`,
    recommendedAction: "Audit GA4 purchase events and add transaction IDs so marketing performance reflects real orders.",
    sourcesUsed: ["GA4 purchase", "Woo orders"],
    triggerMetrics: { gaPurchases, wooOrders, diffRatio },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function funnelDropOffRule(context: InsightContext): MarketingCommandInsight | null {
  const funnelSeries = context.funnel?.timeseries ?? [];
  if (!funnelSeries.length) return null;
  const latest = funnelSeries.at(-1);
  if (!latest) return null;
  const entries = latest.entries;
  const completions = latest.completions;
  const timestamp = latest.date ? `${latest.date}T23:59:59Z` : undefined;
  const staleReason = freshnessGuard(timestamp);
  if (staleReason) {
    return buildInsightBase("funnel_recency", context, {
      suppressReason: staleReason,
      sourcesUsed: ["FunnelKit steps"],
      triggerMetrics: { entries, completions }
    });
  }
  if (!entries || entries <= 0 || completions == null) return null;
  const cvr = (completions / entries) * 100;
  if (cvr >= 5) return null;
  return buildInsightBase("funnel_recency", context, {
    title: "Recent funnel step converted under 5%",
    insight: `Most visitors exit before finishing the current funnel step (latest CVR ${cvr.toFixed(1)}%).`,
    recommendedAction: "Review copy/offer for the latest FunnelKit step or shorten the upsell flow.",
    sourcesUsed: ["FunnelKit entries", "FunnelKit completions"],
    triggerMetrics: { entries, completions, conversion: cvr },
    confidence: cvr < 3 ? "HIGH" : "MEDIUM",
    severity: "MEDIUM"
  });
}

function sessionsUpRevenueFlatRule(context: InsightContext): MarketingCommandInsight | null {
  const sessionsDelta = findDelta(context, "sessions");
  const revenueDelta = findDelta(context, "woo_revenue") ?? findDelta(context, "ga_revenue");
  if (!sessionsDelta || sessionsDelta.percentChange == null || sessionsDelta.percentChange < 10) return null;
  if (!revenueDelta || revenueDelta.percentChange == null || Math.abs(revenueDelta.percentChange) > 5) return null;
  return buildInsightBase("sessions_up_revenue_flat", context, {
    title: "Traffic grew but revenue stayed flat",
    insight: `Sessions up ${percentText(sessionsDelta.percentChange)} while revenue only moved ${percentText(revenueDelta.percentChange)}.`,
    recommendedAction: "Turn new visitors into orders by tightening the pitch and ensuring GA4 captures purchases.",
    sourcesUsed: ["GA4 sessions", "Woo revenue"],
    triggerMetrics: {
      sessionsPercent: sessionsDelta.percentChange,
      revenuePercent: revenueDelta.percentChange
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function revenueDownSessionsFlatRule(context: InsightContext): MarketingCommandInsight | null {
  const revenueDelta = findDelta(context, "woo_revenue") ?? findDelta(context, "ga_revenue");
  const sessionsDelta = findDelta(context, "sessions");
  if (!revenueDelta || revenueDelta.percentChange == null || revenueDelta.percentChange > -10) return null;
  if (!sessionsDelta || sessionsDelta.percentChange == null || Math.abs(sessionsDelta.percentChange) > 5) return null;
  return buildInsightBase("revenue_down_sessions_flat", context, {
    title: "Revenue slipped while traffic stayed flat",
    insight: `Revenue down ${percentText(revenueDelta.percentChange)} even though sessions only moved ${percentText(sessionsDelta.percentChange)}.`,
    recommendedAction: "Audit offer mix and product availability—pricing or inventory likely caused the dip.",
    sourcesUsed: ["Woo revenue", "GA4 sessions"],
    triggerMetrics: {
      revenuePercent: revenueDelta.percentChange,
      sessionsPercent: sessionsDelta.percentChange
    },
    confidence: "MEDIUM",
    severity: "HIGH"
  });
}

function aovDropRule(context: InsightContext): MarketingCommandInsight | null {
  const aovDelta = findDelta(context, "woo_aov");
  if (!aovDelta || aovDelta.percentChange == null || aovDelta.percentChange > -8) return null;
  return buildInsightBase("aov_drop", context, {
    title: "Average order value is falling",
    insight: `AOV dropped ${percentText(aovDelta.percentChange)} vs the prior week.`,
    recommendedAction: "Re-center the upsell path around premium editions before scaling traffic.",
    sourcesUsed: ["Woo AOV"],
    triggerMetrics: {
      aovPercent: aovDelta.percentChange,
      absoluteChange: aovDelta.absoluteChange
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function metaSpendUpNoPurchasesRule(context: InsightContext): MarketingCommandInsight | null {
  const spendDelta = findDelta(context, "meta_spend");
  const purchaseDelta = findDelta(context, "meta_purchases");
  if (!spendDelta || spendDelta.percentChange == null || spendDelta.percentChange < 10) return null;
  if (!purchaseDelta || purchaseDelta.percentChange == null || purchaseDelta.percentChange > 0) return null;
  return buildInsightBase("meta_spend_up_flat_purchases", context, {
    title: "Meta spend climbed without more purchases",
    insight: `Spend up ${percentText(spendDelta.percentChange)} but purchases are ${percentText(purchaseDelta.percentChange)}.`,
    recommendedAction: "Pause scaling until creative and landing page updates lift volume again.",
    sourcesUsed: ["Meta spend", "Meta purchases"],
    triggerMetrics: {
      spendPercent: spendDelta.percentChange,
      purchasePercent: purchaseDelta.percentChange
    },
    confidence: "MEDIUM",
    severity: "HIGH"
  });
}

function metaCtrDownCpcUpRule(context: InsightContext): MarketingCommandInsight | null {
  const ctrDelta = findDelta(context, "meta_ctr");
  const cpcDelta = findDelta(context, "meta_cpc");
  if (!ctrDelta || ctrDelta.percentChange == null || ctrDelta.percentChange > -10) return null;
  if (!cpcDelta || cpcDelta.percentChange == null || cpcDelta.percentChange < 10) return null;
  return buildInsightBase("meta_ctr_down_cpc_up", context, {
    title: "Meta CTR fell while CPC climbed",
    insight: `CTR ${percentText(ctrDelta.percentChange)} and CPC ${percentText(cpcDelta.percentChange)} vs prior week—creative fatigue is setting in.`,
    recommendedAction: "Rotate fresh creative and tighten audience to stop CPC bleed.",
    sourcesUsed: ["Meta CTR", "Meta CPC"],
    triggerMetrics: {
      ctrPercent: ctrDelta.percentChange,
      cpcPercent: cpcDelta.percentChange
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function metaRoasDownRule(context: InsightContext): MarketingCommandInsight | null {
  const roasDelta = findDelta(context, "meta_roas");
  if (!roasDelta || roasDelta.percentChange == null || roasDelta.percentChange > -10) return null;
  return buildInsightBase("meta_roas_down", context, {
    title: "Meta ROAS is slipping",
    insight: `ROAS fell ${percentText(roasDelta.percentChange)} vs the previous 7 days.`,
    recommendedAction: "Trim bids on weak ad sets and reinvest only after creative refresh proves a lift.",
    sourcesUsed: ["Meta ROAS"],
    triggerMetrics: { roasPercent: roasDelta.percentChange },
    confidence: "MEDIUM",
    severity: "HIGH"
  });
}

function metaMomentumPositiveRule(context: InsightContext): MarketingCommandInsight | null {
  const purchaseDelta = findDelta(context, "meta_purchases");
  const spendDelta = findDelta(context, "meta_spend");
  if (!purchaseDelta || purchaseDelta.percentChange == null || purchaseDelta.percentChange < 15) return null;
  if (!spendDelta || spendDelta.percentChange == null || Math.abs(spendDelta.percentChange) > 5) return null;
  return buildInsightBase("meta_purchases_up_flat_spend", context, {
    title: "Meta volume improved without extra spend",
    insight: `Purchases ${percentText(purchaseDelta.percentChange)} while spend stayed within ${percentText(spendDelta.percentChange)}.`,
    recommendedAction: "Lock in this creative combo, then scale gradually with daily monitoring.",
    sourcesUsed: ["Meta purchases", "Meta spend"],
    triggerMetrics: {
      purchasesPercent: purchaseDelta.percentChange,
      spendPercent: spendDelta.percentChange
    },
    confidence: "HIGH",
    severity: "MEDIUM"
  });
}

function productMomentumUnavailableRule(context: InsightContext): MarketingCommandInsight | null {
  const reasons = context.productMomentum?.suppressedReasons;
  if (!reasons?.length) return null;
  return buildInsightBase("product_momentum_unavailable", context, {
    suppressReason: reasons.join("; "),
    sourcesUsed: ["Woo top products"],
    triggerMetrics: {}
  });
}

function productWinnerRule(context: InsightContext): MarketingCommandInsight | null {
  const momentum = context.productMomentum;
  if (!momentum || momentum.suppressedReasons?.length) return null;
  const leader = momentum.winners?.[0];
  if (!leader || (leader.revenueDeltaPercent ?? 0) < 15) return null;
  return buildInsightBase("product_momentum_winner", context, {
    title: `${leader.name ?? "A product"} is surging`,
    insight: `${leader.name ?? "This product"} revenue up ${percentText(leader.revenueDeltaPercent)} vs prior 7d.`,
    recommendedAction: "Feature this piece in paid + owned channels while demand builds.",
    sourcesUsed: ["Woo top products"],
    triggerMetrics: {
      revenueDeltaPercent: leader.revenueDeltaPercent,
      revenueDelta: leader.revenueDelta
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function productLaggardRule(context: InsightContext): MarketingCommandInsight | null {
  const momentum = context.productMomentum;
  if (!momentum || momentum.suppressedReasons?.length) return null;
  const laggard = momentum.laggards?.[0];
  if (!laggard || (laggard.revenueDeltaPercent ?? 0) > -15) return null;
  return buildInsightBase("product_momentum_laggard", context, {
    title: `${laggard.name ?? "A product"} lost momentum`,
    insight: `${laggard.name ?? "This product"} revenue down ${percentText(laggard.revenueDeltaPercent)} vs prior week.`,
    recommendedAction: "Refresh the story or bundle it with a top seller before next promo.",
    sourcesUsed: ["Woo top products"],
    triggerMetrics: {
      revenueDeltaPercent: laggard.revenueDeltaPercent,
      revenueDelta: laggard.revenueDelta
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function productNewBreakoutRule(context: InsightContext): MarketingCommandInsight | null {
  const momentum = context.productMomentum;
  if (!momentum || momentum.suppressedReasons?.length) return null;
  const breakout = momentum.newBreakouts?.[0];
  if (!breakout) return null;
  return buildInsightBase("product_new_breakout", context, {
    title: `${breakout.name ?? "A product"} is a breakout seller`,
    insight: `${breakout.name ?? "This product"} sold ${breakout.currentRevenue ?? 0} USD this week with no prior-week sales.`,
    recommendedAction: "Add this piece to Meta + email creative immediately to ride the spike.",
    sourcesUsed: ["Woo top products"],
    triggerMetrics: {
      currentRevenue: breakout.currentRevenue,
      units: breakout.currentUnits
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function productConcentrationRule(context: InsightContext): MarketingCommandInsight | null {
  const momentum = context.productMomentum;
  if (!momentum || momentum.suppressedReasons?.length) return null;
  const concentration = momentum.concentration;
  if (!concentration || (concentration.sharePercent ?? 0) < 60) return null;
  return buildInsightBase("product_revenue_concentration", context, {
    title: "Revenue is concentrated in one product",
    insight: `${concentration.topProduct ?? "One product"} drove ${percentText(concentration.sharePercent)} of Woo revenue this week.`,
    recommendedAction: "Promote at least one secondary hero product so revenue isn’t tied to a single piece.",
    sourcesUsed: ["Woo top products"],
    triggerMetrics: {
      concentration: concentration.sharePercent,
      topProduct: concentration.topProduct
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function geographyAvailabilityRule(context: InsightContext): MarketingCommandInsight | null {
  const geography = context.salesGeography;
  if (!geography?.suppressedReasons?.length) return null;
  return buildInsightBase("sales_geography_unavailable", context, {
    suppressReason: geography.suppressedReasons.join("; "),
    sourcesUsed: ["Woo geography"],
    triggerMetrics: {}
  });
}

function geographyConcentrationRule(context: InsightContext): MarketingCommandInsight | null {
  const geography = context.salesGeography;
  if (!geography || geography.suppressedReasons?.length) return null;
  const locations = geography.locations ?? [];
  if (locations.length < 2) return null;
  const totalRevenue = locations.reduce((sum, location) => sum + (location.revenue ?? 0), 0);
  if (!totalRevenue) return null;
  const leader = locations[0];
  if (!leader) return null;
  const sharePercent = Number(((leader.revenue / totalRevenue) * 100).toFixed(1));
  if (!Number.isFinite(sharePercent) || sharePercent < 70) return null;
  return buildInsightBase("sales_geography_concentration", context, {
    title: `${leader.label} is driving most orders`,
    insight: `${leader.label} accounts for ${percentText(sharePercent)} of Woo revenue this week.`,
    recommendedAction: "Tailor creative for secondary regions so sales aren’t tied to a single geography.",
    sourcesUsed: ["Woo geography"],
    triggerMetrics: {
      sharePercent,
      orderCount: leader.orderCount,
      privacyLevel: leader.privacyLevel
    },
    confidence: sharePercent >= 85 ? "HIGH" : "MEDIUM",
    severity: "MEDIUM"
  });
}

function geographyNewLocationRule(context: InsightContext): MarketingCommandInsight | null {
  const comparison = context.salesGeography?.comparison;
  if (!comparison) return null;
  const entry = comparison.newLocations?.[0];
  if (!entry) return null;
  return buildInsightBase("sales_geography_new_location", context, {
    title: `${entry.label} showed up in orders this week`,
    insight: `${entry.label} generated ${formatCurrency(entry.currentRevenue)} in the latest 7 days with no prior-week sales.`,
    recommendedAction: "Highlight this region in organic + paid while demand emerges.",
    sourcesUsed: ["Woo geography"],
    triggerMetrics: {
      revenue: entry.currentRevenue,
      orders: entry.currentOrders,
      privacyLevel: entry.privacyLevel
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function geographyRisingLocationRule(context: InsightContext): MarketingCommandInsight | null {
  const comparison = context.salesGeography?.comparison;
  if (!comparison) return null;
  const entry = comparison.risingLocations?.[0];
  if (!entry) return null;
  return buildInsightBase("sales_geography_rising_location", context, {
    title: `${entry.label} demand is accelerating`,
    insight: `${entry.label} revenue ${entry.revenueDelta >= 0 ? "grew" : "changed"} ${percentText(entry.revenueDeltaPercent)} vs previous 7d.`,
    recommendedAction: "Mirror this geography in creative and fulfillment planning.",
    sourcesUsed: ["Woo geography"],
    triggerMetrics: {
      revenueDelta: entry.revenueDelta,
      revenueDeltaPercent: entry.revenueDeltaPercent,
      privacyLevel: entry.privacyLevel
    },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function geographyDomesticDeltaRule(context: InsightContext): MarketingCommandInsight | null {
  const delta = context.salesGeography?.comparison?.domesticDelta ?? null;
  if (delta == null || Math.abs(delta) < GEOGRAPHY_DELTA_THRESHOLD) return null;
  return buildInsightBase("sales_geography_domestic_delta", context, {
    title: `Domestic revenue ${delta > 0 ? "rose" : "fell"}`,
    insight: `Domestic Woo revenue moved ${formatRevenueDelta(delta)} vs the previous 7 days.`,
    recommendedAction: delta > 0 ? "Double down on the domestic offer path." : "Triage domestic channels before scaling spend.",
    sourcesUsed: ["Woo geography"],
    triggerMetrics: { delta },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function geographyInternationalDeltaRule(context: InsightContext): MarketingCommandInsight | null {
  const delta = context.salesGeography?.comparison?.internationalDelta ?? null;
  if (delta == null || Math.abs(delta) < GEOGRAPHY_DELTA_THRESHOLD) return null;
  return buildInsightBase("sales_geography_international_delta", context, {
    title: `International revenue ${delta > 0 ? "appeared" : "dropped"}`,
    insight: `International Woo revenue moved ${formatRevenueDelta(delta)} vs the previous 7 days.`,
    recommendedAction:
      delta > 0 ? "Ensure logistics + pricing can support the spike." : "Review messaging and shipping friction for international buyers.",
    sourcesUsed: ["Woo geography"],
    triggerMetrics: { delta },
    confidence: "MEDIUM",
    severity: "MEDIUM"
  });
}

function buildInsightBase(
  id: string,
  context: InsightContext,
  partial: Partial<MarketingCommandInsight>
): MarketingCommandInsight {
  return {
    id,
    range: context.range,
    title: partial.title ?? "",
    insight: partial.insight ?? "",
    recommendedAction: partial.recommendedAction ?? "",
    sourcesUsed: partial.sourcesUsed ?? [],
    triggerMetrics: partial.triggerMetrics ?? {},
    confidence: partial.confidence ?? "LOW",
    severity: partial.severity ?? "LOW",
    suppressReason: partial.suppressReason ?? undefined
  };
}

function freshnessGuard(timestamp?: string | null) {
  if (!timestamp) return "missing timestamp";
  const updated = new Date(timestamp);
  if (Number.isNaN(updated.getTime())) return "invalid timestamp";
  const hours = (Date.now() - updated.getTime()) / 36e5;
  if (hours > FRESH_HOURS) return `stale (${hours.toFixed(1)}h old)`;
  return null;
}

function formatCurrency(value?: number | null) {
  if (value == null) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatRevenueDelta(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  if (value === 0) return formatted;
  return `${value > 0 ? "+" : "-"}${formatted}`;
}

function findDelta(context: InsightContext, metric: string) {
  return context.metricDeltas?.find((delta) => delta.metric === metric) ?? null;
}

function percentText(value?: number | null) {
  if (value == null) return "0%";
  return `${percentFormatter.format(Math.abs(value))}%`;
}
