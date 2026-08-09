import "@/lib/server-only";

import {
  SPORTSPRO_RSS_URL,
  SPORTSPRO_SOURCE_ID
} from "@/lib/external-intelligence/collection/sportspro/sportspro.contract";
import {
  collectSportsProRssV1,
  computeSportsProEvidenceReferenceId,
  computeSportsProSourceItemId
} from "@/lib/external-intelligence/collection/sportspro/sportspro.adapter";
import { buildSportsProEvidenceReference } from "@/lib/external-intelligence/collection/sportspro/sportspro.evidence";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { heartbeat, advanceScheduleNextRun, type ScheduleRow } from "@/lib/external-intelligence/orchestration/heartbeat";
import { leaseNextExternalCollectionJobV1, releaseExternalCollectionJobLeaseV1 } from "@/lib/external-intelligence/orchestration/job-leasing";
import { nextJobStateAfterFailure } from "@/lib/external-intelligence/orchestration/job-retry-lifecycle";
import { EvidenceReferenceRepository } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";
import { ClaimRepository } from "@/lib/external-intelligence/persistence/supabase/claim.repository";
import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";
import {
  PersistenceIdempotencyConflictError,
  PersistenceClaimVersionIdentityConflictError
} from "@/lib/external-intelligence/persistence/errors";
import {
  normalizeSportsProOneShotFilter,
  filterSportsProItemsForOneShot,
  type SportsProOneShotFilter
} from "@/lib/external-intelligence/orchestration/handlers/sportspro-one-shot-filter";
import {
  bumpReasonCodes,
  emptyExternalCollectionObservabilityV1,
  type ExternalCollectionObservabilityV1
} from "@/lib/external-intelligence/orchestration/observability-v1";

const SPORTSPRO_SCHEDULE_ID = "sports_business.sportspro:production" as const;
const MAX_ITEMS_PER_RUN = 5;

// One-shot-only: when an explicit non-empty SportsPro filter is supplied, we allow a
// bounded lookahead discovery window so targets outside the first 5 sorted items can be
// selected without changing scheduler/unfiltered semantics.
export const SPORTSPRO_FILTERED_ONE_SHOT_DISCOVERY_LIMIT_V1 = 20;

export function __test__getSportsProDiscoveryMaxItemsV1(input: {
  mode: "scheduler" | "one_shot";
  has_explicit_non_empty_one_shot_filter: boolean;
}) {
  if (input.mode === "one_shot" && input.has_explicit_non_empty_one_shot_filter) {
    return SPORTSPRO_FILTERED_ONE_SHOT_DISCOVERY_LIMIT_V1;
  }
  return MAX_ITEMS_PER_RUN;
}

type SportsProLaneDeps = {
  computeEvidenceReferenceId: typeof computeSportsProEvidenceReferenceId;
  computeSourceItemId: typeof computeSportsProSourceItemId;
  buildEvidenceReference: typeof buildSportsProEvidenceReference;
  qualifyDownstream: typeof qualifyEvidenceReferenceDownstreamV1;
  createEvidenceRepo: () => EvidenceReferenceRepository;
  createClaimRepo: () => ClaimRepository;
};

const DEFAULT_DEPS: SportsProLaneDeps = {
  computeEvidenceReferenceId: computeSportsProEvidenceReferenceId,
  computeSourceItemId: computeSportsProSourceItemId,
  buildEvidenceReference: buildSportsProEvidenceReference,
  qualifyDownstream: qualifyEvidenceReferenceDownstreamV1,
  createEvidenceRepo: () => new EvidenceReferenceRepository(),
  createClaimRepo: () => new ClaimRepository()
};

export async function __test__processSportsProCollectedItemsV1(input: {
  now_iso: string;
  mode: "scheduler" | "one_shot";
  one_shot_filter: ReturnType<typeof normalizeSportsProOneShotFilter>;
  collected_items: Array<{
    canonical_url: string;
    guid: string | null;
    title: string;
    published_at_iso: string | null;
    author: string | null;
    categories: string[];
    excerpt: string | null;
  }>;
  deps?: Partial<SportsProLaneDeps>;
}) {
  const deps: SportsProLaneDeps = { ...DEFAULT_DEPS, ...(input.deps ?? {}) } as SportsProLaneDeps;

  const sel =
    input.mode === "one_shot"
      ? filterSportsProItemsForOneShot({
          items: input.collected_items,
          filter: input.one_shot_filter,
          computeEvidenceReferenceId: deps.computeEvidenceReferenceId
        })
      : { filtered: input.collected_items, skipped_count: 0, mode: "unfiltered" as const };

  const evidenceRepo = deps.createEvidenceRepo();
  const claimRepo = deps.createClaimRepo();

  let wroteEvidence = 0;
  let wroteClaims = 0;

  let obs: ExternalCollectionObservabilityV1 = emptyExternalCollectionObservabilityV1({
    fetched_items: input.collected_items.length,
    selected_items: sel.filtered.length,
    skipped_items: sel.skipped_count
  });

  for (const [idx, item] of sel.filtered.entries()) {
    const evidence_reference_id = deps.computeEvidenceReferenceId({ canonical_url: item.canonical_url });
    const source_item_id = deps.computeSourceItemId({ canonical_url: item.canonical_url, guid: item.guid });
    const evidence = deps.buildEvidenceReference({
      evidence_reference_id,
      canonical_url: item.canonical_url,
      guid: item.guid,
      source_item_id,
      title: item.title,
      published_at_iso: item.published_at_iso,
      collected_at_iso: input.now_iso,
      author: item.author,
      categories: item.categories,
      excerpt: item.excerpt,
      feed_url: SPORTSPRO_RSS_URL,
      rss_position: idx
    });

    const evRes = await evidenceRepo.persistEvidenceReference({
      evidence,
      policy_refs_json: [{ policy_name: "sportspro.rss", semantic_version: "v1", content_hash: "ph" }],
      policy_version: "sportspro.rss.v1"
    });

    obs = Object.freeze({
      ...obs,
      evidence: {
        ...obs.evidence,
        processed: obs.evidence.processed + 1,
        new_versions: obs.evidence.new_versions + (evRes.created_new_version ? 1 : 0),
        idempotent_replays: obs.evidence.idempotent_replays + (evRes.idempotent_replay ? 1 : 0)
      }
    });

    // IMPORTANT: derive downstream qualification from persisted evidence payload when available.
    type EvidenceVersionLike = { payload_available: boolean; payload_json: unknown };
    const maybeGetVersion = (evidenceRepo as unknown as { getVersion?: (ref: unknown) => Promise<EvidenceVersionLike> }).getVersion;
    const persistedEvidenceVersion = typeof maybeGetVersion === "function" ? await maybeGetVersion(evRes.ref) : null;
    const evidenceForDownstream = persistedEvidenceVersion?.payload_available ? (persistedEvidenceVersion.payload_json as typeof evidence) : evidence;

    let dq:
      | ReturnType<typeof qualifyEvidenceReferenceDownstreamV1>
      | { status: "error"; reason_codes: string[]; claims: []; sports_milestones: [] };
    try {
      dq = deps.qualifyDownstream({
        evidence: evidenceForDownstream,
        now_iso: input.now_iso,
        source_context: { kind: "sportspro" }
      });
    } catch (e) {
      dq = { status: "error", reason_codes: [e instanceof Error ? e.message : String(e)], claims: [], sports_milestones: [] };
    }

    obs = Object.freeze({
      ...obs,
      qualification: {
        ...obs.qualification,
        processed: obs.qualification.processed + 1,
        qualified: obs.qualification.qualified + (dq.status === "qualified" ? 1 : 0),
        not_qualified: obs.qualification.not_qualified + (dq.status === "not_qualified" ? 1 : 0),
        unsupported: obs.qualification.unsupported + (dq.status === "unsupported" ? 1 : 0),
        errors: obs.qualification.errors + (dq.status === "error" ? 1 : 0),
        reason_codes: bumpReasonCodes(obs.qualification.reason_codes, dq.reason_codes)
      },
      claims: {
        ...obs.claims,
        proposed: obs.claims.proposed + (dq.status === "qualified" ? dq.claims.length : 0)
      },
      sports_milestones: {
        ...obs.sports_milestones,
        proposed: obs.sports_milestones.proposed + (dq.status === "qualified" ? dq.sports_milestones.length : 0)
      }
    });

    if (dq.status === "qualified" && dq.claims.length) {
      for (const claim of dq.claims) {
        let claimRes: Awaited<ReturnType<ClaimRepository["persistClaim"]>>;
        try {
          obs = Object.freeze({
            ...obs,
            claims: { ...obs.claims, persistence_attempts: obs.claims.persistence_attempts + 1 }
          });
          claimRes = await claimRepo.persistClaim({
            claim,
            evidence_version_ref: evRes.ref,
            policy_refs_json: [{ policy_name: "generalized_claim_v1", semantic_version: "v1", content_hash: "ph" }],
            interpretation_policy_hash: "ph",
            edge: { relation: "supported_by", policy_version: "provenance/v1", policy_hash: "ph" }
          });
        } catch (e) {
          obs = Object.freeze({
            ...obs,
            claims: { ...obs.claims, errors: obs.claims.errors + 1 }
          });
          throw e;
        }

        obs = Object.freeze({
          ...obs,
          claims: {
            ...obs.claims,
            new_versions: obs.claims.new_versions + (claimRes.created_new_version ? 1 : 0),
            idempotent_replays: obs.claims.idempotent_replays + (claimRes.idempotent_replay ? 1 : 0)
          }
        });
        wroteClaims += 1;
      }
    }
    wroteEvidence += 1;
  }

  return {
    selection: {
      mode: sel.mode,
      skipped_items: sel.skipped_count,
      selected_items: sel.filtered.length,
      filter: input.one_shot_filter
    },
    wrote: { evidence: wroteEvidence, claims: wroteClaims },
    observability_v1: obs
  };
}

function safeErrorSummary(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  return String(error).slice(0, 240);
}

export function __test__classifySportsProErrorCode(input: { error: unknown; error_summary: string }) {
  const msg = input.error_summary;
  if (msg.includes("sportspro_timeout")) return "handler_timeout" as const;
  if (
    input.error instanceof PersistenceIdempotencyConflictError ||
    input.error instanceof PersistenceClaimVersionIdentityConflictError
  ) {
    return "persistence_integrity_conflict" as const;
  }
  return "invalid_configuration" as const;
}

export async function runSportsProCollectionLaneV1(input: {
  now_iso: string;
  mode?: "scheduler" | "one_shot";
  // One-shot only: optional narrow filter for SportsPro controlled proofs.
  one_shot_filter?: null | SportsProOneShotFilter;
}) {
  const supabase = getExternalIntelligenceSupabaseClient({});

  // Safety: refuse if any other real external schedule is enabled.
  const { count: otherEnabled, error: otherErr } = await supabase
    .from("external_collection_schedules_v1")
    .select("schedule_id", { count: "exact", head: true })
    .eq("enabled", true)
    .eq("environment", "production")
    .neq("source_id", SPORTSPRO_SOURCE_ID)
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
    .eq("schedule_id", SPORTSPRO_SCHEDULE_ID)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!scheduleRow) return { status: "skipped", reason: "sportspro_schedule_missing" } as const;

  const schedule = scheduleRow as unknown as ScheduleRow & {
    concurrency_key: string;
    maximum_attempts: number;
    timeout_seconds: number;
    collection_mode: string;
  };

  const mode = input.mode ?? "scheduler";

  const oneShotFilter = mode === "one_shot" ? normalizeSportsProOneShotFilter(input.one_shot_filter ?? null) : null;
  const discoveryMaxItems = __test__getSportsProDiscoveryMaxItemsV1({
    mode,
    has_explicit_non_empty_one_shot_filter: oneShotFilter !== null
  });

  if (schedule.environment !== "production") return { status: "skipped", reason: "wrong_environment" } as const;
  if (schedule.source_id !== SPORTSPRO_SOURCE_ID) return { status: "blocked", reason: "source_id_mismatch" } as const;
  if (mode === "scheduler" && !schedule.enabled) return { status: "skipped", reason: "disabled" } as const;

  const scheduleForHeartbeat: typeof schedule =
    mode === "one_shot"
      ? ({
          ...schedule,
          enabled: true,
          next_run_at: input.now_iso
        } as typeof schedule)
      : schedule;

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

  let enqueued = 0;
  for (const job of hb.queued_jobs) {
    const { error: insertError } = await supabase.from("external_collection_jobs_v1").insert({
      job_id: job.job_id,
      schedule_id: job.schedule_id,
      source_id: job.source_id,
      collection_plan_id: "v1.sportspro.rss.collection_plan_placeholder",
      planned_for: job.planned_for,
      run_after: job.run_after,
      status: "queued",
      attempt_count: 0,
      maximum_attempts: Number(schedule.maximum_attempts ?? 3) || 3,
      input_fingerprint: job.input_fingerprint,
      idempotency_key: job.idempotency_key,
      concurrency_key: String(schedule.concurrency_key ?? "sports_business:sportspro")
    });
    if (insertError) {
      const msg = "message" in insertError ? String((insertError as { message: string }).message ?? "") : "";
      if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) throw insertError;
    } else {
      enqueued += 1;
    }
  }

  const leaseOwner = `sportspro:${process.pid}`;
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

  if (leased.source_id !== SPORTSPRO_SOURCE_ID) {
    await releaseExternalCollectionJobLeaseV1({
      client: leaseClient,
      job_id: leased.job_id,
      lease_owner: leaseOwner,
      new_status: "blocked"
    });
    return { status: "blocked", reason: "leased_non_sportspro_job", job_id: leased.job_id } as const;
  }

  const startedAt = new Date().toISOString();
  const { error: runningError } = await supabase
    .from("external_collection_jobs_v1")
    .update({ status: "running", started_at: startedAt, updated_at: startedAt })
    .eq("job_id", leased.job_id)
    .eq("lease_owner", leaseOwner);
  if (runningError) throw runningError;

  try {
    const out = await collectSportsProRssV1({ now_iso: input.now_iso, max_items: discoveryMaxItems });
    if (!out.ok) throw new Error(out.error);

    const processed = await __test__processSportsProCollectedItemsV1({
      now_iso: input.now_iso,
      mode,
      one_shot_filter: oneShotFilter,
      collected_items: out.items
    });

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
      wrote: processed.wrote,
      selection: processed.selection,
      observability_v1: processed.observability_v1,
      next_run_at: mode === "scheduler" ? nextRunAt : null
    } as const;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const msg = safeErrorSummary(error);

    const errorCode = __test__classifySportsProErrorCode({ error, error_summary: msg });
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
