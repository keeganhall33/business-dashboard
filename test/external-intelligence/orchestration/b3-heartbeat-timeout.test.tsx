import test from "node:test";
import assert from "node:assert/strict";

import type { InternalOrchestrationJobKey } from "@/lib/external-intelligence/orchestration/internal-jobs";
import type { InternalOrchestrationLease } from "@/lib/external-intelligence/orchestration/lock";
import type { InternalOrchestrationJobRow, InternalOrchestrationJobsRepository } from "@/lib/external-intelligence/orchestration/internal-jobs.repository";
import { runExternalIntelligenceHeartbeatV1WithDeps } from "@/lib/scheduler/externalIntelligenceHeartbeat";
import { runWithTimeout } from "@/lib/external-intelligence/orchestration/timeout";

type EnabledJobRow = {
  job_name: string;
  cadence_type: string;
  cadence_minutes: number | null;
  next_run_at: string | null;
  timeout_seconds: number;
  maximum_attempts: number;
};

function makeJob(input: Partial<EnabledJobRow> & { job_name: InternalOrchestrationJobKey }): EnabledJobRow {
  return {
    job_name: input.job_name,
    cadence_type: input.cadence_type ?? "daily",
    cadence_minutes: input.cadence_minutes ?? null,
    next_run_at: input.next_run_at ?? "2026-08-05T00:00:00.000Z",
    timeout_seconds: input.timeout_seconds ?? 60,
    maximum_attempts: input.maximum_attempts ?? 3
  };
}

class FakeJobsRepo {
  enabled: EnabledJobRow[] = [];
  updates: Array<{ job_name: string; succeeded: boolean; next_run_at: string }> = [];

  async upsertDefinitions() {}

  async listEnabledJobsForEnv() {
    return this.enabled as unknown as InternalOrchestrationJobRow[];
  }

  async updateAfterRun(input: { job_name: InternalOrchestrationJobKey; next_run_at: string; now_iso: string; succeeded: boolean }) {
    this.updates.push({ job_name: input.job_name, succeeded: input.succeeded, next_run_at: input.next_run_at });
  }
}

test("b3 heartbeat: timeout is loaded from governed job configuration", async () => {
  const repo = new FakeJobsRepo();
  repo.enabled = [makeJob({ job_name: "external-source-watchdog-v1", timeout_seconds: 7 })];

  let seenTimeoutMs: number | null = null;

  const res = await runExternalIntelligenceHeartbeatV1WithDeps({
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    jobsRepo: () => repo as unknown as InternalOrchestrationJobsRepository,
    acquireLock: async () => ({ acquired: true, lease_token: "t", expires_at: null } satisfies InternalOrchestrationLease),
    renewLock: async () => ({ renewed: true, expires_at: "2026-08-05T00:05:00.000Z" }),
    releaseLock: async () => ({ released: true }),
    evaluateOperationalHealth: async () => {},
    alertOperationalFailure: async () => ({ created: false }),
    runWithTimeout: async (input) => {
      seenTimeoutMs = input.timeout_ms;
      return { ok: true, value: "ok" };
    },
    handlers: () => ({
      "external-source-watchdog-v1": async () => "ok"
    }) as unknown as Record<InternalOrchestrationJobKey, (signal: AbortSignal) => Promise<unknown>>
  });

  assert.equal(seenTimeoutMs, 7000);
  assert.equal(res.status, "succeeded");
});

test("b3 heartbeat: handler exceeding timeout yields handler_timeout; later handlers do not run; release attempted", async () => {
  const repo = new FakeJobsRepo();
  repo.enabled = [
    makeJob({ job_name: "external-source-watchdog-v1", timeout_seconds: 1 }),
    makeJob({ job_name: "milestone-horizon-scan-v1", timeout_seconds: 1 })
  ];

  let ranSecond = false;
  let released = 0;
  let sawAbort = false;

  const res = await runExternalIntelligenceHeartbeatV1WithDeps({
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    jobsRepo: () => repo as unknown as InternalOrchestrationJobsRepository,
    acquireLock: async () => ({ acquired: true, lease_token: "t", expires_at: null } satisfies InternalOrchestrationLease),
    renewLock: async () => ({ renewed: true, expires_at: "2026-08-05T00:05:00.000Z" }),
    releaseLock: async () => {
      released += 1;
      return { released: true };
    },
    evaluateOperationalHealth: async () => {},
    alertOperationalFailure: async () => ({ created: false }),
    // Use real timeout machinery but force a tiny timeout to keep the test fast.
    runWithTimeout: (input) => runWithTimeout({ ...input, timeout_ms: 5 }),
    handlers: () => ({
      "external-source-watchdog-v1": async (signal: AbortSignal) => {
        signal.addEventListener(
          "abort",
          () => {
            sawAbort = true;
          },
          { once: true }
        );
        // Never resolve; allow timeout to win.
        await new Promise(() => {});
      },
      "milestone-horizon-scan-v1": async () => {
        ranSecond = true;
        return "ok";
      }
    }) as unknown as Record<InternalOrchestrationJobKey, (signal: AbortSignal) => Promise<unknown>>
  });

  assert.equal(res.status, "succeeded");
  assert.equal(ranSecond, false);
  assert.equal(sawAbort, true);
  assert.equal(released, 1);

  const first = (res.results as Record<string, unknown>)["external-source-watchdog-v1"] as Record<string, unknown>;
  assert.equal(first.status, "failed");
  assert.equal(first.error_code, "handler_timeout");

  assert.equal(repo.updates.length, 1);
  assert.equal(repo.updates[0]?.job_name, "external-source-watchdog-v1");
  assert.equal(repo.updates[0]?.succeeded, false);
});

test("b3 heartbeat: renew occurs before each handler; renewal failure halts execution and still releases", async () => {
  const repo = new FakeJobsRepo();
  repo.enabled = [
    makeJob({ job_name: "external-source-watchdog-v1", timeout_seconds: 1 }),
    makeJob({ job_name: "milestone-horizon-scan-v1", timeout_seconds: 1 })
  ];

  let renewCalls = 0;
  let released = 0;
  let ranAny = 0;

  const res = await runExternalIntelligenceHeartbeatV1WithDeps({
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    jobsRepo: () => repo as unknown as InternalOrchestrationJobsRepository,
    acquireLock: async () => ({ acquired: true, lease_token: "t", expires_at: null } satisfies InternalOrchestrationLease),
    renewLock: async () => {
      renewCalls += 1;
      // First renewal (pre-work) succeeds; second (before first handler) fails.
      if (renewCalls === 1) return { renewed: true, expires_at: "2026-08-05T00:05:00.000Z" };
      return { renewed: false, expires_at: null };
    },
    releaseLock: async () => {
      released += 1;
      return { released: true };
    },
    evaluateOperationalHealth: async () => {},
    alertOperationalFailure: async () => ({ created: false }),
    runWithTimeout: async () => ({ ok: true, value: "ok" }),
    handlers: () => ({
      "external-source-watchdog-v1": async () => {
        ranAny += 1;
        return "ok";
      },
      "milestone-horizon-scan-v1": async () => {
        ranAny += 1;
        return "ok";
      }
    }) as unknown as Record<InternalOrchestrationJobKey, (signal: AbortSignal) => Promise<unknown>>
  });

  assert.deepEqual(res, { status: "blocked", reason: "lock_renewal_failed" });
  assert.equal(ranAny, 0);
  assert.equal(released, 1);
});

test("b3 heartbeat: lease safety fails closed (insufficient remaining lease; timeout exceeds lease)", async () => {
  const repo = new FakeJobsRepo();

  // Case 1: insufficient remaining lease prevents handler start.
  repo.enabled = [makeJob({ job_name: "external-source-watchdog-v1", timeout_seconds: 60 })];

  let ran = 0;
  const res1 = await runExternalIntelligenceHeartbeatV1WithDeps({
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    jobsRepo: () => repo as unknown as InternalOrchestrationJobsRepository,
    acquireLock: async () => ({ acquired: true, lease_token: "t", expires_at: null } satisfies InternalOrchestrationLease),
    renewLock: async () => ({ renewed: true, expires_at: "2026-08-05T00:00:50.000Z" }),
    releaseLock: async () => ({ released: true }),
    evaluateOperationalHealth: async () => {},
    alertOperationalFailure: async () => ({ created: false }),
    runWithTimeout: async () => ({ ok: true, value: "ok" }),
    handlers: () => ({
      "external-source-watchdog-v1": async () => {
        ran += 1;
        return "ok";
      }
    }) as unknown as Record<InternalOrchestrationJobKey, (signal: AbortSignal) => Promise<unknown>>
  });

  const r1 = (res1.results as Record<string, unknown>)["external-source-watchdog-v1"] as Record<string, unknown>;
  assert.equal(r1.status, "blocked");
  assert.equal(r1.reason, "insufficient_lease_time");
  assert.equal(ran, 0);

  // Case 2: handler timeout larger than permitted lease fails closed.
  const repo2 = new FakeJobsRepo();
  repo2.enabled = [makeJob({ job_name: "external-source-watchdog-v1", timeout_seconds: 281 })];

  const res2 = await runExternalIntelligenceHeartbeatV1WithDeps({
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    jobsRepo: () => repo2 as unknown as InternalOrchestrationJobsRepository,
    acquireLock: async () => ({ acquired: true, lease_token: "t", expires_at: null } satisfies InternalOrchestrationLease),
    renewLock: async () => ({ renewed: true, expires_at: "2026-08-05T00:05:00.000Z" }),
    releaseLock: async () => ({ released: true }),
    evaluateOperationalHealth: async () => {},
    alertOperationalFailure: async () => ({ created: false }),
    runWithTimeout: async () => ({ ok: true, value: "ok" }),
    handlers: () => ({
      "external-source-watchdog-v1": async () => "ok"
    }) as unknown as Record<InternalOrchestrationJobKey, (signal: AbortSignal) => Promise<unknown>>
  });

  const first = (res2.results as Record<string, unknown>)["external-source-watchdog-v1"] as Record<string, unknown>;
  assert.equal(first.status, "failed");
  assert.equal(first.error_code, "handler_timeout_exceeds_lease");
});

test("b3 heartbeat: duplicate heartbeat contention is a safe no-op", async () => {
  const repo = new FakeJobsRepo();
  let released = 0;

  const res = await runExternalIntelligenceHeartbeatV1WithDeps({
    withJobRun: async ({ fn }) => fn(),
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    jobsRepo: () => repo as unknown as InternalOrchestrationJobsRepository,
    acquireLock: async () => ({ acquired: false, lease_token: null, expires_at: null } satisfies InternalOrchestrationLease),
    renewLock: async () => ({ renewed: false, expires_at: null }),
    releaseLock: async () => {
      released += 1;
      return { released: true };
    },
    evaluateOperationalHealth: async () => {},
    alertOperationalFailure: async () => ({ created: false }),
    runWithTimeout: async () => ({ ok: true, value: "ok" }),
    handlers: () => ({
      "external-source-watchdog-v1": async () => "ok"
    }) as unknown as Record<InternalOrchestrationJobKey, (signal: AbortSignal) => Promise<unknown>>
  });

  assert.deepEqual(res, { status: "blocked", reason: "lock_not_acquired" });
  assert.equal(released, 0);
});
