import "server-only";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
// Claim stable/version record contracts are enforced at the persistence boundary
// (RPC-backed write path). This repository currently implements reads only.
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { mapClaimStableRow, mapClaimVersionRow } from "@/lib/external-intelligence/persistence/supabase/row-mappers";

export class ClaimRepository {
  async getStable(claim_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase.from("external_claims_v1").select("*").eq("claim_id", claim_id).limit(1).maybeSingle();
    if (q.error) throw new Error(`Failed to fetch claim stable: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Claim stable not found: ${claim_id}`);
    return mapClaimStableRow(q.data as unknown as Record<string, unknown>);
  }

  async getVersion(ref: VersionRef, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_claim_versions_v1")
      .select("*")
      .eq("claim_id", ref.object_id)
      .eq("content_hash", ref.content_hash)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch claim version: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Claim version not found: ${ref.object_id}::${ref.content_hash}`);
    return mapClaimVersionRow(q.data as unknown as Record<string, unknown>);
  }

  async listVersions(claim_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase.from("external_claim_versions_v1").select("*").eq("claim_id", claim_id).order("created_at", {
      ascending: true
    });
    if (q.error) throw new Error(`Failed to list claim versions: ${q.error.message}`);
    return (q.data ?? []).map((r) => mapClaimVersionRow(r as unknown as Record<string, unknown>));
  }

  async writeImmutableVersion(): Promise<VersionRef> {
    throw new Error("TransactionSupportBlocked: Claim write requires a server-side SQL transaction (RPC).");
  }
}
