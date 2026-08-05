import type { ConcurrencyCaps } from "@/lib/external-intelligence/orchestration/concurrency";

export type LeasedJob = {
  job_id: string;
  schedule_id: string;
  source_id: string;
  lease_owner: string;
  lease_expires_at: string;
};

export type LeaseClient = {
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }>;
};

/**
 * Atomic leasing via PostgreSQL RPC. This does not execute collectors.
 */
export async function leaseNextExternalCollectionJobV1(input: {
  client: LeaseClient;
  lease_owner: string;
  lease_seconds: number;
  caps: ConcurrencyCaps;
}): Promise<LeasedJob | null> {
  const res = await input.client.rpc<LeasedJob[]>("lease_external_collection_job_v1", {
    in_lease_owner: input.lease_owner,
    in_lease_seconds: input.lease_seconds,
    in_global_concurrency_limit: input.caps.global_limit,
    in_concurrency_key_limit: input.caps.per_concurrency_key_limit
  });

  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) return null;
  return res.data[0]!;
}

export async function renewExternalCollectionJobLeaseV1(input: {
  client: LeaseClient;
  job_id: string;
  lease_owner: string;
  lease_seconds: number;
}): Promise<{ job_id: string; lease_expires_at: string } | null> {
  const res = await input.client.rpc<Array<{ job_id: string; lease_expires_at: string }>>("renew_external_collection_job_lease_v1", {
    in_job_id: input.job_id,
    in_lease_owner: input.lease_owner,
    in_lease_seconds: input.lease_seconds
  });

  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) return null;
  return res.data[0]!;
}

export async function releaseExternalCollectionJobLeaseV1(input: {
  client: LeaseClient;
  job_id: string;
  lease_owner: string;
  new_status: string;
}): Promise<{ job_id: string; status: string } | null> {
  const res = await input.client.rpc<Array<{ job_id: string; status: string }>>("release_external_collection_job_lease_v1", {
    in_job_id: input.job_id,
    in_lease_owner: input.lease_owner,
    in_new_status: input.new_status
  });

  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) return null;
  return res.data[0]!;
}
