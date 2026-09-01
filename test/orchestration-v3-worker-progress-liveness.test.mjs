import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { inspectLease, LEASE_TTL_CONTRACT } from "../scripts/orchestration-v3/lease-reconciliation.mjs";
import {
  DEFAULT_PROGRESS_TIMEOUT_MS,
  LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS,
  resolveProgressTimeout,
  runBufferedChild
} from "../scripts/orchestration-v3/buffered-child-process.mjs";

function processRows() {
  const output = execFileSync("ps", ["-axo", "pid=,ppid=,pgid=,command="], {
    encoding: "utf8",
    timeout: 2_000
  });
  return output.split("\n").map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) return null;
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      command: match[4]
    };
  }).filter(Boolean);
}

async function waitFor(check, { timeoutMs = 3_000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

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

test("parent SIGTERM reaps the full detached child group before the parent exits", async () => {
  if (process.platform === "win32") return;

  const moduleUrl = new URL("../scripts/orchestration-v3/buffered-child-process.mjs", import.meta.url).href;
  const helperSource = [
    `import { runBufferedChild } from ${JSON.stringify(moduleUrl)};`,
    "await runBufferedChild('/bin/sh', ['-c', 'sleep 30 & wait'], { timeout: 30000, progressTimeout: 30000 });"
  ].join("\n");

  const wrapper = spawn(process.execPath, ["--input-type=module", "--eval", helperSource], {
    cwd: process.cwd(),
    stdio: "ignore"
  });

  try {
    const childRow = await waitFor(() =>
      processRows().find((row) => row.ppid === wrapper.pid && row.command.includes("/bin/sh")) ?? null
    );
    assert.ok(childRow, "wrapper must spawn its detached child before failure injection");
    assert.equal(childRow.pgid, childRow.pid, "buffered child must own a distinct process group");

    const nestedRow = await waitFor(() =>
      processRows().find((row) => row.ppid === childRow.pid && /sleep\s+30/.test(row.command)) ?? null
    );
    assert.ok(nestedRow, "fixture must include a nested descendant in the owned child group");
    assert.equal(nestedRow.pgid, childRow.pgid, "nested descendant must remain in the owned process group");

    const exitPromise = once(wrapper, "exit");
    process.kill(wrapper.pid, "SIGTERM");
    const [code, signal] = await exitPromise;

    assert.equal(signal, null, "signal-aware cleanup converts parent SIGTERM into a bounded post-cleanup exit code");
    assert.equal(code, 143, "SIGTERM cleanup exit code must preserve signal semantics");

    const groupGone = await waitFor(() => {
      try {
        process.kill(-childRow.pgid, 0);
        return false;
      } catch (error) {
        return error?.code === "ESRCH";
      }
    });
    assert.equal(groupGone, true, "direct parent SIGTERM must leave zero owned descendants or reparented survivors");
  } finally {
    try { process.kill(wrapper.pid, "SIGKILL"); } catch {}
  }
});
