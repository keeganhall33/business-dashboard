import "@/lib/server-only";

import { createHash } from "node:crypto";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { heartbeat, advanceScheduleNextRun } from "@/lib/external-intelligence/orchestration/heartbeat";
import type { ScheduleRow } from "@/lib/external-intelligence/orchestration/heartbeat";
import { leaseNextExternalCollectionJobV1, releaseExternalCollectionJobLeaseV1 } from "@/lib/external-intelligence/orchestration/job-leasing";
import { nextJobStateAfterFailure } from "@/lib/external-intelligence/orchestration/job-retry-lifecycle";
import { withNoNetwork } from "@/lib/external-intelligence/orchestration/no-network";

export const LIFECYCLE_PROBE_SOURCE_ID = "internal.lifecycle_probe" as const;
export const LIFECYCLE_PROBE_SCHEDULE_ID = "internal.lifecycle_probe:production" as const;

type ProbeMode = "success" | "synthetic_retryable_failure" | "synthetic_permanent_failure";

function parseProbeMode(schedule_policy_version: string): ProbeMode {
  const v = String(schedule_policy_version);
  if (v === "b5_success_v1") return "success";
  if (v === "b5_synthetic_retryable_failure_v1") return "synthetic_retryable_failure";
  if (v === "b5_synthetic_permanent_failure_v1") return "synthetic_permanent_failure";
  // Default fail-closed: treat unknown as permanent misconfiguration.
  return "synthetic_permanent_failure";
}

function safeErrorSummary(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  return String(error).slice(0, 240);
}

/**
 * Phase B5: governed, internal-only lifecycle proof lane.
 *
 * Rules:
 * - DB-governed by external_collection_schedules_v1 enabled/next_run_at.
 * - MUST NOT perform network.
 * - MUST NOT write external-intelligence artifacts (EvidenceReference/Claim/Signal).
 * - MUST fail closed if any non-probe external job is present.
 */
export async function runExternalLifecycleProbeLaneV1(input: { now_iso: string }) {
  const supabase = getExternalIntelligenceSupabaseClient({});

  // Safety: never lease or run any non-probe external job.
  const { count: nonProbeQueuedCount, error: nonProbeQueuedError } = await supabase
    .from("external_collection_jobs_v1")
    .select("job_id", { count: "exact", head: true })
    .in("status", ["queued", "retry_wait", "leased", "running"])
    .neq("source_id", LIFECYCLE_PROBE_SOURCE_ID);
  if (nonProbeQueuedError) throw nonProbeQueuedError;
  if ((nonProbeQueuedCount ?? 0) > 0) {
    return { status: "blocked", reason: "non_probe_external_jobs_present", count: nonProbeQueuedCount } as const;
  }

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("external_collection_schedules_v1")
    .select(
      "schedule_id,source_id,source_config_version,registry_hash,source_sets_hash,eligibility_fingerprint,schedule_policy_version,cadence_type,cadence_interval_seconds,enabled,environment,next_run_at,last_evaluated_at,concurrency_key,maximum_attempts,timeout_seconds,collection_mode"
    )
    .eq("schedule_id", LIFECYCLE_PROBE_SCHEDULE_ID)
    .maybeSingle();

  if (scheduleError) throw scheduleError;
  if (!scheduleRow) return { status: "skipped", reason: "probe_schedule_missing" } as const;

  const schedule = scheduleRow as unknown as ScheduleRow & {
    concurrency_key: string;
    maximum_attempts: number;
    timeout_seconds: number;
    collection_mode: string;
  };

  if (schedule.environment !== "production") return { status: "skipped", reason: "wrong_environment" } as const;
  if (schedule.source_id !== LIFECYCLE_PROBE_SOURCE_ID) return { status: "blocked", reason: "probe_identity_mismatch" } as const;
  if (String(schedule.collection_mode) !== "internal/no-network") {
    return { status: "blocked", reason: "probe_collection_mode_invalid" } as const;
  }

  // Disabled-by-default gate.
  if (!schedule.enabled) {
    return { status: "skipped", reason: "probe_disabled" } as const;
  }

  // Build logical-key set for idempotent enqueue.
  const { data: existingJobs, error: existingError } = await supabase
    .from("external_collection_jobs_v1")
    .select("schedule_id,planned_for,input_fingerprint")
    .eq("schedule_id", schedule.schedule_id);
  if (existingError) throw existingError;

  const existingLogicalKeys = new Set<string>();
  for (const row of existingJobs ?? []) {
    const r = row as unknown as { schedule_id: string; planned_for: string; input_fingerprint: string };
    existingLogicalKeys.add(`${r.schedule_id}|${new Date(r.planned_for).toISOString()}|${String(r.input_fingerprint)}`);
  }

  const hb = heartbeat({
    now_iso: input.now_iso,
    schedules: [schedule],
    existing_jobs_by_logical_key: existingLogicalKeys,
    is_schedule_eligible_now: (s) => {
      if (s.source_id !== LIFECYCLE_PROBE_SOURCE_ID) return { ok: false, reason: "source_id_mismatch" };
      if (s.environment !== "production") return { ok: false, reason: "wrong_environment" };
      return { ok: true, reason: null };
    },
    maximum_jobs_to_enqueue: 1
  });

  // Enqueue any due probe job.
  let enqueued = 0;
  for (const job of hb.queued_jobs) {
    const { error: insertError } = await supabase.from("external_collection_jobs_v1").insert({
      job_id: job.job_id,
      schedule_id: job.schedule_id,
      source_id: job.source_id,
      collection_plan_id: "internal/no-network",
      planned_for: job.planned_for,
      run_after: job.run_after,
      status: "queued",
      attempt_count: 0,
      maximum_attempts: Number(schedule.maximum_attempts ?? 3) || 3,
      input_fingerprint: job.input_fingerprint,
      idempotency_key: job.idempotency_key,
      concurrency_key: String(schedule.concurrency_key ?? "internal:lifecycle_probe")
    });

    // Idempotent insert: ignore conflicts.
    if (insertError) {
      const msg = "message" in insertError ? String((insertError as { message: string }).message ?? "") : "";
      if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) throw insertError;
    } else {
      enqueued += 1;
    }
  }

  // Lease + run exactly one probe job.
  const leaseOwner = `probe:${process.pid}`;
  const leaseClient = {
    rpc: async <T>(fn: string, args: Record<string, unknown>) => {
      // supabase-js rpc returns a builder; awaiting yields { data, error }.
      const res = await supabase.rpc(fn, args);
      return {
        data: (res.data as T | null) ?? null,
        error: res.error ? { message: res.error.message } : null
      };
    }
  };
  const leased = await leaseNextExternalCollectionJobV1({
    client: leaseClient,
    lease_owner: leaseOwner,
    lease_seconds: 60,
    caps: { global_limit: 1, per_concurrency_key_limit: 1 }
  });

  if (!leased) {
    // Advance schedule if we just enqueued but couldn't lease due to caps; do nothing otherwise.
    return { status: "succeeded", enqueued, leased: null } as const;
  }

  if (leased.source_id !== LIFECYCLE_PROBE_SOURCE_ID) {
    // Fail closed: never run unknown jobs.
    await releaseExternalCollectionJobLeaseV1({ client: leaseClient, job_id: leased.job_id, lease_owner: leaseOwner, new_status: "blocked" });
    return { status: "blocked", reason: "leased_non_probe_job", job_id: leased.job_id } as const;
  }

  // Mark running.
  const startedAt = new Date().toISOString();
  const { error: runningError } = await supabase
    .from("external_collection_jobs_v1")
    .update({ status: "running", started_at: startedAt, updated_at: startedAt })
    .eq("job_id", leased.job_id)
    .eq("lease_owner", leaseOwner);
  if (runningError) throw runningError;

  const mode = parseProbeMode(String(schedule.schedule_policy_version));

  const execResult = await withNoNetwork(async () => {
    // Deterministic internal computation.
    const digest = createHash("sha256").update(`${leased.job_id}|${schedule.schedule_policy_version}`).digest("hex");

    type ErrorWithCode = Error & { error_code?: string };

    if (mode === "synthetic_retryable_failure") {
      const error: ErrorWithCode = new Error(`synthetic_failure:transient_network:${digest.slice(0, 12)}`);
      error.error_code = "transient_network";
      throw error;
    }

    if (mode === "synthetic_permanent_failure") {
      const error: ErrorWithCode = new Error(`synthetic_failure:invalid_configuration:${digest.slice(0, 12)}`);
      error.error_code = "invalid_configuration";
      throw error;
    }

    return { ok: true as const, digest_prefix: digest.slice(0, 12) };
  });

  const completedAt = new Date().toISOString();

  if (execResult.ok) {
    const nextRunAt = advanceScheduleNextRun({ now_iso: input.now_iso, schedule });
    const { error: doneError } = await supabase
      .from("external_collection_jobs_v1")
      .update({ status: "succeeded", completed_at: completedAt, updated_at: completedAt })
      .eq("job_id", leased.job_id)
      .eq("lease_owner", leaseOwner);
    if (doneError) throw doneError;

    await releaseExternalCollectionJobLeaseV1({ client: leaseClient, job_id: leased.job_id, lease_owner: leaseOwner, new_status: "succeeded" });

    const { error: schedError } = await supabase
      .from("external_collection_schedules_v1")
      .update({ next_run_at: nextRunAt, last_evaluated_at: input.now_iso, updated_at: completedAt })
      .eq("schedule_id", schedule.schedule_id);
    if (schedError) throw schedError;

    return { status: "succeeded", enqueued, job_id: leased.job_id, next_run_at: nextRunAt, output: execResult.value } as const;
  }

  // Failure path: apply canonical retry policy.
  const error = execResult.error;
  const errorCode = error instanceof Error && "error_code" in error ? String((error as { error_code?: string }).error_code ?? "handler_timeout") : "handler_timeout";
  const { data: jobRow, error: jobReadError } = await supabase
    .from("external_collection_jobs_v1")
    .select("attempt_count,maximum_attempts")
    .eq("job_id", leased.job_id)
    .maybeSingle();
  if (jobReadError) throw jobReadError;

  const jr = (jobRow ?? null) as null | { attempt_count: number | null; maximum_attempts: number | null };
  const attempt_count = Number(jr?.attempt_count ?? 0) + 1;
  const maximum_attempts = Number(jr?.maximum_attempts ?? 3);

  const outcome = nextJobStateAfterFailure({
    now_iso: input.now_iso,
    attempt_count,
    maximum_attempts,
    error_code: errorCode,
    retry_after_seconds: null
  });

  const { error: failUpdateError } = await supabase
    .from("external_collection_jobs_v1")
    .update({
      status: outcome.next_status,
      attempt_count,
      error_code: errorCode,
      error_summary: safeErrorSummary(error),
      next_retry_at: outcome.next_retry_at_iso,
      completed_at: completedAt,
      updated_at: completedAt
    })
    .eq("job_id", leased.job_id)
    .eq("lease_owner", leaseOwner);
  if (failUpdateError) throw failUpdateError;

  await releaseExternalCollectionJobLeaseV1({
    client: leaseClient,
    job_id: leased.job_id,
    lease_owner: leaseOwner,
    new_status: outcome.next_status
  });

  return {
    status: "failed",
    enqueued,
    job_id: leased.job_id,
    error_code: errorCode,
    next_status: outcome.next_status,
    next_retry_at: outcome.next_retry_at_iso,
    failure_class: outcome.failure_class,
    reason: outcome.reason
  } as const;
}
