import "server-only";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
// EvidenceReference stable/version record contracts are enforced at the persistence boundary
// (RPC-backed write path). This repository currently implements reads only.
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { mapEvidenceStableRow, mapEvidenceVersionRow } from "@/lib/external-intelligence/persistence/supabase/row-mappers";

export class EvidenceReferenceRepository {
  async getStable(evidence_reference_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_evidence_references_v1")
      .select("*")
      .eq("evidence_reference_id", evidence_reference_id)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch evidence stable: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Evidence stable not found: ${evidence_reference_id}`);
    return mapEvidenceStableRow(q.data as unknown as Record<string, unknown>);
  }

  async getVersion(ref: VersionRef, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_evidence_reference_versions_v1")
      .select("*")
      .eq("evidence_reference_id", ref.object_id)
      .eq("content_hash", ref.content_hash)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch evidence version: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Evidence version not found: ${ref.object_id}::${ref.content_hash}`);
    return mapEvidenceVersionRow(q.data as unknown as Record<string, unknown>);
  }

  async listVersions(evidence_reference_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_evidence_reference_versions_v1")
      .select("*")
      .eq("evidence_reference_id", evidence_reference_id)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list evidence versions: ${q.error.message}`);
    return (q.data ?? []).map((r) => mapEvidenceVersionRow(r as unknown as Record<string, unknown>));
  }

  // Writes require a DB transaction due to stable<->version circular constraints.
  // Implemented via RPC in a later explicit migration.
  async writeImmutableVersion(): Promise<VersionRef> {
    throw new Error(
      "TransactionSupportBlocked: EvidenceReference write requires a server-side SQL transaction (RPC)."
    );
  }
}
