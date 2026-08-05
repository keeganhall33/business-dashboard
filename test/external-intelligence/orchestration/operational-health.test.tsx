import test from "node:test";
import assert from "node:assert/strict";

import { evaluateOperationalEscalationV1 } from "@/lib/external-intelligence/orchestration/operational-health";

test("operational health: flags stale watchdog and repeated heartbeat failures", () => {
  const res = evaluateOperationalEscalationV1({
    now_iso: "2026-08-06T02:00:00.000Z",
    enabledJobs: [
      { job_name: "external-source-watchdog-v1", last_success_at: "2026-08-04T00:00:00.000Z" },
      { job_name: "milestone-horizon-scan-v1", last_success_at: "2026-08-05T12:00:00.000Z" }
    ],
    recentHeartbeatStatuses: ["failed", "failed", "failed", "succeeded"]
  });

  assert.equal(res.watchdogStale, true);
  assert.equal(res.milestoneScanStale, false);
  assert.equal(res.heartbeatConsecutiveFailed, 3);
});
