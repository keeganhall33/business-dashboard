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
    const measurement_plan = body["measurement_window"];
    if (!measurement_plan || typeof measurement_plan !== "object") return badRequest("measurement_window required");
    const measurementWindow = measurement_plan as Record<string, unknown>;

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const updated = await transitionAction({
      actionId: id,
      to_status: "awaiting_approval",
      to_level: "L3_READY_FOR_APPROVAL",
      actor,
      idempotencyKey,
      note: "Marked ready for approval",
      patch: { measurement_window: measurementWindow }
    });
    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to mark ready", { message: error instanceof Error ? error.message : String(error) });
  }
}
