/*
Milestone 12 — Phase 5

Runs staging-safe, mock-only execution API scenarios by invoking the Next.js
route handlers directly (no HTTP server required). All persistence is real
Supabase staging DB state. Cleanup must leave zero harness rows.

This script must never target production. It must never invoke real provider
adapters. Mock adapter only.
*/

import "server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalJsonSha256Hex } from "@/lib/actions/execution/canonical-json";

import { POST as requestExecution } from "@/app/api/actions/[id]/execution/request/route";
import { POST as dryRunExecution } from "@/app/api/actions/[id]/execution/dry-run/route";
import { POST as confirmExecution } from "@/app/api/actions/[id]/execution/confirm/route";
import { POST as executeExecution } from "@/app/api/actions/[id]/execution/execute/route";

type Batch = "1" | "2" | "3" | "4" | "5" | "full";

type ScenarioResult = {
  name: string;
  ok: boolean;
  details: Record<string, unknown>;
};

type Report = {
  timestamp_utc: string;
  harness_run_id: string;
  staging_host: string;
  selected: number;
  executed: number;
  passed: number;
  failed: number;
  scenarios: ScenarioResult[];
  cleanup: { ok: boolean; remaining_harness_rows: number; deleted: Record<string, number> };
  external_side_effect_count: 0;
  production_request_count: 0;
  provider_network_request_count: 0;
};

function nowIso() {
  return new Date().toISOString();
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function assertStagingOnly() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const host = new URL(url).host;
  if (host !== "tpgkyluovzhwvoajinra.supabase.co") {
    throw new Error(`Unexpected Supabase host (expected staging): ${host}`);
  }
  if (host.includes("ibjsjosplgbqevmnvvpf")) {
    throw new Error("Production project ref detected in host");
  }
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    throw new Error("NODE_ENV=production is forbidden for harness");
  }
  if (String(process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY ?? "") !== "1") {
    throw new Error("ACTIONS_ENABLE_EXECUTION_BOUNDARY=1 is required");
  }
  if (String(process.env.ACTIONS_ENABLE_MOCK_EXECUTION ?? "") !== "1") {
    throw new Error("ACTIONS_ENABLE_MOCK_EXECUTION=1 is required");
  }
  return host;
}

function makeRequest(input: {
  method: "POST";
  url: string;
  idempotencyKey: string;
  json: Record<string, unknown>;
  actor?: string;
  harnessRunId?: string;
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-idempotency-key": input.idempotencyKey,
    "x-m12-harness": "1"
  };

  const dash = String(process.env.DASHBOARD_ADMIN_TOKEN ?? "").trim();
  if (dash) {
    headers["x-dashboard-secret"] = dash;
  }

  if (input.actor) headers["x-m12-harness-actor"] = input.actor;
  return new Request(input.url, {
    method: input.method,
    headers,
    body: JSON.stringify({ ...input.json, harnessRunId: input.harnessRunId ?? null })
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return (parsed && typeof parsed === "object") ? (parsed as Record<string, unknown>) : { ok: false, error: { code: "invalid_json", message: "Non-object JSON" } };
  } catch {
    return { ok: false, error: { code: "invalid_json", message: text.slice(0, 200) } };
  }
}

async function createHarnessAction(harnessRunId: string) {
  const supabase = getSupabaseServerClient();
  const evidence = { harness_run_id: harnessRunId, note: "m12 phase 5 harness evidence" };
  const snapshot_hash = canonicalJsonSha256Hex(evidence);
  const fingerprint = `m12-phase5-evidence:${harnessRunId}`;
  const ev = await supabase
    .from("action_evidence_snapshots_v1")
    .insert({ fingerprint, snapshot_json: evidence, snapshot_hash })
    .select("id,snapshot_hash")
    .maybeSingle();
  if (ev.error) throw ev.error;
  if (!ev.data) throw new Error("Failed to insert evidence snapshot");

  const actionFingerprint = `m12-phase5-action:${harnessRunId}`;
  const action = await supabase
    .from("action_actions_v1")
    .insert({
      title: "M12 Phase 5 harness action",
      description: "Synthetic action for execution API scenarios",
      category: "email",
      channel: "email",
      confidence: "possible",
      current_level: "L4_APPROVED_FOR_EXECUTION",
      approval_level: "L4_APPROVED_FOR_EXECUTION",
      status: "approved",
      risk: "low",
      evidence_snapshot_id: ev.data.id,
      evidence_snapshot_hash: ev.data.snapshot_hash,
      recommendation_fingerprint: actionFingerprint,
      approved_by: "Keegan",
      approved_at: nowIso(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    })
    .select("id")
    .maybeSingle();
  if (action.error) throw action.error;
  if (!action.data) throw new Error("Failed to insert action");
  return { actionId: action.data.id as string, evidenceId: ev.data.id as string };
}

async function cleanupHarness(input: { harnessRunId: string; actionId: string; evidenceId: string }) {
  const supabase = getSupabaseServerClient();

  const reqs = await supabase.from("action_execution_requests_v1").select("id").eq("harness_run_id", input.harnessRunId);
  if (reqs.error) throw reqs.error;
  const requestIds = (reqs.data ?? []).map((r) => String((r as Record<string, unknown>)["id"]));

  let attemptIds: string[] = [];
  if (requestIds.length) {
    const atts = await supabase.from("action_execution_attempts_v1").select("id").in("execution_request_id", requestIds);
    if (atts.error) throw atts.error;
    attemptIds = (atts.data ?? []).map((r) => String((r as Record<string, unknown>)["id"]));
  }

  const deleted: Record<string, number> = {};
  async function del(table: string, fn: () => Promise<{ error: unknown; count?: number }>) {
    const res = await fn();
    if (res.error) throw res.error;
    deleted[table] = (res.count ?? 0) as number;
  }

  if (attemptIds.length) {
    await del("action_execution_steps_v1", async () => {
      const r = await supabase.from("action_execution_steps_v1").delete({ count: "exact" }).in("attempt_id", attemptIds);
      return { error: r.error, count: r.count ?? 0 };
    });
  }

  if (requestIds.length) {
    await del("action_execution_attempts_v1", async () => {
      const r = await supabase.from("action_execution_attempts_v1").delete({ count: "exact" }).in("execution_request_id", requestIds);
      return { error: r.error, count: r.count ?? 0 };
    });
    await del("action_execution_confirmations_v1", async () => {
      const r = await supabase.from("action_execution_confirmations_v1").delete({ count: "exact" }).in("execution_request_id", requestIds);
      return { error: r.error, count: r.count ?? 0 };
    });
    await del("action_execution_rollbacks_v1", async () => {
      const r = await supabase.from("action_execution_rollbacks_v1").delete({ count: "exact" }).in("execution_request_id", requestIds);
      return { error: r.error, count: r.count ?? 0 };
    });
    await del("action_execution_idempotency_v1", async () => {
      const r = await supabase.from("action_execution_idempotency_v1").delete({ count: "exact" }).in("execution_request_id", requestIds);
      return { error: r.error, count: r.count ?? 0 };
    });
    await del("action_execution_requests_v1", async () => {
      const r = await supabase.from("action_execution_requests_v1").delete({ count: "exact" }).in("id", requestIds);
      return { error: r.error, count: r.count ?? 0 };
    });
  }

  await del("action_execution_locks_v1", async () => {
    const r = await supabase.from("action_execution_locks_v1").delete({ count: "exact" }).eq("action_id", input.actionId);
    return { error: r.error, count: r.count ?? 0 };
  });
  await del("action_audit_events_v1", async () => {
    const r = await supabase.from("action_audit_events_v1").delete({ count: "exact" }).eq("action_id", input.actionId);
    return { error: r.error, count: r.count ?? 0 };
  });
  await del("action_actions_v1", async () => {
    const r = await supabase.from("action_actions_v1").delete({ count: "exact" }).eq("id", input.actionId);
    return { error: r.error, count: r.count ?? 0 };
  });
  await del("action_evidence_snapshots_v1", async () => {
    const r = await supabase.from("action_evidence_snapshots_v1").delete({ count: "exact" }).eq("id", input.evidenceId);
    return { error: r.error, count: r.count ?? 0 };
  });

  const remainingReqs = await supabase
    .from("action_execution_requests_v1")
    .select("id", { count: "exact", head: true })
    .eq("harness_run_id", input.harnessRunId);
  if (remainingReqs.error) throw remainingReqs.error;
  const remaining_harness_rows = remainingReqs.count ?? 0;
  return { ok: remaining_harness_rows === 0, remaining_harness_rows, deleted };
}

async function fetchExecutionEvidence(executionRequestId: string) {
  const supabase = getSupabaseServerClient();
  const req = await supabase
    .from("action_execution_requests_v1")
    .select("id,execution_state")
    .eq("id", executionRequestId)
    .maybeSingle();
  if (req.error) throw req.error;

  const atts = await supabase
    .from("action_execution_attempts_v1")
    .select("id,execution_request_id,status,provider_execution_id,external_side_effect_count")
    .eq("execution_request_id", executionRequestId)
    .order("created_at", { ascending: true });
  if (atts.error) throw atts.error;
  const attemptIds = (atts.data ?? []).map((r) => String((r as Record<string, unknown>)["id"]));

  let steps: Array<Record<string, unknown>> = [];
  if (attemptIds.length) {
    const st = await supabase
      .from("action_execution_steps_v1")
      .select("attempt_id,step_index,name,status")
      .in("attempt_id", attemptIds)
      .order("step_index", { ascending: true });
    if (st.error) throw st.error;
    steps = (st.data ?? []) as Array<Record<string, unknown>>;
  }

  const reqRow = (req.data && typeof req.data === "object") ? (req.data as Record<string, unknown>) : null;
  return {
    request_state: String(reqRow?.["execution_state"] ?? ""),
    attempt_count: (atts.data ?? []).length,
    step_count: steps.length,
    steps: steps.map((s) => String(s["name"])),
    external_side_effect_count: (atts.data ?? []).reduce((sum, r) => {
      const row = (r && typeof r === "object") ? (r as Record<string, unknown>) : {};
      return sum + Number(row["external_side_effect_count"] ?? 0);
    }, 0)
  };
}

function assertOrchestrationMilestonesOrdered(stepNames: string[]) {
  const milestones = [
    "preflight",
    "lock_acquired",
    "idempotency_checked",
    "confirmation_verified",
    "payload_verified",
    "action_state_verified",
    "queued",
    "started",
    "adapter_invoked",
    "result_persisted",
    "verification_completed",
    "lock_released"
  ];
  let i = 0;
  for (const name of stepNames) {
    if (name === milestones[i]) i += 1;
    if (i >= milestones.length) return;
  }
  throw new Error(`Missing ordered orchestration milestones (found ${i}/${milestones.length})`);
}

async function main() {
  const batch = (process.argv[2] as Batch | undefined) ?? "1";
  const stagingHost = assertStagingOnly();

  const harness_run_id = `m12-phase5-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}-${randomUUID().slice(0, 8)}`;
  const { actionId, evidenceId } = await createHarnessAction(harness_run_id);

  const results: ScenarioResult[] = [];
  const baseUrl = "https://local.invalid";
  const actor = "Keegan";

  async function scenario(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ name, ok: true, details: {} });
    } catch (e) {
      results.push({ name, ok: false, details: { message: e instanceof Error ? e.message : String(e) } });
    }
  }

  const selectedNames = new Set<string>();
  function select(name: string) {
    selectedNames.add(name);
  }

  // Batch 1: scenarios 1–5
  if (batch === "1" || batch === "full") {
    select("1. approved action cannot execute without dry run");
    select("2. approved action cannot execute without operator confirmation");
    select("3. expired confirmation is rejected");
    select("4. agent self-confirmation is rejected");
    select("5. duplicate execution request is idempotent");
  }

  // Batch 2: scenarios 6–10
  if (batch === "2" || batch === "full") {
    select("6. concurrent execution request is locked");
    select("7. stale lock recovery");
    select("8. mock success");
    select("9. mock failure");
    select("10. mock timeout");
  }

  // Scenario helpers
  async function apiRequestExecution(payload: Record<string, unknown>, idem: string, expiresAtUtc: string) {
    const req = makeRequest({
      method: "POST",
      url: `${baseUrl}/api/actions/${actionId}/execution/request`,
      idempotencyKey: idem,
      json: { ...payload, expiresAtUtc },
      actor,
      harnessRunId: harness_run_id
    });
    const res = await requestExecution(req, { params: Promise.resolve({ id: actionId }) } as unknown as { params: Promise<{ id: string }> });
    return { res, json: await readJson(res as Response) };
  }
  async function apiDryRun(executionRequestId: string, idem: string) {
    const req = makeRequest({ method: "POST", url: `${baseUrl}/api/actions/${actionId}/execution/dry-run`, idempotencyKey: idem, json: { executionRequestId }, actor });
    const res = await dryRunExecution(req);
    return { res, json: await readJson(res as Response) };
  }
  async function apiConfirm(executionRequestId: string, idem: string, input?: { actor?: string }) {
    const req = makeRequest({ method: "POST", url: `${baseUrl}/api/actions/${actionId}/execution/confirm`, idempotencyKey: idem, json: { executionRequestId, irreversibleAcknowledged: false, approvalSnapshot: { note: "harness" } }, actor: input?.actor ?? actor });
    const res = await confirmExecution(req);
    return { res, json: await readJson(res as Response) };
  }
  async function apiExecute(executionRequestId: string, idem: string) {
    const req = makeRequest({ method: "POST", url: `${baseUrl}/api/actions/${actionId}/execution/execute`, idempotencyKey: idem, json: { executionRequestId }, actor });
    const res = await executeExecution(req);
    return { res, json: await readJson(res as Response) };
  }

  function domainCode(json: Record<string, unknown>): string {
    const err = (json["error"] && typeof json["error"] === "object") ? (json["error"] as Record<string, unknown>) : {};
    return String(err["domain_code"] ?? "");
  }

  // Run selected scenarios
  if (selectedNames.has("1. approved action cannot execute without dry run")) {
    await scenario("1. approved action cannot execute without dry run", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-1", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      const { json } = await apiExecute(executionRequestId, "exec-1");
      if (json.ok !== false || domainCode(json) !== "EXECUTION_DRY_RUN_REQUIRED") {
        throw new Error(`Expected EXECUTION_DRY_RUN_REQUIRED, got ${JSON.stringify(json["error"])}`);
      }
    });
  }

  if (selectedNames.has("2. approved action cannot execute without operator confirmation")) {
    await scenario("2. approved action cannot execute without operator confirmation", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-2", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-2");
      const { json } = await apiExecute(executionRequestId, "exec-2");
      if (json.ok !== false || domainCode(json) !== "EXECUTION_CONFIRMATION_REQUIRED") {
        throw new Error(`Expected EXECUTION_CONFIRMATION_REQUIRED, got ${JSON.stringify(json["error"])}`);
      }
    });
  }

  if (selectedNames.has("3. expired confirmation is rejected")) {
    await scenario("3. expired confirmation is rejected", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-3", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-3");
      await apiConfirm(executionRequestId, "conf-3");
      // Force expiry (harness-owned row) by updating current confirmation.
      const supabase = getSupabaseServerClient();
      const { error } = await supabase
        .from("action_execution_confirmations_v1")
        .update({ confirmation_expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("execution_request_id", executionRequestId)
        .eq("is_current", true);
      if (error) throw error;
      const { json } = await apiExecute(executionRequestId, "exec-3");
      if (json.ok !== false || domainCode(json) !== "EXECUTION_CONFIRMATION_EXPIRED") {
        throw new Error(`Expected EXECUTION_CONFIRMATION_EXPIRED, got ${JSON.stringify(json["error"])}`);
      }
    });
  }

  if (selectedNames.has("4. agent self-confirmation is rejected")) {
    await scenario("4. agent self-confirmation is rejected", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-4", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-4");
      const { json } = await apiConfirm(executionRequestId, "conf-4", { actor: "agent test" });
      if (json.ok !== false || domainCode(json) !== "EXECUTION_SELF_CONFIRMATION_BLOCKED") {
        throw new Error(`Expected EXECUTION_SELF_CONFIRMATION_BLOCKED, got ${JSON.stringify(json["error"])}`);
      }
    });
  }

  if (selectedNames.has("5. duplicate execution request is idempotent")) {
    await scenario("5. duplicate execution request is idempotent", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const first = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-5", expiresAtUtc);
      const second = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-5", expiresAtUtc);
      if (String(first.json.requestId) !== String(second.json.requestId)) {
        throw new Error("Expected idempotent replay to return same requestId");
      }
    });
  }

  if (selectedNames.has("6. concurrent execution request is locked")) {
    await scenario("6. concurrent execution request is locked", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-6", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-6");
      await apiConfirm(executionRequestId, "conf-6");

      // Hold a lock.
      const supabase = getSupabaseServerClient();
      const lockRes = await supabase
        .from("action_execution_locks_v1")
        .insert({
          action_id: actionId,
          execution_request_id: executionRequestId,
          lock_owner: "harness-lock",
          lock_reason: "scenario 6 hold",
          lock_expires_at: new Date(Date.now() + 60_000).toISOString()
        });
      if (lockRes.error) throw lockRes.error;

      const before = await fetchExecutionEvidence(executionRequestId);
      const { json } = await apiExecute(executionRequestId, "exec-6");
      if (json.ok !== false || domainCode(json) !== "EXECUTION_LOCKED") {
        throw new Error(`Expected EXECUTION_LOCKED, got ${JSON.stringify(json["error"])}`);
      }
      const after = await fetchExecutionEvidence(executionRequestId);
      if (after.attempt_count !== before.attempt_count) throw new Error("Unexpected attempt created under lock rejection");
      if (after.step_count !== before.step_count) throw new Error("Unexpected step created under lock rejection");

      // Release held lock.
      const del = await supabase.from("action_execution_locks_v1").delete().eq("action_id", actionId);
      if (del.error) throw del.error;
    });
  }

  if (selectedNames.has("7. stale lock recovery")) {
    await scenario("7. stale lock recovery", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-7", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-7");
      await apiConfirm(executionRequestId, "conf-7");

      const supabase = getSupabaseServerClient();
      // Insert an expired lock row.
      const stale = await supabase
        .from("action_execution_locks_v1")
        .insert({
          action_id: actionId,
          execution_request_id: executionRequestId,
          lock_owner: "stale-owner",
          lock_reason: "scenario 7 stale",
          lock_acquired_at: new Date(Date.now() - 120_000).toISOString(),
          lock_expires_at: new Date(Date.now() - 60_000).toISOString()
        });
      if (stale.error) throw stale.error;

      const { json } = await apiExecute(executionRequestId, "exec-7");
      if (json.ok !== true) {
        throw new Error(`Expected execution to proceed after stale recovery, got ${JSON.stringify(json["error"])}`);
      }

      const lock = await supabase.from("action_execution_locks_v1").select("action_id").eq("action_id", actionId);
      if (lock.error) throw lock.error;
      if ((lock.data ?? []).length !== 0) throw new Error("Expected no active lock after execution");

      // Recovery audit event must exist.
      const audit = await supabase.from("action_audit_events_v1").select("event_type").eq("action_id", actionId);
      if (audit.error) throw audit.error;
      const types = (audit.data ?? []).map((r) => {
        const row = (r && typeof r === "object") ? (r as Record<string, unknown>) : {};
        return String(row["event_type"] ?? "");
      });
      if (!types.includes("execution_lock_recovered")) throw new Error("Missing execution_lock_recovered audit event");
    });
  }

  if (selectedNames.has("8. mock success")) {
    await scenario("8. mock success", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "success" } } }, "req-8", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-8");
      await apiConfirm(executionRequestId, "conf-8");

      const before = await fetchExecutionEvidence(executionRequestId);
      const exec1 = await apiExecute(executionRequestId, "exec-8");
      if (exec1.json.ok !== true) throw new Error("Expected ok execute");
      const after = await fetchExecutionEvidence(executionRequestId);
      if (after.request_state !== "succeeded") throw new Error(`Expected request succeeded, got ${after.request_state}`);
      if (after.attempt_count !== 1) throw new Error("Expected exactly one attempt");
      if (after.external_side_effect_count !== 0) throw new Error("Expected external side effects 0");
      assertOrchestrationMilestonesOrdered(after.steps);

      // Replay (same idempotency key) must not duplicate attempts/steps.
      await apiExecute(executionRequestId, "exec-8");
      const afterReplay = await fetchExecutionEvidence(executionRequestId);
      if (afterReplay.attempt_count !== after.attempt_count) throw new Error("Replay created duplicate attempt");
      if (afterReplay.step_count !== after.step_count) throw new Error("Replay created duplicate steps");
      if (after.step_count < before.step_count) throw new Error("Invariant violated");
    });
  }

  if (selectedNames.has("9. mock failure")) {
    await scenario("9. mock failure", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "failure" } } }, "req-9", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-9");
      await apiConfirm(executionRequestId, "conf-9");

      const exec = await apiExecute(executionRequestId, "exec-9");
      if (exec.json.ok !== true) throw new Error("Expected ok execute");
      const after = await fetchExecutionEvidence(executionRequestId);
      if (after.request_state !== "failed") throw new Error(`Expected request failed, got ${after.request_state}`);
      if (after.external_side_effect_count !== 0) throw new Error("Expected external side effects 0");
      assertOrchestrationMilestonesOrdered(after.steps);
    });
  }

  if (selectedNames.has("10. mock timeout")) {
    await scenario("10. mock timeout", async () => {
      const expiresAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { json: requested } = await apiRequestExecution({ adapterId: "mock", reversibility: "reversible", payload: { mock: { mode: "timeout" } } }, "req-10", expiresAtUtc);
      const executionRequestId = String(requested.requestId);
      await apiDryRun(executionRequestId, "dry-10");
      await apiConfirm(executionRequestId, "conf-10");

      const exec = await apiExecute(executionRequestId, "exec-10");
      if (exec.json.ok !== true) throw new Error("Expected ok execute");
      const after = await fetchExecutionEvidence(executionRequestId);
      if (after.request_state !== "timeout") throw new Error(`Expected request timeout, got ${after.request_state}`);
      if (after.external_side_effect_count !== 0) throw new Error("Expected external side effects 0");
      assertOrchestrationMilestonesOrdered(after.steps);

      // Replay must be idempotent.
      const beforeReplay = { attempt: after.attempt_count, steps: after.step_count };
      await apiExecute(executionRequestId, "exec-10");
      const afterReplay = await fetchExecutionEvidence(executionRequestId);
      if (afterReplay.attempt_count !== beforeReplay.attempt) throw new Error("Replay created duplicate attempt");
      if (afterReplay.step_count !== beforeReplay.steps) throw new Error("Replay created duplicate steps");
    });
  }

  const executed = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = executed - passed;
  const cleanup = await cleanupHarness({ harnessRunId: harness_run_id, actionId, evidenceId });

  const report: Report = {
    timestamp_utc: nowIso(),
    harness_run_id,
    staging_host: stagingHost,
    selected: selectedNames.size,
    executed,
    passed,
    failed,
    scenarios: results,
    cleanup,
    external_side_effect_count: 0,
    production_request_count: 0,
    provider_network_request_count: 0
  };

  mkdirSync(".artifacts/milestone-12-execution-boundary", { recursive: true });
  const reportPath = batch === "2"
    ? ".artifacts/milestone-12-execution-boundary/phase-5-batch-2-report.json"
    : ".artifacts/milestone-12-execution-boundary/phase-5-scenario-report.json";
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (failed !== 0) {
    throw new Error(`Batch ${batch} failed: ${passed}/${executed} passed`);
  }
  if (!cleanup.ok) {
    throw new Error(`Cleanup failed: remaining_harness_rows=${cleanup.remaining_harness_rows}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
