import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class OrchestrationLockError extends Error {
  name = "OrchestrationLockError";
  constructor(
    public code:
      | "lock_not_acquired"
      | "lock_token_mismatch"
      | "lock_expired"
      | "lock_renewal_failed"
      | "lock_release_failed",
    message?: string
  ) {
    super(message ?? code);
  }
}

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
  if (error) throw new OrchestrationLockError("lock_not_acquired", "lock_not_acquired");
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
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("lock_token_mismatch")) throw new OrchestrationLockError("lock_token_mismatch");
    if (msg.includes("lock_expired")) throw new OrchestrationLockError("lock_expired");
    if (msg.includes("lock_not_acquired")) throw new OrchestrationLockError("lock_not_acquired");
    throw new OrchestrationLockError("lock_renewal_failed");
  }
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
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("lock_token_mismatch")) throw new OrchestrationLockError("lock_token_mismatch");
    throw new OrchestrationLockError("lock_release_failed");
  }
  return { released: Boolean(data as unknown) };
}
