import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { assertSchedulerAuth } from "@/lib/scheduler/auth";

function makeRequest(headers: Record<string, string>) {
  return new Request("https://example.com/api/scheduler/tick", {
    method: "POST",
    headers
  });
}

test("governed tick trigger workflow exists and runs every five minutes", () => {
  const workflowPath = path.resolve(process.cwd(), ".github/workflows/scheduler-tick.yml");
  const raw = fs.readFileSync(workflowPath, "utf8");

  // Keep parsing lightweight: assert the exact cron expression and the correct route fragment.
  assert.match(raw, /name:\s*Scheduler Tick Trigger/);
  assert.match(raw, /cron:\s*"\*\/5 \* \* \* \*"/);
  assert.match(raw, /\/api\/scheduler\/tick/);
});

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
