import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export async function runExpiredLeaseRecoveryV1(input?: { signal?: AbortSignal }) {
  if (input?.signal?.aborted) throw new Error("handler_aborted");
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { data, error } = await supabase.rpc("recover_expired_external_collection_leases_v1");
  if (error) throw new Error(`lease_recovery_failed: ${error.message}`);
  if (input?.signal?.aborted) throw new Error("handler_aborted");
  return { recovered: Number(data ?? 0) };
}
