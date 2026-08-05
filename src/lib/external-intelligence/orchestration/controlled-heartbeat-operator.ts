import "@/lib/server-only";

import { randomUUID } from "node:crypto";

import { runExternalIntelligenceHeartbeatV1 } from "@/lib/scheduler/externalIntelligenceHeartbeat";
import type { InternalOrchestrationJobKey } from "@/lib/external-intelligence/orchestration/internal-jobs";
import { INTERNAL_ORCHESTRATION_JOBS_V1 } from "@/lib/external-intelligence/orchestration/internal-jobs";
import type { InternalOrchestrationJobRow } from "@/lib/external-intelligence/orchestration/internal-jobs.repository";
import { validateManualHeartbeatInvocationV1 } from "@/lib/external-intelligence/orchestration/manual-invocation";
import { getSystemState, upsertSystemState } from "@/lib/supabase/queries";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";

export const APPROVED_INTERNAL_HEARTBEAT_JOBS_V1: ReadonlyArray<InternalOrchestrationJobKey> = [
  "external-source-watchdog-v1",
  "milestone-horizon-scan-v1",
  "expired-lease-recovery-v1",
  "expired-milestone-alert-cleanup-v1"
] as const;

export type ControlledInvocationStatus =
  | "claimed"
  | "precondition_failed"
  | "running"
  | "succeeded"
  | "failed"
  | "restoration_failed";

type ControlledAuditV1 = {
  schema_version: "controlled_internal_heartbeat_audit_v1";
  operator_version: string;

  invocation_id: string;
  invocation_hash: string;

  requested_by: string;
  requested_at: string;
  expires_at: string;
  environment: "production";
  approved_internal_job_names: InternalOrchestrationJobKey[];

  claimed_at: string;

  started_at: string | null;
  completed_at: string | null;
  status: ControlledInvocationStatus;

  status_history: Array<{ at: string; from: ControlledInvocationStatus | null; to: ControlledInvocationStatus; note: string }>;

  preconditions: Record<string, unknown>;
  pre_run_counts: Record<string, unknown>;
  post_run_counts: Record<string, unknown>;

  heartbeat_result: Record<string, unknown> | null;

  restoration: {
    attempted: boolean;
    restored: boolean;
    error: string | null;
  };

  safe_error_code: string | null;
  safe_error_summary: string | null;
};

function safeSummary(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

function nowIso() {
  return new Date().toISOString();
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function parseProjectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  // Expected: https://<ref>.supabase.co
  const m = supabaseUrl.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i);
  return m?.[1] ?? null;
}

function sameSet(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNumberField(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getSupabase() {
  return getExternalIntelligenceSupabaseClient({});
}

function operatorVersion() {
  // Repo-controlled string; include commit-ish if operator sets it.
  return process.env.CONTROLLED_INTERNAL_HEARTBEAT_OPERATOR_VERSION ?? "b3.1";
}

function requireOperatorExpectedProjectRef() {
  const v = process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF;
  if (!v) throw new Error("precondition_failed:missing_operator_expected_project_ref");
  return v;
}

async function claimInvocationOnceV1(input: {
  key: string;
  value_json: Record<string, unknown>;
}): Promise<{ claimed: boolean; claimed_at: string }> {
  const supabase = getSupabase();
  const claimed_at = nowIso();

  const { error } = await supabase.from("system_state").insert({
    key: input.key,
    value_json: input.value_json,
    updated_at: claimed_at
  });

  // Unique key conflict => already claimed.
  const code = (error as unknown as { code?: string } | null)?.code ?? null;
  if (code === "23505") return { claimed: false, claimed_at };
  if (error) throw error;
  return { claimed: true, claimed_at };
}

function auditTransition(
  prev: ControlledInvocationStatus | null,
  next: ControlledInvocationStatus,
  note: string
): { at: string; from: ControlledInvocationStatus | null; to: ControlledInvocationStatus; note: string } {
  return { at: nowIso(), from: prev, to: next, note };
}

function mergeAuditPreservingHistory(prev: ControlledAuditV1, patch: Partial<ControlledAuditV1>) {
  // Preserve prior status_history and append transitions explicitly.
  return { ...prev, ...patch, status_history: prev.status_history } satisfies ControlledAuditV1;
}

async function getTableCountOrNull(table: string): Promise<number | null> {
  const supabase = getSupabase();
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return typeof count === "number" ? count : null;
}

type PreconditionSnapshot = {
  ok: boolean;
  facts: Record<string, unknown>;
  a5Counts: { evidence_refs: number | null; claims: number | null; signals: number | null };
};

export async function snapshotControlledHeartbeatPreconditionsV1(input: {
  expected_project_ref: string;
  now_iso: string;
}): Promise<PreconditionSnapshot> {
  const approvalFlag = process.env.CONTROLLED_INTERNAL_HEARTBEAT_APPROVED;
  if (approvalFlag !== "true") throw new Error("precondition_failed:approval_flag_missing");

  const operatorExpectedRef = requireOperatorExpectedProjectRef();
  if (operatorExpectedRef !== input.expected_project_ref) throw new Error("precondition_failed:operator_expected_ref_mismatch");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = parseProjectRefFromSupabaseUrl(supabaseUrl);
  if (projectRef !== input.expected_project_ref) throw new Error("precondition_failed:wrong_supabase_project");

  const supabase = getSupabase();

  const [{ data: recurringRows }, { data: activeLockRows }, { data: enabledSchedulesRows }] =
    await Promise.all([
      supabase.from("scheduled_jobs").select("job_key").eq("job_key", "external-intelligence-heartbeat"),
      supabase
        .from("internal_orchestration_locks_v1")
        .select("lock_key,expires_at")
        .eq("lock_key", "external-intelligence-heartbeat")
        .gt("expires_at", input.now_iso),
      supabase.from("external_collection_schedules_v1").select("schedule_id").eq("enabled", true)
    ]);

  const recurringCount = (recurringRows ?? []).length;
  const activeLockCount = (activeLockRows ?? []).length;
  const enabledSchedulesCount = (enabledSchedulesRows ?? []).length;

  const { count: totalExternalJobs, error: totalJobsError } = await supabase
    .from("external_collection_jobs_v1")
    .select("job_id", { count: "exact", head: true });
  if (totalJobsError) throw totalJobsError;

  const { count: activeDirect, error: activeDirectError } = await supabase
    .from("external_collection_jobs_v1")
    .select("job_id", { count: "exact", head: true })
    .in("status", ["queued", "leased", "running"]);
  if (activeDirectError) throw activeDirectError;

  const { count: activeRetryDueOrPending, error: activeRetryError } = await supabase
    .from("external_collection_jobs_v1")
    .select("job_id", { count: "exact", head: true })
    .eq("status", "retry_wait")
    .or(`next_retry_at.is.null,next_retry_at.lte.${input.now_iso}`);
  if (activeRetryError) throw activeRetryError;

  const activeExternalJobs = (activeDirect ?? 0) + (activeRetryDueOrPending ?? 0);

  const a5EvidenceRefs = await getTableCountOrNull("external_evidence_references_v1");
  const a5Claims = await getTableCountOrNull("external_claims_v1");
  const a5Signals = await getTableCountOrNull("external_signals_v1");

  const ok =
    recurringCount === 0 &&
    activeLockCount === 0 &&
    enabledSchedulesCount === 0 &&
    activeExternalJobs === 0;

  return {
    ok,
    facts: {
      supabase_project_ref: projectRef,
      operator_expected_project_ref: operatorExpectedRef,
      recurring_heartbeat_rows: recurringCount,
      active_heartbeat_leases: activeLockCount,
      enabled_external_schedules: enabledSchedulesCount,
      external_collection_jobs_total: totalExternalJobs ?? 0,
      external_collection_jobs_active_executable: activeExternalJobs
    },
    a5Counts: { evidence_refs: a5EvidenceRefs, claims: a5Claims, signals: a5Signals }
  };
}

async function readAllInternalJobsForEnv(env: "production") {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("internal_orchestration_jobs_v1")
    .select("job_name,enabled,next_run_at,timeout_seconds,maximum_attempts,environment")
    .eq("environment", env)
    .order("job_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as InternalOrchestrationJobRow[];
}

async function upsertGovernedDefinitionsIfMissing() {
  const supabase = getSupabase();

  const names = INTERNAL_ORCHESTRATION_JOBS_V1.map((d) => d.job_name);
  const { data, error } = await supabase.from("internal_orchestration_jobs_v1").select("job_name").in("job_name", names);
  if (error) throw error;

  const existing = new Set((data ?? []).map((r) => String((r as unknown as { job_name: string }).job_name)));
  const missing = INTERNAL_ORCHESTRATION_JOBS_V1.filter((d) => !existing.has(d.job_name));
  if (missing.length === 0) return { inserted: 0 };

  const rows = missing.map((d) => ({
    job_name: d.job_name,
    job_version: d.job_version,
    handler_identity: d.handler_identity,
    enabled: false,
    environment: d.environment,
    cadence_type: d.cadence.type,
    cadence_minutes: d.cadence.minutes ?? null,
    timezone: "UTC",
    timeout_seconds: d.timeout_seconds,
    maximum_attempts: d.maximum_attempts,
    concurrency_key: d.concurrency_key,
    next_run_at: null,
    last_run_at: null,
    last_success_at: null,
    last_failure_at: null,
    review_by: d.review_by,
    governing_policy_version: d.governing_policy_version
  }));

  const inserted = await supabase.from("internal_orchestration_jobs_v1").upsert(rows, { onConflict: "job_name" });
  if (inserted.error) throw inserted.error;
  return { inserted: rows.length };
}

async function enableJobsForOneShot(input: { now_iso: string; names: readonly InternalOrchestrationJobKey[] }) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("internal_orchestration_jobs_v1")
    .update({ enabled: true, next_run_at: input.now_iso, updated_at: nowIso() })
    .in("job_name", input.names);
  if (error) throw error;
}

async function restoreJobStates(original: InternalOrchestrationJobRow[]) {
  const supabase = getSupabase();
  for (const row of original) {
    const { error } = await supabase
      .from("internal_orchestration_jobs_v1")
      .update({
        // Configuration fields to restore.
        job_version: row.job_version,
        handler_identity: row.handler_identity,
        enabled: row.enabled,
        environment: row.environment,
        cadence_type: row.cadence_type,
        cadence_minutes: row.cadence_minutes,
        timezone: row.timezone,
        timeout_seconds: row.timeout_seconds,
        maximum_attempts: row.maximum_attempts,
        concurrency_key: row.concurrency_key,
        next_run_at: row.next_run_at,
        review_by: row.review_by,
        governing_policy_version: row.governing_policy_version,
        // Execution history is preserved (last_run_at/last_success_at/last_failure_at).
        updated_at: nowIso()
      })
      .eq("job_name", row.job_name)
      .eq("environment", row.environment);
    if (error) throw error;
  }
}

async function assertOnlyApprovedJobsEnabled(env: "production") {
  const rows = await readAllInternalJobsForEnv(env);
  const enabled = rows.filter((r) => r.enabled).map((r) => r.job_name).sort();
  const approved = [...APPROVED_INTERNAL_HEARTBEAT_JOBS_V1].sort();
  if (enabled.length === 0) return { ok: true, enabled };
  if (!sameSet(enabled, approved)) throw new Error("precondition_failed:unexpected_internal_job_enabled");
  return { ok: true, enabled };
}

async function getLatestUnresolvedHighSeverityOrchestrationAlerts() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("system_alerts")
    .select("alert_id,dedupe_key,severity,alert_type,created_at")
    .eq("is_resolved", false)
    .eq("severity", "high")
    .eq("alert_type", "orchestration_failure")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export type ControlledHeartbeatDeps = {
  nowIso: () => string;
  validateInvocation: typeof validateManualHeartbeatInvocationV1;
  claimInvocationOnce: typeof claimInvocationOnceV1;
  getSystemState: typeof getSystemState;
  upsertSystemState: typeof upsertSystemState;

  snapshotPreconditions: typeof snapshotControlledHeartbeatPreconditionsV1;
  readAllInternalJobsForEnv: typeof readAllInternalJobsForEnv;
  upsertGovernedDefinitionsIfMissing: typeof upsertGovernedDefinitionsIfMissing;
  enableJobsForOneShot: typeof enableJobsForOneShot;
  assertOnlyApprovedJobsEnabled: typeof assertOnlyApprovedJobsEnabled;
  restoreJobStates: typeof restoreJobStates;

  runHeartbeat: () => Promise<unknown>;

  getTableCountOrNull: (table: string) => Promise<number | null>;
  getDistinctHealthSourceCount: () => Promise<number | null>;
  getHealthSourceIds: () => Promise<string[] | null>;
  getActiveHeartbeatLeaseCount: (now_iso: string) => Promise<number>;
  getRecurringHeartbeatRowCount: () => Promise<number>;
  getUnresolvedHighSeverityOrchestrationAlerts: typeof getLatestUnresolvedHighSeverityOrchestrationAlerts;
  getCanonicalProductionSourceIds: () => string[];
};

export const DEFAULT_CONTROLLED_HEARTBEAT_DEPS: ControlledHeartbeatDeps = {
  nowIso,
  validateInvocation: validateManualHeartbeatInvocationV1,
  claimInvocationOnce: claimInvocationOnceV1,
  getSystemState,
  upsertSystemState,

  snapshotPreconditions: snapshotControlledHeartbeatPreconditionsV1,
  readAllInternalJobsForEnv,
  upsertGovernedDefinitionsIfMissing,
  enableJobsForOneShot,
  assertOnlyApprovedJobsEnabled,
  restoreJobStates,

  runHeartbeat: runExternalIntelligenceHeartbeatV1,

  getTableCountOrNull,
  getDistinctHealthSourceCount: async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("external_collection_health_v1").select("source_id");
    if (error) return null;
    const distinct = new Set((data ?? []).map((r) => String((r as unknown as { source_id: string }).source_id)));
    return distinct.size;
  },
  getHealthSourceIds: async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("external_collection_health_v1").select("source_id");
    if (error) return null;
    return (data ?? []).map((r) => String((r as unknown as { source_id: string }).source_id)).sort();
  },
  getActiveHeartbeatLeaseCount: async (now_iso: string) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("internal_orchestration_locks_v1")
      .select("lock_key")
      .eq("lock_key", "external-intelligence-heartbeat")
      .gt("expires_at", now_iso);
    if (error) throw error;
    return (data ?? []).length;
  },
  getRecurringHeartbeatRowCount: async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("scheduled_jobs")
      .select("job_key")
      .eq("job_key", "external-intelligence-heartbeat");
    if (error) throw error;
    return (data ?? []).length;
  },
  getUnresolvedHighSeverityOrchestrationAlerts: getLatestUnresolvedHighSeverityOrchestrationAlerts,
  getCanonicalProductionSourceIds: () => {
    const { file } = loadProductionSourceRegistryV1();
    return file.sources.map((s) => s.source_id).sort();
  }
};

export async function runControlledExternalIntelligenceHeartbeatV1WithDeps(
  deps: ControlledHeartbeatDeps,
  input: {
    expected_project_ref: "ibjsjosplgbqevmnvvpf";
    invocation_json: unknown;
  }
) {
  // Ensure operator explicitly declares intent.
  const operatorEnv = process.env.OPERATOR_ENVIRONMENT;
  if (operatorEnv !== "production") throw new Error("precondition_failed:operator_env_not_production");

  const invocation = deps.validateInvocation(input.invocation_json);

  if (invocation.environment !== "production") throw new Error("precondition_failed:environment_not_production");
  if (invocation.dry_run !== false) throw new Error("precondition_failed:dry_run_not_allowed");
  if (!invocation.requested_by) throw new Error("precondition_failed:requested_by_missing");

  if (!sameSet(invocation.approved_internal_job_names, APPROVED_INTERNAL_HEARTBEAT_JOBS_V1)) {
    throw new Error("precondition_failed:approved_jobs_mismatch");
  }

  const auditKey = `controlled_internal_heartbeat_invocation_v1:${invocation.invocation_id}`;
  // Atomic claim before any mutable step.
  const claimNow = deps.nowIso();
  const claim = await deps.claimInvocationOnce({
    key: auditKey,
    value_json: {
      schema_version: "controlled_internal_heartbeat_audit_v1",
      operator_version: operatorVersion(),
      invocation_id: invocation.invocation_id,
      invocation_hash: invocation.content_hash,
      status: "claimed",
      requested_by: invocation.requested_by,
      requested_at: invocation.requested_at,
      expires_at: invocation.expires_at,
      environment: invocation.environment,
      approved_internal_job_names: invocation.approved_internal_job_names,
      claimed_at: claimNow
    }
  });

  if (!claim.claimed) {
    return { ok: false, error: "invocation_already_claimed" } as const;
  }

  const claimedAt = claim.claimed_at;
  const pre = await deps.snapshotPreconditions({ expected_project_ref: input.expected_project_ref, now_iso: deps.nowIso() });

  const unresolvedHighBefore = await deps.getUnresolvedHighSeverityOrchestrationAlerts();
  const unresolvedHighBeforeIds = new Set(
    unresolvedHighBefore.map((a) => String((a as unknown as { alert_id: string }).alert_id))
  );

  const baseAudit: ControlledAuditV1 = {
    schema_version: "controlled_internal_heartbeat_audit_v1",
    operator_version: operatorVersion(),
    invocation_id: invocation.invocation_id,
    invocation_hash: invocation.content_hash,

    requested_by: invocation.requested_by,
    requested_at: invocation.requested_at,
    expires_at: invocation.expires_at,
    environment: "production",
    approved_internal_job_names: invocation.approved_internal_job_names.slice().sort() as InternalOrchestrationJobKey[],

    claimed_at: claimedAt,

    started_at: null,
    completed_at: null,
    status: pre.ok ? "claimed" : "precondition_failed",

    status_history: [auditTransition(null, "claimed", "atomic_claim")],

    preconditions: pre.facts,
    pre_run_counts: { a5: pre.a5Counts },
    post_run_counts: {},

    heartbeat_result: null,

    restoration: { attempted: false, restored: false, error: null },

    safe_error_code: pre.ok ? null : "precondition_failed",
    safe_error_summary: pre.ok ? null : "one or more preconditions not met"
  };

  await deps.upsertSystemState(auditKey, baseAudit);

  if (!pre.ok) {
    const prev = baseAudit.status;
    const completed = deps.nowIso();
    const failedAudit = mergeAuditPreservingHistory(baseAudit, {
      status: "precondition_failed",
      completed_at: completed,
      safe_error_code: "precondition_failed",
      safe_error_summary: "one or more preconditions not met"
    });
    failedAudit.status_history = [...baseAudit.status_history, auditTransition(prev, "precondition_failed", "preconditions")];
    await deps.upsertSystemState(auditKey, failedAudit);
    return { ok: false, error: "precondition_failed" };
  }

  const originalRows = await deps.readAllInternalJobsForEnv("production");

  const startedAt = deps.nowIso();
  const runningAudit = mergeAuditPreservingHistory(baseAudit, { started_at: startedAt, status: "running" });
  runningAudit.status_history = [...baseAudit.status_history, auditTransition(baseAudit.status, "running", "begin")];
  await deps.upsertSystemState(auditKey, runningAudit);

  let heartbeatResult: Record<string, unknown> | null = null;

  try {
    await deps.upsertGovernedDefinitionsIfMissing();

    await deps.enableJobsForOneShot({ now_iso: deps.nowIso(), names: APPROVED_INTERNAL_HEARTBEAT_JOBS_V1 });

    await deps.assertOnlyApprovedJobsEnabled("production");

    const out = await deps.runHeartbeat();
    heartbeatResult = out as unknown as Record<string, unknown>;

    // Heartbeat result validation: must contain exactly the 4 handlers with succeeded status.
    const resultsUnknown = (heartbeatResult.results ?? null) as unknown;
    if (!isRecord(resultsUnknown)) throw new Error("postcondition_failed:missing_results");

    const keys = Object.keys(resultsUnknown).sort();
    const approved = [...APPROVED_INTERNAL_HEARTBEAT_JOBS_V1].sort();
    if (!sameSet(keys, approved)) throw new Error("postcondition_failed:unexpected_handler_results");
    for (const k of approved) {
      const ru = resultsUnknown[k];
      if (!isRecord(ru)) throw new Error("postcondition_failed:missing_handler_result");
      const r = ru;
      if (r?.status !== "succeeded") throw new Error("postcondition_failed:handler_not_succeeded");
      if (r?.error_code) throw new Error("postcondition_failed:handler_error_code_present");
    }

    const watchdog = resultsUnknown["external-source-watchdog-v1"];
    const watchdogOutput = isRecord(watchdog) ? (watchdog.output as unknown) : null;
    if (!isRecord(watchdogOutput)) throw new Error("postcondition_failed:watchdog_missing_output");
    if (getNumberField(watchdogOutput, "sourcesEvaluated") !== 24 || getNumberField(watchdogOutput, "healthRowsUpserted") !== 24) {
      throw new Error("postcondition_failed:watchdog_not_24");
    }

    const healthRows = await deps.getTableCountOrNull("external_collection_health_v1");
    const distinctSources = await deps.getDistinctHealthSourceCount();
    const healthSourceIds = await deps.getHealthSourceIds();
    const canonicalSourceIds = deps.getCanonicalProductionSourceIds();
    if (!healthSourceIds) throw new Error("postcondition_failed:missing_health_source_ids");
    if (!sameSet(healthSourceIds, canonicalSourceIds)) throw new Error("postcondition_failed:health_source_ids_mismatch");

    const enabledExternalSchedules = (
      await deps.snapshotPreconditions({ expected_project_ref: input.expected_project_ref, now_iso: deps.nowIso() })
    ).facts.enabled_external_schedules;

    const snapAfter = await deps.snapshotPreconditions({ expected_project_ref: input.expected_project_ref, now_iso: deps.nowIso() });
    const externalJobsTotal = snapAfter.facts.external_collection_jobs_total;
    const externalJobsActive = snapAfter.facts.external_collection_jobs_active_executable;

    const sportsMilestones = await deps.getTableCountOrNull("sports_milestones_v1");
    const sportsMilestoneVersions = await deps.getTableCountOrNull("sports_milestone_versions_v1");
    const sportsMilestoneAlerts = await deps.getTableCountOrNull("sports_milestone_alerts_v1");

    const activeLocks = await deps.getActiveHeartbeatLeaseCount(deps.nowIso());
    const recurringRows = await deps.getRecurringHeartbeatRowCount();

    const afterA5EvidenceRefs = await deps.getTableCountOrNull("external_evidence_references_v1");
    const afterA5Claims = await deps.getTableCountOrNull("external_claims_v1");
    const afterA5Signals = await deps.getTableCountOrNull("external_signals_v1");

    const post = {
      health_rows: healthRows,
      distinct_sources: distinctSources,
      enabled_external_schedules: enabledExternalSchedules,
      external_collection_jobs_total: externalJobsTotal,
      external_collection_jobs_active_executable: externalJobsActive,
      sports_milestones: sportsMilestones,
      sports_milestone_versions: sportsMilestoneVersions,
      sports_milestone_alerts: sportsMilestoneAlerts,
      active_heartbeat_leases: activeLocks,
      recurring_heartbeat_rows: recurringRows,
      a5: { evidence_refs: afterA5EvidenceRefs, claims: afterA5Claims, signals: afterA5Signals }
    };

    if (healthRows !== 24) throw new Error("postcondition_failed:health_rows_not_24");
    if (distinctSources !== 24) throw new Error("postcondition_failed:distinct_sources_not_24");
    if (Number(enabledExternalSchedules) !== 0) throw new Error("postcondition_failed:enabled_external_schedules_nonzero");
    if (Number(externalJobsActive) !== 0) throw new Error("postcondition_failed:active_external_jobs_nonzero");
    if (sportsMilestones !== 0 || sportsMilestoneVersions !== 0 || sportsMilestoneAlerts !== 0) {
      throw new Error("postcondition_failed:milestones_nonzero");
    }
    if (activeLocks !== 0) throw new Error("postcondition_failed:active_lock_remaining");
    if (recurringRows !== 0) throw new Error("postcondition_failed:recurring_row_present");

    if (pre.a5Counts.evidence_refs !== null && afterA5EvidenceRefs !== pre.a5Counts.evidence_refs) {
      throw new Error("postcondition_failed:a5_evidence_refs_changed");
    }
    if (pre.a5Counts.claims !== null && afterA5Claims !== pre.a5Counts.claims) {
      throw new Error("postcondition_failed:a5_claims_changed");
    }
    if (pre.a5Counts.signals !== null && afterA5Signals !== pre.a5Counts.signals) {
      throw new Error("postcondition_failed:a5_signals_changed");
    }

    const unresolvedHighAfter = await deps.getUnresolvedHighSeverityOrchestrationAlerts();
    const newHigh = unresolvedHighAfter.filter(
      (a) => !unresolvedHighBeforeIds.has(String((a as unknown as { alert_id: string }).alert_id))
    );
    if (newHigh.length > 0) throw new Error("postcondition_failed:new_high_severity_alert");

    const completedAt = deps.nowIso();
    const succeededAudit = mergeAuditPreservingHistory(baseAudit, {
      started_at: startedAt,
      completed_at: completedAt,
      status: "succeeded",
      heartbeat_result: heartbeatResult,
      post_run_counts: post,
      restoration: { attempted: true, restored: true, error: null },
      safe_error_code: null,
      safe_error_summary: null
    });
    succeededAudit.status_history = [...runningAudit.status_history, auditTransition("running", "succeeded", "complete")];
    await deps.upsertSystemState(auditKey, succeededAudit);

    return { ok: true, audit_key: auditKey, result: heartbeatResult };
  } catch (error) {
    const failedAt = deps.nowIso();
    const failedAudit = mergeAuditPreservingHistory(baseAudit, {
      started_at: startedAt,
      completed_at: failedAt,
      status: "failed",
      heartbeat_result: heartbeatResult,
      restoration: { attempted: true, restored: false, error: null },
      safe_error_code: "controlled_run_failed",
      safe_error_summary: safeSummary(error)
    });
    failedAudit.status_history = [...runningAudit.status_history, auditTransition("running", "failed", "error")];
    await deps.upsertSystemState(auditKey, failedAudit);

    throw error;
  } finally {
    try {
      await deps.restoreJobStates(originalRows);
      const latest = await deps.getSystemState(auditKey);
      const latestJson = (latest?.value_json ?? {}) as Record<string, unknown>;
      await deps.upsertSystemState(auditKey, { ...latestJson, restoration: { attempted: true, restored: true, error: null } });
    } catch (e) {
      const latest = await deps.getSystemState(auditKey);
      const latestJson = (latest?.value_json ?? {}) as Record<string, unknown>;
      await deps.upsertSystemState(auditKey, {
        ...latestJson,
        status: "restoration_failed",
        restoration: { attempted: true, restored: false, error: safeSummary(e) }
      });
    }
  }
}

export function generateControlledHeartbeatInvocationId() {
  return randomUUID();
}
