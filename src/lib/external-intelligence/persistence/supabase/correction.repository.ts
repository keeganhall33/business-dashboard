import "server-only";

import type { CorrectionRecord } from "@/lib/external-intelligence/persistence/records";
import { correctionIdempotencyKey } from "@/lib/external-intelligence/persistence/idempotency";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class CorrectionRepository {
  async recordCorrection(c: CorrectionRecord, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const correction_id = correctionIdempotencyKey({
      object_ref: c.object_ref,
      correction_type: c.correction_type,
      supersedes_ref: c.supersedes_ref,
      policy_version: c.policy_version,
      reason: c.reason
    });

    const row = {
      correction_id,
      object_type: c.object_ref.object_type,
      object_id: c.object_ref.object_id,
      content_hash: c.object_ref.content_hash,
      object_ref_json: c.object_ref,
      correction_type: c.correction_type,
      supersedes_ref_json: c.supersedes_ref,
      superseded_by_ref_json: c.superseded_by_ref,
      reason: c.reason,
      policy_version: c.policy_version,
      policy_hash: c.policy_version,
      created_at: c.created_at
    };

    const { error } = await supabase
      .from("external_corrections_v1")
      .upsert(row, { onConflict: "object_type,object_id,content_hash,correction_type,policy_hash" });
    if (error) throw new Error(`Failed to upsert correction: ${error.message}`);
  }

  async listCorrections(object_ref: CorrectionRecord["object_ref"], opts?: {
    client?: ReturnType<typeof getExternalIntelligenceSupabaseClient>;
  }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_corrections_v1")
      .select("*")
      .eq("object_type", object_ref.object_type)
      .eq("object_id", object_ref.object_id)
      .eq("content_hash", object_ref.content_hash)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list corrections: ${q.error.message}`);
    return (q.data ?? []) as unknown as CorrectionRecord[];
  }
}
