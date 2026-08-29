import test from "node:test";
import assert from "node:assert/strict";
import { inspectLease, LEASE_TTL_CONTRACT } from "../scripts/orchestration-v3/lease-reconciliation.mjs";
import {
  DEFAULT_PROGRESS_TIMEOUT_MS,
  LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS,
  resolveProgressTimeout,
  runBufferedChild
} from "../scripts/orchestration-v3/buffered-child-process.mjs";

test("fresh timer heartbeat does not imply fresh execution progress", () => {
  const now = new Date("2026-08-29T15:00:00.000Z");
  const lease = {
    sessionId: "test",
    workerId: "local-e",
    issueNumber: 861,
    pid: 12345,
    startedAt: "2026-08-29T14:00:00.000Z",
    heartbeatAt: "2026-08-29T14:59:45.000Z",
    lastProgressAt: new Date(now.getTime() - LEASE_TTL_CONTRACT.progressFreshMs - 1_000).toISOString(),
    progressSequence: 3,
    progressPhase: "CHILD_STARTED",
    worktree: null
  };

  const inspection = inspectLease("local-e", {
    now,
    lease,
    pidAlive: true,
    processCommandText: "node scripts/orchestration-v3/worker.mjs --issue 861 --worker local-e"
  });

  assert.equal(inspection.heartbeat_fresh, true);
  assert.equal(inspection.progress_fresh, false);
  assert.ok(inspection.evidence.includes("PROGRESS_STALE"));
  assert.equal(inspection.reconciliation_decision, "LIVE_LEASE_PRESERVED", "ownership lease remains preserved even though forward progress is stale");
});

test("local OpenClaw receives a larger bounded no-output allowance than generic children", () => {
  assert.equal(resolveProgressTimeout("/bin/sh"), DEFAULT_PROGRESS_TIMEOUT_MS);
  assert.equal(resolveProgressTimeout("/opt/homebrew/bin/openclaw"), LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS);
  assert.ok(LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS > DEFAULT_PROGRESS_TIMEOUT_MS);
  assert.ok(LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS < 950_000, "OpenClaw progress allowance must remain below the hard worker timeout");
  assert.equal(resolveProgressTimeout("/opt/homebrew/bin/openclaw", 150), 150, "explicit test/diagnostic bounds must override the OpenClaw default");
});

test("buffered child detects bounded progress stall and terminates its owned process group", async () => {
  if (process.platform === "win32") return;

  const result = await runBufferedChild("/bin/sh", ["-c", "sleep 30 & wait"], {
    timeout: 10_000,
    progressTimeout: 150,
    maxBuffer: 1024 * 1024
  });

  assert.equal(result.error?.code, "EPROGRESSSTALL");
  assert.ok(Number.isInteger(result.childPid) && result.childPid > 0);

  await new Promise((resolve) => setTimeout(resolve, 100));
  let groupAlive = true;
  try {
    process.kill(-result.childProcessGroupId, 0);
  } catch (error) {
    if (error?.code === "ESRCH") groupAlive = false;
  }
  assert.equal(groupAlive, false, "owned child process group must have no survivors after stall termination");
});
