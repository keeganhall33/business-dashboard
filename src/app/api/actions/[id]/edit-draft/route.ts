import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getAction, updateDraftAssets } from "@/lib/actions/action-store";

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
    if (current.status !== "draft_prepared") return badRequest("Only draft_prepared actions can be edited");

    const prepared_assets = body["prepared_assets"];
    if (!Array.isArray(prepared_assets) || prepared_assets.length === 0) {
      return badRequest("prepared_assets required");
    }

    const execution_plan = body["execution_plan"];
    if (!execution_plan || typeof execution_plan !== "object") {
      return badRequest("execution_plan required");
    }

    const updated = await updateDraftAssets({
      actionId: id,
      actor,
      idempotencyKey,
      prepared_assets,
      execution_plan: execution_plan as Record<string, unknown>
    });

    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to edit draft", { message: error instanceof Error ? error.message : String(error) });
  }
}
