import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { insertAuditEvent } from "@/lib/actions/action-store";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const bodyUnknown: unknown = await request.json().catch(() => ({}));
    const body = (bodyUnknown && typeof bodyUnknown === "object") ? (bodyUnknown as Record<string, unknown>) : {};
    const actor = String(body["actor"] ?? "ceo");
    const comment = String(body["comment"] ?? "").trim();
    if (!comment) return badRequest("comment required");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("action_comments_v1").insert({
      action_id: id,
      author: actor,
      body: comment
    });
    if (error) throw error;

    await insertAuditEvent({
      action_id: id,
      event_type: "comment",
      from_status: null,
      to_status: null,
      from_level: null,
      to_level: null,
      actor,
      idempotency_key: idempotencyKey,
      note: "Added comment",
      metadata: {}
    });

    return ok({ ok: true });
  } catch (error) {
    return serverError("Failed to add comment", { message: error instanceof Error ? error.message : String(error) });
  }
}
