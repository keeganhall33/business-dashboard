import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { transitionAction } from "@/lib/actions/action-store";

export const runtime = "nodejs";

function requireSyntheticMode() {
  const flag = (process.env.ACTIONS_ENABLE_SYNTHETIC_OUTCOMES ?? "").toLowerCase();
  if (!(flag === "1" || flag === "true")) {
    throw new Error("Synthetic measurement disabled (set ACTIONS_ENABLE_SYNTHETIC_OUTCOMES=1)");
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    requireSyntheticMode();
    const { id } = await ctx.params;
    const bodyUnknown: unknown = await request.json().catch(() => ({}));
    const body = (bodyUnknown && typeof bodyUnknown === "object") ? (bodyUnknown as Record<string, unknown>) : {};
    const actor = String(body["actor"] ?? "ceo");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const updated = await transitionAction({
      actionId: id,
      to_status: "measuring",
      to_level: "L5_EXECUTED_AND_MEASURED",
      actor,
      idempotencyKey,
      note: "Entered synthetic measuring mode (no external execution)",
      metadata: { synthetic: true }
    });

    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to start measuring", { message: error instanceof Error ? error.message : String(error) });
  }
}
