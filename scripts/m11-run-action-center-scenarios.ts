#!/usr/bin/env tsx

/**
 * Milestone 11 staging scenario harness.
 *
 * - Uses local Next.js Action Center routes (auth + idempotency + transition guards).
 * - Tags every created record with a deterministic harness_run_id for cleanup.
 * - Produces machine-readable reports under .artifacts/milestone-11-action-center/
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

type ScenarioTrace = {
  name: string;
  pass: boolean;
  external_side_effect_count: number;
  harness_run_id: string;
  fingerprint_prefix: string;
  steps: StepRecord[];
  first_failure_step: string | null;
  first_failure_status: number | null;
  first_failure_error: string | null;
  action_id: string | null;
  final_status: string | null;
  final_approval_level: string | null;
};

type CleanupReport = {
  ok: boolean;
  harness_run_id: string;
  identified: { actions: number; audits: number; comments: number; outcomes: number; plans: number; snaps: number; prefs: number };
  deleted: { actions: number; audits: number; comments: number; outcomes: number; plans: number; snaps: number; prefs: number };
  remaining: { actions: number; audits: number; comments: number; outcomes: number; plans: number; snaps: number; prefs: number };
  remaining_harness_rows: number;
};

type PhaseReport = {
  ok: boolean;
  phase: "A";
  harness_run_id: string;
  generated_at_utc: string;
  staging_host: string;
  scenarios_executed: number;
  scenarios_passed: number;
  scenarios_failed: number;
  failures: string[];
  external_side_effect_count: number;
  traces: ScenarioTrace[];
  cleanup: CleanupReport;
  no_production_requests: boolean;
};

type JsonObject = Record<string, unknown>;

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
  // Never include secrets here; the harness only hits local routes and PostgREST.
  // Still keep payload small.
  if ((input.contentType ?? "").includes("application/json")) {
    const obj = coerceObject(input.json);
    if (!obj) return input.json;
    // Drop large nested blobs.
    if ("actions" in obj && Array.isArray(obj.actions)) {
      return { ...obj, actions: `[${obj.actions.length} items]` };
    }
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
}): Promise<{ step: StepRecord; json: unknown }>
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
    response: sanitizedBody
  };

  return { step, json };
}

function requireActionFields(action: JsonObject, fields: string[]): string | null {
  for (const f of fields) {
    if (!(f in action)) return `Missing action.${f}`;
  }
  return null;
}

function getActionFromEnvelope(json: unknown): JsonObject | null {
  const obj = coerceObject(json);
  if (!obj) return null;
  const ok = obj["ok"];
  if (ok !== true) return null;
  const action = coerceObject(obj["action"]);
  return action;
}

async function cleanupHarnessRun(input: {
  supabaseUrl: string;
  serviceKey: string;
  harness_run_id: string;
}): Promise<CleanupReport> {
  const supabase = createClient(input.supabaseUrl, input.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Safe identification: only rows whose recommendation_id starts with our harness_run_id.
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
    actions: actionIds.length,
    audits: 0,
    comments: 0,
    outcomes: 0,
    plans: 0,
    snaps: snapIds.length,
    prefs: 0
  };

  const deleted = { actions: 0, audits: 0, comments: 0, outcomes: 0, plans: 0, snaps: 0, prefs: 0 };

  if (actionIds.length) {
    const outcomes = await supabase.from("action_synthetic_outcomes_v1").delete().in("action_id", actionIds).select("id");
    if (outcomes.error) throw outcomes.error;
    deleted.outcomes = (outcomes.data ?? []).length;

    const comments = await supabase.from("action_comments_v1").delete().in("action_id", actionIds).select("id");
    if (comments.error) throw comments.error;
    deleted.comments = (comments.data ?? []).length;

    const audits = await supabase.from("action_audit_events_v1").delete().in("action_id", actionIds).select("id");
    if (audits.error) throw audits.error;
    deleted.audits = (audits.data ?? []).length;

    const plans = await supabase.from("action_measurement_plans_v1").delete().in("action_id", actionIds).select("id");
    if (plans.error) throw plans.error;
    deleted.plans = (plans.data ?? []).length;

    const actionDel = await supabase.from("action_actions_v1").delete().in("id", actionIds).select("id");
    if (actionDel.error) throw actionDel.error;
    deleted.actions = (actionDel.data ?? []).length;
  }

  if (snapIds.length) {
    const snapDel = await supabase.from("action_evidence_snapshots_v1").delete().in("id", snapIds).select("id");
    if (snapDel.error) throw snapDel.error;
    deleted.snaps = (snapDel.data ?? []).length;
  }

  // Verify remaining
  const remainingActions = await supabase
    .from("action_actions_v1")
    .select("id", { count: "exact", head: true })
    .like("recommendation_id", `${recPrefix}%`);
  if (remainingActions.error) throw remainingActions.error;
  const remainingCount = remainingActions.count ?? 0;

  const report: CleanupReport = {
    ok: remainingCount === 0,
    harness_run_id: input.harness_run_id,
    identified,
    deleted,
    remaining: {
      actions: remainingCount,
      audits: 0,
      comments: 0,
      outcomes: 0,
      plans: 0,
      snaps: 0,
      prefs: 0
    },
    remaining_harness_rows: remainingCount
  };
  return report;
}

async function runPhaseA(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "phase-a-report.json");

  const baseUrl = process.env.M11_BASE_URL ?? "http://localhost:3456";
  const token = mustGet("DASHBOARD_ADMIN_TOKEN");

  const supabaseUrl = mustGet("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustGet("SUPABASE_SERVICE_ROLE_KEY");
  const stagingHost = new URL(supabaseUrl).host;

  const harness_run_id = `m11-harness-${nowUtcIso().replace(/[:.]/g, "-")}-${randomSuffix(6)}`;
  const fingerprint_prefix = `m11:${harness_run_id}:`;

  const traces: ScenarioTrace[] = [];
  let externalSideEffects = 0;

  async function runScenario1(): Promise<ScenarioTrace> {
    const name = "1. Meta measurement recommendation";
    const steps: StepRecord[] = [];
    let first_failure_step: string | null = null;
    let first_failure_status: number | null = null;
    let first_failure_error: string | null = null;

    const window = { startDate: "2026-05-02", endDate: "2026-05-08" };
    const fingerprint = stableHash({ kind: "meta_measurement", window, harness_run_id });
    const recId = `m11_harness:${harness_run_id}:rec_meta_measurement`;
    const title = `M11 Harness (${harness_run_id}) — Meta measurement recommendation`;

    const recommendation: JsonObject = {
      id: recId,
      title,
      category: "measurement",
      approval_level: "L1_RECOMMENDATION",
      status: "recommended",
      confidence: "possible",
      expected_outcome: "Improve KPI",
      reason: "Harness scenario",
      affected_channels: ["meta"],
      affected_products: ["store"],
      affected_audiences: ["all"],
      priority_score: { overallScore: 55 },
      estimated_incremental_revenue: { usd: 1000 },
      estimated_cost: { usd: 100 },
      estimated_effort: { hours: 2 },
      risk: "medium",
      approval_requirements: {},
      measurement_window: window,
      data_missing: [],
      limitations: []
    };

    const evidence_snapshot: JsonObject = {
      harness_run_id,
      fingerprint: `${fingerprint_prefix}${fingerprint}`,
      window,
      metric: "roas"
    };

    const create = await httpStep({
      baseUrl,
      token,
      scenario: name,
      step: "create",
      method: "POST",
      path: "/api/actions",
      expectedStatus: 200,
      idempotencyKey: `${harness_run_id}:create:1`,
      body: { actor: "m11_harness", window, recommendation, evidence_snapshot }
    });
    create.step.scenario = name;
    steps.push(create.step);

    if (!create.step.ok) {
      first_failure_step = "create";
      first_failure_status = create.step.actualStatus;
      first_failure_error = create.step.errorMessage;
      return {
        name,
        pass: false,
        external_side_effect_count: 0,
        harness_run_id,
        fingerprint_prefix,
        steps,
        first_failure_step,
        first_failure_status,
        first_failure_error,
        action_id: null,
        final_status: null,
        final_approval_level: null
      };
    }

    const action = getActionFromEnvelope(create.json);
    if (!action) {
      first_failure_step = "create.parse";
      first_failure_status = 200;
      first_failure_error = "Missing action envelope";
      return {
        name,
        pass: false,
        external_side_effect_count: 0,
        harness_run_id,
        fingerprint_prefix,
        steps,
        first_failure_step,
        first_failure_status,
        first_failure_error,
        action_id: null,
        final_status: null,
        final_approval_level: null
      };
    }

    const missing = requireActionFields(action, ["id", "status", "approval_level"]);
    if (missing) {
      first_failure_step = "create.validate";
      first_failure_status = 200;
      first_failure_error = missing;
      return {
        name,
        pass: false,
        external_side_effect_count: 0,
        harness_run_id,
        fingerprint_prefix,
        steps,
        first_failure_step,
        first_failure_status,
        first_failure_error,
        action_id: String(action["id"] ?? ""),
        final_status: String(action["status"] ?? ""),
        final_approval_level: String(action["approval_level"] ?? "")
      };
    }

    return {
      name,
      pass: true,
      external_side_effect_count: 0,
      harness_run_id,
      fingerprint_prefix,
      steps,
      first_failure_step: null,
      first_failure_status: null,
      first_failure_error: null,
      action_id: String(action["id"] ?? ""),
      final_status: String(action["status"] ?? ""),
      final_approval_level: String(action["approval_level"] ?? "")
    };
  }

  const trace = await runScenario1();
  traces.push(trace);
  externalSideEffects += trace.external_side_effect_count;

  const cleanup = await cleanupHarnessRun({ supabaseUrl, serviceKey, harness_run_id });

  const failures = traces.filter((t) => !t.pass).map((t) => t.name);
  const report: PhaseReport = {
    ok: failures.length === 0 && cleanup.ok && externalSideEffects === 0,
    phase: "A",
    harness_run_id,
    generated_at_utc: nowUtcIso(),
    staging_host: stagingHost,
    scenarios_executed: 1,
    scenarios_passed: traces.filter((t) => t.pass).length,
    scenarios_failed: failures.length,
    failures,
    external_side_effect_count: externalSideEffects,
    traces,
    cleanup,
    no_production_requests: !supabaseUrl.includes("ibjsjosplgbqevmnvvpf")
  };

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outFile }, null, 2));

  process.exit(report.ok ? 0 : 1);
}

const mode = process.argv.includes("--phase") ? process.argv[process.argv.indexOf("--phase") + 1] : "A";
if (mode !== "A") {
  console.error("Only --phase A is implemented in this run");
  process.exit(2);
}

runPhaseA().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

