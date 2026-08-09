import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

/**
 * Read-only reuse lookup by source_id + source_url_or_reference.
 *
 * NOTE: We do not assume evidence_reference_id is derived from URL for targeted research.
 */
export async function evidenceReuseLookupSupabaseV1(input: {
  source_id: string;
  canonical_url: string;
}): Promise<{ exists: boolean; evidence_reference_id: string | null }> {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const q = await supabase
    .from("external_evidence_reference_versions_v1")
    .select("evidence_reference_id")
    .eq("source_id", input.source_id)
    .eq("source_url_or_reference", input.canonical_url)
    .limit(1);
  if (q.error) throw new Error(`Failed to lookup evidence reuse: ${q.error.message}`);
  const row = (q.data ?? [])[0] as null | { evidence_reference_id?: string };
  return { exists: !!row?.evidence_reference_id, evidence_reference_id: row?.evidence_reference_id ?? null };
}
