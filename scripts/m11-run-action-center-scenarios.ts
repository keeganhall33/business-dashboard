#!/usr/bin/env tsx

/**
 * Milestone 11 helper: create/advance an Action Center record from a Milestone 10
 * recommendation payload.
 *
 * Safety:
 * - This script never performs external execution.
 * - Writes are gated by ACTIONS_ENABLE_WRITES=1 and NODE_ENV !== 'production'
 *   (enforced by action-store).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

type InputJson = {
  actor?: string;
  window: { startDate: string; endDate: string };
  recommendation: Record<string, unknown>;
  evidence_snapshot: Record<string, unknown>;
};

type ActionRow = {
  id: string;
  status: string;
  current_level: string;
  evidence_snapshot_id: string | null;
  evidence_snapshot_hash: string | null;
};

function requireWritesEnabled() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Writes disabled: NODE_ENV=production");
  }
  const flag = (process.env.ACTIONS_ENABLE_WRITES ?? "").toLowerCase();
  if (!(flag === "1" || flag === "true")) {
    throw new Error("Writes disabled: set ACTIONS_ENABLE_WRITES=1 (local/staging only)");
  }
}

function computeRecommendationFingerprint(input: {
  category: string;
  channel: string;
  affected_products: string[];
  affected_audiences: string[];
  action_key: string;
  evidence_window: { startDate: string; endDate: string };
}): string {
  const normalized = {
    category: input.category,
    channel: input.channel,
    affected_products: [...input.affected_products].sort(),
    affected_audiences: [...input.affected_audiences].sort(),
    action_key: input.action_key,
    evidence_window: input.evidence_window
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function usage() {
  // Keep this extremely simple; we only need a callable entrypoint for local proof.
  console.log(
    [
      "m11-run-action-center-scenarios",
      "",
      "Usage:",
      "  pnpm -s tsx scripts/m11-run-action-center-scenarios.ts --input <path.json>",
      "",
      "Input JSON shape:",
      "  { window: {startDate,endDate}, recommendation: {...}, evidence_snapshot: {...}, actor?: 'ceo' }",
      "",
      "Optional steps:",
      "  --prepare  (transition recommended -> draft_prepared)",
      "  --ready    (transition draft_prepared -> awaiting_approval)",
      "  --approve  (transition awaiting_approval -> approved)",
      "  --outcome <successful|unsuccessful|inconclusive|stopped_early>",
      ""
    ].join("\n")
  );
}

function getFlagValue(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1] ?? null;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    usage();
    process.exit(0);
  }

  const inputPath = getFlagValue(args, "--input");
  if (!inputPath) {
    console.error("Missing --input");
    usage();
    process.exit(1);
  }

  const abs = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
  const raw = fs.readFileSync(abs, "utf8");
  const parsed = JSON.parse(raw) as InputJson;

  const actor = parsed.actor ?? "ceo";
  const rec = parsed.recommendation;

  const category = String(rec["category"] ?? "unknown");
  const channel = String((Array.isArray(rec["affected_channels"]) ? (rec["affected_channels"] as unknown[])[0] : "unknown") ?? "unknown");
  const affected_products = Array.isArray(rec["affected_products"]) ? (rec["affected_products"] as string[]) : [];
  const affected_audiences = Array.isArray(rec["affected_audiences"]) ? (rec["affected_audiences"] as string[]) : [];

  requireWritesEnabled();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for direct DB writes");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const fingerprint = computeRecommendationFingerprint({
    category,
    channel,
    affected_products,
    affected_audiences,
    action_key: String(rec["id"] ?? "unknown"),
    evidence_window: parsed.window
  });

  const snapshotHash = crypto.createHash("sha256").update(JSON.stringify(parsed.evidence_snapshot)).digest("hex");

  // Insert evidence snapshot
  const { data: snap, error: snapErr } = await supabase
    .from("action_evidence_snapshots_v1")
    .insert({ fingerprint, snapshot_json: parsed.evidence_snapshot, snapshot_hash: snapshotHash })
    .select("id")
    .single();
  if (snapErr) throw snapErr;

  // Create action (dedupe is enforced by DB unique partial index; keep this simple for proof)
  const { data: action, error: actionErr } = await supabase
    .from("action_actions_v1")
    .insert({
      recommendation_id: String(rec["id"] ?? ""),
      opportunity_id: (rec["opportunity_id"] as string | null) ?? null,
      title: String(rec["title"] ?? ""),
      description: (rec["reason"] as string | null) ?? null,
      category,
      channel,
      affected_products,
      affected_audiences,
      current_level: "L1_RECOMMENDATION",
      status: "recommended",
      priority_score: (rec["priority_score"] as Record<string, unknown>) ?? {},
      confidence: (rec["confidence"] as string) ?? "possible",
      expected_outcome: (rec["expected_outcome"] as string) ?? "",
      estimated_impact: (rec["estimated_incremental_revenue"] as Record<string, unknown>) ?? {},
      estimated_cost: (rec["estimated_cost"] as Record<string, unknown>) ?? {},
      estimated_effort: (rec["estimated_effort"] as Record<string, unknown>) ?? {},
      risk: ((rec["risk"] as "low" | "medium" | "high") ?? "medium"),
      evidence_snapshot_id: snap.id,
      evidence_snapshot_hash: snapshotHash,
      approval_requirements: (rec["approval_requirements"] as Record<string, unknown>) ?? {},
      measurement_window: (rec["measurement_window"] as Record<string, unknown>) ?? {},
      recommendation_fingerprint: fingerprint
    })
    .select("id,status,current_level,evidence_snapshot_id,evidence_snapshot_hash")
    .single<ActionRow>();
  if (actionErr) throw actionErr;

  // Audit: created
  await supabase.from("action_audit_events_v1").insert({
    action_id: action.id,
    event_type: "created",
    from_status: null,
    to_status: action.status,
    from_level: null,
    to_level: action.current_level,
    actor,
    note: "Created action from recommendation (script)",
    metadata: { idempotencyKey: `m11-${String(rec["id"] ?? "rec")}` }
  });

  let current = action;

  async function transition(to_status: string, to_level: string, patch: Record<string, unknown> = {}, note = "transition") {
    const { data: updated, error: updErr } = await supabase
      .from("action_actions_v1")
      .update({ status: to_status, current_level: to_level, ...patch })
      .eq("id", current.id)
      .select("id,status,current_level,evidence_snapshot_id,evidence_snapshot_hash")
      .single<ActionRow>();
    if (updErr) throw updErr;
    await supabase.from("action_audit_events_v1").insert({
      action_id: current.id,
      event_type: "transition",
      from_status: current.status,
      to_status,
      from_level: current.current_level,
      to_level,
      actor,
      note,
      metadata: {}
    });
    current = updated;
  }

  if (hasFlag(args, "--prepare")) {
    await transition(
      "draft_prepared",
      "L2_DRAFT_PREPARED",
      { prepared_assets: [{ type: "note", title: "Draft", body: "Prepared by script" }] },
      "Prepared draft assets (script)"
    );
  }

  if (hasFlag(args, "--ready")) {
    await transition(
      "awaiting_approval",
      "L3_READY_FOR_APPROVAL",
      { measurement_window: parsed.window },
      "Marked ready for approval (script)"
    );
  }

  if (hasFlag(args, "--approve")) {
    await transition("approved", "L4_APPROVED_FOR_EXECUTION", { approved_by: actor, approved_at: new Date().toISOString() }, "Approved (script; internal only)");
  }

  const outcome = getFlagValue(args, "--outcome");
  if (outcome) {
    await supabase.from("action_synthetic_outcomes_v1").insert({
      action_id: current.id,
      outcome_status: outcome,
      outcome_json: { note: "Synthetic outcome recorded by script", outcome }
    });
    await supabase.from("action_audit_events_v1").insert({
      action_id: current.id,
      event_type: "synthetic_outcome_recorded",
      from_status: null,
      to_status: null,
      from_level: null,
      to_level: null,
      actor,
      note: `Recorded synthetic outcome: ${outcome}`,
      metadata: {}
    });
  }

  const { data: audit, error: auditErr } = await supabase
    .from("action_audit_events_v1")
    .select("id,event_type,from_status,to_status,from_level,to_level,actor,note,metadata,created_at")
    .eq("action_id", current.id)
    .order("created_at", { ascending: true });
  if (auditErr) throw auditErr;

  console.log(JSON.stringify({ ok: true, action: current, audit_count: audit?.length ?? 0, last_audit: audit?.[audit.length - 1] ?? null }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
