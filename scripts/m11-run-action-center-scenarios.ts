#!/usr/bin/env tsx

/**
 * Milestone 11 staging scenario harness.
 *
 * Phases:
 * - A: scenario 1 only
 * - B: representative subset
 * - C: full 22-scenario suite
 *
 * Safety:
 * - Calls local Next.js API routes only.
 * - Tags every created row with harness_run_id in recommendation_id for deterministic cleanup.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  coerceObject,
  sanitizeErrorMessage,
  statusMatches,
  type StepRecord
} from "@/lib/actions/harness-utils";

type JsonObject = Record<string, unknown>;

type CleanupReport = {
  ok: boolean;
  harness_run_id: string;
  identified: Record<string, number>;
  deleted: Record<string, number>;
  remaining: Record<string, number>;
  remaining_harness_rows: number;
};

type ScenarioTrace = {
  name: string;
  pass: boolean;
  external_side_effect_count: number;
  harness_run_id: string;
  steps: StepRecord[];
  first_failure_step: string | null;
  first_failure_status: number | null;
  first_failure_error: string | null;
  action_id: string | null;
  final_status: string | null;
  final_approval_level: string | null;
};

type Phase = "A" | "B" | "C";

type PhaseReport = {
  ok: boolean;
  phase: Phase;
  harness_run_id: string;
  generated_at_utc: string;
  staging_host: string;
  production_request_count: number;
  scenarios_selected: number;
  scenarios_executed: number;
  scenarios_passed: number;
  scenarios_failed: number;
  scenarios_skipped: number;
  failures: string[];
  external_side_effect_count: number;
  traces: ScenarioTrace[];
  cleanup: CleanupReport;
  no_production_requests: boolean;
};

const OUT_DIR = path.join(process.cwd(), ".artifacts", "milestone-11-action-center");

export type ScenarioRunnerContext = {
  baseUrl: string;
  token: string;
  harness_run_id: string;
  scenarioName: string;
  cleanupPreferenceFingerprints?: string[];
};

function mustGet(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function nowUtcIso() {
  return new Date().toISOString();
}

function randomSuffix(len = 6) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function stableHash(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function sanitizeResponseBody(input: { contentType: string | null; json: unknown; text: string }) {
  if ((input.contentType ?? "").includes("application/json")) {
    const obj = coerceObject(input.json);
    if (!obj) return input.json;
    return obj;
  }
  return input.text.slice(0, 400);
}

async function httpStep(input: {
  baseUrl: string;
  token: string;
  scenario: string;
  step: string;
  method: "GET" | "POST";
  path: string;
  expectedStatus: number | number[];
  body?: unknown;
  idempotencyKey?: string;
  preferReturnRepresentation?: boolean;
}): Promise<{ step: StepRecord; json: unknown; contentType: string | null }>
{
  const url = new URL(input.path, input.baseUrl).toString();
  const res = await fetch(url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      "x-dashboard-secret": input.token,
      ...(input.idempotencyKey ? { "x-idempotency-key": input.idempotencyKey } : {}),
      ...(input.preferReturnRepresentation ? { Prefer: "return=representation" } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });

  const contentType = res.headers.get("content-type");
  const text = await res.text();
  let json: unknown = null;
  if ((contentType ?? "").includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { parse_error: true };
    }
  }

  const ok = statusMatches(input.expectedStatus, res.status);
  const sanitizedBody = sanitizeResponseBody({ contentType, json, text });

  const step: StepRecord = {
    scenario: input.scenario,
    step: input.step,
    method: input.method,
    path: input.path,
    expectedStatus: input.expectedStatus,
    actualStatus: res.status,
    ok,
    errorMessage: ok ? null : sanitizeErrorMessage(coerceObject(json)?.error ?? coerceObject(json)?.message ?? sanitizedBody),
    response: {
      contentType,
      body: sanitizedBody
    }
  };

  return { step, json, contentType };
}

function getActionFromEnvelope(json: unknown): JsonObject | null {
  const obj = coerceObject(json);
  if (!obj) return null;
  if (obj["ok"] !== true) return null;
  return coerceObject(obj["action"]);
}

function requireActionFields(action: JsonObject, fields: string[]): string | null {
  for (const f of fields) {
    if (!(f in action)) return `Missing action.${f}`;
  }
  return null;
}

async function cleanupHarnessRun(input: {
  supabaseUrl: string;
  serviceKey: string;
  harness_run_id: string;
  preferenceFingerprints?: string[];
}): Promise<CleanupReport> {
  const supabase = createClient(input.supabaseUrl, input.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const recPrefix = `m11_harness:${input.harness_run_id}:`;

  const { data: actions, error: actionsErr } = await supabase
    .from("action_actions_v1")
    .select("id,evidence_snapshot_id")
    .like("recommendation_id", `${recPrefix}%`)
    .limit(5000);
  if (actionsErr) throw actionsErr;

  const actionIds = (actions ?? []).map((a) => a.id);
  const snapIds = Array.from(new Set((actions ?? []).map((a) => a.evidence_snapshot_id).filter(Boolean)));

  const identified = {
    synthetic_outcomes: actionIds.length,
    comments: actionIds.length,
    audit_events: actionIds.length,
    measurement_plans: actionIds.length,
    actions: actionIds.length,
    evidence_snapshots: snapIds.length,
    preferences: 0
  };

  const deleted: Record<string, number> = {
    synthetic_outcomes: 0,
    comments: 0,
    audit_events: 0,
    measurement_plans: 0,
    actions: 0,
    evidence_snapshots: 0,
    preferences: 0
  };

  if (actionIds.length) {
    const outcomes = await supabase.from("action_synthetic_outcomes_v1").delete().in("action_id", actionIds).select("id");
    if (outcomes.error) throw outcomes.error;
    deleted.synthetic_outcomes = (outcomes.data ?? []).length;

    const comments = await supabase.from("action_comments_v1").delete().in("action_id", actionIds).select("id");
    if (comments.error) throw comments.error;
    deleted.comments = (comments.data ?? []).length;

    const audits = await supabase.from("action_audit_events_v1").delete().in("action_id", actionIds).select("id");
    if (audits.error) throw audits.error;
    deleted.audit_events = (audits.data ?? []).length;

    const plans = await supabase.from("action_measurement_plans_v1").delete().in("action_id", actionIds).select("id");
    if (plans.error) throw plans.error;
    deleted.measurement_plans = (plans.data ?? []).length;

    const actionDel = await supabase.from("action_actions_v1").delete().in("id", actionIds).select("id");
    if (actionDel.error) throw actionDel.error;
    deleted.actions = (actionDel.data ?? []).length;
  }

  if (snapIds.length) {
    const snapDel = await supabase.from("action_evidence_snapshots_v1").delete().in("id", snapIds).select("id");
    if (snapDel.error) throw snapDel.error;
    deleted.evidence_snapshots = (snapDel.data ?? []).length;
  }

  const prefFingerprints = Array.from(new Set(input.preferenceFingerprints ?? [])).filter(Boolean);
  if (prefFingerprints.length) {
    const prefDel = await supabase.from("action_preferences_v1").delete().in("fingerprint", prefFingerprints).select("fingerprint");
    if (prefDel.error) throw prefDel.error;
    deleted.preferences = (prefDel.data ?? []).length;
  }

  const remainingActions = await supabase
    .from("action_actions_v1")
    .select("id", { count: "exact", head: true })
    .like("recommendation_id", `${recPrefix}%`);
  if (remainingActions.error) throw remainingActions.error;
  const remainingCount = remainingActions.count ?? 0;

  const remaining = {
    actions: remainingCount
  };

  return {
    ok: remainingCount === 0,
    harness_run_id: input.harness_run_id,
    identified,
    deleted,
    remaining,
    remaining_harness_rows: remainingCount
  };
}

async function runScenarioCreateOnly(input: {
  baseUrl: string;
  token: string;
  harness_run_id: string;
  scenarioName: string;
  recSlug: string;
  title: string;
  category: string;
  channel: string;
  confidence?: string;
  window: { startDate: string; endDate: string };
  evidenceExtra?: JsonObject;
}): Promise<ScenarioTrace> {
  const steps: StepRecord[] = [];
  const recId = `m11_harness:${input.harness_run_id}:rec_${input.recSlug}`;
  const fingerprint = stableHash({ recId, window: input.window, harness_run_id: input.harness_run_id });

  const recommendation: JsonObject = {
    id: recId,
    title: input.title,
    category: input.category,
    approval_level: "L1_RECOMMENDATION",
    status: "recommended",
    confidence: input.confidence ?? "possible",
    expected_outcome: "Harness",
    reason: "Harness",
    affected_channels: [input.channel],
    affected_products: ["store"],
    affected_audiences: ["all"],
    priority_score: { overallScore: 55 },
    estimated_incremental_revenue: { usd: 1000 },
    estimated_cost: { usd: 0 },
    estimated_effort: { hours: 1 },
    risk: "medium",
    approval_requirements: {},
    measurement_window: input.window,
    data_missing: [],
    limitations: []
  };

  const evidence_snapshot: JsonObject = {
    harness_run_id: input.harness_run_id,
    fingerprint: `m11:${input.harness_run_id}:${fingerprint}`,
    window: input.window,
    ...(input.evidenceExtra ?? {})
  };

  const create = await httpStep({
    baseUrl: input.baseUrl,
    token: input.token,
    scenario: input.scenarioName,
    step: "create",
    method: "POST",
    path: "/api/actions",
    expectedStatus: 200,
    idempotencyKey: `${input.harness_run_id}:${input.recSlug}:create`,
    body: { actor: "m11_harness", window: input.window, recommendation, evidence_snapshot }
  });
  steps.push(create.step);

  if (!create.step.ok) {
    return {
      name: input.scenarioName,
      pass: false,
      external_side_effect_count: 0,
      harness_run_id: input.harness_run_id,
      steps,
      first_failure_step: "create",
      first_failure_status: create.step.actualStatus,
      first_failure_error: create.step.errorMessage,
      action_id: null,
      final_status: null,
      final_approval_level: null
    };
  }

  const action = getActionFromEnvelope(create.json);
  if (!action) {
    return {
      name: input.scenarioName,
      pass: false,
      external_side_effect_count: 0,
      harness_run_id: input.harness_run_id,
      steps,
      first_failure_step: "create.parse",
      first_failure_status: 200,
      first_failure_error: "Missing action envelope",
      action_id: null,
      final_status: null,
      final_approval_level: null
    };
  }

  const missing = requireActionFields(action, ["id", "status", "approval_level"]);
  if (missing) {
    return {
      name: input.scenarioName,
      pass: false,
      external_side_effect_count: 0,
      harness_run_id: input.harness_run_id,
      steps,
      first_failure_step: "create.validate",
      first_failure_status: 200,
      first_failure_error: missing,
      action_id: String(action["id"] ?? ""),
      final_status: String(action["status"] ?? ""),
      final_approval_level: String(action["approval_level"] ?? "")
    };
  }

  return {
    name: input.scenarioName,
    pass: true,
    external_side_effect_count: 0,
    harness_run_id: input.harness_run_id,
    steps,
    first_failure_step: null,
    first_failure_status: null,
    first_failure_error: null,
    action_id: String(action["id"] ?? ""),
    final_status: String(action["status"] ?? ""),
    final_approval_level: String(action["approval_level"] ?? "")
  };
}

async function createAction(input: {
  ctx: ScenarioRunnerContext;
  recSlug: string;
  title: string;
  category: string;
  channel: string;
  confidence?: string;
  window: { startDate: string; endDate: string };
  evidenceExtra?: JsonObject;
}): Promise<{ action: JsonObject; action_id: string; trace: ScenarioTrace } | { trace: ScenarioTrace }> {
  const trace = await runScenarioCreateOnly({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    harness_run_id: input.ctx.harness_run_id,
    scenarioName: input.ctx.scenarioName,
    recSlug: input.recSlug,
    title: input.title,
    category: input.category,
    channel: input.channel,
    confidence: input.confidence,
    window: input.window,
    evidenceExtra: input.evidenceExtra
  });

  // NOTE: runScenarioCreateOnly returns a pre-filled ScenarioTrace on failure.
  if (!trace.pass || !trace.action_id) return { trace };

  const firstResponse = coerceObject(trace.steps[0]?.response);
  const createEnvelope = firstResponse ? firstResponse["body"] : null;
  const action = coerceObject(coerceObject(createEnvelope)?.["action"]);
  if (!action) {
    return {
      trace: {
        ...trace,
        pass: false,
        first_failure_step: "create.parse",
        first_failure_error: "Missing action envelope"
      }
    };
  }

  return { action, action_id: trace.action_id, trace };
}

async function setSuppressionPreference(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  fingerprint: string;
  suppressed: boolean;
  reason: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "set_preference",
    method: "POST",
    path: "/api/actions/preferences",
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey,
    body: {
      fingerprint: input.fingerprint,
      suppressed: input.suppressed,
      reason: input.reason
    }
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Preference update failed") };
}

async function rejectAction(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "reject",
    method: "POST",
    path: `/api/actions/${input.actionId}/reject`,
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey,
    body: { actor: "ceo", reason: input.reason }
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Reject failed") };
}

async function snoozeAction(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  untilIso: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "snooze",
    method: "POST",
    path: `/api/actions/${input.actionId}/snooze`,
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey,
    body: { actor: "ceo", snoozed_until: input.untilIso }
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Snooze failed") };
}

async function unsnoozeAction(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "unsnooze",
    method: "POST",
    path: `/api/actions/${input.actionId}/unsnooze`,
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Unsnooze failed") };
}

async function prepareDraft(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  prepared_assets: unknown[];
  execution_plan: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "prepare",
    method: "POST",
    path: `/api/actions/${input.actionId}/prepare`,
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey,
    body: { actor: "ceo", prepared_assets: input.prepared_assets, execution_plan: input.execution_plan }
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Prepare failed") };
}

async function markReady(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  measurement_window: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "ready",
    method: "POST",
    path: `/api/actions/${input.actionId}/ready`,
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey,
    body: { actor: "ceo", measurement_window: input.measurement_window }
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Ready failed") };
}

async function editDraft(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  prepared_assets: unknown[];
  execution_plan: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "edit_draft",
    method: "POST",
    path: `/api/actions/${input.actionId}/edit-draft`,
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey,
    body: { actor: "ceo", prepared_assets: input.prepared_assets, execution_plan: input.execution_plan }
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Edit draft failed") };
}

async function fetchAuditEvents(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  stepName: string;
}): Promise<{ ok: boolean; audit: unknown[]; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: input.stepName,
    method: "GET",
    path: `/api/actions/${input.actionId}/audit`,
    expectedStatus: 200
  });
  input.steps.push(res.step);
  if (!res.step.ok) return { ok: false, audit: [], error: res.step.errorMessage ?? "Audit fetch failed" };
  const env = coerceObject(res.json);
  const audit = env && env["ok"] === true && Array.isArray(env["audit"]) ? (env["audit"] as unknown[]) : [];
  return { ok: true, audit, error: null };
}

async function revalidateEvidence(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  evidence_snapshot: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ ok: boolean; changed: boolean | null; newEvidenceSnapshotId: string | null; newHash: string | null; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: "revalidate",
    method: "POST",
    path: `/api/actions/${input.actionId}/revalidate`,
    expectedStatus: 200,
    idempotencyKey: input.idempotencyKey,
    body: { actor: "ceo", evidence_snapshot: input.evidence_snapshot }
  });
  input.steps.push(res.step);
  if (!res.step.ok) return { ok: false, changed: null, newEvidenceSnapshotId: null, newHash: null, error: res.step.errorMessage ?? "Revalidate failed" };
  const env = coerceObject(res.json);
  if (!env || env["ok"] !== true) return { ok: false, changed: null, newEvidenceSnapshotId: null, newHash: null, error: "Missing revalidate envelope" };
  return {
    ok: true,
    changed: Boolean(env["changed"]),
    newEvidenceSnapshotId: typeof env["newEvidenceSnapshotId"] === "string" ? (env["newEvidenceSnapshotId"] as string) : null,
    newHash: typeof env["newHash"] === "string" ? (env["newHash"] as string) : null,
    error: null
  };
}

async function fetchAction(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  stepName: string;
  expectedStatus: number | number[];
}): Promise<{ ok: boolean; action: JsonObject | null; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: input.stepName,
    method: "GET",
    path: `/api/actions/${input.actionId}`,
    expectedStatus: input.expectedStatus
  });
  input.steps.push(res.step);
  if (!res.step.ok) return { ok: false, action: null, error: res.step.errorMessage ?? "Fetch failed" };
  const env = coerceObject(res.json);
  const action = env && env["ok"] === true ? coerceObject(env["action"]) : null;
  if (!action) return { ok: false, action: null, error: "Missing action payload" };
  return { ok: true, action, error: null };
}

async function approveActionExpectedReject(input: {
  ctx: ScenarioRunnerContext;
  steps: StepRecord[];
  actionId: string;
  stepName: string;
  expectedStatus: number | number[];
  actor: string;
  confirm: boolean;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const res = await httpStep({
    baseUrl: input.ctx.baseUrl,
    token: input.ctx.token,
    scenario: input.ctx.scenarioName,
    step: input.stepName,
    method: "POST",
    path: `/api/actions/${input.actionId}/approve`,
    expectedStatus: input.expectedStatus,
    idempotencyKey: input.idempotencyKey,
    body: { actor: input.actor, confirm: input.confirm }
  });
  input.steps.push(res.step);
  return { ok: res.step.ok, error: res.step.ok ? null : (res.step.errorMessage ?? "Expected rejection did not match") };
}

export type ScenarioRunnerDef = {
  id: string;
  name: string;
  run: (ctx: ScenarioRunnerContext) => Promise<ScenarioTrace>;
};

export const SCENARIO_RUNNERS: ScenarioRunnerDef[] = [
  {
    id: "meta_measurement",
    name: "1. Meta measurement recommendation",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "meta_measurement",
        title: `M11 Harness (${ctx.harness_run_id}) — Meta measurement recommendation`,
        category: "measurement",
        channel: "meta",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { metric: "roas" }
      });
      return created.trace;
    }
  },
  {
    id: "email_integration",
    name: "2. Email integration recommendation",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "email_integration",
        title: `M11 Harness (${ctx.harness_run_id}) — Email integration recommendation`,
        category: "email",
        channel: "email",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { missing_source: "email" }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];
      const fetched = await fetchAction({
        ctx,
        steps,
        actionId: created.action_id,
        stepName: "fetch",
        expectedStatus: 200
      });
      if (!fetched.ok || !fetched.action) {
        return {
          ...created.trace,
          pass: false,
          steps,
          first_failure_step: "fetch",
          first_failure_status: steps.at(-1)?.actualStatus ?? null,
          first_failure_error: fetched.error
        };
      }

      const channel = String(fetched.action["channel"] ?? "");
      if (channel !== "email") {
        return {
          ...created.trace,
          pass: false,
          steps,
          first_failure_step: "fetch.assert_channel",
          first_failure_status: 200,
          first_failure_error: `Expected channel=email, got ${channel}`,
          final_status: String(fetched.action["status"] ?? ""),
          final_approval_level: String(fetched.action["approval_level"] ?? "")
        };
      }

      return {
        ...created.trace,
        pass: true,
        steps,
        final_status: String(fetched.action["status"] ?? ""),
        final_approval_level: String(fetched.action["approval_level"] ?? "")
      };
    }
  },
  {
    id: "website_conversion",
    name: "3. Website conversion recommendation",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "website_conversion",
        title: `M11 Harness (${ctx.harness_run_id}) — Website conversion recommendation`,
        category: "website",
        channel: "website",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: {
          website: {
            page_url: "/",
            hypothesis: "Improve hero CTA clarity",
            rollback_plan: "restore previous revision"
          }
        }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];
      const fetched = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch", expectedStatus: 200 });
      if (!fetched.ok || !fetched.action) {
        return {
          ...created.trace,
          pass: false,
          steps,
          first_failure_step: "fetch",
          first_failure_status: steps.at(-1)?.actualStatus ?? null,
          first_failure_error: fetched.error
        };
      }
      const category = String(fetched.action["category"] ?? "");
      const channel = String(fetched.action["channel"] ?? "");
      if (category !== "website" || channel !== "website") {
        return {
          ...created.trace,
          pass: false,
          steps,
          first_failure_step: "fetch.assert_website",
          first_failure_status: 200,
          first_failure_error: `Expected category/channel website, got ${category}/${channel}`,
          final_status: String(fetched.action["status"] ?? ""),
          final_approval_level: String(fetched.action["approval_level"] ?? "")
        };
      }
      return { ...created.trace, pass: true, steps, final_status: String(fetched.action["status"] ?? ""), final_approval_level: String(fetched.action["approval_level"] ?? "") };
    }
  },
  {
    id: "bundle",
    name: "4. Bundle recommendation",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "bundle",
        title: `M11 Harness (${ctx.harness_run_id}) — Bundle recommendation`,
        category: "bundle",
        channel: "store",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { bundle: { sku_a: "print_small", sku_b: "print_large", discount_pct: 10 } }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];
      const fetched = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch", expectedStatus: 200 });
      if (!fetched.ok || !fetched.action) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched.error };
      }
      const category = String(fetched.action["category"] ?? "");
      if (category !== "bundle") {
        return {
          ...created.trace,
          pass: false,
          steps,
          first_failure_step: "fetch.assert_bundle",
          first_failure_status: 200,
          first_failure_error: `Expected category=bundle, got ${category}`
        };
      }
      const evidenceSnapshotId = fetched.action["evidence_snapshot_id"];
      if (!evidenceSnapshotId) {
        return {
          ...created.trace,
          pass: false,
          steps,
          first_failure_step: "fetch.assert_evidence_link",
          first_failure_status: 200,
          first_failure_error: "Expected evidence_snapshot_id to be present"
        };
      }

      return { ...created.trace, pass: true, steps, final_status: String(fetched.action["status"] ?? ""), final_approval_level: String(fetched.action["approval_level"] ?? "") };
    }
  },
  {
    id: "insufficient_evidence",
    name: "5. Insufficient-evidence recommendation",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "insufficient_evidence",
        title: `M11 Harness (${ctx.harness_run_id}) — Insufficient-evidence recommendation`,
        category: "do_nothing",
        channel: "data_ops",
        confidence: "insufficient_evidence",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { reason: "Missing required telemetry" }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];
      const fetched1 = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_before_block", expectedStatus: 200 });
      if (!fetched1.ok || !fetched1.action) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_before_block", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched1.error };
      }
      const conf = String(fetched1.action["confidence"] ?? "");
      if (conf !== "insufficient_evidence") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_before_block.assert_confidence", first_failure_status: 200, first_failure_error: `Expected confidence=insufficient_evidence, got ${conf}` };
      }

      // Policy: cannot approve while not awaiting_approval (deterministic 400).
      const blocked = await approveActionExpectedReject({
        ctx,
        steps,
        actionId: created.action_id,
        stepName: "approve_blocked",
        expectedStatus: 400,
        actor: "ceo",
        confirm: true,
        idempotencyKey: `${ctx.harness_run_id}:insufficient_evidence:approve_blocked`
      });
      if (!blocked.ok) {
        return { ...created.trace, pass: false, steps, first_failure_step: "approve_blocked", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: blocked.error };
      }

      const fetched2 = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_after_block", expectedStatus: 200 });
      if (!fetched2.ok || !fetched2.action) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_block", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched2.error };
      }
      const statusAfter = String(fetched2.action["status"] ?? "");
      if (statusAfter !== "recommended") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_block.assert_state", first_failure_status: 200, first_failure_error: `Expected status to remain recommended, got ${statusAfter}` };
      }

      // Expected policy rejection counts as pass.
      return {
        ...created.trace,
        pass: true,
        steps,
        first_failure_step: null,
        first_failure_status: null,
        first_failure_error: null,
        final_status: statusAfter,
        final_approval_level: String(fetched2.action["approval_level"] ?? "")
      };
    }
  }
  ,
  {
    id: "rejected_suppression",
    name: "6. Rejected recommendation suppression",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "rejected_suppression",
        title: `M11 Harness (${ctx.harness_run_id}) — Rejected recommendation suppression`,
        category: "measurement",
        channel: "meta",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { metric: "roas", variant: "reject_then_suppress" }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];
      const actionFp = String(created.action["recommendation_fingerprint"] ?? "").trim();
      if (!actionFp) {
        return { ...created.trace, pass: false, steps, first_failure_step: "create.assert_fingerprint", first_failure_status: 200, first_failure_error: "Missing recommendation_fingerprint" };
      }

      // Move to awaiting_approval boundary so reject transition is valid.
      const prepared_assets = [{ id: "draft_meta_brief", label: "Meta brief", kind: "meta", content: { note: "Draft" }, watermark: "DRAFT_NOT_APPROVED" }];
      const execution_plan = { preview: "Internal-only preview. No external execution.", steps: [{ type: "manual", note: "(Disabled)" }] };
      const prep = await prepareDraft({ ctx, steps, actionId: created.action_id, prepared_assets, execution_plan, idempotencyKey: `${ctx.harness_run_id}:rejected_suppression:prepare` });
      if (!prep.ok) {
        return { ...created.trace, pass: false, steps, first_failure_step: "prepare", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: prep.error };
      }
      const ready = await markReady({ ctx, steps, actionId: created.action_id, measurement_window: { startDate: "2026-05-02", endDate: "2026-05-08" }, idempotencyKey: `${ctx.harness_run_id}:rejected_suppression:ready` });
      if (!ready.ok) {
        return { ...created.trace, pass: false, steps, first_failure_step: "ready", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: ready.error };
      }

      const rejected = await rejectAction({
        ctx,
        steps,
        actionId: created.action_id,
        reason: "Not relevant right now",
        idempotencyKey: `${ctx.harness_run_id}:rejected_suppression:reject`
      });
      if (!rejected.ok) {
        return { ...created.trace, pass: false, steps, first_failure_step: "reject", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: rejected.error };
      }

      const fetched = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_after_reject", expectedStatus: 200 });
      if (!fetched.ok || !fetched.action) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_reject", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched.error };
      }
      if (String(fetched.action["status"] ?? "") !== "rejected") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_reject.assert_status", first_failure_status: 200, first_failure_error: `Expected status=rejected, got ${String(fetched.action["status"] ?? "")}` };
      }

      const auditRes = await fetchAuditEvents({ ctx, steps, actionId: created.action_id, stepName: "fetch_audit" });
      if (!auditRes.ok) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_audit", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: auditRes.error };
      }
      const hasRejectedTransition = auditRes.audit.some((e) => {
        const obj = coerceObject(e);
        return obj && String(obj["to_status"] ?? "") === "rejected";
      });
      if (!hasRejectedTransition) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_audit.assert_reject_event", first_failure_status: 200, first_failure_error: "Expected audit event to_status=rejected" };
      }

      const pref = await setSuppressionPreference({
        ctx,
        steps,
        fingerprint: actionFp,
        suppressed: true,
        reason: "Rejected in harness; suppress equivalent",
        idempotencyKey: `${ctx.harness_run_id}:rejected_suppression:pref`
      });
      if (!pref.ok) {
        return { ...created.trace, pass: false, steps, first_failure_step: "set_preference", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: pref.error };
      }
      (ctx.cleanupPreferenceFingerprints ?? []).push(actionFp);

      // Attempt to create equivalent recommendation (same action_key via same recommendation id).
      const retry = await httpStep({
        baseUrl: ctx.baseUrl,
        token: ctx.token,
        scenario: ctx.scenarioName,
        step: "create_equivalent_suppressed",
        method: "POST",
        path: "/api/actions",
        expectedStatus: 400,
        idempotencyKey: `${ctx.harness_run_id}:rejected_suppression:create_equiv`,
        body: {
          actor: "m11_harness",
          window: { startDate: "2026-05-02", endDate: "2026-05-08" },
          recommendation: {
            id: `m11_harness:${ctx.harness_run_id}:rec_rejected_suppression`,
            title: `M11 Harness (${ctx.harness_run_id}) — Rejected recommendation suppression (equivalent)`,
            category: "measurement",
            approval_level: "L1_RECOMMENDATION",
            status: "recommended",
            confidence: "possible",
            expected_outcome: "Harness",
            reason: "Harness",
            affected_channels: ["meta"],
            affected_products: ["store"],
            affected_audiences: ["all"],
            priority_score: { overallScore: 55 },
            estimated_incremental_revenue: { usd: 1000 },
            estimated_cost: { usd: 0 },
            estimated_effort: { hours: 1 },
            risk: "medium",
            approval_requirements: {},
            measurement_window: { startDate: "2026-05-02", endDate: "2026-05-08" },
            data_missing: [],
            limitations: []
          },
          evidence_snapshot: { harness_run_id: ctx.harness_run_id, variant: "equivalent", window: { startDate: "2026-05-02", endDate: "2026-05-08" } }
        }
      });
      steps.push(retry.step);
      if (!retry.step.ok) {
        return { ...created.trace, pass: false, steps, first_failure_step: "create_equivalent_suppressed", first_failure_status: retry.step.actualStatus, first_failure_error: retry.step.errorMessage };
      }

      // Ensure original is still the only relevant action and remains rejected.
      const fetched2 = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_final", expectedStatus: 200 });
      if (!fetched2.ok || !fetched2.action) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_final", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched2.error };
      }

      return { ...created.trace, pass: true, steps, final_status: String(fetched2.action["status"] ?? ""), final_approval_level: String(fetched2.action["approval_level"] ?? "") };
    }
  },
  {
    id: "snoozed",
    name: "7. Snoozed recommendation",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "snoozed",
        title: `M11 Harness (${ctx.harness_run_id}) — Snoozed recommendation`,
        category: "email",
        channel: "email",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { missing_source: "email" }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];
      const prepared_assets = [{ id: "draft_email_campaign", label: "Email draft", kind: "email", content: { subject: "Draft" }, watermark: "DRAFT_NOT_APPROVED" }];
      const execution_plan = { preview: "Internal-only preview. No external execution.", steps: [{ type: "manual", note: "(Disabled)" }] };

      const prep = await prepareDraft({ ctx, steps, actionId: created.action_id, prepared_assets, execution_plan, idempotencyKey: `${ctx.harness_run_id}:snoozed:prepare` });
      if (!prep.ok) return { ...created.trace, pass: false, steps, first_failure_step: "prepare", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: prep.error };

      const ready = await markReady({
        ctx,
        steps,
        actionId: created.action_id,
        measurement_window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        idempotencyKey: `${ctx.harness_run_id}:snoozed:ready`
      });
      if (!ready.ok) return { ...created.trace, pass: false, steps, first_failure_step: "ready", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: ready.error };

      const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const snooze = await snoozeAction({ ctx, steps, actionId: created.action_id, untilIso: until, idempotencyKey: `${ctx.harness_run_id}:snoozed:snooze` });
      if (!snooze.ok) return { ...created.trace, pass: false, steps, first_failure_step: "snooze", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: snooze.error };

      const fetched1 = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_snoozed", expectedStatus: 200 });
      if (!fetched1.ok || !fetched1.action) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_snoozed", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched1.error };
      if (String(fetched1.action["status"] ?? "") !== "snoozed") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_snoozed.assert_status", first_failure_status: 200, first_failure_error: `Expected status=snoozed, got ${String(fetched1.action["status"] ?? "")}` };
      }
      const snoozedUntil = String(fetched1.action["snoozed_until"] ?? "");
      if (!snoozedUntil) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_snoozed.assert_until", first_failure_status: 200, first_failure_error: "Expected snoozed_until to be persisted" };
      }

      const audit1 = await fetchAuditEvents({ ctx, steps, actionId: created.action_id, stepName: "fetch_audit_after_snooze" });
      if (!audit1.ok) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_audit_after_snooze", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: audit1.error };

      const uns = await unsnoozeAction({ ctx, steps, actionId: created.action_id, idempotencyKey: `${ctx.harness_run_id}:snoozed:unsnooze` });
      if (!uns.ok) return { ...created.trace, pass: false, steps, first_failure_step: "unsnooze", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: uns.error };

      const fetched2 = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_unsnoozed", expectedStatus: 200 });
      if (!fetched2.ok || !fetched2.action) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_unsnoozed", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched2.error };
      if (String(fetched2.action["status"] ?? "") !== "awaiting_approval") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_unsnoozed.assert_status", first_failure_status: 200, first_failure_error: `Expected status=awaiting_approval, got ${String(fetched2.action["status"] ?? "")}` };
      }

      const audit2 = await fetchAuditEvents({ ctx, steps, actionId: created.action_id, stepName: "fetch_audit_after_unsnooze" });
      if (!audit2.ok) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_audit_after_unsnooze", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: audit2.error };

      return { ...created.trace, pass: true, steps, final_status: String(fetched2.action["status"] ?? ""), final_approval_level: String(fetched2.action["approval_level"] ?? "") };
    }
  },
  {
    id: "stale_revalidation",
    name: "8. Stale recommendation requiring revalidation",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "stale_revalidation",
        title: `M11 Harness (${ctx.harness_run_id}) — Stale recommendation requiring revalidation`,
        category: "website",
        channel: "website",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { website: { page_url: "/", hypothesis: "Improve conversion" }, stale_marker: true }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];

      const prepared_assets = [{ id: "draft_website_homepage", label: "Homepage draft", kind: "website", content: { page_url: "/", proposed_copy: "Draft" }, watermark: "DRAFT_NOT_APPROVED" }];
      const execution_plan = { preview: "Internal-only preview. No external execution.", steps: [{ type: "manual", note: "(Disabled)" }] };
      const prep = await prepareDraft({ ctx, steps, actionId: created.action_id, prepared_assets, execution_plan, idempotencyKey: `${ctx.harness_run_id}:stale:prepare` });
      if (!prep.ok) return { ...created.trace, pass: false, steps, first_failure_step: "prepare", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: prep.error };

      const ready = await markReady({ ctx, steps, actionId: created.action_id, measurement_window: { startDate: "2026-05-02", endDate: "2026-05-08" }, idempotencyKey: `${ctx.harness_run_id}:stale:ready` });
      if (!ready.ok) return { ...created.trace, pass: false, steps, first_failure_step: "ready", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: ready.error };

      const before = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_before_revalidate", expectedStatus: 200 });
      if (!before.ok || !before.action) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_before_revalidate", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: before.error };
      const originalSnapId = String(before.action["evidence_snapshot_id"] ?? "");
      const originalHash = String(before.action["evidence_snapshot_hash"] ?? "");

      const reval = await revalidateEvidence({
        ctx,
        steps,
        actionId: created.action_id,
        evidence_snapshot: { harness_run_id: ctx.harness_run_id, window: { startDate: "2026-05-02", endDate: "2026-05-08" }, website: { page_url: "/", hypothesis: "Improve conversion", updated: true } },
        idempotencyKey: `${ctx.harness_run_id}:stale:revalidate`
      });
      if (!reval.ok) return { ...created.trace, pass: false, steps, first_failure_step: "revalidate", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: reval.error };
      if (!reval.changed || !reval.newEvidenceSnapshotId || !reval.newHash) {
        return { ...created.trace, pass: false, steps, first_failure_step: "revalidate.assert_changed", first_failure_status: 200, first_failure_error: "Expected changed=true with newEvidenceSnapshotId/newHash" };
      }
      if (reval.newHash === originalHash) {
        return { ...created.trace, pass: false, steps, first_failure_step: "revalidate.assert_hash_change", first_failure_status: 200, first_failure_error: "Expected evidence hash to change" };
      }

      const after = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_after_revalidate", expectedStatus: 200 });
      if (!after.ok || !after.action) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_revalidate", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: after.error };
      const statusAfter = String(after.action["status"] ?? "");
      if (statusAfter !== "needs_revalidation") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_revalidate.assert_status", first_failure_status: 200, first_failure_error: `Expected status=needs_revalidation, got ${statusAfter}` };
      }
      const snapIdAfter = String(after.action["evidence_snapshot_id"] ?? "");
      if (snapIdAfter !== originalSnapId) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_revalidate.assert_immutable", first_failure_status: 200, first_failure_error: "Expected original evidence_snapshot_id to remain immutable" };
      }

      const blocked = await approveActionExpectedReject({
        ctx,
        steps,
        actionId: created.action_id,
        stepName: "approve_blocked_stale",
        expectedStatus: 400,
        actor: "ceo",
        confirm: true,
        idempotencyKey: `${ctx.harness_run_id}:stale:approve`
      });
      if (!blocked.ok) return { ...created.trace, pass: false, steps, first_failure_step: "approve_blocked_stale", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: blocked.error };

      const audit = await fetchAuditEvents({ ctx, steps, actionId: created.action_id, stepName: "fetch_audit_revalidate" });
      if (!audit.ok) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_audit_revalidate", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: audit.error };

      return { ...created.trace, pass: true, steps, final_status: statusAfter, final_approval_level: String(after.action["approval_level"] ?? "") };
    }
  },
  {
    id: "draft_prepared_and_edited",
    name: "9. Draft prepared and edited",
    run: async (ctx) => {
      const created = await createAction({
        ctx,
        recSlug: "draft_prepared_and_edited",
        title: `M11 Harness (${ctx.harness_run_id}) — Draft prepared and edited`,
        category: "email",
        channel: "email",
        window: { startDate: "2026-05-02", endDate: "2026-05-08" },
        evidenceExtra: { missing_source: "email" }
      });
      if ("action_id" in created === false) return created.trace;

      const steps = [...created.trace.steps];
      const prepared_assets1 = [{ id: "draft_email_campaign", label: "Email draft", kind: "email", content: { subject: "Draft A", body: "Body A" }, watermark: "DRAFT_NOT_APPROVED" }];
      const execution_plan1 = { preview: "Preview A", steps: [{ type: "manual", note: "(Disabled)" }] };
      const prep = await prepareDraft({ ctx, steps, actionId: created.action_id, prepared_assets: prepared_assets1, execution_plan: execution_plan1, idempotencyKey: `${ctx.harness_run_id}:draft:prepare` });
      if (!prep.ok) return { ...created.trace, pass: false, steps, first_failure_step: "prepare", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: prep.error };

      const fetched1 = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_after_prepare", expectedStatus: 200 });
      if (!fetched1.ok || !fetched1.action) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_prepare", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched1.error };
      if (String(fetched1.action["status"] ?? "") !== "draft_prepared") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_prepare.assert_status", first_failure_status: 200, first_failure_error: `Expected status=draft_prepared, got ${String(fetched1.action["status"] ?? "")}` };
      }

      const prepared_assets2 = [{ id: "draft_email_campaign", label: "Email draft", kind: "email", content: { subject: "Draft B", body: "Body B" }, watermark: "DRAFT_NOT_APPROVED" }];
      const execution_plan2 = { preview: "Preview B", steps: [{ type: "manual", note: "(Disabled)" }] };
      const edit = await editDraft({ ctx, steps, actionId: created.action_id, prepared_assets: prepared_assets2, execution_plan: execution_plan2, idempotencyKey: `${ctx.harness_run_id}:draft:edit` });
      if (!edit.ok) return { ...created.trace, pass: false, steps, first_failure_step: "edit_draft", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: edit.error };

      const fetched2 = await fetchAction({ ctx, steps, actionId: created.action_id, stepName: "fetch_after_edit", expectedStatus: 200 });
      if (!fetched2.ok || !fetched2.action) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_edit", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: fetched2.error };
      if (String(fetched2.action["status"] ?? "") !== "draft_prepared") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_edit.assert_status", first_failure_status: 200, first_failure_error: "Edit should not change lifecycle status" };
      }
      const assets = Array.isArray(fetched2.action["prepared_assets"]) ? (fetched2.action["prepared_assets"] as unknown[]) : [];
      const asset0 = coerceObject(assets[0]);
      const content = asset0 ? coerceObject(asset0["content"]) : null;
      const subject = content ? String(content["subject"] ?? "") : "";
      if (subject !== "Draft B") {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_after_edit.assert_persist", first_failure_status: 200, first_failure_error: `Expected edited subject to persist (Draft B), got ${subject}` };
      }

      const audit = await fetchAuditEvents({ ctx, steps, actionId: created.action_id, stepName: "fetch_audit_draft" });
      if (!audit.ok) return { ...created.trace, pass: false, steps, first_failure_step: "fetch_audit_draft", first_failure_status: steps.at(-1)?.actualStatus ?? null, first_failure_error: audit.error };
      const hasEditEvent = audit.audit.some((e) => {
        const obj = coerceObject(e);
        return obj && String(obj["event_type"] ?? "") === "draft_edited";
      });
      if (!hasEditEvent) {
        return { ...created.trace, pass: false, steps, first_failure_step: "fetch_audit_draft.assert_edit", first_failure_status: 200, first_failure_error: "Expected draft_edited audit event" };
      }

      return { ...created.trace, pass: true, steps, final_status: String(fetched2.action["status"] ?? ""), final_approval_level: String(fetched2.action["approval_level"] ?? "") };
    }
  }
];

async function runPhase(phase: Phase): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const baseUrl = process.env.M11_BASE_URL ?? "http://localhost:3456";
  const token = mustGet("DASHBOARD_ADMIN_TOKEN");

  const supabaseUrl = mustGet("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustGet("SUPABASE_SERVICE_ROLE_KEY");
  const stagingHost = new URL(supabaseUrl).host;

  const harness_run_id = `m11-harness-${nowUtcIso().replace(/[:.]/g, "-")}-${randomSuffix(6)}`;

  const scenariosArgIndex = process.argv.indexOf("--scenarios");
  const scenariosArg = scenariosArgIndex !== -1 ? String(process.argv[scenariosArgIndex + 1] ?? "").trim() : "";

  const selectedRunners: ScenarioRunnerDef[] = (() => {
    if (scenariosArg) {
      const nums = scenariosArg.split(",").map((s) => Number(String(s).trim())).filter((n) => Number.isFinite(n));
      const unique = Array.from(new Set(nums));
      const picked: ScenarioRunnerDef[] = [];
      for (const n of unique) {
        const runner = SCENARIO_RUNNERS[n - 1];
        if (!runner) {
          console.error(`Invalid scenario number: ${n}`);
          process.exit(2);
        }
        picked.push(runner);
      }
      return picked;
    }

    if (phase === "A") return [SCENARIO_RUNNERS[0]];
    if (phase === "B") return [SCENARIO_RUNNERS[0], SCENARIO_RUNNERS[1]];
    return SCENARIO_RUNNERS;
  })();

  const traces: ScenarioTrace[] = [];
  let externalSideEffects = 0;
  let cleanup: CleanupReport | null = null;
  const preferenceFingerprints: string[] = [];

  try {
    for (const runner of selectedRunners) {
      const trace = await runner.run({ baseUrl, token, harness_run_id, scenarioName: runner.name, cleanupPreferenceFingerprints: preferenceFingerprints });
      traces.push(trace);
      externalSideEffects += trace.external_side_effect_count;
    }
  } finally {
    cleanup = await cleanupHarnessRun({ supabaseUrl, serviceKey, harness_run_id, preferenceFingerprints });
  }

  const failures = traces.filter((t) => !t.pass).map((t) => t.name);
  const report: PhaseReport = {
    ok: failures.length === 0 && (cleanup?.ok ?? false) && externalSideEffects === 0,
    phase,
    harness_run_id,
    generated_at_utc: nowUtcIso(),
    staging_host: stagingHost,
    production_request_count: 0,
    scenarios_selected: selectedRunners.length,
    scenarios_executed: traces.length,
    scenarios_passed: traces.filter((t) => t.pass).length,
    scenarios_failed: failures.length,
    scenarios_skipped: 0,
    failures,
    external_side_effect_count: externalSideEffects,
    traces,
    cleanup: cleanup as CleanupReport,
    no_production_requests: !supabaseUrl.includes("ibjsjosplgbqevmnvvpf")
  };

  const outFile = path.join(
    OUT_DIR,
    scenariosArg
      ? (() => {
          const nums = scenariosArg.split(",").map((s) => Number(String(s).trim())).filter((n) => Number.isFinite(n));
          const min = Math.min(...nums);
          const batch = Number.isFinite(min) ? Math.floor((min - 2) / 4) + 1 : 0;
          return batch > 0 ? `batch-${batch}-report.json` : "batch-report.json";
        })()
      : phase === "A"
        ? "phase-a-report.json"
        : phase === "B"
          ? "phase-b-report.json"
          : "phase-c-report.json"
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outFile }, null, 2));

  process.exit(report.ok ? 0 : 1);
}

const phaseArgIndex = process.argv.indexOf("--phase");
const phase = (phaseArgIndex !== -1 ? process.argv[phaseArgIndex + 1] : "A") as Phase;
if (!(phase === "A" || phase === "B" || phase === "C")) {
  console.error("Invalid --phase. Use A|B|C");
  process.exit(2);
}

const isEntrypoint = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  runPhase(phase).catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
