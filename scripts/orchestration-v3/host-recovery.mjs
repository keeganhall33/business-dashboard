import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";
import { buildLivenessReport } from "./liveness-report.mjs";
import { inspectIntegrationLock, recoverStaleIntegrationLock } from "./integration-queue.mjs";
import { inspectGitRoot, recoverIdleWorker } from "./preflight.mjs";

const LAUNCHD_LABEL = "com.keegan.jeeves.orchestration-v3";
const ALLOWED_OPERATIONS = new Set(["status", "restart-watcher", "recover-stale-integration-lock", "repair-idle-worker"]);
const RESULT_PRIORITY = {
  HUMAN_ACTION_REQUIRED: 4,
  DEGRADED: 3,
  RECOVERED: 2,
  HEALTHY: 1
};

function nowIso() {
  return new Date().toISOString();
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function bestEffort(exe, args, options = {}) {
  const res = spawnSync(exe, args, { encoding: "utf8", timeout: options.timeout ?? 60_000, ...options });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: String(res.stdout ?? "").trim(),
    stderr: String(res.stderr ?? "").trim(),
    error: res.error ? String(res.error.message ?? res.error) : null
  };
}

function safeAuditName(operation, generatedAt) {
  return `${generatedAt.replace(/[:.]/g, "-")}-${operation}.json`;
}

function auditPath(operation, generatedAt) {
  return path.join(ORCHESTRATION_V3.runtime.stateRoot, "host-recovery-audit", safeAuditName(operation, generatedAt));
}

function activeWorkerIds(report) {
  return new Set((report?.workers ?? []).filter((worker) => worker.pid_alive).map((worker) => worker.worker_id));
}

function summarizeLiveness(report) {
  return {
    watcher_loaded: Boolean(report?.watcher?.loaded),
    watcher_pid: report?.watcher?.pid ?? null,
    watcher_pid_alive: Boolean(report?.watcher?.pid_alive),
    heartbeat_age_seconds: report?.heartbeat?.age_seconds ?? null,
    active_workers: [...activeWorkerIds(report)].sort(),
    capacity: report?.summary?.capacity_acceptance_proof ?? null,
    utilization: report?.summary?.utilization_label ?? null,
    role_utilization: report?.summary?.role_utilization ?? null,
    ready_backfill_candidates: report?.summary?.ready_backfill_candidates ?? [],
    ready_unmapped_issue_numbers: report?.summary?.ready_unmapped_issue_numbers ?? []
  };
}

function statusFromReport(report) {
  if (!report?.watcher?.loaded || !report?.watcher?.pid_alive) return "DEGRADED";
  if (report?.summary?.capacity_acceptance_proof !== `${ORCHESTRATION_V3.capacity.totalWorkers}/${ORCHESTRATION_V3.capacity.totalWorkers}`) return "DEGRADED";
  if ((report?.summary?.ready_unmapped_issue_numbers ?? []).length > 0) return "DEGRADED";
  return "HEALTHY";
}

function worstStatus(...statuses) {
  return statuses.reduce((current, next) => RESULT_PRIORITY[next] > RESULT_PRIORITY[current] ? next : current, "HEALTHY");
}

function assertActiveWorkersPreserved(before, after) {
  const beforeActive = activeWorkerIds(before);
  const afterActive = activeWorkerIds(after);
  const missing = [...beforeActive].filter((workerId) => !afterActive.has(workerId));
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true, missing: [] };
}

function launchctlTarget() {
  return `gui/${process.getuid()}/${LAUNCHD_LABEL}`;
}

function reloadWatcher(deps) {
  const actions = [];
  actions.push({ action: "launchctl_bootout_v3_watcher", result: deps.bestEffort("launchctl", ["bootout", launchctlTarget()]) });
  const kickstart = deps.bestEffort("launchctl", ["kickstart", "-k", launchctlTarget()]);
  actions.push({ action: "launchctl_kickstart_v3_watcher", result: kickstart });
  return actions;
}

function validateWorkerRepairTarget(workerId, beforeReport) {
  if (!ORCHESTRATION_V3.workers[workerId]) return { ok: false, reason: "UNKNOWN_WORKER" };
  if (activeWorkerIds(beforeReport).has(workerId)) return { ok: false, reason: "ACTIVE_WORKER_NOT_REPAIRABLE" };
  return { ok: true, reason: null };
}

export function runBoundedHostRecovery(input = {}, deps = {}) {
  const operation = String(input.operation ?? "status");
  if (!ALLOWED_OPERATIONS.has(operation)) {
    return {
      status: "HUMAN_ACTION_REQUIRED",
      operation,
      result: "INVALID_OPERATION",
      allowed_operations: [...ALLOWED_OPERATIONS].sort()
    };
  }

  const reason = String(input.reason ?? "unspecified").slice(0, 500);
  const generatedAt = deps.nowIso?.() ?? nowIso();
  const liveness = deps.liveness ?? ((options) => buildLivenessReport(options));
  const inspectLock = deps.inspectIntegrationLock ?? inspectIntegrationLock;
  const recoverLock = deps.recoverStaleIntegrationLock ?? recoverStaleIntegrationLock;
  const repairWorker = deps.recoverIdleWorker ?? recoverIdleWorker;
  const inspectRoot = deps.inspectGitRoot ?? inspectGitRoot;
  const commandDeps = {
    bestEffort: deps.bestEffort ?? bestEffort
  };
  const includeGithub = Boolean(input.includeGithub);
  const before = liveness({ includeGithub, launchdLabel: LAUNCHD_LABEL });
  const beforeState = summarizeLiveness(before);
  const actions = [];
  let status = statusFromReport(before);
  let result = "NOOP";

  try {
    if (operation === "restart-watcher") {
      if (process.platform !== "darwin" && !input.allowNonDarwinForTest) {
        status = "HUMAN_ACTION_REQUIRED";
        result = "LAUNCHD_UNAVAILABLE_ON_HOST";
      } else {
        actions.push(...reloadWatcher(commandDeps));
        const afterReload = liveness({ includeGithub, launchdLabel: LAUNCHD_LABEL });
        const preservation = assertActiveWorkersPreserved(before, afterReload);
        if (!preservation.ok) {
          status = "HUMAN_ACTION_REQUIRED";
          result = `ACTIVE_WORKER_PRESERVATION_FAILED:${preservation.missing.join(",")}`;
        } else {
          status = statusFromReport(afterReload) === "HEALTHY" ? "RECOVERED" : "DEGRADED";
          result = status === "RECOVERED" ? "WATCHER_RECOVERED" : "WATCHER_RELOAD_INCOMPLETE";
        }
      }
    } else if (operation === "recover-stale-integration-lock") {
      const inspection = inspectLock();
      actions.push({ action: "inspect_integration_lock", result: inspection });
      if (inspection.exists && inspection.pidAlive) {
        status = "HUMAN_ACTION_REQUIRED";
        result = "INTEGRATION_LOCK_LIVE";
      } else if (!inspection.exists || !inspection.stale) {
        status = statusFromReport(before);
        result = "NO_STALE_INTEGRATION_LOCK";
      } else {
        const recovery = recoverLock();
        actions.push({ action: "recover_stale_integration_lock", result: recovery });
        status = recovery.recovered ? "RECOVERED" : "DEGRADED";
        result = recovery.recovered ? "STALE_INTEGRATION_LOCK_RECOVERED" : "STALE_INTEGRATION_LOCK_NOT_RECOVERED";
      }
    } else if (operation === "repair-idle-worker") {
      const workerId = String(input.workerId ?? "");
      const validation = validateWorkerRepairTarget(workerId, before);
      if (!validation.ok) {
        status = "HUMAN_ACTION_REQUIRED";
        result = validation.reason;
      } else {
        const recovery = repairWorker(workerId);
        actions.push({ action: "recover_idle_worker", worker_id: workerId, result: recovery });
        status = recovery.after?.healthy ? "RECOVERED" : "DEGRADED";
        result = recovery.after?.healthy ? "IDLE_WORKER_RECOVERED" : "IDLE_WORKER_RECOVERY_INCOMPLETE";
      }
    } else {
      const runtime = inspectRoot(ORCHESTRATION_V3.runtime.root);
      actions.push({ action: "inspect_runtime_root", result: { healthy: runtime.healthy, errors: runtime.errors } });
      result = status === "HEALTHY" ? "HEALTHY" : "STATUS_DEGRADED";
    }
  } catch (err) {
    status = "HUMAN_ACTION_REQUIRED";
    result = err instanceof Error ? err.message : String(err);
  }

  const after = liveness({ includeGithub, launchdLabel: LAUNCHD_LABEL });
  const afterState = summarizeLiveness(after);
  status = worstStatus(status, statusFromReport(after) === "HEALTHY" && status === "DEGRADED" ? "DEGRADED" : status);
  const audit = {
    contract_version: "jeeves_v3_bounded_host_recovery_v1",
    generated_at: generatedAt,
    operation,
    reason,
    status,
    result,
    allowed_operations: [...ALLOWED_OPERATIONS].sort(),
    before_state: beforeState,
    actions,
    after_state: afterState,
    safety: {
      no_general_command_execution: true,
      active_workers_preserved: assertActiveWorkersPreserved(before, after),
      production_change: "NO",
      destructive_action_allowed: false
    }
  };
  const file = deps.auditPath?.(operation, generatedAt) ?? auditPath(operation, generatedAt);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(audit, null, 2) + "\n");
    audit.audit_path = file;
  } catch (err) {
    audit.audit_write_error = err instanceof Error ? err.message : String(err);
    audit.status = "DEGRADED";
  }
  return audit;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const operation = arg("--operation", "status");
  const workerId = arg("--worker");
  const reason = arg("--reason", "manual bounded V3 host recovery request");
  const includeGithub = hasFlag("--github");
  const result = runBoundedHostRecovery({ operation, workerId, reason, includeGithub });
  console.log(JSON.stringify(result, null, hasFlag("--pretty") ? 2 : 0));
  process.exitCode = result.status === "HEALTHY" || result.status === "RECOVERED" ? 0 : 2;
}
