import "server-only";

import type { LifecycleTransitionRecord } from "@/lib/external-intelligence/persistence/records";
import { lifecycleTransitionIdempotencyKey } from "@/lib/external-intelligence/persistence/idempotency";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class LifecycleRepository {
  async recordTransition(t: LifecycleTransitionRecord, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const transition_id = lifecycleTransitionIdempotencyKey({
      object_ref: t.object_ref,
      from_status: t.from_status,
      to_status: t.to_status,
      effective_at: t.effective_at,
      policy_version: t.policy_version,
      reason_codes: t.reason_codes
    });

    const row = {
      transition_id,
      object_type: t.object_ref.object_type,
      object_id: t.object_ref.object_id,
      content_hash: t.object_ref.content_hash,
      object_ref_json: t.object_ref,
      from_status: t.from_status,
      to_status: t.to_status,
      effective_at: t.effective_at,
      reason_codes: t.reason_codes,
      policy_version: t.policy_version,
      policy_hash: t.policy_version,
      created_at: t.created_at
    };

    const { error } = await supabase
      .from("external_lifecycle_transitions_v1")
      .upsert(row, { onConflict: "object_type,object_id,content_hash,from_status,to_status,effective_at,policy_hash" });
    if (error) throw new Error(`Failed to upsert lifecycle transition: ${error.message}`);
  }

  async listTransitions(object_ref: LifecycleTransitionRecord["object_ref"], opts?: {
    client?: ReturnType<typeof getExternalIntelligenceSupabaseClient>;
  }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_lifecycle_transitions_v1")
      .select("*")
      .eq("object_type", object_ref.object_type)
      .eq("object_id", object_ref.object_id)
      .eq("content_hash", object_ref.content_hash)
      .order("effective_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list transitions: ${q.error.message}`);
    return (q.data ?? []) as unknown as LifecycleTransitionRecord[];
  }
}
