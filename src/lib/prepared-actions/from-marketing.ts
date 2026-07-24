import type { MarketingCommandSnapshot, PreparedAction, PreparedActionCategory, PreparedActionEvidence } from "@/lib/types/dashboard";
import { createPreparedAction } from "@/lib/supabase/queries";

const ACTIVE_STATUSES = new Set<PreparedAction["status"]>(["draft", "ready_for_review", "approved"]);

const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type PreparedActionInsertPayload = Parameters<typeof createPreparedAction>[0];

export type PreparedActionGenerationSummary = {
  created: number;
  skippedDuplicate: number;
  skippedUnsupported: number;
};

export async function ensurePreparedActionsFromMarketingSnapshot(
  snapshot: MarketingCommandSnapshot,
  existingActions: PreparedAction[]
) {
  const summary: PreparedActionGenerationSummary = {
    created: 0,
    skippedDuplicate: 0,
    skippedUnsupported: 0
  };

  if (!snapshot?.topConnectedInsights?.length) return summary;
  const activeKeys = new Set(
    existingActions
      .filter((action) => action.dedupeKey && ACTIVE_STATUSES.has(action.status))
      .map((action) => action.dedupeKey as string)
  );

  for (const insight of snapshot.topConnectedInsights) {
    if (!insight?.id) continue;
    const template = buildTemplateForInsight(insight, snapshot);
    if (!template) {
      summary.skippedUnsupported += 1;
      continue;
    }
    const dedupeKey = `marketing_insight:${insight.id}`;
    if (activeKeys.has(dedupeKey)) {
      summary.skippedDuplicate += 1;
      continue;
    }
    try {
      await createPreparedAction({
        ...template,
        dedupeKey
      });
      summary.created += 1;
      activeKeys.add(dedupeKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("prepared_actions_dedupe_active_idx")) {
        summary.skippedDuplicate += 1;
        continue;
      }
      console.warn("ensurePreparedActionsFromMarketingSnapshot error", message);
    }
  }

  return summary;
}

function buildTemplateForInsight(
  insight: NonNullable<MarketingCommandSnapshot["topConnectedInsights"]>[number],
  snapshot: MarketingCommandSnapshot
): PreparedActionInsertPayload | null {
  switch (insight.id) {
    case "cart_checkout_drop":
      return buildCheckoutLeakAction(insight, snapshot.generatedAt ?? null);
    case "product_revenue_concentration":
      return buildConcentrationAction(insight, snapshot.generatedAt ?? null);
    case "product_momentum_winner":
      return buildMomentumWinnerAction(insight, snapshot.generatedAt ?? null);
    default:
      return null;
  }
}

function buildCheckoutLeakAction(
  insight: NonNullable<MarketingCommandSnapshot["topConnectedInsights"]>[number],
  generatedAt: string | null
): PreparedActionInsertPayload | null {
  const addToCart = toNumber(insight.triggerMetrics?.addToCart);
  const beginCheckout = toNumber(insight.triggerMetrics?.beginCheckout);
  const retention = typeof insight.triggerMetrics?.checkoutRetention === "number" ? insight.triggerMetrics.checkoutRetention * 100 : null;
  if (addToCart == null || beginCheckout == null) return null;
  const evidence: PreparedActionEvidence[] = [
    { label: "GA4 add_to_cart", value: formatNumber(addToCart) },
    { label: "begin_checkout", value: formatNumber(beginCheckout) }
  ];
  if (retention != null) {
    evidence.push({ label: "Checkout retention", value: `${percentFormatter.format(retention)}%` });
  }
  return {
    title: "Audit cart → checkout drop-off",
    category: "website" as PreparedActionCategory,
    sourcePanel: "marketing_command",
    createdByAgent: "marketing_command",
    sourceInsightId: insight.id,
    sourceSnapshotAt: generatedAt,
    whyItMatters: insight.insight ?? "Cart volume is not converting to checkout starts.",
    evidence,
    preparedAsset: [],
    estimatedImpact: null,
    riskLevel: "high" as const,
    confidence: "medium" as const,
    dataLight: beginCheckout < 10,
    requiredApprovalAction: "Approve checkout friction investigation"
  };
}

function buildConcentrationAction(
  insight: NonNullable<MarketingCommandSnapshot["topConnectedInsights"]>[number],
  generatedAt: string | null
): PreparedActionInsertPayload | null {
  const triggeredName = typeof insight.triggerMetrics?.topProduct === "string" ? insight.triggerMetrics.topProduct : "";
  const fallbackName = typeof insight.title === "string" ? insight.title : "";
  const topProduct = (triggeredName.trim() || fallbackName.trim());
  const concentration = typeof insight.triggerMetrics?.concentration === "number" ? insight.triggerMetrics.concentration : null;
  if (!topProduct || concentration == null) return null;
  return {
    title: "Stage a backup revenue hero",
    category: "product" as PreparedActionCategory,
    sourcePanel: "marketing_command",
    createdByAgent: "marketing_command",
    sourceInsightId: insight.id,
    sourceSnapshotAt: generatedAt,
    whyItMatters: insight.insight ?? `${topProduct} controls too much revenue share right now.`,
    evidence: [
      { label: "Top product", value: topProduct },
      { label: "Revenue share", value: `${percentFormatter.format(concentration)}%` }
    ],
    preparedAsset: [],
    estimatedImpact: null,
    riskLevel: "medium" as const,
    confidence: "medium" as const,
    dataLight: false,
    requiredApprovalAction: "Approve backup hero merchandising plan"
  };
}

function buildMomentumWinnerAction(
  insight: NonNullable<MarketingCommandSnapshot["topConnectedInsights"]>[number],
  generatedAt: string | null
): PreparedActionInsertPayload | null {
  const triggeredName = typeof insight.triggerMetrics?.topProduct === "string" ? insight.triggerMetrics.topProduct : "";
  const derivedName = insight.title ? insight.title.replace(/^.+?:\s*/, "").trim() : "";
  const productName = triggeredName.trim() || derivedName;
  const delta = typeof insight.triggerMetrics?.revenueDelta === "number" ? insight.triggerMetrics.revenueDelta : null;
  const deltaPercent = typeof insight.triggerMetrics?.revenueDeltaPercent === "number" ? insight.triggerMetrics.revenueDeltaPercent : null;
  if (!productName) return null;
  const evidence: PreparedActionEvidence[] = [];
  if (deltaPercent != null) evidence.push({ label: "Revenue Δ%", value: `${percentFormatter.format(deltaPercent)}%` });
  if (delta != null) evidence.push({ label: "Revenue Δ", value: currencyFormatter.format(delta) });
  return {
    title: `Promote ${productName} now`,
    category: "product" as PreparedActionCategory,
    sourcePanel: "marketing_command",
    createdByAgent: "marketing_command",
    sourceInsightId: insight.id,
    sourceSnapshotAt: generatedAt,
    whyItMatters: insight.insight ?? `${productName} is surging week-over-week—capture the lift while it lasts.`,
    evidence,
    preparedAsset: [],
    estimatedImpact: delta != null ? currencyFormatter.format(delta) : null,
    riskLevel: "medium" as const,
    confidence: "high" as const,
    dataLight: false,
    requiredApprovalAction: "Approve spotlight across email + site hero"
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value: number | null) {
  if (value == null) return null;
  return value.toLocaleString("en-US");
}
