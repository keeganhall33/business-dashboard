import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { assertSchedulerAuth } from "@/lib/scheduler/auth";

const ROOT = process.cwd();

function makeRequest(headers: Record<string, string>) {
  return new Request("https://example.com/api/scheduler/tick", {
    method: "POST",
    headers
  });
}

test("vercel.json defines exactly one cron for /api/scheduler/tick every 5 minutes", () => {
  const vercelJsonPath = path.join(ROOT, "vercel.json");
  const raw = fs.readFileSync(vercelJsonPath, "utf8");
  const parsed = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> };

  assert.ok(Array.isArray(parsed.crons));
  assert.equal(parsed.crons!.length, 1);
  assert.deepEqual(parsed.crons![0], { path: "/api/scheduler/tick", schedule: "*/5 * * * *" });
});

test("scheduler auth: Authorization Bearer <SCHEDULER_SECRET> is accepted (Vercel Cron compatible)", async () => {
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
