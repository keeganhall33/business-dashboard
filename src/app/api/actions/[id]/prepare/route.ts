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
    const assets = Array.isArray(body["prepared_assets"]) ? (body["prepared_assets"] as unknown[]) : [];
    if (!assets.length) return badRequest("prepared_assets required");

    const executionPlan = body["execution_plan"];
    if (!executionPlan || typeof executionPlan !== "object") return badRequest("execution_plan required");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const updated = await transitionAction({
      actionId: id,
      to_status: "draft_prepared",
      to_level: "L2_DRAFT_PREPARED",
      actor,
      idempotencyKey,
      note: "Prepared draft assets",
      patch: { prepared_assets: assets, execution_plan: executionPlan as Record<string, unknown> }
    });
    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to prepare action", { message: error instanceof Error ? error.message : String(error) });
  }
}
