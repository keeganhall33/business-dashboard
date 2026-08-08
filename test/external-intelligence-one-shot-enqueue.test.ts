import { describe, expect, it } from "vitest";

import { heartbeat, type ScheduleRow } from "@/lib/external-intelligence/orchestration/heartbeat";

describe("external-intelligence one-shot enqueue semantics", () => {
  const baseSchedule: ScheduleRow = {
    schedule_id: "sports_business.boardroom:production",
    source_id: "sports_business.boardroom",
    source_config_version: "v1",
    registry_hash: "r".repeat(64),
    source_sets_hash: "s".repeat(64),
    eligibility_fingerprint: "e".repeat(64),
    schedule_policy_version: "p",
    cadence_type: "hourly",
    cadence_interval_seconds: 3600,
    enabled: true,
    environment: "production",
    next_run_at: null,
    last_evaluated_at: null
  };

  it("scheduler mode: enabled schedule with next_run_at=null enqueues 0", () => {
    const hb = heartbeat({
      now_iso: "2026-08-08T00:00:00.000Z",
      schedules: [baseSchedule],
      existing_jobs_by_logical_key: new Set(),
      is_schedule_eligible_now: () => ({ ok: true, reason: null }),
      maximum_jobs_to_enqueue: 1
    });

    expect(hb.queued_jobs.length).toBe(0);
  });

  it("one-shot mode can force due-ness by supplying next_run_at=now", () => {
    const forced: ScheduleRow = { ...baseSchedule, next_run_at: "2026-08-08T00:00:00.000Z" };
    const hb = heartbeat({
      now_iso: "2026-08-08T00:00:00.000Z",
      schedules: [forced],
      existing_jobs_by_logical_key: new Set(),
      is_schedule_eligible_now: () => ({ ok: true, reason: null }),
      maximum_jobs_to_enqueue: 1
    });

    expect(hb.queued_jobs.length).toBe(1);
    expect(hb.queued_jobs[0]?.schedule_id).toBe("sports_business.boardroom:production");
  });
});

