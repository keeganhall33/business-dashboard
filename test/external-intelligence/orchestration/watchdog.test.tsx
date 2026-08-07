import test from "node:test";
import assert from "node:assert/strict";

import { evaluateDailyWatchdogV1 } from "@/lib/external-intelligence/orchestration/watchdog";

test("watchdog: evaluates all sources deterministically and does not imply collection", () => {
  const out = evaluateDailyWatchdogV1({
    now_iso: "2026-08-05T00:00:00.000Z",
    schedule_enabled_by_source_id: {},
    allowed_now_by_source_id: {},
    adapter_operational_by_source_id: {}
  });

  assert.equal(out.length, 25);
  // In B2, schedules are not configured/enabled by default.
  assert.ok(out.every((r) => r.health_state === "disabled" || r.health_state === "blocked"));

  const out2 = evaluateDailyWatchdogV1({
    now_iso: "2026-08-05T00:00:00.000Z",
    schedule_enabled_by_source_id: {},
    allowed_now_by_source_id: {},
    adapter_operational_by_source_id: {}
  });
  assert.deepEqual(out, out2);
});
