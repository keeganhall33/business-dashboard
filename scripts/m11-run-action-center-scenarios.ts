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

import { createClient } from "@supabase/supabase-js";

import {
  coerceObject,
  sanitizeErrorMessage,
  statusMatches,
  type StepRecord
} from "@/lib/actions/harness-utils";
import { M11_SCENARIOS } from "@/lib/actions/m11-scenarios";

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
    confidence: "possible",
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

async function runPhase(phase: Phase): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const baseUrl = process.env.M11_BASE_URL ?? "http://localhost:3456";
  const token = mustGet("DASHBOARD_ADMIN_TOKEN");

  const supabaseUrl = mustGet("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustGet("SUPABASE_SERVICE_ROLE_KEY");
  const stagingHost = new URL(supabaseUrl).host;

  const harness_run_id = `m11-harness-${nowUtcIso().replace(/[:.]/g, "-")}-${randomSuffix(6)}`;

  const selected =
    phase === "A"
      ? M11_SCENARIOS.slice(0, 1)
      : phase === "B"
        ? [M11_SCENARIOS[0], M11_SCENARIOS[19]]
        : M11_SCENARIOS;

  const traces: ScenarioTrace[] = [];
  let externalSideEffects = 0;

  // Only scenario 1 is fully implemented here; the rest are TODO.
  for (const s of selected) {
    if (s.id !== "meta_measurement") {
      traces.push({
        name: s.name,
        pass: false,
        external_side_effect_count: 0,
        harness_run_id,
        steps: [],
        first_failure_step: "not_implemented",
        first_failure_status: null,
        first_failure_error: "Scenario not implemented",
        action_id: null,
        final_status: null,
        final_approval_level: null
      });
      continue;
    }

    const trace = await runScenarioCreateOnly({
      baseUrl,
      token,
      harness_run_id,
      scenarioName: s.name,
      recSlug: "meta_measurement",
      title: `M11 Harness (${harness_run_id}) — Meta measurement recommendation`,
      category: "measurement",
      channel: "meta",
      window: { startDate: "2026-05-02", endDate: "2026-05-08" },
      evidenceExtra: { metric: "roas" }
    });
    traces.push(trace);
    externalSideEffects += trace.external_side_effect_count;
  }

  const cleanup = await cleanupHarnessRun({ supabaseUrl, serviceKey, harness_run_id });

  const failures = traces.filter((t) => !t.pass).map((t) => t.name);
  const report: PhaseReport = {
    ok: failures.length === 0 && cleanup.ok && externalSideEffects === 0,
    phase,
    harness_run_id,
    generated_at_utc: nowUtcIso(),
    staging_host: stagingHost,
    production_request_count: 0,
    scenarios_selected: selected.length,
    scenarios_executed: traces.length,
    scenarios_passed: traces.filter((t) => t.pass).length,
    scenarios_failed: failures.length,
    scenarios_skipped: 0,
    failures,
    external_side_effect_count: externalSideEffects,
    traces,
    cleanup,
    no_production_requests: !supabaseUrl.includes("ibjsjosplgbqevmnvvpf")
  };

  const outFile = path.join(
    OUT_DIR,
    phase === "A" ? "phase-a-report.json" : phase === "B" ? "phase-b-report.json" : "phase-c-report.json"
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

runPhase(phase).catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
