import type { MetaAdsSnapshot, PreparedAction } from "@/lib/types/dashboard";
import { createPreparedAction } from "@/lib/supabase/queries";

export type PreparedActionGenerationSummary = {
  created: number;
  skippedDuplicate: number;
  skippedUnsupported: number;
};

export async function ensurePreparedActionsFromMetaSnapshot(
  snapshot: MetaAdsSnapshot,
  existing: PreparedAction[]
): Promise<PreparedActionGenerationSummary> {
  const summary: PreparedActionGenerationSummary = { created: 0, skippedDuplicate: 0, skippedUnsupported: 0 };
  const activeKeys = new Set(existing.map((action) => action.dedupeKey).filter((key): key is string => Boolean(key)));

  if (!snapshot?.summary) return summary;

  const creativeNeedsRefresh = shouldRefreshCreative(snapshot.summary);
  if (creativeNeedsRefresh) {
    const key = "meta_insight:creative_refresh";
    if (activeKeys.has(key)) {
      summary.skippedDuplicate += 1;
    } else {
      await createPreparedAction({
        title: "Prepare Meta creative refresh brief",
        category: "meta",
        sourcePanel: "meta_ads",
        sourceInsightId: key,
        sourceSnapshotAt: snapshot.generatedAt,
        dedupeKey: key,
        createdByAgent: "meta_ads",
        whyItMatters: `Spent ${currency(snapshot.summary.spend)} with ${snapshot.summary.purchases} purchases (ROAS ${formatNumber(
          snapshot.summary.roas
        )}). Fresh creative needed before scaling budget.`,
        evidence: [
          { label: "Spend", value: currency(snapshot.summary.spend) },
          { label: "Purchases", value: String(snapshot.summary.purchases ?? 0) },
          { label: "ROAS", value: formatNumber(snapshot.summary.roas, "x") }
        ],
        preparedAsset: [{ label: "Brief outline", value: "Hook, collector proof, CTA" }],
        estimatedImpact: "Stabilize ROAS before scaling",
        riskLevel: "medium",
        confidence: "medium",
        dataLight: (snapshot.summary.purchases ?? 0) < 3,
        requiredApprovalAction: "Approve creative refresh work"
      });
      summary.created += 1;
      activeKeys.add(key);
    }
  }

  const campaignsToScale = snapshot.campaigns
    ?.filter((campaign) => (campaign.purchases ?? 0) >= 3 && (campaign.roas ?? 0) >= 2)
    .slice(0, 2);

  for (const campaign of campaignsToScale ?? []) {
    const key = `meta_insight:scale:${campaign.campaignId}`;
    if (activeKeys.has(key)) {
      summary.skippedDuplicate += 1;
      continue;
    }
    await createPreparedAction({
      title: `Plan scale test for ${campaign.campaignName}`,
      category: "meta",
      sourcePanel: "meta_ads",
      sourceInsightId: campaign.campaignId,
      sourceSnapshotAt: snapshot.generatedAt,
      dedupeKey: key,
      createdByAgent: "meta_ads",
      whyItMatters: `${campaign.campaignName} is running at ROAS ${formatNumber(campaign.roas, "x")} with ${campaign.purchases ?? 0} purchases. Scale carefully to capture upside.`,
      evidence: [
        { label: "Spend", value: currency(campaign.spend) },
        { label: "Purchases", value: String(campaign.purchases ?? 0) },
        { label: "ROAS", value: formatNumber(campaign.roas, "x") }
      ],
      preparedAsset: [],
      estimatedImpact: "Increased paid revenue",
      riskLevel: "medium",
      confidence: "high",
      dataLight: false,
      requiredApprovalAction: "Approve scale test parameters"
    });
    summary.created += 1;
    activeKeys.add(key);
  }

  return summary;
}

function shouldRefreshCreative(summary: MetaAdsSnapshot["summary"]) {
  if (!summary) return false;
  const purchases = summary.purchases ?? 0;
  if (purchases === 0 && (summary.spend ?? 0) >= 50) return true;
  if (purchases < 3) return true;
  if (summary.roas != null && summary.roas < 1) return true;
  return false;
}

function currency(value?: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatNumber(value?: number | null, suffix = "") {
  if (value == null) return "n/a";
  return `${value.toFixed(2)}${suffix}`;
}
