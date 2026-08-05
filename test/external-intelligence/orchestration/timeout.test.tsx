import test from "node:test";
import assert from "node:assert/strict";

import { remainingLeaseMs, runWithTimeout } from "@/lib/external-intelligence/orchestration/timeout";

test("timeout: runWithTimeout returns handler_timeout and does not treat as success", async () => {
  const res = await runWithTimeout({
    name: "x",
    timeout_ms: 10,
    fn: async () => new Promise(() => {})
  });

  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "handler_timeout");
});

test("timeout: remainingLeaseMs computes delta", () => {
  const ms = remainingLeaseMs({
    now_iso: "2026-08-05T00:00:00.000Z",
    expires_at_iso: "2026-08-05T00:00:10.000Z"
  });
  assert.equal(ms, 10_000);
});
