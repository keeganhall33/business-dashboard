import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { transitionAction } from "@/lib/actions/action-store";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const bodyUnknown: unknown = await request.json().catch(() => ({}));
    const body = (bodyUnknown && typeof bodyUnknown === "object") ? (bodyUnknown as Record<string, unknown>) : {};
    const actor = String(body["actor"] ?? "ceo");
    const reason = String(body["reason"] ?? "").trim();
    if (!reason) return badRequest("reason required");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const updated = await transitionAction({
      actionId: id,
      to_status: "rejected",
      to_level: "L3_READY_FOR_APPROVAL",
      actor,
      idempotencyKey,
      note: "Rejected action",
      patch: { rejection_reason: reason }
    });
    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to reject", { message: error instanceof Error ? error.message : String(error) });
  }
}
