import test from "node:test";
import assert from "node:assert/strict";

import { OrchestrationLockError } from "@/lib/external-intelligence/orchestration/lock";
import { runExternalIntelligenceHeartbeatV1WithDeps } from "@/lib/scheduler/externalIntelligenceHeartbeat";

type HeartbeatOverrides = NonNullable<Parameters<typeof runExternalIntelligenceHeartbeatV1WithDeps>[0]>;

test("b3 heartbeat: acquire RPC error is not collapsed into blocked lock_not_acquired", async () => {
  const overrides: HeartbeatOverrides = {
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    acquireLock: async () => {
      throw new OrchestrationLockError("lock_rpc_error", "rpc_error: status=500 message=boom");
    },
    // Unused for this test path.
    renewLock: async () => ({ renewed: false, expires_at: null }),
    releaseLock: async () => ({ released: true }),
    jobsRepo: () =>
      ({
        upsertDefinitions: async () => {},
        listEnabledJobsForEnv: async () => [],
        updateAfterRun: async () => {}
      }) as unknown as ReturnType<HeartbeatOverrides["jobsRepo"]>,
    alertOperationalFailure: async () => ({ created: false } as unknown as { created: boolean }),
    evaluateOperationalHealth: async () => {},
    runWithTimeout: async () => ({ ok: true, value: null } as unknown as { ok: true; value: unknown }),
    handlers: () => ({}) as unknown as Record<string, (signal: AbortSignal) => Promise<unknown>>
  };

  await assert.rejects(
    () =>
      runExternalIntelligenceHeartbeatV1WithDeps(overrides),
    /rpc_error/
  );
});

test("b3 heartbeat: acquired=false returns blocked lock_not_acquired", async () => {
  const overrides: HeartbeatOverrides = {
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    acquireLock: async () => ({ acquired: false, lease_token: null, expires_at: null }),
    renewLock: async () => ({ renewed: false, expires_at: null }),
    releaseLock: async () => ({ released: true }),
    jobsRepo: () =>
      ({
        upsertDefinitions: async () => {},
        listEnabledJobsForEnv: async () => [],
        updateAfterRun: async () => {}
      }) as unknown as ReturnType<HeartbeatOverrides["jobsRepo"]>,
    alertOperationalFailure: async () => ({ created: false } as unknown as { created: boolean }),
    evaluateOperationalHealth: async () => {},
    runWithTimeout: async () => ({ ok: true, value: null } as unknown as { ok: true; value: unknown }),
    handlers: () => ({}) as unknown as Record<string, (signal: AbortSignal) => Promise<unknown>>
  };

  const out = await runExternalIntelligenceHeartbeatV1WithDeps(overrides);

  assert.deepEqual(out, { status: "blocked", reason: "lock_not_acquired" });
});
