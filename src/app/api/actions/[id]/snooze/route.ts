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
    const until = String(body["snoozed_until"] ?? "").trim();
    if (!until) return badRequest("snoozed_until required (ISO timestamp)");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const updated = await transitionAction({
      actionId: id,
      to_status: "snoozed",
      to_level: "L3_READY_FOR_APPROVAL",
      actor,
      idempotencyKey,
      note: "Snoozed action",
      patch: { snoozed_until: until }
    });
    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to snooze", { message: error instanceof Error ? error.message : String(error) });
  }
}
