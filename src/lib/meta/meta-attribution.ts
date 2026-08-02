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

  // ROAS is a direct attribution metric.
  if (snapshot.summary?.roas != null) return true;

  // Campaign-level attribution fields are nullable; when Meta can't attribute,
  // they are typically omitted/null rather than reliably encoded as 0.
  const campaigns = snapshot.campaigns ?? [];
  return campaigns.some((c) => c.purchases != null || c.purchaseValue != null || c.roas != null);
}

