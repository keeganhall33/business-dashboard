import { deepFreeze } from "@/lib/external-intelligence/config/freeze";

import { createIdempotencyKey, createInputFingerprint } from "@/lib/external-intelligence/orchestration/idempotency";
import { computeNextRunAt, isDue } from "@/lib/external-intelligence/orchestration/due-schedules";

export type ScheduleRow = {
  schedule_id: string;
  source_id: string;
  source_config_version: string;
  registry_hash: string;
  source_sets_hash: string;
  eligibility_fingerprint: string;
  schedule_policy_version: string;
  cadence_type: "hourly" | "every_n_hours" | "daily" | "weekly" | "monthly" | "manual" | "disabled";
  cadence_interval_seconds: number;
  enabled: boolean;
  environment: "production" | "staging" | "local";
  next_run_at: string | null;
  last_evaluated_at: string | null;
};

export type JobRow = {
  job_id: string;
  schedule_id: string;
  source_id: string;
  collection_plan_id: string;
  planned_for: string;
  run_after: string;
  status: "queued";
  attempt_count: number;
  maximum_attempts: number;
  input_fingerprint: string;
  idempotency_key: string;
};

export type HeartbeatResult = {
  evaluated_at: string;
  queued_jobs: JobRow[];
  blocked_schedules: Array<{ schedule_id: string; reason: string }>;
};

/**
 * B2 heartbeat:
 * - identifies due schedules
 * - enqueues idempotent jobs
 * - does NOT execute collectors
 */
export function heartbeat(input: {
  now_iso: string;
  schedules: ScheduleRow[];
  // Existing logical jobs to prevent duplicates.
  existing_jobs_by_logical_key: Set<string>;

  // External governance facts (provided; no network).
  is_schedule_eligible_now: (schedule: ScheduleRow) => { ok: boolean; reason: string | null };

  maximum_jobs_to_enqueue: number;
}): HeartbeatResult {
  const now = new Date(input.now_iso);

  const queued_jobs: JobRow[] = [];
  const blocked_schedules: HeartbeatResult["blocked_schedules"] = [];

  const schedules = input.schedules.slice().sort((a, b) => a.schedule_id.localeCompare(b.schedule_id));

  for (const s of schedules) {
    if (!s.enabled) continue;

    const eligible = input.is_schedule_eligible_now(s);
    if (!eligible.ok) {
      blocked_schedules.push({ schedule_id: s.schedule_id, reason: eligible.reason ?? "ineligible" });
      continue;
    }

    const nextRun = s.next_run_at ? new Date(s.next_run_at) : null;
    if (!isDue({ now, next_run_at: nextRun })) continue;

    const input_fingerprint = createInputFingerprint({
      source_id: s.source_id,
      source_config_version: s.source_config_version,
      registry_hash: s.registry_hash,
      source_sets_hash: s.source_sets_hash,
      eligibility_fingerprint: s.eligibility_fingerprint,
      policy_version: s.schedule_policy_version
    });

    const planned_for = nextRun?.toISOString() ?? now.toISOString();

    const logicalKey = `${s.schedule_id}|${planned_for}|${input_fingerprint}`;
    if (input.existing_jobs_by_logical_key.has(logicalKey)) continue;

    const idempotency_key = createIdempotencyKey({
      schedule_id: s.schedule_id,
      planned_for_iso: planned_for,
      input_fingerprint
    });

    queued_jobs.push({
      job_id: idempotency_key,
      schedule_id: s.schedule_id,
      source_id: s.source_id,
      collection_plan_id: "collection_plan_placeholder",
      planned_for,
      run_after: now.toISOString(),
      status: "queued",
      attempt_count: 0,
      maximum_attempts: 0,
      input_fingerprint,
      idempotency_key
    });

    if (queued_jobs.length >= input.maximum_jobs_to_enqueue) break;
  }

  return deepFreeze({ evaluated_at: now.toISOString(), queued_jobs: queued_jobs.slice(), blocked_schedules });
}

export function advanceScheduleNextRun(input: { now_iso: string; schedule: ScheduleRow }): string | null {
  const now = new Date(input.now_iso);
  const lastRunAt = input.schedule.next_run_at ? new Date(input.schedule.next_run_at) : null;
  const next = computeNextRunAt({
    now,
    cadence_type: input.schedule.cadence_type,
    cadence_interval_seconds: input.schedule.cadence_interval_seconds,
    last_run_at: lastRunAt
  });
  return next ? next.toISOString() : null;
}
