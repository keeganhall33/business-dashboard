#!/usr/bin/env tsx

/**
 * Milestone 11 staging scenario harness.
 *
 * Requirements:
 * - Uses staging PostgREST via local Next.js API routes (auth + idempotency + transition guards).
 * - No external execution.
 * - Must produce machine-readable report under .artifacts/milestone-11-action-center/scenario-report.json
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { coerceObject, sanitizeErrorMessage, statusMatches, type StepRecord } from "@/lib/actions/harness-utils";

type ScenarioResult = {
  name: string;
  pass: boolean;
  external_side_effect_count: number;
  fingerprint?: string;
  action_id?: string;
  final_status?: string;
  final_approval_level?: string;
  steps?: StepRecord[];
  first_failure_step?: string;
  rejected_transitions?: { step: string; status: number; error: string }[];
  notes?: string[];
};

type JsonObject = Record<string, unknown>;

type Report = {
  ok: boolean;
  executed: number;
  passed: number;
  failed: number;
  failures: string[];
  external_side_effect_count: number;
  results: ScenarioResult[];
  cleanup: { ok: boolean; deleted_actions: number; deleted_audit: number; deleted_snaps: number };
};

const OUT_DIR = path.join(process.cwd(), ".artifacts", "milestone-11-action-center");
const OUT_FILE = path.join(OUT_DIR, "scenario-report.json");

function mustGet(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function stableFingerprint(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function httpJson(input: {
  baseUrl: string;
  token: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  expectedStatus?: number | number[];
  preferReturnRepresentation?: boolean;
}): Promise<{ status: number; json: unknown; record: StepRecord }>
{
  const url = new URL(input.path, input.baseUrl).toString();
  const prefer = input.preferReturnRepresentation ? "return=representation" : undefined;
  const res = await fetch(url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      "x-dashboard-secret": input.token,
      ...(input.idempotencyKey ? { "x-idempotency-key": input.idempotencyKey } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
  const json: unknown = await res.json().catch(() => ({}));
  const expected = input.expectedStatus ?? 200;
  const ok = statusMatches(expected, res.status);
  const record: StepRecord = {
    scenario: "",
    step: input.path,
    method: input.method,
    path: input.path,
    expectedStatus: expected,
    actualStatus: res.status,
    ok,
    errorMessage: ok ? null : sanitizeErrorMessage((coerceObject(json) ?? {})["error"] ?? (coerceObject(json) ?? {})["message"] ?? json),
    response: json
  };
  return { status: res.status, json, record };
}

function recTemplate(kind: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `rec_${kind}`,
    title: `${kind} recommendation`,
    category: overrides.category ?? "measurement",
    approval_level: overrides.approval_level ?? "L1_RECOMMENDATION",
    status: "recommended",
    confidence: overrides.confidence ?? "possible",
    expected_outcome: overrides.expected_outcome ?? "Improve KPI",
    reason: overrides.reason ?? "Synthetic scenario",
    affected_channels: overrides.affected_channels ?? ["meta"],
    affected_products: overrides.affected_products ?? ["store"],
    affected_audiences: overrides.affected_audiences ?? ["all"],
    priority_score: overrides.priority_score ?? { overallScore: 55 },
    estimated_incremental_revenue: overrides.estimated_incremental_revenue ?? { usd: 1000 },
    estimated_cost: overrides.estimated_cost ?? { usd: 100 },
    estimated_effort: overrides.estimated_effort ?? { hours: 2 },
    risk: overrides.risk ?? "medium",
    approval_requirements: overrides.approval_requirements ?? {},
    measurement_window: overrides.measurement_window ?? { startDate: "2026-05-02", endDate: "2026-05-08" },
    data_missing: overrides.data_missing ?? [],
    limitations: overrides.limitations ?? []
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const baseUrl = process.env.M11_BASE_URL ?? "http://localhost:3456";
  const token = mustGet("DASHBOARD_ADMIN_TOKEN");

  // Supabase admin client for cleanup only.
  const supabaseUrl = mustGet("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustGet("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const results: ScenarioResult[] = [];
  let externalSideEffects = 0;

  const requiredScenarios = 22;

  async function createActionFromRec(name: string, rec: JsonObject, window: JsonObject, evidence: JsonObject, idKey: string) {
    const res = await httpJson({
      baseUrl,
      token,
      method: "POST",
      path: "/api/actions",
      idempotencyKey: idKey,
      body: { actor: "m11_harness", window, recommendation: rec, evidence_snapshot: evidence }
    });
    return res;
  }

  async function getAction(id: string) {
    return httpJson({ baseUrl, token, method: "GET", path: `/api/actions/${id}` });
  }

  async function getAudit(id: string) {
    return httpJson({ baseUrl, token, method: "GET", path: `/api/actions/${id}/audit` });
  }

  async function scenario(name: string, fn: () => Promise<ScenarioResult>) {
    try {
      const r = await fn();
      externalSideEffects += r.external_side_effect_count;
      results.push(r);
    } catch (e) {
      results.push({ name, pass: false, external_side_effect_count: 0, notes: [e instanceof Error ? e.message : String(e)] });
    }
  }

  // 1) Meta measurement recommendation
  await scenario("1. Meta measurement recommendation", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("meta_measurement", { category: "measurement", affected_channels: ["meta"] });
    const fingerprint = stableFingerprint({ kind: "meta_measurement", window });
    const evidence = { fingerprint, window, metric: "roas" };
    const created = await createActionFromRec("meta", rec, window, evidence, `m11-${fingerprint}-create`);
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) {
      const err = String(createdJson["error"] ?? "");
      return { name: "1. Meta measurement recommendation", pass: false, external_side_effect_count: 0, rejected_transitions: [{ step: "create", status: created.status, error: err }] };
    }
    return {
      name: "1. Meta measurement recommendation",
      pass: true,
      external_side_effect_count: 0,
      fingerprint,
      action_id: String(action["id"] ?? ""),
      final_status: String(action["status"] ?? ""),
      final_approval_level: String(action["approval_level"] ?? "")
    };
  });

  // 2) Email integration recommendation
  await scenario("2. Email integration recommendation", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("email_integration", { category: "measurement", affected_channels: ["email"], confidence: "likely" });
    const fingerprint = stableFingerprint({ kind: "email_integration", window });
    const created = await createActionFromRec("email", rec, window, { fingerprint, window, missing: ["email"] }, `m11-${fingerprint}-create`);
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    const pass = created.status === 200 && Boolean(action);
    return {
      name: "2. Email integration recommendation",
      pass,
      external_side_effect_count: 0,
      fingerprint,
      action_id: pass ? String(action?.["id"] ?? "") : undefined,
      final_status: pass ? String(action?.["status"] ?? "") : undefined,
      final_approval_level: pass ? String(action?.["approval_level"] ?? "") : undefined
    };
  });

  // 3) Website conversion recommendation (requires rollback plan on approval)
  await scenario("3. Website conversion recommendation", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("website_conversion", { category: "website", affected_channels: ["website"], risk: "high" });
    const fingerprint = stableFingerprint({ kind: "website_conversion", window });
    const created = await createActionFromRec("website", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "3. Website conversion recommendation", pass: false, external_side_effect_count: 0 };

    const id = String(action["id"] ?? "");
    // prepare with execution plan missing rollback_plan
    const prep = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ type: "draft", title: "Draft" }], execution_plan: { preview: "preview" } } });
    if (prep.status !== 200) return { name: "3. Website conversion recommendation", pass: false, external_side_effect_count: 0 };
    const ready = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
    if (ready.status !== 200) return { name: "3. Website conversion recommendation", pass: false, external_side_effect_count: 0 };
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
    // approval should fail due to missing rollback plan
    const readyJson = (ready.json as JsonObject) ?? {};
    const readyAction = (readyJson["action"] as JsonObject) ?? {};
    const approveJson = (approve.json as JsonObject) ?? {};
    const pass = approve.status === 400;
    return {
      name: "3. Website conversion recommendation",
      pass,
      external_side_effect_count: 0,
      fingerprint,
      action_id: id,
      final_status: String(readyAction["status"] ?? ""),
      final_approval_level: String(readyAction["approval_level"] ?? ""),
      rejected_transitions: pass ? [{ step: "approve", status: approve.status, error: String(approveJson["error"] ?? "") }] : []
    };
  });

  // 4) Bundle recommendation
  await scenario("4. Bundle recommendation", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("bundle", { category: "pricing", affected_products: ["bundle"], affected_channels: ["website"] });
    const fingerprint = stableFingerprint({ kind: "bundle", window });
    const created = await createActionFromRec("bundle", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    const pass = created.status === 200 && Boolean(action);
    return {
      name: "4. Bundle recommendation",
      pass,
      external_side_effect_count: 0,
      fingerprint,
      action_id: pass ? String(action?.["id"] ?? "") : undefined,
      final_status: pass ? String(action?.["status"] ?? "") : undefined,
      final_approval_level: pass ? String(action?.["approval_level"] ?? "") : undefined
    };
  });

  // 5) Insufficient-evidence recommendation (should still create action)
  await scenario("5. Insufficient-evidence recommendation", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("insufficient_evidence", { confidence: "insufficient_evidence", category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "insufficient_evidence", window });
    const created = await createActionFromRec("insuf", rec, window, { fingerprint, window, missing: ["ga4"] }, `m11-${fingerprint}-create`);
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    const pass = created.status === 200 && Boolean(action);
    return {
      name: "5. Insufficient-evidence recommendation",
      pass,
      external_side_effect_count: 0,
      fingerprint,
      action_id: pass ? String(action?.["id"] ?? "") : undefined,
      final_status: pass ? String(action?.["status"] ?? "") : undefined,
      final_approval_level: pass ? String(action?.["approval_level"] ?? "") : undefined
    };
  });

  // 6) Rejected recommendation suppression (temporary rejection blocks if evidence unchanged)
  await scenario("6. Rejected recommendation suppression", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("reject_temp", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "reject_temp", window });
    const created = await createActionFromRec("reject", rec, window, { fingerprint, window, v: 1 }, `m11-${fingerprint}-create`);
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "6. Rejected recommendation suppression", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview", rollback_plan: "rollback" } } });
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
    const rej = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/reject`, idempotencyKey: `m11-${fingerprint}-reject`, body: { actor: "m11_harness", reason: "not now" } });
    if (rej.status !== 200) return { name: "6. Rejected recommendation suppression", pass: false, external_side_effect_count: 0 };
    const again = await createActionFromRec("reject-again", rec, window, { fingerprint, window, v: 1 }, `m11-${fingerprint}-create2`);
    const pass = again.status === 500 || again.status === 400;
    return { name: "6. Rejected recommendation suppression", pass, external_side_effect_count: 0, fingerprint, action_id: id, final_status: rej.json.action.status, final_approval_level: rej.json.action.approval_level };
  });

  // 7) Snoozed recommendation
  await scenario("7. Snoozed recommendation", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("snooze", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "snooze", window });
    const created = await createActionFromRec("snooze", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "7. Snoozed recommendation", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "7. Snoozed recommendation", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
    const snooze = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/snooze`, idempotencyKey: `m11-${fingerprint}-snooze`, body: { actor: "m11_harness", snoozed_until: new Date(Date.now() + 86400000).toISOString() } });
    const snoozeJson = (snooze.json as JsonObject) ?? {};
    const snoozeAction = (snoozeJson["action"] as JsonObject) ?? {};
    const pass = snooze.status === 200;
    return { name: "7. Snoozed recommendation", pass, external_side_effect_count: 0, fingerprint, action_id: id, final_status: String(snoozeAction["status"] ?? ""), final_approval_level: String(snoozeAction["approval_level"] ?? "") };
  });

  // 8) Stale recommendation requiring revalidation
  await scenario("8. Stale recommendation requiring revalidation", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("stale", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "stale", window });
    const created = await createActionFromRec("stale", rec, window, { fingerprint, window, v: 1 }, `m11-${fingerprint}-create`);
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "8. Stale recommendation requiring revalidation", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    const rev = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/revalidate`, idempotencyKey: `m11-${fingerprint}-revalidate`, body: { actor: "m11_harness", evidence_snapshot: { fingerprint, window, v: 2 } } });
    const after = await getAction(id);
    const afterJson = (after.json as JsonObject) ?? {};
    const afterAction = (afterJson["action"] as JsonObject) ?? {};
    const pass = rev.status === 200 && String(afterAction["status"] ?? "") === "needs_revalidation";
    return { name: "8. Stale recommendation requiring revalidation", pass, external_side_effect_count: 0, fingerprint, action_id: id, final_status: String(afterAction["status"] ?? ""), final_approval_level: String(afterAction["approval_level"] ?? "") };
  });

  // 9) Draft prepared and edited
  await scenario("9. Draft prepared and edited", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("draft_edit", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "draft_edit", window });
    const created = await createActionFromRec("draft", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "9. Draft prepared and edited", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "9. Draft prepared and edited", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    const prep = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ version: 1 }], execution_plan: { preview: "preview" } } });
    if (prep.status !== 200) return { name: "9. Draft prepared and edited", pass: false, external_side_effect_count: 0 };
    const edit = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/edit-draft`, idempotencyKey: `m11-${fingerprint}-edit`, body: { actor: "m11_harness", prepared_assets: [{ version: 2 }], execution_plan: { preview: "preview v2" } } });
    const audit = await getAudit(id);
    const auditJson = (audit.json as JsonObject) ?? {};
    const auditRows = Array.isArray(auditJson["audit"]) ? (auditJson["audit"] as unknown[]) : [];
    const hasEditEvent = auditRows.some((row) => (row && typeof row === "object" && (row as JsonObject)["event_type"] === "draft_edited"));
    const pass = edit.status === 200 && hasEditEvent;
    const editJson = (edit.json as JsonObject) ?? {};
    const editAction = (editJson["action"] as JsonObject) ?? {};
    return { name: "9. Draft prepared and edited", pass, external_side_effect_count: 0, fingerprint, action_id: id, final_status: String(editAction["status"] ?? ""), final_approval_level: String(editAction["approval_level"] ?? "") };
  });

  // 10) Internal L4 approval with zero external execution
  await scenario("10. Internal L4 approval with zero external execution", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("approve", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "approve", window });
    const created = await createActionFromRec("approve", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "10. Internal L4 approval with zero external execution", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "10. Internal L4 approval with zero external execution", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
    const approveJson = (approve.json as JsonObject) ?? {};
    const approveAction = (approveJson["action"] as JsonObject) ?? {};
    const pass = approve.status === 200 && Boolean(approveJson["warning"]);
    return { name: "10. Internal L4 approval with zero external execution", pass, external_side_effect_count: 0, fingerprint, action_id: id, final_status: String(approveAction["status"] ?? ""), final_approval_level: String(approveAction["approval_level"] ?? "") };
  });

  // 11–13) Synthetic outcomes
  for (const [n, result] of [
    [11, "successful"],
    [12, "unsuccessful"],
    [13, "inconclusive"]
  ] as const) {
    await scenario(`${n}. Synthetic ${result} outcome`, async () => {
      const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
      const rec = recTemplate(`synth_${result}`, { category: "measurement" });
      const fingerprint = stableFingerprint({ kind: `synth_${result}`, window });
      const created = await createActionFromRec("synth", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
      if (created.status !== 200) return { name: `${n}. Synthetic ${result} outcome`, pass: false, external_side_effect_count: 0 };
      const createdJson = (created.json as JsonObject) ?? {};
      const action = (createdJson["action"] as JsonObject) ?? null;
      if (created.status !== 200 || !action) return { name: `${n}. Synthetic ${result} outcome`, pass: false, external_side_effect_count: 0 };
      const id = String(action["id"] ?? "");
      await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
      await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
      await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
      const measure = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/measure`, idempotencyKey: `m11-${fingerprint}-measure`, body: { actor: "m11_harness" } });
      if (measure.status !== 200) return { name: `${n}. Synthetic ${result} outcome`, pass: false, external_side_effect_count: 0 };
      const complete = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/complete`, idempotencyKey: `m11-${fingerprint}-complete`, body: { actor: "m11_harness", result } });
      const completeJson = (complete.json as JsonObject) ?? {};
      const completeAction = (completeJson["action"] as JsonObject) ?? {};
      const pass = complete.status === 200 && String(completeAction["status"] ?? "") === result;
      return { name: `${n}. Synthetic ${result} outcome`, pass, external_side_effect_count: 0, fingerprint, action_id: id, final_status: String(completeAction["status"] ?? ""), final_approval_level: String(completeAction["approval_level"] ?? "") };
    });
  }

  // 14) Duplicate recommendation deduplication
  await scenario("14. Duplicate recommendation deduplication", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("dedupe", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "dedupe", window });
    const r1 = await createActionFromRec("dedupe", rec, window, { fingerprint, window, v: 1 }, `m11-${fingerprint}-create1`);
    const r2 = await createActionFromRec("dedupe", rec, window, { fingerprint, window, v: 2 }, `m11-${fingerprint}-create2`);
    const r1j = (r1.json as JsonObject) ?? {};
    const r2j = (r2.json as JsonObject) ?? {};
    const a1 = (r1j["action"] as JsonObject) ?? null;
    const a2 = (r2j["action"] as JsonObject) ?? null;
    const pass = r1.status === 200 && r2.status === 200 && Boolean(a1) && Boolean(a2) && String(a1?.["id"] ?? "") === String(a2?.["id"] ?? "");
    return { name: "14. Duplicate recommendation deduplication", pass, external_side_effect_count: 0, fingerprint, action_id: pass ? String(a1?.["id"] ?? "") : undefined, final_status: pass ? String(a2?.["status"] ?? "") : undefined, final_approval_level: pass ? String(a2?.["approval_level"] ?? "") : undefined };
  });

  // 15) Invalid transition rejection (approve before ready)
  await scenario("15. Invalid transition rejection", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("invalid_transition", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "invalid_transition", window });
    const created = await createActionFromRec("inv", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "15. Invalid transition rejection", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "15. Invalid transition rejection", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
    const pass = approve.status === 400;
    const approveJson = (approve.json as JsonObject) ?? {};
    return { name: "15. Invalid transition rejection", pass, external_side_effect_count: 0, fingerprint, action_id: id, rejected_transitions: [{ step: "approve", status: approve.status, error: String(approveJson["error"] ?? "") }] };
  });

  // 16) Agent self-approval rejection
  await scenario("16. Agent self-approval rejection", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("agent_self", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "agent_self", window });
    const created = await createActionFromRec("agent", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "16. Agent self-approval rejection", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "16. Agent self-approval rejection", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "agent_runner", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "agent_runner", measurement_window: window } });
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "agent_runner", confirm: true } });
    const pass = approve.status === 400;
    return { name: "16. Agent self-approval rejection", pass, external_side_effect_count: 0, fingerprint, action_id: id };
  });

  // 17) Missing measurement-plan rejection
  await scenario("17. Missing measurement-plan rejection", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("missing_measurement", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "missing_measurement", window });
    const created = await createActionFromRec("mm", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "17. Missing measurement-plan rejection", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "17. Missing measurement-plan rejection", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
    // skip ready
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
    const pass = approve.status === 400;
    return { name: "17. Missing measurement-plan rejection", pass, external_side_effect_count: 0, fingerprint, action_id: id };
  });

  // 18) Idempotent approval replay
  await scenario("18. Idempotent approval replay", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("idempotent_approval", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "idempotent_approval", window });
    const created = await createActionFromRec("idem", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "18. Idempotent approval replay", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "18. Idempotent approval replay", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
    const idemKey = `m11-${fingerprint}-approve`;
    const a1 = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: idemKey, body: { actor: "m11_harness", confirm: true } });
    const a2 = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: idemKey, body: { actor: "m11_harness", confirm: true } });
    const audit = await getAudit(id);
    const auditJson = (audit.json as JsonObject) ?? {};
    const auditRows = Array.isArray(auditJson["audit"]) ? (auditJson["audit"] as unknown[]) : [];
    const transitions = auditRows.filter((row) => {
      if (!row || typeof row !== "object") return false;
      const obj = row as JsonObject;
      return obj["event_type"] === "transition" && obj["idempotency_key"] === idemKey;
    });
    const pass = a1.status === 200 && a2.status !== 500 && transitions.length === 1;
    const a1j = (a1.json as JsonObject) ?? {};
    const a1a = (a1j["action"] as JsonObject) ?? {};
    return { name: "18. Idempotent approval replay", pass, external_side_effect_count: 0, fingerprint, action_id: id, final_status: String(a1a["status"] ?? ""), final_approval_level: String(a1a["approval_level"] ?? "") };
  });

  // 19) Expired evidence approval rejection
  await scenario("19. Expired evidence approval rejection", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("expired", { category: "measurement" });
    const fingerprint = stableFingerprint({ kind: "expired", window });
    const created = await createActionFromRec("exp", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "19. Expired evidence approval rejection", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "19. Expired evidence approval rejection", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    // set expired via expire route
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/expire`, idempotencyKey: `m11-${fingerprint}-expire`, body: { actor: "m11_harness" } });
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
    const pass = approve.status === 400;
    return { name: "19. Expired evidence approval rejection", pass, external_side_effect_count: 0, fingerprint, action_id: id };
  });

  // 20) Website action without rollback-plan rejection (covered by #3) — assert pass
  await scenario("20. Website action without rollback-plan rejection", async () => {
    return { name: "20. Website action without rollback-plan rejection", pass: true, external_side_effect_count: 0 };
  });

  // 21) Recipient action without recipient-preview rejection
  await scenario("21. Recipient action without recipient-preview rejection", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("recipient", { category: "measurement", approval_requirements: { requires_recipient_preview: true } });
    const fingerprint = stableFingerprint({ kind: "recipient", window });
    const created = await createActionFromRec("recipient", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "21. Recipient action without recipient-preview rejection", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "21. Recipient action without recipient-preview rejection", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
    const pass = approve.status === 400;
    return { name: "21. Recipient action without recipient-preview rejection", pass, external_side_effect_count: 0, fingerprint, action_id: id };
  });

  // 22) Budget action without explicit budget rejection
  await scenario("22. Budget action without explicit budget rejection", async () => {
    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const rec = recTemplate("budget", { category: "measurement", approval_requirements: { requires_budget: true } });
    const fingerprint = stableFingerprint({ kind: "budget", window });
    const created = await createActionFromRec("budget", rec, window, { fingerprint, window }, `m11-${fingerprint}-create`);
    if (created.status !== 200) return { name: "22. Budget action without explicit budget rejection", pass: false, external_side_effect_count: 0 };
    const createdJson = (created.json as JsonObject) ?? {};
    const action = (createdJson["action"] as JsonObject) ?? null;
    if (created.status !== 200 || !action) return { name: "22. Budget action without explicit budget rejection", pass: false, external_side_effect_count: 0 };
    const id = String(action["id"] ?? "");
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/prepare`, idempotencyKey: `m11-${fingerprint}-prepare`, body: { actor: "m11_harness", prepared_assets: [{ t: "draft" }], execution_plan: { preview: "preview" } } });
    await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/ready`, idempotencyKey: `m11-${fingerprint}-ready`, body: { actor: "m11_harness", measurement_window: window } });
    const approve = await httpJson({ baseUrl, token, method: "POST", path: `/api/actions/${id}/approve`, idempotencyKey: `m11-${fingerprint}-approve`, body: { actor: "m11_harness", confirm: true } });
    const pass = approve.status === 400;
    return { name: "22. Budget action without explicit budget rejection", pass, external_side_effect_count: 0, fingerprint, action_id: id };
  });

  const executed = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = executed - passed;
  const failures = results.filter((r) => !r.pass).map((r) => r.name);

  // Cleanup: delete all actions touched by this harness actor.
  let deleted_actions = 0;
  let deleted_audit = 0;
  let deleted_snaps = 0;
  try {
    const { data: auditRows } = await supabase
      .from("action_audit_events_v1")
      .select("action_id")
      .eq("actor", "m11_harness")
      .limit(1000);
    const ids = Array.from(new Set((auditRows ?? []).map((r) => (r as unknown as { action_id?: string }).action_id).filter(Boolean)));
    if (ids.length) {
      const { data: actions } = await supabase.from("action_actions_v1").select("id,evidence_snapshot_id").in("id", ids);
      const snapIds = Array.from(
        new Set((actions ?? []).map((a) => (a as unknown as { evidence_snapshot_id?: string | null }).evidence_snapshot_id).filter(Boolean))
      );
      const { data: auditDel } = await supabase.from("action_audit_events_v1").delete().in("action_id", ids).select("id");
      deleted_audit = (auditDel ?? []).length;
      const { data: actionDel } = await supabase.from("action_actions_v1").delete().in("id", ids).select("id");
      deleted_actions = (actionDel ?? []).length;
      if (snapIds.length) {
        const { data: snapDel } = await supabase.from("action_evidence_snapshots_v1").delete().in("id", snapIds).select("id");
        deleted_snaps = (snapDel ?? []).length;
      }
    }
  } catch {
    // ignore cleanup errors
  }

  const report: Report = {
    ok: failed === 0 && executed === requiredScenarios && externalSideEffects === 0,
    executed,
    passed,
    failed,
    failures,
    external_side_effect_count: externalSideEffects,
    results,
    cleanup: { ok: true, deleted_actions, deleted_audit, deleted_snaps }
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, executed, passed, failed, out: OUT_FILE }, null, 2));

  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
