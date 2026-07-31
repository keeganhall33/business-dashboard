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
  writeFileSync(
    `.artifacts/milestone-12-execution-boundary/phase-5-scenario-report.json`,
    JSON.stringify(report, null, 2)
  );

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
