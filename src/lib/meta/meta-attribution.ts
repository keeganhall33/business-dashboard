import type { MetaAdsSnapshot } from "@/lib/types/dashboard";

/**
 * Meta delivery and Meta attribution are separate.
 *
 * Delivery can be live while attribution is unavailable.
 * We only treat attribution as available when it is defensible from Meta payloads
 * (i.e. not an implicit default/placeholder).
 */
export function hasDefensibleMetaAttribution(snapshot: MetaAdsSnapshot | null | undefined): boolean {
  if (!snapshot) return false;

  // Campaign-level attribution fields are nullable; when Meta can't attribute,
  // they are typically omitted/null rather than reliably encoded as 0.
  // We treat attribution as defensible only when at least one campaign carries
  // explicit attribution fields (including legitimate zeros).
  const campaigns = snapshot.campaigns ?? [];
  const hasCampaignAttribution = campaigns.some((c) => c.purchases != null || c.purchaseValue != null || c.roas != null);
  if (hasCampaignAttribution) return true;

  // Some payloads may include summary-level zeros even when attribution isn't configured.
  // Without campaign-level attribution evidence, only treat summary attribution as
  // defensible when it is strictly positive.
  const purchases = snapshot.summary?.purchases;
  const purchaseValue = snapshot.summary?.purchaseValue;
  const roas = snapshot.summary?.roas;

  return Boolean((purchases != null && purchases > 0) || (purchaseValue != null && purchaseValue > 0) || (roas != null && roas > 0));
}
