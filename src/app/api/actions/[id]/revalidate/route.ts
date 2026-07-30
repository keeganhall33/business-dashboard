import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getAction, insertAuditEvent, transitionAction } from "@/lib/actions/action-store";
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

    const snapshot = action.evidence_snapshot;
    const bytes = Buffer.from(JSON.stringify(snapshot ?? {}));
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");

    const changed = action.evidence_snapshot_hash && hash !== action.evidence_snapshot_hash;

    if (changed && (action.status === "recommended" || action.status === "draft_prepared" || action.status === "awaiting_approval" || action.status === "snoozed")) {
      await transitionAction({
        actionId: id,
        to_status: "needs_revalidation",
        to_level: action.current_level,
        actor: "ceo",
        idempotencyKey,
        note: "Marked needs_revalidation due to stale evidence hash",
        metadata: { hash }
      });
    } else {
      await insertAuditEvent({
        action_id: id,
        event_type: "revalidate",
        from_status: action.status,
        to_status: action.status,
        from_level: action.current_level,
        to_level: action.current_level,
        actor: "ceo",
        idempotency_key: idempotencyKey,
        note: changed ? "Evidence hash changed; needs review" : "Evidence unchanged",
        metadata: { changed, hash }
      });
    }

    return ok({ ok: true, changed, hash });
  } catch (error) {
    return serverError("Failed to revalidate", { message: error instanceof Error ? error.message : String(error) });
  }
}
