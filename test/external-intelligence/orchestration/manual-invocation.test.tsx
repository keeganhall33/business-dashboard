import test from "node:test";
import assert from "node:assert/strict";

import {
  computeManualInvocationHash,
  validateManualHeartbeatInvocationV1
} from "@/lib/external-intelligence/orchestration/manual-invocation";

test("manual invocation: hash is deterministic and mismatch fails closed", () => {
  const base = {
    schema_version: "manual_heartbeat_invocation_v1" as const,
    invocation_id: "invocation_00000001",
    environment: "production" as const,
    approved_internal_job_names: ["external-source-watchdog-v1", "milestone-horizon-scan-v1"] as const,
    dry_run: true,
    requested_at: "2099-01-01T00:00:00.000Z",
    requested_by: "owner",
    expires_at: "2099-01-01T01:00:00.000Z",
    configuration_version: "v1"
  };

  const hash = computeManualInvocationHash(base);
  const ok = validateManualHeartbeatInvocationV1({ ...base, content_hash: hash });
  assert.equal(ok.content_hash, hash);

  assert.throws(() => validateManualHeartbeatInvocationV1({ ...base, content_hash: "deadbeef" }), /invocation_hash_mismatch/);
});

test("manual invocation: rejects unknown/internal-external names and rejects expired", () => {
  const base = {
    schema_version: "manual_heartbeat_invocation_v1" as const,
    invocation_id: "invocation_00000002",
    environment: "production" as const,
    approved_internal_job_names: ["external-source-watchdog-v1"] as const,
    dry_run: true,
    requested_at: "2026-08-05T00:00:00.000Z",
    requested_by: "owner",
    expires_at: "2000-01-01T00:00:00.000Z",
    configuration_version: "v1"
  };

  const hash = computeManualInvocationHash(base);
  assert.throws(() => validateManualHeartbeatInvocationV1({ ...base, content_hash: hash }), /invocation_expired/);

  const badName = {
    ...base,
    expires_at: "2099-01-01T00:00:00.000Z",
    approved_internal_job_names: ["fred-collector-v1"]
  };
  const badHash = computeManualInvocationHash(badName as unknown as Parameters<typeof computeManualInvocationHash>[0]);
  assert.throws(
    () =>
      validateManualHeartbeatInvocationV1({
        ...(badName as unknown as Record<string, unknown>),
        content_hash: badHash
      }),
    /invalid_invocation/
  );
});
