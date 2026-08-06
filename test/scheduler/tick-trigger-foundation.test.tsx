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
  const workflowsDir = path.resolve(process.cwd(), ".github/workflows");
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .filter((name) => name.includes("scheduler") && name.includes("tick"));

  // Exactly one scheduled tick workflow should exist.
  assert.deepEqual(workflowFiles, ["production-scheduler-tick.yml"]);

  const workflowPath = path.join(workflowsDir, "production-scheduler-tick.yml");
  const raw = fs.readFileSync(workflowPath, "utf8");

  // Must include manual dispatch + five-minute schedule, and target the tick route.
  assert.match(raw, /name:\s*Production Scheduler Tick/);
  assert.match(raw, /workflow_dispatch:\s*\{\}/);
  assert.match(raw, /cron:\s*"\*\/5 \* \* \* \*"/);
  assert.match(raw, /\/api\/scheduler\/tick/);

  // Must NOT include push/pull_request triggers.
  assert.ok(!/\n\s*push:\s*/.test(raw));
  assert.ok(!/\n\s*pull_request:\s*/.test(raw));
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
