import "@/lib/server-only";

import type { InternalOrchestrationJobDefinition, InternalOrchestrationJobKey } from "@/lib/external-intelligence/orchestration/internal-jobs";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export type InternalOrchestrationJobRow = {
  job_name: string;
  job_version: string;
  handler_identity: string;
  enabled: boolean;
  environment: string;
  cadence_type: string;
  cadence_minutes: number | null;
  timezone: string;
  timeout_seconds: number;
  maximum_attempts: number;
  concurrency_key: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  review_by: string | null;
  governing_policy_version: string;
};

export class InternalOrchestrationJobsRepository {
  async upsertDefinitions(defs: ReadonlyArray<InternalOrchestrationJobDefinition>) {
    const supabase = getExternalIntelligenceSupabaseClient({});

    const names = defs.map((d) => d.job_name);
    const existing = await supabase
      .from("internal_orchestration_jobs_v1")
      .select("job_name,enabled,next_run_at,last_run_at,last_success_at,last_failure_at")
      .in("job_name", names);

    if (existing.error) throw new Error(`Failed to read existing internal jobs: ${existing.error.message}`);
    const existingByName = new Map(
      (existing.data ?? []).map((r) => [
        String((r as unknown as { job_name: string }).job_name),
        r as unknown as Pick<InternalOrchestrationJobRow, "enabled" | "next_run_at" | "last_run_at" | "last_success_at" | "last_failure_at"> & {
          job_name: string;
        }
      ])
    );

    const rows = defs.map((d) => {
      const prev = existingByName.get(d.job_name) ?? null;
      return {
      job_name: d.job_name,
      job_version: d.job_version,
      handler_identity: d.handler_identity,
      // Preserve governed enablement state + scheduling fields; deployment must not flip to enabled.
      enabled: prev?.enabled ?? d.enabled,
      environment: d.environment,
      cadence_type: d.cadence.type,
      cadence_minutes: d.cadence.minutes ?? null,
      timezone: "UTC",
      timeout_seconds: d.timeout_seconds,
      maximum_attempts: d.maximum_attempts,
      concurrency_key: d.concurrency_key,
      next_run_at: prev?.next_run_at ?? d.next_run_at,
      last_run_at: prev?.last_run_at ?? d.last_run_at,
      last_success_at: prev?.last_success_at ?? d.last_success_at,
      last_failure_at: prev?.last_failure_at ?? d.last_failure_at,
      review_by: d.review_by,
      governing_policy_version: d.governing_policy_version
      };
    });

    const { error } = await supabase.from("internal_orchestration_jobs_v1").upsert(rows, { onConflict: "job_name" });
    if (error) throw new Error(`Failed to upsert internal jobs: ${error.message}`);
  }

  async listEnabledJobsForEnv(env: "production" | "staging" | "local"): Promise<InternalOrchestrationJobRow[]> {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const { data, error } = await supabase
      .from("internal_orchestration_jobs_v1")
      .select(
        "job_name,job_version,handler_identity,enabled,environment,cadence_type,cadence_minutes,timezone,timeout_seconds,maximum_attempts,concurrency_key,next_run_at,last_run_at,last_success_at,last_failure_at,review_by,governing_policy_version"
      )
      .eq("environment", env)
      .eq("enabled", true)
      .order("job_name", { ascending: true });
    if (error) throw new Error(`Failed to list enabled internal jobs: ${error.message}`);
    return (data ?? []) as unknown as InternalOrchestrationJobRow[];
  }

  async updateAfterRun(input: {
    job_name: InternalOrchestrationJobKey;
    next_run_at: string;
    now_iso: string;
    succeeded: boolean;
  }) {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const patch: Partial<InternalOrchestrationJobRow> = {
      next_run_at: input.next_run_at,
      last_run_at: input.now_iso
    };
    if (input.succeeded) patch.last_success_at = input.now_iso;
    else patch.last_failure_at = input.now_iso;

    const { error } = await supabase.from("internal_orchestration_jobs_v1").update(patch).eq("job_name", input.job_name);
    if (error) throw new Error(`Failed to update internal job after run: ${error.message}`);
  }
}
