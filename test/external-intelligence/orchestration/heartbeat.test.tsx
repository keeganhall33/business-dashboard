import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceScheduleNextRun,
  heartbeat,
  type ScheduleRow
} from "@/lib/external-intelligence/orchestration/heartbeat";

test("heartbeat: due enabled eligible schedule enqueues exactly one logical job (idempotent)", () => {
  const now = "2026-08-05T00:00:00.000Z";

  const schedules: ScheduleRow[] = [
    {
      schedule_id: "sch1",
      source_id: "economics.fred",
      source_config_version: "v1.0.0",
      registry_hash: "a".repeat(64),
      source_sets_hash: "b".repeat(64),
      eligibility_fingerprint: "c".repeat(64),
      schedule_policy_version: "v1.0.0",
      cadence_type: "daily",
      cadence_interval_seconds: 86400,
      enabled: true,
      environment: "production",
      next_run_at: "2026-08-04T00:00:00.000Z",
      last_evaluated_at: null
    }
  ];

  const res1 = heartbeat({
    now_iso: now,
    schedules,
    existing_jobs_by_logical_key: new Set(),
    is_schedule_eligible_now: () => ({ ok: true, reason: null }),
    maximum_jobs_to_enqueue: 10
  });

  assert.equal(res1.queued_jobs.length, 1);

  const logicalKey = `sch1|2026-08-04T00:00:00.000Z|${res1.queued_jobs[0]!.input_fingerprint}`;

  const res2 = heartbeat({
    now_iso: now,
    schedules,
    existing_jobs_by_logical_key: new Set([logicalKey]),
    is_schedule_eligible_now: () => ({ ok: true, reason: null }),
    maximum_jobs_to_enqueue: 10
  });

  assert.equal(res2.queued_jobs.length, 0);
});

test("heartbeat: ineligible schedule does not enqueue and records blocked reason", () => {
  const now = "2026-08-05T00:00:00.000Z";

  const schedules: ScheduleRow[] = [
    {
      schedule_id: "sch1",
      source_id: "economics.fred",
      source_config_version: "v1.0.0",
      registry_hash: "a".repeat(64),
      source_sets_hash: "b".repeat(64),
      eligibility_fingerprint: "c".repeat(64),
      schedule_policy_version: "v1.0.0",
      cadence_type: "daily",
      cadence_interval_seconds: 86400,
      enabled: true,
      environment: "production",
      next_run_at: "2026-08-04T00:00:00.000Z",
      last_evaluated_at: null
    }
  ];

  const res = heartbeat({
    now_iso: now,
    schedules,
    existing_jobs_by_logical_key: new Set(),
    is_schedule_eligible_now: () => ({ ok: false, reason: "eligibility_not_allowed_now" }),
    maximum_jobs_to_enqueue: 10
  });

  assert.equal(res.queued_jobs.length, 0);
  assert.deepEqual(res.blocked_schedules, [{ schedule_id: "sch1", reason: "eligibility_not_allowed_now" }]);
});

test("advanceScheduleNextRun: deterministic", () => {
  const s: ScheduleRow = {
    schedule_id: "sch1",
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    registry_hash: "a".repeat(64),
    source_sets_hash: "b".repeat(64),
    eligibility_fingerprint: "c".repeat(64),
    schedule_policy_version: "v1.0.0",
    cadence_type: "daily",
    cadence_interval_seconds: 86400,
    enabled: true,
    environment: "production",
    next_run_at: "2026-08-04T00:00:00.000Z",
    last_evaluated_at: null
  };

  const next = advanceScheduleNextRun({ now_iso: "2026-08-05T00:00:00.000Z", schedule: s });
  assert.equal(next, "2026-08-05T00:00:00.000Z");
});
