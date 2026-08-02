import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { recordSyntheticOutcome } from "@/lib/actions/action-store";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const bodyUnknown: unknown = await request.json().catch(() => ({}));
    const body = (bodyUnknown && typeof bodyUnknown === "object") ? (bodyUnknown as Record<string, unknown>) : {};
    const actor = String(body["actor"] ?? "ceo");
    const outcome_status = String(body["outcome_status"] ?? "").trim();
    const outcome_json = body["outcome_json"];
    if (!outcome_status) return badRequest("outcome_status required");
    if (!outcome_json || typeof outcome_json !== "object") return badRequest("outcome_json required");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    await recordSyntheticOutcome({
      actionId: id,
      actor,
      idempotencyKey,
      outcome_status: outcome_status as "successful" | "unsuccessful" | "inconclusive" | "stopped_early",
      outcome_json: outcome_json as Record<string, unknown>
    });

    return ok({ ok: true });
  } catch (error) {
    return serverError("Failed to record outcome", { message: error instanceof Error ? error.message : String(error) });
  }
}
