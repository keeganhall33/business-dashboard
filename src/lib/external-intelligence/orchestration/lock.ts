import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

/**
 * Acquire a global orchestration lock (best-effort).
 *
 * Uses a dedicated SECURITY DEFINER RPC so the lock lives in Postgres.
 */
export async function acquireGlobalOrchestrationLockV1(input: {
  lock_key: number;
}): Promise<{ acquired: boolean }> {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { data, error } = await supabase.rpc("try_advisory_lock_v1", {
    in_lock_key: input.lock_key
  });
  if (error) throw new Error(`Failed to acquire lock: ${error.message}`);
  return { acquired: Boolean(data) };
}

export async function releaseGlobalOrchestrationLockV1(input: {
  lock_key: number;
}): Promise<{ released: boolean }> {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { data, error } = await supabase.rpc("advisory_unlock_v1", {
    in_lock_key: input.lock_key
  });
  if (error) throw new Error(`Failed to release lock: ${error.message}`);
  return { released: Boolean(data) };
}

