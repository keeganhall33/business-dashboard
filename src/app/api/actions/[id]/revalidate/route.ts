import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getAction, insertAuditEvent, transitionAction } from "@/lib/actions/action-store";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const action = await getAction(id);
    if (!action) return ok({ ok: false, error: "Action not found" });

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const bodyUnknown: unknown = await request.json().catch(() => ({}));
    const body = (bodyUnknown && typeof bodyUnknown === "object") ? (bodyUnknown as Record<string, unknown>) : {};
    const actor = String(body["actor"] ?? "ceo");
    const currentEvidence = body["evidence_snapshot"];
    if (!currentEvidence || typeof currentEvidence !== "object") {
      return badRequest("evidence_snapshot required");
    }

    const bytes = Buffer.from(JSON.stringify(currentEvidence));
    const newHash = crypto.createHash("sha256").update(bytes).digest("hex");

    const changed = Boolean(action.evidence_snapshot_hash && newHash !== action.evidence_snapshot_hash);

    // Always store the new evidence separately so history remains intact.
    const supabase = getSupabaseServerClient();
    const { data: snapRow, error: snapErr } = await supabase
      .from("action_evidence_snapshots_v1")
      .insert({ fingerprint: action.recommendation_fingerprint, snapshot_json: currentEvidence, snapshot_hash: newHash })
      .select("id")
      .single();
    if (snapErr) throw snapErr;

    // Mark needs_revalidation when evidence materially changes.
    if (changed && (action.status === "recommended" || action.status === "draft_prepared" || action.status === "awaiting_approval" || action.status === "snoozed")) {
      await transitionAction({
        actionId: id,
        to_status: "needs_revalidation",
        to_level: action.current_level,
        actor,
        idempotencyKey,
        note: "Marked needs_revalidation due to updated evidence",
        metadata: { oldHash: action.evidence_snapshot_hash, newHash, newEvidenceSnapshotId: snapRow.id },
        patch: {
          // keep the original evidence_snapshot_id untouched; store updated evidence pointer in execution_plan metadata.
          execution_plan: {
            ...(action.execution_plan ?? {}),
            revalidation: { latest_evidence_snapshot_id: snapRow.id, latest_evidence_hash: newHash }
          }
        }
      });
    } else {
      await insertAuditEvent({
        action_id: id,
        event_type: "revalidate",
        from_status: action.status,
        to_status: action.status,
        from_level: action.current_level,
        to_level: action.current_level,
        actor,
        idempotency_key: idempotencyKey,
        note: changed ? "Evidence hash changed; needs review" : "Evidence unchanged",
        metadata: { changed, oldHash: action.evidence_snapshot_hash, newHash, newEvidenceSnapshotId: snapRow.id }
      });
    }

    return ok({ ok: true, changed, newHash, newEvidenceSnapshotId: snapRow.id });
  } catch (error) {
    return serverError("Failed to revalidate", { message: error instanceof Error ? error.message : String(error) });
  }
}
