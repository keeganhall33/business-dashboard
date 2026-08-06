import test from "node:test";
import assert from "node:assert/strict";

import { assertSchedulerAuth } from "@/lib/scheduler/auth";

function makeRequest(headers: Record<string, string>) {
  return new Request("https://example.com/api/scheduler/tick", {
    method: "POST",
    headers
  });
}

test("scheduler auth: Authorization Bearer <SCHEDULER_SECRET> is accepted", async () => {
  process.env.SCHEDULER_SECRET = "test-secret";
  const req = makeRequest({ Authorization: "Bearer test-secret" });
  await assert.doesNotReject(() => assertSchedulerAuth(req));
});

test("scheduler auth: missing secret fails closed", async () => {
  process.env.SCHEDULER_SECRET = "test-secret";
  const req = makeRequest({});
  await assert.rejects(() => assertSchedulerAuth(req), /Unauthorized/);
});

test("scheduler auth: wrong Bearer secret fails closed", async () => {
  process.env.SCHEDULER_SECRET = "test-secret";
  const req = makeRequest({ Authorization: "Bearer wrong" });
  await assert.rejects(() => assertSchedulerAuth(req), /Unauthorized/);
});
