import "@/lib/server-only";

import { HOOPHALL_SOURCE_ID } from "@/lib/external-intelligence/collection/hoophall/hoophall.contract";
import { collectHoophallNewsroomV1 } from "@/lib/external-intelligence/collection/hoophall/hoophall.adapter";
import { buildHoophallEvidenceReference } from "@/lib/external-intelligence/collection/hoophall/hoophall.qualification";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { heartbeat, advanceScheduleNextRun, type ScheduleRow } from "@/lib/external-intelligence/orchestration/heartbeat";
import { leaseNextExternalCollectionJobV1, releaseExternalCollectionJobLeaseV1 } from "@/lib/external-intelligence/orchestration/job-leasing";
import { nextJobStateAfterFailure } from "@/lib/external-intelligence/orchestration/job-retry-lifecycle";
import { EvidenceReferenceRepository } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";
import { ClaimRepository } from "@/lib/external-intelligence/persistence/supabase/claim.repository";
import { SportsMilestoneRepository } from "@/lib/external-intelligence/milestones/persistence/milestone.repository";
import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";

const HOOPHALL_SCHEDULE_ID = "sports.basketball.hoophall.official:production" as const;

function safeErrorSummary(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  return String(error).slice(0, 240);
}

/**
 * Phase B6: execute ONE governed real source lane end-to-end (Hoophall) using existing schedules/jobs/leasing/retry.
 *
 * Still deny-by-default:
 * - Runs only if the Hoophall schedule row exists and is enabled.
 * - Refuses to run if any other real external schedule is enabled.
 */
export async function runHoophallCollectionLaneV1(input: { now_iso: string; mode?: "scheduler" | "one_shot" }) {
  const supabase = getExternalIntelligenceSupabaseClient({});

  const mode = input.mode ?? "scheduler";

  // Safety: refuse if any other real external schedule is enabled.
  const { count: otherEnabled, error: otherErr } = await supabase
    .from("external_collection_schedules_v1")
    .select("schedule_id", { count: "exact", head: true })
    .eq("enabled", true)
    .eq("environment", "production")
    .neq("source_id", HOOPHALL_SOURCE_ID)
    .neq("source_id", "internal.lifecycle_probe");
  if (otherErr) throw otherErr;
  if ((otherEnabled ?? 0) > 0) {
    return { status: "blocked", reason: "another_real_external_schedule_enabled", count: otherEnabled } as const;
  }

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("external_collection_schedules_v1")
    .select(
      "schedule_id,source_id,source_config_version,registry_hash,source_sets_hash,eligibility_fingerprint,schedule_policy_version,cadence_type,cadence_interval_seconds,enabled,environment,next_run_at,last_evaluated_at,concurrency_key,maximum_attempts,timeout_seconds,collection_mode"
    )
    .eq("schedule_id", HOOPHALL_SCHEDULE_ID)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!scheduleRow) return { status: "skipped", reason: "hoophall_schedule_missing" } as const;

  const schedule = scheduleRow as unknown as ScheduleRow & {
    concurrency_key: string;
    maximum_attempts: number;
    timeout_seconds: number;
    collection_mode: string;
  };

  if (schedule.environment !== "production") return { status: "skipped", reason: "wrong_environment" } as const;
  if (schedule.source_id !== HOOPHALL_SOURCE_ID) return { status: "blocked", reason: "source_id_mismatch" } as const;
  if (mode === "scheduler" && !schedule.enabled) return { status: "skipped", reason: "disabled" } as const;

  const scheduleForHeartbeat: typeof schedule =
    mode === "one_shot"
      ? ({
          ...schedule,
          enabled: true,
          next_run_at: input.now_iso
        } as typeof schedule)
      : schedule;

  // Existing logical jobs for idempotency.
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
    schedules: [scheduleForHeartbeat],
    existing_jobs_by_logical_key: existingLogicalKeys,
    is_schedule_eligible_now: () => ({ ok: true, reason: null }),
    maximum_jobs_to_enqueue: 1
  });

  // Enqueue due job (idempotent on insert errors).
  let enqueued = 0;
  for (const job of hb.queued_jobs) {
    const { error: insertError } = await supabase.from("external_collection_jobs_v1").insert({
      job_id: job.job_id,
      schedule_id: job.schedule_id,
      source_id: job.source_id,
      collection_plan_id: "b6.hoophall.collection_plan_placeholder",
      planned_for: job.planned_for,
      run_after: job.run_after,
      status: "queued",
      attempt_count: 0,
      maximum_attempts: Number(schedule.maximum_attempts ?? 3) || 3,
      input_fingerprint: job.input_fingerprint,
      idempotency_key: job.idempotency_key,
      concurrency_key: String(schedule.concurrency_key ?? "sports:hoophall")
    });
    if (insertError) {
      const msg = "message" in insertError ? String((insertError as { message: string }).message ?? "") : "";
      if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) throw insertError;
    } else {
      enqueued += 1;
    }
  }

  const leaseOwner = `hoophall:${process.pid}`;
  const leaseClient = {
    rpc: async <T>(fn: string, args: Record<string, unknown>) => {
      const res = await supabase.rpc(fn, args);
      return { data: (res.data as T | null) ?? null, error: res.error ? { message: res.error.message } : null };
    }
  };

  const leased = await leaseNextExternalCollectionJobV1({
    client: leaseClient,
    lease_owner: leaseOwner,
    lease_seconds: 60,
    caps: { global_limit: 1, per_concurrency_key_limit: 1 }
  });
  if (!leased) return { status: "succeeded", enqueued, leased: null } as const;

  if (leased.source_id !== HOOPHALL_SOURCE_ID) {
    await releaseExternalCollectionJobLeaseV1({ client: leaseClient, job_id: leased.job_id, lease_owner: leaseOwner, new_status: "blocked" });
    return { status: "blocked", reason: "leased_non_hoophall_job", job_id: leased.job_id } as const;
  }

  const startedAt = new Date().toISOString();
  const { error: runningError } = await supabase
    .from("external_collection_jobs_v1")
    .update({ status: "running", started_at: startedAt, updated_at: startedAt })
    .eq("job_id", leased.job_id)
    .eq("lease_owner", leaseOwner);
  if (runningError) throw runningError;

  try {
    const out = await collectHoophallNewsroomV1({
      now_iso: input.now_iso,
      fetch,
      detail_fetch_cap: 5
    });

    if (!out.ok) throw new Error(out.error);

    // Deterministic selection: take first observed item only for B6 proof to keep writes bounded.
    const first = out.listing.items[0];
    if (!first) {
      const completedAt = new Date().toISOString();
      await supabase
        .from("external_collection_jobs_v1")
        .update({ status: "succeeded", completed_at: completedAt, updated_at: completedAt })
        .eq("job_id", leased.job_id)
        .eq("lease_owner", leaseOwner);
      await releaseExternalCollectionJobLeaseV1({ client: leaseClient, job_id: leased.job_id, lease_owner: leaseOwner, new_status: "succeeded" });
      return { status: "succeeded", enqueued, job_id: leased.job_id, wrote: { evidence: 0, claims: 0, milestones: 0 } } as const;
    }

    const detail = out.details.find((d) => d.url === first.url) ?? null;
    // Always persist evidence (minimum provenance) for the first item.
    const evidence = buildHoophallEvidenceReference({
      url: first.url,
      headline: first.headline,
      published_at_iso: null,
      collected_at_iso: input.now_iso,
      content_hash_hex: detail?.raw_hash ?? out.listing_raw_hash
    });

    const evidenceRepo = new EvidenceReferenceRepository();
    const evRes = await evidenceRepo.persistEvidenceReference({
      evidence,
      policy_refs_json: [{ policy_name: "b6.hoophall", semantic_version: "v1", content_hash: "ph" }],
      policy_version: "b6.hoophall.deterministic.v1"
    });

    let wroteClaims = 0;
    let wroteMilestones = 0;

    // Generic downstream qualification stage (Hoophall parity).
    let dq:
      | ReturnType<typeof qualifyEvidenceReferenceDownstreamV1>
      | { status: "error"; reason_codes: string[]; claims: []; sports_milestones: [] };
    try {
      dq = qualifyEvidenceReferenceDownstreamV1({
        evidence,
        now_iso: input.now_iso,
        source_context: {
          kind: "hoophall",
          headline: first.headline,
          listing_description: first.listing_description,
          detail_excerpt: detail?.excerpt ?? null
        }
      });
    } catch (e) {
      dq = { status: "error", reason_codes: [e instanceof Error ? e.message : String(e)], claims: [], sports_milestones: [] };
    }

    if (dq.status === "qualified") {
      const claim = dq.claims[0] ?? null;
      const milestone = dq.sports_milestones[0] ?? null;

      if (claim) {
        const claimRepo = new ClaimRepository();
        await claimRepo.persistClaim({
          claim,
          evidence_version_ref: evRes.ref,
          policy_refs_json: [{ policy_name: "b6.hoophall", semantic_version: "v1", content_hash: "ph" }],
          interpretation_policy_hash: "ph",
          edge: { relation: "supported_by", policy_version: "provenance/v1", policy_hash: "ph" }
        });
        wroteClaims = 1;
      }

      if (milestone) {
        const milestoneRepo = new SportsMilestoneRepository();
        await milestoneRepo.persistMilestone({
          milestone,
          policy_refs: [{ policy_name: "b6.hoophall", semantic_version: "v1", content_hash: "ph" }]
        });
        wroteMilestones = 1;
      }
    }

    const completedAt = new Date().toISOString();
    const nextRunAt = advanceScheduleNextRun({ now_iso: input.now_iso, schedule });

    await supabase
      .from("external_collection_jobs_v1")
      .update({ status: "succeeded", completed_at: completedAt, updated_at: completedAt })
      .eq("job_id", leased.job_id)
      .eq("lease_owner", leaseOwner);
    await releaseExternalCollectionJobLeaseV1({ client: leaseClient, job_id: leased.job_id, lease_owner: leaseOwner, new_status: "succeeded" });
    if (mode === "scheduler") {
      await supabase
        .from("external_collection_schedules_v1")
        .update({ next_run_at: nextRunAt, last_evaluated_at: input.now_iso, updated_at: completedAt })
        .eq("schedule_id", schedule.schedule_id);
    }

    return {
      status: "succeeded",
      mode,
      enqueued,
      job_id: leased.job_id,
      wrote: { evidence: 1, claims: wroteClaims, milestones: wroteMilestones },
      next_run_at: mode === "scheduler" ? nextRunAt : null
    } as const;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const msg = safeErrorSummary(error);
    const errorCode = msg.includes("hoophall_timeout") ? "handler_timeout" : "invalid_configuration";
    const { data: jobRow } = await supabase
      .from("external_collection_jobs_v1")
      .select("attempt_count,maximum_attempts")
      .eq("job_id", leased.job_id)
      .maybeSingle();
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

    await supabase
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
    await releaseExternalCollectionJobLeaseV1({ client: leaseClient, job_id: leased.job_id, lease_owner: leaseOwner, new_status: outcome.next_status });
    return {
      status: "failed",
      mode,
      job_id: leased.job_id,
      error_code: errorCode,
      next_status: outcome.next_status,
      next_retry_at: outcome.next_retry_at_iso
    } as const;
  }
}
