import { formatPercent, formatUsd } from "@/lib/agents/shared";
import { generatePreparedActionAsset } from "@/lib/prepared-actions/asset-writer";
import { createPreparedAction, updatePreparedAction } from "@/lib/supabase/queries";
import type {
  MarketingCommandSnapshot,
  PreparedAction,
  PreparedActionEvidence,
  PreparedAssetType,
  WebsiteConversionSnapshot
} from "@/lib/types/dashboard";

export type ScoreboardMetricRecord = {
  metric_key: string;
  current_value: number | string | null;
  target_value: number | string | null;
  stats?: {
    average?: number | null;
    changePercent?: number | null;
  } | null;
};

export type SloanPreparedActionSummary = {
  actionsCreated: number;
  actionsSkippedDuplicate: number;
  actionsSkippedLowConfidence: number;
  signalsChecked: string[];
};

type SloanSignalContext = {
  metrics: ScoreboardMetricRecord[];
  websiteSnapshot?: WebsiteConversionSnapshot | null;
  marketingSnapshot?: MarketingCommandSnapshot | null;
  preparedActions: PreparedAction[];
};

const ACTIVE_STATUSES = new Set(["draft", "ready_for_review", "approved"]);

const percent = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : "unknown";

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const metricByKey = (metrics: ScoreboardMetricRecord[], key: string) =>
  metrics.find((metric) => metric.metric_key === key);

export async function ensurePreparedActionsFromSloanSignals(context: SloanSignalContext): Promise<SloanPreparedActionSummary> {
  const summary: SloanPreparedActionSummary = {
    actionsCreated: 0,
    actionsSkippedDuplicate: 0,
    actionsSkippedLowConfidence: 0,
    signalsChecked: []
  };

  const dedupeKeys = new Set(
    context.preparedActions
      .filter((action) => action.dedupeKey && ACTIVE_STATUSES.has(action.status))
      .map((action) => action.dedupeKey as string)
  );

  async function createAction(input: {
    dedupeKey: string;
    title: string;
    category: "product" | "website";
    sourcePanel: string;
    whyItMatters: string;
    evidence: PreparedActionEvidence[];
    requiredApprovalAction: string;
    riskLevel: "low" | "medium" | "high";
    confidence: "low" | "medium" | "high";
    dataLight: boolean;
    estimatedImpact?: string | null;
    assetType?: PreparedAssetType;
  }) {
    if (dedupeKeys.has(input.dedupeKey)) {
      summary.actionsSkippedDuplicate += 1;
      return;
    }

    const action = await createPreparedAction({
      title: input.title,
      category: input.category,
      sourcePanel: input.sourcePanel,
      sourceInsightId: null,
      sourceSnapshotAt: new Date().toISOString(),
      sourceUrl: null,
      dedupeKey: input.dedupeKey,
      whyItMatters: input.whyItMatters,
      evidence: input.evidence,
      preparedAsset: [],
      estimatedImpact: input.estimatedImpact ?? null,
      riskLevel: input.riskLevel,
      confidence: input.confidence,
      dataLight: input.dataLight,
      requiredApprovalAction: input.requiredApprovalAction,
      createdByAgent: "sloan",
      expiresAt: null,
      notes: null
    });

    if (input.assetType) {
      const asset = generatePreparedActionAsset(action, input.assetType);
      await updatePreparedAction(action.id, { preparedAsset: [asset] });
      action.preparedAsset = [asset];
    }

    context.preparedActions.push(action);
    dedupeKeys.add(input.dedupeKey);
    summary.actionsCreated += 1;
  }

  async function handleMetricSignal(args: {
    key: string;
    signalId: string;
    thresholdMultiplier: number;
    title: string;
    category: "product" | "website";
    sourcePanel: string;
    approvalText: string;
    formatValue: (value: number) => string;
    assetType?: PreparedAssetType;
  }) {
    summary.signalsChecked.push(args.signalId);
    const metric = metricByKey(context.metrics, args.key);
    if (!metric) {
      summary.actionsSkippedLowConfidence += 1;
      return;
    }
    const current = toNumber(metric.current_value);
    const target = toNumber(metric.target_value);
    const changePercent = metric.stats?.changePercent ?? null;
    if (current == null || target == null) {
      summary.actionsSkippedLowConfidence += 1;
      return;
    }
    const ratio = target > 0 ? current / target : null;
    if (ratio != null && ratio <= args.thresholdMultiplier) {
      const evidence: PreparedActionEvidence[] = [
        { label: `${args.key.toUpperCase()} current`, value: args.formatValue(current) },
        { label: "Target", value: args.formatValue(target) }
      ];
      if (changePercent != null) {
        evidence.push({ label: "30d trend", value: formatPercent(changePercent, 1) });
      }
      const why = `${args.key.toUpperCase()} is ${args.formatValue(current)} vs ${args.formatValue(target)} target.`;
      await createAction({
        dedupeKey: `sloan:${args.signalId}`,
        title: args.title,
        category: args.category,
        sourcePanel: args.sourcePanel,
        whyItMatters: why,
        evidence,
        requiredApprovalAction: args.approvalText,
        riskLevel: ratio <= args.thresholdMultiplier * 0.9 ? "high" : "medium",
        confidence: "medium",
        dataLight: false,
        assetType: args.assetType
      });
    }
  }

  await handleMetricSignal({
    key: "aov",
    signalId: "aov_gap",
    thresholdMultiplier: 0.85,
    title: "Raise AOV with premium offer audit",
    category: "product",
    sourcePanel: "revenue_engine",
    approvalText: "Approve Sloan's premium pricing reset.",
    formatValue: (value) => formatUsd(value, 0),
    assetType: "content_post_draft"
  });

  await handleMetricSignal({
    key: "conversion_rate",
    signalId: "conversion_gap",
    thresholdMultiplier: 0.85,
    title: "Investigate conversion friction",
    category: "website",
    sourcePanel: "funnel_performance",
    approvalText: "Approve Sloan's conversion recovery plan.",
    formatValue: (value) => formatPercent(value, 2),
    assetType: "checkout_audit_brief"
  });

  // Cart → checkout drop
  summary.signalsChecked.push("checkout_drop");
  const addToCart = toNumber(context.websiteSnapshot?.ga4?.addToCartEvents);
  const beginCheckout = toNumber(context.websiteSnapshot?.ga4?.beginCheckoutEvents);
  const purchases = toNumber(context.websiteSnapshot?.ga4?.ecommercePurchases);
  if (addToCart != null && beginCheckout != null && purchases != null && addToCart > 0 && beginCheckout > 0) {
    const beginRate = beginCheckout / addToCart;
    const purchaseRate = purchases / beginCheckout;
    if (beginRate < 0.45 || purchaseRate < 0.5) {
      const evidence: PreparedActionEvidence[] = [
        { label: "Add to cart", value: String(addToCart) },
        { label: "Begin checkout", value: String(beginCheckout) },
        { label: "Purchases", value: String(purchases) }
      ];
      await createAction({
        dedupeKey: "sloan:checkout_crater",
        title: "Run checkout friction audit",
        category: "website",
        sourcePanel: "funnel_performance",
        whyItMatters: `Checkout drop-off is ${percent(beginRate * 100)} from cart → checkout and ${percent(
          purchaseRate * 100
        )} from checkout → purchase.`,
        evidence,
        requiredApprovalAction: "Approve Sloan's checkout remediation checklist.",
        riskLevel: "high",
        confidence: "medium",
        dataLight: false,
        assetType: "checkout_audit_brief"
      });
    }
  } else {
    summary.actionsSkippedLowConfidence += 1;
  }

  // Product concentration
  summary.signalsChecked.push("product_concentration");
  const momentum = context.marketingSnapshot?.productMomentum ?? null;
  const concentrationPercent = momentum?.concentration?.sharePercent ?? deriveConcentrationFromWebsite(context.websiteSnapshot);
  if (typeof concentrationPercent === "number") {
    if (concentrationPercent >= 65 && momentum?.concentration?.topProduct) {
      const productName = momentum.concentration.topProduct;
      await createAction({
        dedupeKey: `sloan:product_concentration:${productName.toLowerCase()}`,
        title: `Stage backup hero before ${productName} cools`,
        category: "product",
        sourcePanel: "marketing_command",
        whyItMatters: `${productName} controls ${concentrationPercent.toFixed(1)}% of Woo revenue right now.`,
        evidence: [{ label: "Revenue share", value: percent(concentrationPercent) }],
        requiredApprovalAction: "Approve Sloan's backup hero merchandising plan.",
        riskLevel: "medium",
        confidence: "high",
        dataLight: false,
        assetType: "content_post_draft"
      });
    }
  } else {
    summary.actionsSkippedLowConfidence += 1;
  }

  // Product momentum winner
  summary.signalsChecked.push("momentum_winner");
  const winner = momentum?.winners?.[0];
  if (winner && !momentum?.suppressedReasons?.length) {
    const deltaPercent = toNumber(winner.revenueDeltaPercent);
    const delta = toNumber(winner.revenueDelta);
    if ((deltaPercent != null && deltaPercent >= 25) || (delta != null && delta >= 500)) {
      const name = winner.name ?? "Top product";
      await createAction({
        dedupeKey: `sloan:momentum:${slugify(name)}`,
        title: `Promote momentum winner: ${name}`,
        category: "product",
        sourcePanel: "marketing_command",
        whyItMatters: `${name} is surging (${percent(deltaPercent ?? null)} vs prior window).`,
        evidence: [
          { label: "Revenue Δ", value: delta != null ? formatUsd(delta, 0) : "unknown" },
          { label: "Δ%", value: percent(deltaPercent ?? null) }
        ],
        requiredApprovalAction: "Approve Sloan's momentum promotion plan.",
        riskLevel: "medium",
        confidence: "high",
        dataLight: false,
        assetType: "content_post_draft"
      });
    }
  }

  return summary;
}

function deriveConcentrationFromWebsite(snapshot?: WebsiteConversionSnapshot | null) {
  const topProducts = snapshot?.wooCommerce?.topProducts;
  const totalRevenue = toNumber(snapshot?.wooCommerce?.totalRevenue);
  if (!topProducts?.length || !totalRevenue || totalRevenue <= 0) return null;
  const top = toNumber(topProducts[0]?.revenue);
  if (top == null) return null;
  return (top / totalRevenue) * 100;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
