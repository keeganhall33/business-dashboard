import "@/lib/server-only";

import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";
import type { InternalOrchestrationJobKey } from "@/lib/external-intelligence/orchestration/internal-jobs";

export type ManualHeartbeatInvocationV1 = {
  schema_version: "manual_heartbeat_invocation_v1";

  invocation_id: string;
  environment: "production" | "staging" | "local";
  approved_internal_job_names: InternalOrchestrationJobKey[];

  dry_run: boolean;
  requested_at: string;
  requested_by: string;
  expires_at: string;

  configuration_version: string;
  content_hash: string;
};

export function computeManualInvocationHash(input: Omit<ManualHeartbeatInvocationV1, "content_hash">): string {
  return sha256CanonicalJson({
    v: "manual-heartbeat-invocation/v1",
    invocation_id: input.invocation_id,
    environment: input.environment,
    approved_internal_job_names: input.approved_internal_job_names.slice().sort(),
    dry_run: input.dry_run,
    requested_at: input.requested_at,
    requested_by: input.requested_by,
    expires_at: input.expires_at,
    configuration_version: input.configuration_version
  });
}

export function validateManualHeartbeatInvocationV1(input: unknown): ManualHeartbeatInvocationV1 {
  const x = input as Partial<ManualHeartbeatInvocationV1>;
  if (!x || x.schema_version !== "manual_heartbeat_invocation_v1") throw new Error("invalid_invocation");
  if (!x.invocation_id || x.invocation_id.length < 8) throw new Error("invalid_invocation");
  if (!x.requested_by) throw new Error("invalid_invocation");
  if (!x.requested_at || !x.expires_at) throw new Error("invalid_invocation");
  if (!x.configuration_version) throw new Error("invalid_invocation");
  if (!Array.isArray(x.approved_internal_job_names) || x.approved_internal_job_names.length === 0) {
    throw new Error("invalid_invocation");
  }

  const env = x.environment;
  if (env !== "production" && env !== "staging" && env !== "local") throw new Error("invalid_invocation");

  const computed = computeManualInvocationHash({
    schema_version: "manual_heartbeat_invocation_v1",
    invocation_id: x.invocation_id,
    environment: env,
    approved_internal_job_names: x.approved_internal_job_names as InternalOrchestrationJobKey[],
    dry_run: Boolean(x.dry_run),
    requested_at: x.requested_at,
    requested_by: x.requested_by,
    expires_at: x.expires_at,
    configuration_version: x.configuration_version
  });

  if (x.content_hash !== computed) throw new Error("invocation_hash_mismatch");

  if (Date.parse(x.expires_at) <= Date.parse(x.requested_at)) throw new Error("invocation_expired");

  return {
    schema_version: "manual_heartbeat_invocation_v1",
    invocation_id: x.invocation_id,
    environment: env,
    approved_internal_job_names: x.approved_internal_job_names as InternalOrchestrationJobKey[],
    dry_run: Boolean(x.dry_run),
    requested_at: x.requested_at,
    requested_by: x.requested_by,
    expires_at: x.expires_at,
    configuration_version: x.configuration_version,
    content_hash: computed
  };
}
