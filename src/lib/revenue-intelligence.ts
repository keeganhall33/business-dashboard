import type { CommerceTelemetry, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

type InferenceType = "measured" | "deterministic" | "heuristic" | "insufficient_evidence";

type Provenance = {
  source: string;
  measuredInputs: string[];
  calculation?: string;
  inferenceType: InferenceType;
  confidence: number | null;
  dataWindow?: string;
  caveats?: string[];
};

export type RevenueFact = {
  id: string;
  label: string;
  value: string;
  severity?: "info" | "warning" | "critical";
  provenance: Provenance;
};

export type ScenarioOutlook = {
  label: string;
  summary: string;
  assumptions: string[];
  provenance: Provenance;
  reviewDate: string;
};

export type RevenueAction = {
  id: string;
  title: string;
  recommendation: string;
  expectedImpact: string;
  urgency: "Today" | "This week" | "This month";
  provenance: Provenance;
  rule: {
    owner: string;
    trigger: string;
    minimumSample: string;
    evidence: string[];
    suppression: string[];
    confidenceMethod: string;
    expectedImpactMethod: string;
  };
};

export type RevenueIntel = {
  headline: RevenueFact | null;
  drivers: RevenueFact[];
  reconciliation: {
    entries: RevenueFact[];
    note: string;
  };
  actions: RevenueAction[];
  scenario: ScenarioOutlook | null;
  customerMessage: string | null;
};

type Trend = { first: number; last: number; delta: number } | null;

type ActionRuleContext = {
  rangeLabel: string;
  hasPartialDay: boolean;
  hasCompleteRange: boolean;
  isStaleSource: boolean;
  ordersInRange: number | null;
  wooRevenueTrend: Trend;
  wooOrderTrend: Trend;
  ga4FunnelCartToCheckout: number | null | undefined;
  wooRefundRate: number | null | undefined;
  wooNetRevenue: number | null | undefined;
  wooRevenueVolumeOk: boolean;
  wooOrderVolumeOk: boolean;
  productConcentrationEligible: boolean;
  topProductShare: number | null;
  topProductName: string | null;
  ga4Sessions: number | null;
};

type ActionRuleDefinition = {
  id: RevenueAction["id"];
  title: RevenueAction["title"];
  recommendation: (ctx: ActionRuleContext) => string;
  expectedImpact: (ctx: ActionRuleContext) => string;
  urgency: RevenueAction["urgency"];
  trigger: string;
  minimumSample: string;
  evidence: string[];
  suppression: string[];
  confidenceMethod: string;
  expectedImpactMethod: string;
  guard: (ctx: ActionRuleContext) => { ok: boolean; caveats?: string[] };
  confidence: (ctx: ActionRuleContext) => number;
};

const ACTION_RULES: ActionRuleDefinition[] = [
  {
    id: "woo-revenue-decline",
    title: "Stabilize Woo revenue",
    recommendation: (ctx) =>
      ctx.wooRevenueTrend
        ? `Address the ${formatPercent(ctx.wooRevenueTrend.delta)} revenue slide with a conversion-focused release.`
        : "Insufficient evidence",
    expectedImpact: (ctx) => {
      if (!ctx.wooRevenueTrend) return "Potential impact cannot yet be quantified.";
      const loss = Math.abs(Math.round(ctx.wooRevenueTrend.last - ctx.wooRevenueTrend.first));
      return loss > 0 ? `Recover approximately ${currency(loss)} in this range if conversion improves.` : "Potential impact cannot yet be quantified.";
    },
    urgency: "This week",
    trigger: "Woo telemetry shows ≥10% decline with ≥$5K baseline and ≥$1K absolute loss",
    minimumSample: "Woo orders ≥5, revenue baseline ≥$5K, ≥2 telemetry points",
    evidence: ["Woo telemetry timeseries", "Woo commerce summary"],
    suppression: [
      "Selected range includes partial current day",
      "Telemetry window incomplete",
      "Source is stale (>48h)",
      "Revenue baseline below $5K",
      "Absolute change below $1K"
    ],
    confidenceMethod: "Deterministic calculation of percent change",
    expectedImpactMethod: "Absolute loss first-last",
    guard: (ctx) => {
      if (
        ctx.hasPartialDay ||
        !ctx.wooRevenueTrend ||
        ctx.wooRevenueTrend.delta >= -0.1 ||
        !ctx.wooRevenueVolumeOk ||
        !ctx.hasCompleteRange ||
        ctx.isStaleSource
      ) {
        return { ok: false };
      }
      return { ok: true };
    },
    confidence: () => 0.7
  },
  {
    id: "woo-order-decline",
    title: "Restore order volume",
    recommendation: (ctx) =>
      ctx.wooOrderTrend ? `Close the ${formatPercent(ctx.wooOrderTrend.delta)} order gap by activating a qualified audience.` : "Insufficient evidence",
    expectedImpact: () => "Rebuild weekly order count to protect revenue pacing.",
    urgency: "This week",
    trigger: "Woo orders down ≥8% with ≥100-order baseline",
    minimumSample: "Woo orders ≥100, ≥2 telemetry points",
    evidence: ["Woo telemetry timeseries"],
    suppression: [
      "Selected range includes partial current day",
      "Telemetry window incomplete",
      "Orders baseline below 100",
      "Trend unavailable",
      "Source is stale (>48h)"
    ],
    confidenceMethod: "Deterministic calculation of percent change",
    expectedImpactMethod: "Qualitative (order pacing)",
    guard: (ctx) => {
      if (
        ctx.hasPartialDay ||
        !ctx.wooOrderTrend ||
        ctx.wooOrderTrend.delta >= -0.08 ||
        !ctx.wooOrderVolumeOk ||
        !ctx.hasCompleteRange ||
        ctx.isStaleSource
      ) {
        return { ok: false };
      }
      return { ok: true };
    },
    confidence: () => 0.65
  },
  {
    id: "woo-refunds",
    title: "Investigate refund spike",
    recommendation: (ctx) =>
      ctx.wooRefundRate != null
        ? `Refund rate ${formatPercentRaw(ctx.wooRefundRate)} exceeds the ≤5% guardrail. Identify offending products or fulfillment gaps.`
        : "Insufficient evidence",
    expectedImpact: (ctx) => {
      if (ctx.wooRefundRate == null || ctx.wooNetRevenue == null) return "Potential impact cannot yet be quantified.";
      const exposure = Math.round((ctx.wooNetRevenue ?? 0) * (ctx.wooRefundRate ?? 0));
      return exposure > 0 ? `Protect roughly ${currency(exposure)} by resolving refund root causes.` : "Potential impact cannot yet be quantified.";
    },
    urgency: "This week",
    trigger: "Refund rate >8% with reliable refund window",
    minimumSample: "Refund definition present, Woo net revenue reported",
    evidence: ["Woo snapshot refund rate", "Woo net revenue"],
    suppression: [
      "Selected range includes partial current day",
      "Refund definition incomplete",
      "Net revenue missing"
    ],
    confidenceMethod: "Measured refund rate",
    expectedImpactMethod: "Net revenue × refund rate",
    guard: (ctx) => {
      if (ctx.hasPartialDay || ctx.wooRefundRate == null || ctx.wooRefundRate <= 0.08 || ctx.wooNetRevenue == null) {
        return { ok: false };
      }
      return { ok: true };
    },
    confidence: () => 0.6
  },
  {
    id: "funnel-cart-drop",
    title: "Fix cart-to-checkout drop",
    recommendation: (ctx) =>
      ctx.ga4FunnelCartToCheckout != null
        ? `Only ${formatPercentRaw(ctx.ga4FunnelCartToCheckout)} of carts reach checkout; audit checkout blockers.`
        : "Insufficient evidence",
    expectedImpact: () => "Increase checkout throughput by addressing UX or trust blockers.",
    urgency: "Today",
    trigger: "GA4 cart→checkout <40% with ≥500 sessions",
    minimumSample: "GA4 funnel data with ≥500 sessions",
    evidence: ["GA4 funnel rates"],
    suppression: [
      "GA4 funnel data missing",
      "Selected range includes partial current day",
      "Source stale (>48h)",
      "Sessions below 500"
    ],
    confidenceMethod: "Measured funnel rate",
    expectedImpactMethod: "Qualitative (conversion lift)",
    guard: (ctx) => {
      if (
        ctx.ga4FunnelCartToCheckout == null ||
        ctx.ga4FunnelCartToCheckout >= 0.4 ||
        ctx.hasPartialDay ||
        ctx.isStaleSource ||
        (ctx.ga4Sessions != null && ctx.ga4Sessions < 500)
      ) {
        return { ok: false };
      }
      return { ok: true };
    },
    confidence: () => 0.55
  },
  {
    id: "woo-product-concentration",
    title: "Diversify product mix",
    recommendation: (ctx) =>
      ctx.topProductShare != null && ctx.topProductName
        ? `${ctx.topProductName} drives ${formatPercentRaw(ctx.topProductShare)} of units; add a second hero to reduce fragility.`
        : "Insufficient evidence",
    expectedImpact: () => "Reduce dependence on a single product and protect drop cadence.",
    urgency: "This month",
    trigger: "Top product share ≥50% with ≥10 orders across ≥3 products",
    minimumSample: "Orders ≥10, products ≥3, full telemetry window",
    evidence: ["Woo top products"],
    suppression: [
      "Orders below 10",
      "Products below 3",
      "Telemetry incomplete",
      "Source stale (>48h)",
      "Selected range includes partial current day"
    ],
    confidenceMethod: "Deterministic share calculation",
    expectedImpactMethod: "Qualitative diversification thesis",
    guard: (ctx) => {
      if (!ctx.productConcentrationEligible || ctx.topProductShare == null || ctx.topProductShare < 0.5) {
        return { ok: false };
      }
      return { ok: true };
    },
    confidence: () => 0.6
  }
];

function buildActionFromRule(rule: ActionRuleDefinition, ctx: ActionRuleContext, provenance: Provenance): RevenueAction {
  return {
    id: rule.id,
    title: rule.title,
    recommendation: rule.recommendation(ctx),
    expectedImpact: rule.expectedImpact(ctx),
    urgency: rule.urgency,
    provenance,
    rule: {
      owner: "Revenue Intelligence",
      trigger: rule.trigger,
      minimumSample: rule.minimumSample,
      evidence: rule.evidence,
      suppression: rule.suppression,
      confidenceMethod: rule.confidenceMethod,
      expectedImpactMethod: rule.expectedImpactMethod
    }
  };
}

export function buildRevenueIntelligence({
  snapshot,
  telemetry
}: {
  snapshot?: WebsiteConversionSnapshot | null;
  telemetry?: CommerceTelemetry;
}): RevenueIntel {
  const woo = snapshot?.wooCommerce;
  const ga4 = snapshot?.ga4;
  const wooSummary = telemetry?.woo?.summary;
  const wooSeries = telemetry?.woo?.timeseries ?? [];
  const gaSeries = telemetry?.ga4?.timeseries ?? [];

  const rangeLabel = telemetry?.range ? `${telemetry.range.startDate} → ${telemetry.range.endDate}` : "Range unavailable";
  const todayIso = new Date().toISOString().slice(0, 10);
  const hasPartialDay = telemetry?.range ? telemetry.range.endDate >= todayIso : false;
  const isStaleSource = telemetry?.range ? daysBetween(telemetry.range.endDate, todayIso) > 2 : false;
  const expectedDays = telemetry?.range ? daysBetweenInclusive(telemetry.range.startDate, telemetry.range.endDate) : null;
  const hasCompleteRange = expectedDays ? wooSeries.length >= expectedDays : wooSeries.length >= 2;

  const wooRevenueTrend = computeTrend(wooSeries.map((point) => point.revenue));
  const wooOrderTrend = computeTrend(wooSeries.map((point) => point.orders));
  const gaRevenueTrend = computeTrend(gaSeries.map((point) => point.revenue));

  const ordersInRange = wooSummary?.orders ?? woo?.paidOrdersInWindow ?? null;
  const wooRevenueBaseline = wooRevenueTrend?.first ?? wooSummary?.revenue ?? woo?.netRevenue ?? null;
  const wooRevenueVolumeOk =
    wooRevenueBaseline != null ? wooRevenueBaseline >= 5000 && Math.abs((wooRevenueTrend?.last ?? 0) - (wooRevenueTrend?.first ?? 0)) >= 1000 : false;
  const wooOrderVolumeOk = ordersInRange != null ? ordersInRange >= 100 && Math.abs((wooOrderTrend?.last ?? 0) - (wooOrderTrend?.first ?? 0)) >= 20 : false;

  const topProducts = (woo?.topProducts ?? []).filter((product) => (product.units ?? 0) > 0);
  const totalUnits = topProducts.reduce((sum, product) => sum + (product.units ?? 0), 0);
  const topProduct = topProducts[0];
  const topProductShare = totalUnits > 0 && topProduct ? (topProduct.units ?? 0) / totalUnits : null;
  const productConcentrationEligible = !!(
    ordersInRange != null && ordersInRange >= 10 && topProducts.length >= 3 && hasCompleteRange && !isStaleSource && !hasPartialDay
  );

  const ctx: ActionRuleContext = {
    rangeLabel,
    hasPartialDay,
    hasCompleteRange,
    isStaleSource,
    ordersInRange,
    wooRevenueTrend,
    wooOrderTrend,
    ga4FunnelCartToCheckout: ga4?.funnelRates?.cartToCheckout,
    wooRefundRate: woo?.refundRate,
    wooNetRevenue: woo?.netRevenue,
    wooRevenueVolumeOk,
    wooOrderVolumeOk,
    productConcentrationEligible,
    topProductShare,
    topProductName: topProduct?.name ?? null,
    ga4Sessions: ga4?.sessions ?? ga4?.totalUsers ?? null
  };

  const headline = buildHeadline({ woo, wooRevenueTrend, gaRevenueTrend, rangeLabel });
  const drivers = buildDrivers({ wooRevenueTrend, wooOrderTrend, woo, ga4, ctx });
  const reconciliation = buildReconciliation({ woo, ga4, rangeLabel });

  const actions: RevenueAction[] = [];
  for (const rule of ACTION_RULES) {
    const guardResult = rule.guard(ctx);
    if (!guardResult.ok) continue;
    const provenance: Provenance = {
      source: rule.id,
      measuredInputs: rule.evidence,
      calculation: rule.confidenceMethod,
      inferenceType: "heuristic",
      confidence: rule.confidence(ctx),
      dataWindow: rangeLabel,
      caveats: guardResult.caveats
    };
    actions.push(buildActionFromRule(rule, ctx, provenance));
  }

  const scenario = buildScenario(actions, rangeLabel);

  return {
    headline,
    drivers: drivers.slice(0, 3),
    reconciliation,
    actions: actions.slice(0, 3),
    scenario,
    customerMessage: "Insufficient customer history for reliable customer intelligence"
  };
}

function buildHeadline({
  woo,
  wooRevenueTrend,
  gaRevenueTrend,
  rangeLabel
}: {
  woo?: WebsiteConversionSnapshot["wooCommerce"];
  wooRevenueTrend: Trend;
  gaRevenueTrend: Trend;
  rangeLabel: string;
}): RevenueFact | null {
  if (wooRevenueTrend) {
    return {
      id: "headline-woo-trend",
      label: "Woo trend",
      value: `Woo revenue ${wooRevenueTrend.delta >= 0 ? "up" : "down"} ${formatPercent(wooRevenueTrend.delta)} in this range`,
      severity: wooRevenueTrend.delta < -0.1 ? "critical" : "info",
      provenance: {
        source: "Woo telemetry",
        measuredInputs: ["Woo revenue timeseries"],
        calculation: "(last-first)/first",
        inferenceType: "deterministic",
        confidence: 0.9,
        dataWindow: rangeLabel
      }
    };
  }
  if (gaRevenueTrend) {
    return {
      id: "headline-ga4-trend",
      label: "GA4 trend",
      value: `GA4 revenue ${gaRevenueTrend.delta >= 0 ? "up" : "down"} ${formatPercent(gaRevenueTrend.delta)} in this range`,
      severity: gaRevenueTrend.delta < -0.1 ? "warning" : "info",
      provenance: {
        source: "GA4 telemetry",
        measuredInputs: ["GA4 revenue timeseries"],
        calculation: "(last-first)/first",
        inferenceType: "deterministic",
        confidence: 0.8,
        dataWindow: rangeLabel
      }
    };
  }
  if (woo?.netRevenue != null) {
    return {
      id: "headline-woo-static",
      label: "Woo completed-order revenue",
      value: currency(woo.netRevenue),
      severity: "info",
      provenance: {
        source: "Woo snapshot",
        measuredInputs: ["Woo net revenue"],
        inferenceType: "measured",
        confidence: 0.95,
        dataWindow: rangeLabel
      }
    };
  }
  return null;
}

function buildDrivers({
  wooRevenueTrend,
  wooOrderTrend,
  woo,
  ga4,
  ctx
}: {
  wooRevenueTrend: Trend;
  wooOrderTrend: Trend;
  woo?: WebsiteConversionSnapshot["wooCommerce"];
  ga4?: WebsiteConversionSnapshot["ga4"];
  ctx: ActionRuleContext;
}): RevenueFact[] {
  const drivers: RevenueFact[] = [];

  if (wooRevenueTrend && ctx.wooRevenueVolumeOk) {
    drivers.push({
      id: "driver-woo-revenue",
      label: "Woo revenue pace",
      value: `Revenue ${wooRevenueTrend.delta >= 0 ? "up" : "down"} ${formatPercent(wooRevenueTrend.delta)}`,
      severity: wooRevenueTrend.delta < -0.1 ? "critical" : "info",
      provenance: {
        source: "Woo telemetry",
        measuredInputs: ["Woo revenue timeseries"],
        calculation: "(last-first)/first",
        inferenceType: "deterministic",
        confidence: 0.9,
        dataWindow: ctx.rangeLabel,
        caveats: ctx.hasCompleteRange ? undefined : ["Telemetry window incomplete"]
      }
    });
  }

  if (wooOrderTrend && ctx.wooOrderVolumeOk) {
    drivers.push({
      id: "driver-woo-orders",
      label: "Order volume",
      value: `Orders ${wooOrderTrend.delta >= 0 ? "up" : "down"} ${formatPercent(wooOrderTrend.delta)}`,
      severity: wooOrderTrend.delta < -0.08 ? "warning" : "info",
      provenance: {
        source: "Woo telemetry",
        measuredInputs: ["Woo orders timeseries"],
        calculation: "(last-first)/first",
        inferenceType: "deterministic",
        confidence: 0.85,
        dataWindow: ctx.rangeLabel
      }
    });
  }

  if (woo?.refundRate != null && woo?.refundRate > 0.08) {
    drivers.push({
      id: "driver-refunds",
      label: "Refund pressure",
      value: `Refund rate ${formatPercentRaw(woo.refundRate)}`,
      severity: "warning",
      provenance: {
        source: "Woo snapshot",
        measuredInputs: ["Refund rate"],
        inferenceType: "measured",
        confidence: 0.7,
        dataWindow: ctx.rangeLabel,
        caveats: woo.refundDefinition ? undefined : ["Refund definition incomplete"]
      }
    });
  }

  if (ga4?.funnelRates?.cartToCheckout != null && ga4.funnelRates.cartToCheckout < 0.4) {
    drivers.push({
      id: "driver-cart-drop",
      label: "Cart leakage",
      value: `${formatPercentRaw(ga4.funnelRates.cartToCheckout)} of carts hit checkout`,
      severity: "warning",
      provenance: {
        source: "GA4 snapshot",
        measuredInputs: ["Cart→checkout rate"],
        inferenceType: "measured",
        confidence: 0.7,
        dataWindow: ctx.rangeLabel
      }
    });
  }

  if (ctx.topProductShare != null && ctx.topProductShare >= 0.5 && ctx.productConcentrationEligible) {
    drivers.push({
      id: "driver-product-share",
      label: "Product concentration",
      value: `${ctx.topProductName ?? "Top product"} carries ${formatPercentRaw(ctx.topProductShare)} of units`,
      severity: "warning",
      provenance: {
        source: "Woo snapshot",
        measuredInputs: ["Top products"],
        calculation: "units_of_top / total_units",
        inferenceType: "deterministic",
        confidence: 0.6,
        dataWindow: ctx.rangeLabel
      }
    });
  }

  return drivers;
}

function buildReconciliation({
  woo,
  ga4,
  rangeLabel
}: {
  woo?: WebsiteConversionSnapshot["wooCommerce"];
  ga4?: WebsiteConversionSnapshot["ga4"];
  rangeLabel: string;
}) {
  const entries: RevenueFact[] = [];
  if (woo?.netRevenue != null) {
    entries.push({
      id: "recon-woo",
      label: "Woo completed-order revenue",
      value: currency(woo.netRevenue),
      provenance: {
        source: "Woo snapshot",
        measuredInputs: ["Net revenue"],
        inferenceType: "measured",
        confidence: 0.95,
        dataWindow: rangeLabel
      }
    });
  } else if (woo?.grossOrderRevenue != null) {
    entries.push({
      id: "recon-woo-gross",
      label: "Woo gross order revenue",
      value: currency(woo.grossOrderRevenue),
      provenance: {
        source: "Woo snapshot",
        measuredInputs: ["Gross order revenue"],
        inferenceType: "measured",
        confidence: 0.9,
        dataWindow: rangeLabel
      }
    });
  }

  if (ga4?.purchaseRevenue != null) {
    entries.push({
      id: "recon-ga4",
      label: "GA4 analytics-reported revenue",
      value: currency(ga4.purchaseRevenue),
      provenance: {
        source: "GA4 snapshot",
        measuredInputs: ["Purchase revenue"],
        inferenceType: "measured",
        confidence: 0.7,
        dataWindow: rangeLabel,
        caveats: ["Tracking gaps or attribution windows may differ"]
      }
    });
  }

  if (woo?.refundTotal != null) {
    entries.push({
      id: "recon-refunds",
      label: "Refund total",
      value: currency(woo.refundTotal),
      provenance: {
        source: "Woo snapshot",
        measuredInputs: ["Refund total"],
        inferenceType: "measured",
        confidence: woo.refundDefinition ? 0.7 : 0.4,
        dataWindow: rangeLabel,
        caveats: woo.refundDefinition ? undefined : ["Refund definition incomplete"]
      }
    });
  }

  const note =
    "Woo uses completed orders, GA4 uses analytics receipts, and refunds reduce net revenue when available. Differences indicate tracking or timing gaps.";

  return { entries, note };
}

function buildScenario(actions: RevenueAction[], rangeLabel: string): ScenarioOutlook | null {
  if (!actions.length) {
    return {
      label: "Scenario Outlook",
      summary: "Potential impact cannot yet be quantified.",
      assumptions: ["No defensible action impact available"],
      provenance: {
        source: "Revenue Intelligence",
        measuredInputs: [],
        inferenceType: "insufficient_evidence",
        confidence: null,
        dataWindow: rangeLabel,
        caveats: ["Pending reliable actions"]
      },
      reviewDate: new Date().toISOString().slice(0, 10)
    };
  }

  const top = actions[0];
  return {
    label: "Scenario Outlook",
    summary: `If ${top.title.toLowerCase()} succeeds under current assumptions, the estimated upside is ${top.expectedImpact.replace(
      /^[A-Z]/,
      (c) => c.toLowerCase()
    )}. This is a heuristic scenario, not a forecast.`,
    assumptions: ["Action owner validates plan", "No further degradation in upstream demand"],
    provenance: {
      source: top.id,
      measuredInputs: top.provenance.measuredInputs,
      calculation: top.provenance.calculation,
      inferenceType: "heuristic",
      confidence: top.provenance.confidence,
      dataWindow: rangeLabel,
      caveats: ["Scenario, not forecast"].concat(top.provenance.caveats ?? [])
    },
    reviewDate: new Date().toISOString().slice(0, 10)
  };
}

function computeTrend(series: Array<number | null | undefined>): Trend {
  if (!series || series.length < 2) return null;
  const first = series.find((value) => value != null && Number.isFinite(value));
  const last = [...series].reverse().find((value) => value != null && Number.isFinite(value));
  if (first == null || last == null || first === 0) return null;
  return { first, last, delta: (last - first) / first };
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBetweenInclusive(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = Math.abs(Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))) + 1;
  return diff;
}

function currency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function formatPercentRaw(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "–";
  return `${Math.round(value * 100)}%`;
}
