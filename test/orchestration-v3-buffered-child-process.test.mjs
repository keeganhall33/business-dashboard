import assert from "node:assert/strict";
import test from "node:test";

import {
  runBufferedChild
} from "../scripts/orchestration-v3/buffered-child-process.mjs";

test("buffered async child leaves event loop available for worker heartbeats", async () => {
  let heartbeatTicks = 0;

  const heartbeat = setInterval(() => {
    heartbeatTicks += 1;
  }, 25);

  try {
    const run = await runBufferedChild(
      process.execPath,
      [
        "-e",
        "setTimeout(() => { process.stdout.write('DONE'); }, 220)"
      ],
      {
        timeout: 2_000,
        maxBuffer: 1024 * 1024
      }
    );

    assert.equal(run.status, 0);
    assert.equal(run.error, null);
    assert.equal(run.stdout, "DONE");

    // A synchronous spawn would block this timer for the entire child run.
    assert.ok(
      heartbeatTicks >= 3,
      `expected heartbeat timer to advance during child execution, got ${heartbeatTicks}`
    );
  } finally {
    clearInterval(heartbeat);
  }
});

test("buffered async child preserves timeout evidence", async () => {
  const run = await runBufferedChild(
    process.execPath,
    ["-e", "setTimeout(() => {}, 5000)"],
    {
      timeout: 100,
      maxBuffer: 1024 * 1024
    }
  );

  assert.equal(run.error?.code, "ETIMEDOUT");
});

test("buffered async child fails closed on output overflow", async () => {
  const run = await runBufferedChild(
    process.execPath,
    ["-e", "process.stdout.write('x'.repeat(200000))"],
    {
      timeout: 2_000,
      maxBuffer: 1024
    }
  );

  assert.equal(run.error?.code, "ENOBUFS");
});
