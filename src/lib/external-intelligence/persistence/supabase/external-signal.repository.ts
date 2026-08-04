import "server-only";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
// Signal stable/version record contracts are enforced at the persistence boundary
// (RPC-backed write path). This repository currently implements reads only.
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { mapSignalStableRow, mapSignalVersionRow } from "@/lib/external-intelligence/persistence/supabase/row-mappers";

export class ExternalSignalRepository {
  async getStable(signal_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase.from("external_signals_v1").select("*").eq("signal_id", signal_id).limit(1).maybeSingle();
    if (q.error) throw new Error(`Failed to fetch signal stable: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Signal stable not found: ${signal_id}`);
    return mapSignalStableRow(q.data as unknown as Record<string, unknown>);
  }

  async getVersion(ref: VersionRef, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_signal_versions_v1")
      .select("*")
      .eq("signal_id", ref.object_id)
      .eq("content_hash", ref.content_hash)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch signal version: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Signal version not found: ${ref.object_id}::${ref.content_hash}`);
    return mapSignalVersionRow(q.data as unknown as Record<string, unknown>);
  }

  async listVersions(signal_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_signal_versions_v1")
      .select("*")
      .eq("signal_id", signal_id)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list signal versions: ${q.error.message}`);
    return (q.data ?? []).map((r) => mapSignalVersionRow(r as unknown as Record<string, unknown>));
  }

  async writeImmutableVersion(): Promise<VersionRef> {
    throw new Error(
      "TransactionSupportBlocked: Signal write requires a server-side SQL transaction (RPC) due to stable<->version FKs."
    );
  }
}
