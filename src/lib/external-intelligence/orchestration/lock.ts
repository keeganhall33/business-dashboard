import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export type InternalOrchestrationLease = {
  acquired: boolean;
  lease_token: string | null;
  expires_at: string | null;
};

/**
 * Durable global orchestration lock (no Postgres session affinity).
 */
export async function acquireInternalOrchestrationLockV1(input: {
  lock_key: string;
  lease_owner: string;
  lease_seconds: number;
}): Promise<InternalOrchestrationLease> {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { data, error } = await supabase.rpc("acquire_internal_orchestration_lock_v1", {
    in_lock_key: input.lock_key,
    in_lease_owner: input.lease_owner,
    in_lease_seconds: input.lease_seconds
  });
  if (error) throw new Error(`Failed to acquire lock: ${error.message}`);
  const row = (data as unknown as InternalOrchestrationLease[] | null)?.[0] ?? null;
  return {
    acquired: Boolean(row?.acquired),
    lease_token: row?.lease_token ?? null,
    expires_at: row?.expires_at ?? null
  };
}

export async function renewInternalOrchestrationLockV1(input: {
  lock_key: string;
  lease_token: string;
  lease_seconds: number;
}): Promise<{ renewed: boolean; expires_at: string | null }> {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { data, error } = await supabase.rpc("renew_internal_orchestration_lock_v1", {
    in_lock_key: input.lock_key,
    in_lease_token: input.lease_token,
    in_lease_seconds: input.lease_seconds
  });
  if (error) throw new Error(`Failed to renew lock: ${error.message}`);
  const row = (data as unknown as Array<{ renewed: boolean; expires_at: string | null }> | null)?.[0] ?? null;
  return { renewed: Boolean(row?.renewed), expires_at: row?.expires_at ?? null };
}

export async function releaseInternalOrchestrationLockV1(input: {
  lock_key: string;
  lease_token: string;
}): Promise<{ released: boolean }> {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { data, error } = await supabase.rpc("release_internal_orchestration_lock_v1", {
    in_lock_key: input.lock_key,
    in_lease_token: input.lease_token
  });
  if (error) throw new Error(`Failed to release lock: ${error.message}`);
  return { released: Boolean(data as unknown) };
}
