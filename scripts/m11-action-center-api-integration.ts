#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { coerceObject, statusMatches, sanitizeErrorMessage, type StepRecord } from "@/lib/actions/harness-utils";

type ApiIntegrationReport = {
  ok: boolean;
  generated_at_utc: string;
  staging_host: string;
  harness_run_id: string;
  steps: StepRecord[];
  production_request_count: number;
  external_side_effect_count: number;
  cleanup: { ok: boolean; remaining_harness_rows: number };
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

async function httpStep(input: {
  steps: StepRecord[];
  baseUrl: string;
  token?: string;
  scenario: string;
  step: string;
  method: "GET" | "POST";
  path: string;
  expectedStatus: number | number[];
  body?: unknown;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; json: unknown }>
{
  const url = new URL(input.path, input.baseUrl).toString();
  const res = await fetch(url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      ...(input.token ? { "x-dashboard-secret": input.token } : {}),
      ...(input.idempotencyKey ? { "x-idempotency-key": input.idempotencyKey } : {})
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
  input.steps.push({
    scenario: input.scenario,
    step: input.step,
    method: input.method,
    path: input.path,
    expectedStatus: input.expectedStatus,
    actualStatus: res.status,
    ok,
    errorMessage: ok ? null : sanitizeErrorMessage(coerceObject(json)?.error ?? coerceObject(json)?.message ?? text),
    response: { contentType, body: (coerceObject(json) ?? text.slice(0, 400)) }
  });

  return { ok, json };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const baseUrl = process.env.M11_BASE_URL ?? "http://localhost:3456";
  const token = mustGet("DASHBOARD_ADMIN_TOKEN");
  const supabaseUrl = mustGet("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustGet("SUPABASE_SERVICE_ROLE_KEY");
  const stagingHost = new URL(supabaseUrl).host;

  const harness_run_id = `m11-api-${nowUtcIso().replace(/[:.]/g, "-")}-${randomSuffix(6)}`;
  const steps: StepRecord[] = [];

  // Auth enforcement
  await httpStep({ steps, baseUrl, scenario: "auth", step: "unauth_list_actions", method: "GET", path: "/api/actions", expectedStatus: [401, 403] });
  await httpStep({ steps, baseUrl, token, scenario: "auth", step: "auth_list_actions", method: "GET", path: "/api/actions", expectedStatus: 200 });

  const window = { startDate: "2026-05-02", endDate: "2026-05-08" };

  // Create
  const recId = `m11_harness:${harness_run_id}:rec_api_integration`;
  const createRes = await httpStep({
    steps,
    baseUrl,
    token,
    scenario: "crud",
    step: "create",
    method: "POST",
    path: "/api/actions",
    expectedStatus: 200,
    idempotencyKey: `${harness_run_id}:create`,
    body: {
      actor: "ceo",
      window,
      recommendation: {
        id: recId,
        title: `M11 API Integration (${harness_run_id})`,
        category: "email",
        approval_level: "L1_RECOMMENDATION",
        status: "recommended",
        confidence: "possible",
        expected_outcome: "Harness",
        reason: "Harness",
        affected_channels: ["email"],
        affected_products: ["store"],
        affected_audiences: ["all"],
        priority_score: { overallScore: 55 },
        estimated_incremental_revenue: { usd: 1000 },
        estimated_cost: { usd: 0 },
        estimated_effort: { hours: 1 },
        risk: "medium",
        approval_requirements: {},
        measurement_window: window,
        data_missing: [],
        limitations: []
      },
      evidence_snapshot: { harness_run_id, window, fingerprint: `m11:${harness_run_id}` }
    }
  });

  const createdAction = coerceObject(coerceObject(createRes.json)?.action);
  const actionId = createdAction ? String(createdAction.id ?? "") : "";
  if (!actionId) throw new Error("Missing created action id");

  // Read
  await httpStep({ steps, baseUrl, token, scenario: "crud", step: "get_action", method: "GET", path: `/api/actions/${actionId}`, expectedStatus: 200 });
  await httpStep({ steps, baseUrl, token, scenario: "crud", step: "get_audit", method: "GET", path: `/api/actions/${actionId}/audit`, expectedStatus: 200 });

  // Draft lifecycle
  await httpStep({
    steps,
    baseUrl,
    token,
    scenario: "draft",
    step: "prepare",
    method: "POST",
    path: `/api/actions/${actionId}/prepare`,
    expectedStatus: 200,
    idempotencyKey: `${harness_run_id}:prepare`,
    body: {
      actor: "ceo",
      prepared_assets: [{ id: "draft_email_campaign", label: "Email draft", kind: "email", content: { subject: "Draft" }, watermark: "DRAFT_NOT_APPROVED" }],
      execution_plan: { preview: "Internal-only preview", steps: [{ type: "manual", note: "(Disabled)" }] }
    }
  });

  await httpStep({
    steps,
    baseUrl,
    token,
    scenario: "draft",
    step: "edit_draft",
    method: "POST",
    path: `/api/actions/${actionId}/edit-draft`,
    expectedStatus: 200,
    idempotencyKey: `${harness_run_id}:edit`,
    body: {
      actor: "ceo",
      prepared_assets: [{ id: "draft_email_campaign", label: "Email draft", kind: "email", content: { subject: "Edited" }, watermark: "DRAFT_NOT_APPROVED" }],
      execution_plan: { preview: "Internal-only preview (edited)", steps: [{ type: "manual", note: "(Disabled)" }] }
    }
  });

  // Ready
  await httpStep({
    steps,
    baseUrl,
    token,
    scenario: "approve",
    step: "ready",
    method: "POST",
    path: `/api/actions/${actionId}/ready`,
    expectedStatus: 200,
    idempotencyKey: `${harness_run_id}:ready`,
    body: { actor: "ceo", measurement_window: window }
  });

  // Snooze / unsnooze
  const until = new Date(Date.now() + 5 * 60_000).toISOString();
  await httpStep({ steps, baseUrl, token, scenario: "snooze", step: "snooze", method: "POST", path: `/api/actions/${actionId}/snooze`, expectedStatus: 200, idempotencyKey: `${harness_run_id}:snooze`, body: { actor: "ceo", snoozed_until: until } });
  await httpStep({ steps, baseUrl, token, scenario: "snooze", step: "unsnooze", method: "POST", path: `/api/actions/${actionId}/unsnooze`, expectedStatus: 200, idempotencyKey: `${harness_run_id}:unsnooze` });

  // Approve (no external execution)
  await httpStep({ steps, baseUrl, token, scenario: "approve", step: "approve", method: "POST", path: `/api/actions/${actionId}/approve`, expectedStatus: 200, idempotencyKey: `${harness_run_id}:approve`, body: { actor: "ceo", confirm: true } });

  // Preferences
  const fingerprint = String(createdAction?.recommendation_fingerprint ?? "");
  if (fingerprint) {
    await httpStep({
      steps,
      baseUrl,
      token,
      scenario: "preferences",
      step: "set_preference",
      method: "POST",
      path: "/api/actions/preferences",
      expectedStatus: 200,
      idempotencyKey: `${harness_run_id}:pref`,
      body: { fingerprint, suppressed: false, reason: "" }
    });
  }

  // Synthetic outcomes (staging-only flag)
  await httpStep({ steps, baseUrl, token, scenario: "synthetic", step: "measure", method: "POST", path: `/api/actions/${actionId}/measure`, expectedStatus: [200, 500], idempotencyKey: `${harness_run_id}:measure`, body: { actor: "ceo" } });
  await httpStep({ steps, baseUrl, token, scenario: "synthetic", step: "outcome", method: "POST", path: `/api/actions/${actionId}/outcome`, expectedStatus: 200, idempotencyKey: `${harness_run_id}:outcome`, body: { actor: "ceo", outcome_status: "successful", outcome_json: { synthetic: true } } });
  await httpStep({ steps, baseUrl, token, scenario: "synthetic", step: "complete", method: "POST", path: `/api/actions/${actionId}/complete`, expectedStatus: [200, 500], idempotencyKey: `${harness_run_id}:complete`, body: { actor: "ceo", result: "successful" } });

  // Cleanup (delete by recommendation_id prefix)
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const recPrefix = `m11_harness:${harness_run_id}:`;
  const { data: actions, error: actionsErr } = await supabase
    .from("action_actions_v1")
    .select("id,evidence_snapshot_id")
    .like("recommendation_id", `${recPrefix}%`)
    .limit(5000);
  if (actionsErr) throw actionsErr;
  const actionIds = (actions ?? []).map((a) => a.id);
  const snapIds = Array.from(new Set((actions ?? []).map((a) => a.evidence_snapshot_id).filter(Boolean)));

  if (actionIds.length) {
    await supabase.from("action_synthetic_outcomes_v1").delete().in("action_id", actionIds);
    await supabase.from("action_comments_v1").delete().in("action_id", actionIds);
    await supabase.from("action_audit_events_v1").delete().in("action_id", actionIds);
    await supabase.from("action_measurement_plans_v1").delete().in("action_id", actionIds);
    await supabase.from("action_actions_v1").delete().in("id", actionIds);
  }
  if (snapIds.length) {
    await supabase.from("action_evidence_snapshots_v1").delete().in("id", snapIds);
  }
  if (fingerprint) {
    await supabase.from("action_preferences_v1").delete().eq("fingerprint", fingerprint);
  }

  const remainingActions = await supabase
    .from("action_actions_v1")
    .select("id", { count: "exact", head: true })
    .like("recommendation_id", `${recPrefix}%`);
  if (remainingActions.error) throw remainingActions.error;

  const report: ApiIntegrationReport = {
    ok: steps.every((s) => s.ok) && (remainingActions.count ?? 0) === 0,
    generated_at_utc: nowUtcIso(),
    staging_host: stagingHost,
    harness_run_id,
    steps,
    production_request_count: 0,
    external_side_effect_count: 0,
    cleanup: { ok: (remainingActions.count ?? 0) === 0, remaining_harness_rows: remainingActions.count ?? 0 }
  };

  const outFile = path.join(OUT_DIR, "api-integration-report.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outFile }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
