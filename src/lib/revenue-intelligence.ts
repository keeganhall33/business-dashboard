import type { CommerceTelemetry, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

export type RevenueAction = {
  id: string;
  title: string;
  reason: string;
  expectedImpact: string;
  confidence: number;
  confidenceLabel: string;
  urgency: "Today" | "This week" | "This month";
  supportingMetrics: string[];
  score: number;
};

export type RevenueIntel = {
  headline: string;
  supportingEvidence: string[];
  drivers: string[];
  outlook: string;
  metrics: Array<{ label: string; value: string; delta?: string; explanation?: string }>;
  customerInsights: string[];
  productInsights: string[];
  actions: RevenueAction[];
};

export function buildRevenueIntelligence({
  snapshot,
  telemetry
}: {
  snapshot?: WebsiteConversionSnapshot | null;
  telemetry?: CommerceTelemetry;
}): RevenueIntel {
  const metrics: Array<{ label: string; value: string; delta?: string; explanation?: string }> = [];
  const drivers: string[] = [];
  const customerInsights: string[] = [];
  const productInsights: string[] = [];
  const actions: RevenueAction[] = [];

  const woo = snapshot?.wooCommerce;
  const ga4 = snapshot?.ga4;
  const wooSummary = telemetry?.woo?.summary;
  const wooSeries = telemetry?.woo?.timeseries ?? [];
  const gaSeries = telemetry?.ga4?.timeseries ?? [];

  const wooRevenueTrend = computeTrend(wooSeries.map((point) => point.revenue));
  const wooOrderTrend = computeTrend(wooSeries.map((point) => point.orders));
  const gaRevenueTrend = computeTrend(gaSeries.map((point) => point.revenue));

  if (wooSummary) {
    metrics.push({
      label: "Woo revenue",
      value: currency(wooSummary.revenue ?? woo?.netRevenue ?? 0),
      delta: formatPercent(wooRevenueTrend?.delta ?? null),
      explanation: wooRevenueTrend ? `Based on Woo telemetry (${wooSeries.length} points).` : undefined
    });
    metrics.push({
      label: "Woo orders",
      value: formatNumber(wooSummary.orders ?? woo?.paidOrdersInWindow),
      delta: formatPercent(wooOrderTrend?.delta ?? null)
    });
    metrics.push({ label: "Woo AOV", value: currency(wooSummary.avgOrderValue ?? woo?.grossAov ?? 0) });
  }

  if (ga4) {
    metrics.push({
      label: "GA4 web revenue",
      value: currency(ga4.purchaseRevenue ?? wooSummary?.revenue ?? 0),
      delta: formatPercent(gaRevenueTrend?.delta ?? null)
    });
    if (ga4.funnelRates?.sessionToPurchase != null) {
      metrics.push({
        label: "Session → purchase",
        value: formatPercentRaw(ga4.funnelRates.sessionToPurchase),
        explanation: "Based on GA4 funnel rates"
      });
    }
  }

  if (woo?.topProducts?.length) {
    const totalUnits = woo.topProducts.reduce((sum, product) => sum + (product.units ?? 0), 0) || 1;
    const topProduct = woo.topProducts[0];
    const share = (topProduct.units ?? 0) / totalUnits;
    productInsights.push(`${topProduct.name} contributes ${formatPercentRaw(share)} of tracked units.`);
    if (share >= 0.5) {
      productInsights.push(`Dependence on ${topProduct.name} exceeds 50%; diversify drops to reduce risk.`);
      actions.push(
        buildAction({
          id: "woo-product-concentration",
          title: "Diversify product mix",
          reason: `${topProduct.name} generates ${formatPercentRaw(share)} of units.`,
          expectedImpact: "Reduce revenue fragility if the hero product stalls",
          confidence: 0.7,
          urgency: "This month",
          supportingMetrics: [`Top product share ${formatPercentRaw(share)}`],
          score: 60
        })
      );
    }
  }

  if (woo?.refundRate != null && woo.refundRate > 0.08) {
    drivers.push(`Refund rate ${formatPercentRaw(woo.refundRate)} over the most recent window.`);
    actions.push(
      buildAction({
        id: "woo-refunds",
        title: "Investigate refund spike",
        reason: `Refund rate ${formatPercentRaw(woo.refundRate)} exceeds the healthy band (≤5%).`,
        expectedImpact: "Preserve ${currency((woo.netRevenue ?? 0) * woo.refundRate)} by fixing product/fulfillment issues",
        confidence: 0.65,
        urgency: "This week",
        supportingMetrics: [drivers[drivers.length - 1]],
        score: 75
      })
    );
  }

  if (wooRevenueTrend && wooRevenueTrend.delta <= -0.1 && meetsVolume(wooRevenueTrend, 5000, 1000)) {
    const loss = Math.abs(Math.round((wooRevenueTrend.first ?? 0) - (wooRevenueTrend.last ?? 0)));
    drivers.push(`Woo revenue trending ${formatPercent(wooRevenueTrend.delta)} across the latest telemetry window.`);
    actions.push(
      buildAction({
        id: "woo-revenue-decline",
        title: "Stabilize Woo revenue",
        reason: drivers[drivers.length - 1],
        expectedImpact: `Potentially recover ~$${loss} by launching a conversion-focused drop`,
        confidence: 0.75,
        urgency: "This week",
        supportingMetrics: [drivers[drivers.length - 1]],
        score: 90
      })
    );
  }

  if (wooOrderTrend && wooOrderTrend.delta <= -0.08 && meetsVolume(wooOrderTrend, 100, 20)) {
    drivers.push(`Woo orders down ${formatPercent(wooOrderTrend.delta)} vs prior telemetry window.`);
    actions.push(
      buildAction({
        id: "woo-order-decline",
        title: "Re-engage dormant collectors",
        reason: drivers[drivers.length - 1],
        expectedImpact: "Boost weekly orders by reactivating lapsed VIPs",
        confidence: 0.7,
        urgency: "This week",
        supportingMetrics: [drivers[drivers.length - 1]],
        score: 80
      })
    );
  }

  if (ga4?.funnelRates?.cartToCheckout != null && ga4.funnelRates.cartToCheckout < 0.4) {
    const statement = `Only ${formatPercentRaw(ga4.funnelRates.cartToCheckout)} of carts reach checkout.`;
    drivers.push(statement);
    actions.push(
      buildAction({
        id: "funnel-cart-drop",
        title: "Fix cart-to-checkout drop",
        reason: statement,
        expectedImpact: "Lift conversion by fixing cart UX or payment trust signals",
        confidence: 0.6,
        urgency: "Today",
        supportingMetrics: [statement],
        score: 85
      })
    );
  }

  const recentOrders = woo?.recentOrders ?? [];
  if (recentOrders.length) {
    const uniqueCustomers = new Set(recentOrders.map((order) => order.id ?? order.date_paid ?? "unknown"));
    customerInsights.push(`${formatNumber(uniqueCustomers.size)} recent orders captured across the latest range.`);
  }

  const headline = drivers.length
    ? drivers[0]
    : woo
      ? `WooCommerce recorded ${currency(woo.netRevenue ?? woo.grossOrderRevenue ?? 0)} in this window.`
      : "Revenue steady. No commerce snapshot available.";

  const supportingEvidence: string[] = [];
  if (woo?.netRevenue != null) {
    supportingEvidence.push(`Woo net revenue ${currency(woo.netRevenue)}.`);
  }
  if (ga4?.totalUsers != null) {
    supportingEvidence.push(`GA4 users ${formatNumber(ga4.totalUsers)}.`);
  }

  const rankedActions = rankRevenueActions(actions).slice(0, 3);
  const outlook = rankedActions.length
    ? `If successful, these actions could ${rankedActions[0].expectedImpact.toLowerCase()}.`
    : "Trajectory is stable; keep executing planned releases.";

  return {
    headline,
    supportingEvidence,
    drivers,
    outlook,
    metrics,
    customerInsights,
    productInsights,
    actions: rankedActions
  };
}

function buildAction({
  id,
  title,
  reason,
  expectedImpact,
  confidence,
  urgency,
  supportingMetrics,
  score
}: {
  id: string;
  title: string;
  reason: string;
  expectedImpact: string;
  confidence: number;
  urgency: RevenueAction["urgency"];
  supportingMetrics: string[];
  score: number;
}): RevenueAction {
  return {
    id,
    title,
    reason,
    expectedImpact,
    confidence,
    confidenceLabel: "Heuristic rule",
    urgency,
    supportingMetrics,
    score
  };
}

function rankRevenueActions(actions: RevenueAction[]) {
  return [...actions].sort((a, b) => b.score - a.score);
}

function computeTrend(series: Array<number | null | undefined>) {
  if (!series || series.length < 2) return null;
  const first = series.find((value) => value != null && Number.isFinite(value));
  const last = [...series].reverse().find((value) => value != null && Number.isFinite(value));
  if (first == null || last == null || first === 0) return null;
  return { first, last, delta: (last - first) / first };
}

function meetsVolume(trend: { first: number; last: number }, minBaseline: number, minAbsoluteChange: number) {
  const absoluteChange = Math.abs(trend.last - trend.first);
  return trend.first >= minBaseline && absoluteChange >= minAbsoluteChange;
}

function currency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatNumber(value?: number | null) {
  if (value == null) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return undefined;
  return `${Math.round(value * 100)}%`;
}

function formatPercentRaw(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "–";
  return `${Math.round(value * 100)}%`;
}
