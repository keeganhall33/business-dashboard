import test from "node:test";
import assert from "node:assert/strict";

import { INTERNAL_ORCHESTRATION_JOBS_V1 } from "@/lib/external-intelligence/orchestration/internal-jobs";

test("b3 internal job registry: includes required handlers and remains disabled by default", () => {
  const names = new Set(INTERNAL_ORCHESTRATION_JOBS_V1.map((j) => j.job_name));
  for (const required of [
    "external-source-watchdog-v1",
    "milestone-horizon-scan-v1",
    "expired-lease-recovery-v1",
    "expired-milestone-alert-cleanup-v1"
  ]) {
    assert.ok(names.has(required as any));
  }

  for (const job of INTERNAL_ORCHESTRATION_JOBS_V1) {
    assert.equal(job.enabled, false);
    assert.ok(job.handler_identity.length > 0);
    assert.ok(job.concurrency_key.length > 0);
  }
});
