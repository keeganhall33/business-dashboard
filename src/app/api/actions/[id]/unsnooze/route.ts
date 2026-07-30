import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { transitionAction } from "@/lib/actions/action-store";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing x-idempotency-key" }), { status: 400 });
    }

    const updated = await transitionAction({
      actionId: id,
      to_status: "awaiting_approval",
      to_level: "L3_READY_FOR_APPROVAL",
      actor: "ceo",
      idempotencyKey,
      note: "Unsnoozed",
      patch: { snoozed_until: null }
    });
    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to unsnooze", { message: error instanceof Error ? error.message : String(error) });
  }
}

