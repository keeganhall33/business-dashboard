import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { DurableAction } from "./action-contract";
import { isValidTransition } from "./action-transitions";
import {
  ACTIVE_DEDUPE_STATUSES,
  isPermanentlySuppressed,
  shouldBlockReconsiderationAfterRejection
} from "./suppression-logic";

function requireWritesEnabled() {
  // Absolute rule: do not allow action persistence writes in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Action writes are disabled in production");
  }
  const flag = (process.env.ACTIONS_ENABLE_WRITES ?? "").toLowerCase();
  if (!(flag === "1" || flag === "true")) {
    throw new Error("Action writes disabled (set ACTIONS_ENABLE_WRITES=1 for local/staging only)");
  }
}

export async function listActions(): Promise<DurableAction[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("action_actions_v1")
    .select(
      "id,recommendation_id,opportunity_id,approval_level,title,description,category,channel,affected_products,affected_audiences,current_level,status,priority_score,confidence,expected_outcome,estimated_impact,estimated_cost,estimated_effort,risk,evidence_snapshot_id,evidence_snapshot_hash,assumptions,limitations,prepared_assets,execution_plan,approval_requirements,last_idempotency_key,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,snoozed_until,expires_at,executed_at,measurement_window,baseline_snapshot,result_snapshot,outcome,lessons,recommendation_fingerprint,created_at,updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...(row as unknown as DurableAction), evidence_snapshot: null }));
}

export async function getAction(actionId: string): Promise<DurableAction | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("action_actions_v1")
    .select(
      "id,recommendation_id,opportunity_id,approval_level,title,description,category,channel,affected_products,affected_audiences,current_level,status,priority_score,confidence,expected_outcome,estimated_impact,estimated_cost,estimated_effort,risk,evidence_snapshot_id,evidence_snapshot_hash,assumptions,limitations,prepared_assets,execution_plan,approval_requirements,last_idempotency_key,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,snoozed_until,expires_at,executed_at,measurement_window,baseline_snapshot,result_snapshot,outcome,lessons,recommendation_fingerprint,created_at,updated_at"
    )
    .eq("id", actionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let snapshot: Record<string, unknown> | null = null;
  if (data.evidence_snapshot_id) {
    const { data: snap, error: snapErr } = await supabase
      .from("action_evidence_snapshots_v1")
      .select("snapshot_json")
      .eq("id", data.evidence_snapshot_id)
      .maybeSingle();
    if (!snapErr) snapshot = (snap?.snapshot_json as Record<string, unknown> | null) ?? null;
  }

  return { ...(data as unknown as DurableAction), evidence_snapshot: snapshot };
}

export async function createActionFromRecommendation(input: {
  recommendationId: string;
  opportunityId: string | null;
  fingerprint: string;
  title: string;
  description: string | null;
  category: string;
  channel: string;
  affected_products: string[];
  affected_audiences: string[];
  priority_score: Record<string, unknown>;
  confidence: string;
  expected_outcome: string;
  estimated_impact: Record<string, unknown>;
  estimated_cost: Record<string, unknown>;
  estimated_effort: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  evidence_snapshot: Record<string, unknown>;
  approval_requirements: Record<string, unknown>;
  measurement_window: Record<string, unknown>;
  idempotencyKey: string;
  actor: string;
}): Promise<DurableAction> {
  requireWritesEnabled();
  const supabase = getSupabaseAdminClient();

  // Idempotency: store idempotency key as part of snapshot hash.
  const snapshotBytes = Buffer.from(JSON.stringify(input.evidence_snapshot));
  const snapshotHash = crypto.createHash("sha256").update(snapshotBytes).digest("hex");

  // Permanent suppression (preferences table) blocks creation.
  const { data: pref, error: prefErr } = await supabase
    .from("action_preferences_v1")
    .select("suppressed")
    .eq("fingerprint", input.fingerprint)
    .maybeSingle();
  if (prefErr && prefErr.code !== "PGRST116") throw prefErr;
  const prefObj = (pref && typeof pref === "object" && "suppressed" in pref) ? (pref as { suppressed: boolean }) : null;
  if (isPermanentlySuppressed(prefObj)) {
    throw new Error("Recommendation is permanently suppressed");
  }

  // Dedupe by fingerprint: update evidence snapshot for existing active action.
  const { data: existing, error: existingErr } = await supabase
    .from("action_actions_v1")
    .select("id,evidence_snapshot_id,status,current_level")
    .eq("recommendation_fingerprint", input.fingerprint)
    .in("status", [...ACTIVE_DEDUPE_STATUSES])
    .maybeSingle();
  if (existingErr && existingErr.code !== "PGRST116") throw existingErr;

  // Temporary rejection: if most recent rejected action exists and evidence is unchanged, block reconsideration.
  const { data: rejected, error: rejectedErr } = await supabase
    .from("action_actions_v1")
    .select("evidence_snapshot_hash")
    .eq("recommendation_fingerprint", input.fingerprint)
    .eq("status", "rejected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rejectedErr && rejectedErr.code !== "PGRST116") throw rejectedErr;
  const rejectedHash =
    rejected && typeof rejected === "object" && "evidence_snapshot_hash" in rejected
      ? (rejected as { evidence_snapshot_hash: string | null }).evidence_snapshot_hash
      : null;
  if (shouldBlockReconsiderationAfterRejection({ previousRejectedEvidenceHash: rejectedHash ?? null, newEvidenceHash: snapshotHash })) {
    throw new Error("Recommendation was rejected and evidence has not materially changed");
  }

  const { data: snapRow, error: snapErr } = await supabase
    .from("action_evidence_snapshots_v1")
    .insert({ fingerprint: input.fingerprint, snapshot_json: input.evidence_snapshot, snapshot_hash: snapshotHash })
    .select("id")
    .single();
  if (snapErr) throw snapErr;

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from("action_actions_v1")
      .update({
        evidence_snapshot_id: snapRow.id,
        evidence_snapshot_hash: snapshotHash,
        last_idempotency_key: input.idempotencyKey,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id);
    if (updErr) throw updErr;
    await supabase.from("action_audit_events_v1").insert({
      action_id: existing.id,
      event_type: "evidence_updated",
      from_status: existing.status,
      to_status: existing.status,
      from_level: existing.current_level,
      to_level: existing.current_level,
      actor: input.actor,
      idempotency_key: input.idempotencyKey,
      note: "Updated evidence snapshot; deduped by fingerprint",
      metadata: {}
    });
    const updated = await getAction(existing.id);
    if (!updated) throw new Error("Failed to load updated action");
    return updated;
  }

  const { data: created, error: createErr } = await supabase
    .from("action_actions_v1")
    .insert({
      recommendation_id: input.recommendationId,
      opportunity_id: input.opportunityId,
      approval_level: "L1_RECOMMENDATION",
      title: input.title,
      description: input.description,
      category: input.category,
      channel: input.channel,
      affected_products: input.affected_products,
      affected_audiences: input.affected_audiences,
      current_level: "L1_RECOMMENDATION",
      status: "recommended",
      priority_score: input.priority_score,
      confidence: input.confidence,
      expected_outcome: input.expected_outcome,
      estimated_impact: input.estimated_impact,
      estimated_cost: input.estimated_cost,
      estimated_effort: input.estimated_effort,
      risk: input.risk,
      evidence_snapshot_id: snapRow.id,
      evidence_snapshot_hash: snapshotHash,
      prepared_assets: [],
      execution_plan: {},
      approval_requirements: input.approval_requirements,
      measurement_window: input.measurement_window,
      last_idempotency_key: input.idempotencyKey,
      recommendation_fingerprint: input.fingerprint
    })
    .select("id")
    .single();
  if (createErr) throw createErr;

  await supabase.from("action_audit_events_v1").insert({
    action_id: created.id,
    event_type: "created",
    from_status: null,
    to_status: "recommended",
    from_level: null,
    to_level: "L1_RECOMMENDATION",
    actor: input.actor,
    idempotency_key: input.idempotencyKey,
    note: "Created action from recommendation",
    metadata: {}
  });

  const result = await getAction(created.id);
  if (!result) throw new Error("Failed to load created action");
  return result;
}

export async function transitionAction(input: {
  actionId: string;
  to_status: DurableAction["status"];
  to_level: DurableAction["current_level"];
  actor: string;
  idempotencyKey: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
  patch?: Partial<Pick<DurableAction, "prepared_assets" | "approval_requirements" | "execution_plan" | "measurement_window" | "snoozed_until" | "rejection_reason" | "approved_by" | "approved_at" | "rejected_by" | "rejected_at" | "expires_at">>;
}): Promise<DurableAction> {
  requireWritesEnabled();
  const supabase = getSupabaseAdminClient();
  const current = await getAction(input.actionId);
  if (!current) throw new Error("Action not found");

  const from_status = current.status;
  const from_level = current.current_level;

  const valid = isValidTransition({ from_status, to_status: input.to_status, from_level, to_level: input.to_level });
  if (!valid) {
    throw new Error(`Invalid transition ${from_status}/${from_level} -> ${input.to_status}/${input.to_level}`);
  }

  const update: Record<string, unknown> = {
    status: input.to_status,
    current_level: input.to_level,
    last_idempotency_key: input.idempotencyKey,
    ...(input.patch ?? {})
  };

  // Approval/rejection timestamps
  if (input.to_status === "approved") {
    update.approved_by = input.actor;
    update.approved_at = new Date().toISOString();
  }
  if (input.to_status === "rejected") {
    update.rejected_by = input.actor;
    update.rejected_at = new Date().toISOString();
  }

  const { error } = await supabase.from("action_actions_v1").update(update).eq("id", input.actionId);
  if (error) throw error;

  await insertAuditEvent({
    action_id: input.actionId,
    event_type: "transition",
    from_status,
    to_status: input.to_status,
    from_level,
    to_level: input.to_level,
    actor: input.actor,
    idempotency_key: input.idempotencyKey,
    note: input.note ?? null,
    metadata: input.metadata ?? {}
  });

  const updated = await getAction(input.actionId);
  if (!updated) throw new Error("Failed to load updated action");
  return updated;
}

export async function recordSyntheticOutcome(input: {
  actionId: string;
  actor: string;
  idempotencyKey: string;
  outcome_status: "successful" | "unsuccessful" | "inconclusive" | "stopped_early";
  outcome_json: Record<string, unknown>;
}): Promise<void> {
  requireWritesEnabled();
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("action_synthetic_outcomes_v1").insert({
    action_id: input.actionId,
    outcome_status: input.outcome_status,
    outcome_json: input.outcome_json
  });
  if (error) throw error;
  await insertAuditEvent({
    action_id: input.actionId,
    event_type: "synthetic_outcome_recorded",
    from_status: null,
    to_status: null,
    from_level: null,
    to_level: null,
    actor: input.actor,
    idempotency_key: input.idempotencyKey,
    note: `Recorded synthetic outcome: ${input.outcome_status}`,
    metadata: {}
  });
}

export async function insertAuditEvent(event: {
  action_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_level: string | null;
  to_level: string | null;
  actor: string;
  idempotency_key?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("action_audit_events_v1").insert({
    action_id: event.action_id,
    event_type: event.event_type,
    from_status: event.from_status,
    to_status: event.to_status,
    from_level: event.from_level,
    to_level: event.to_level,
    actor: event.actor,
    idempotency_key: event.idempotency_key ?? null,
    note: event.note ?? null,
    metadata: event.metadata ?? {}
  });
  if (error) throw error;
}

export async function listAuditEvents(actionId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("action_audit_events_v1")
    .select("id,action_id,event_type,from_status,to_status,from_level,to_level,actor,note,metadata,created_at")
    .eq("action_id", actionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
