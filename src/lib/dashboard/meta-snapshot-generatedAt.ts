import type { MetaAdsSnapshot } from "@/lib/types/dashboard";

/**
 * Meta snapshot freshness normalization.
 *
 * Semantics:
 * - Prefer payload.generatedAt when present (provider/snapshot timestamp).
 * - Otherwise fall back to dashboard_snapshots.generated_at (snapshot-generation / retrieval time).
 * - If neither exists, remain null (do not fabricate).
 */
export function normalizeMetaSnapshotGeneratedAt(metaSnapshot: MetaAdsSnapshot | null, rowGeneratedAt: string | null): MetaAdsSnapshot | null {
  if (!metaSnapshot) return null;
  if (typeof metaSnapshot.generatedAt === "string" && metaSnapshot.generatedAt) return metaSnapshot;
  return { ...metaSnapshot, generatedAt: rowGeneratedAt };
}

