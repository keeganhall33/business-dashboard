import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getAction, transitionAction } from "@/lib/actions/action-store";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const bodyUnknown: unknown = await request.json().catch(() => ({}));
    const body = (bodyUnknown && typeof bodyUnknown === "object") ? (bodyUnknown as Record<string, unknown>) : {};
    const actor = String(body["actor"] ?? "ceo");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const current = await getAction(id);
    if (!current) return badRequest("Action not found");

    const updated = await transitionAction({
      actionId: id,
      to_status: "expired",
      to_level: current.current_level,
      actor,
      idempotencyKey,
      note: "Expired due to stale evidence",
      patch: { expires_at: new Date().toISOString() }
    });

    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to expire", { message: error instanceof Error ? error.message : String(error) });
  }
}

