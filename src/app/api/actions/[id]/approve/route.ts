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
    const confirm = Boolean(body["confirm"]);
    if (!confirm) return badRequest("confirm=true required");

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    if (!actor || actor.toLowerCase().includes("agent")) return badRequest("Invalid actor (no agent self-approval)");

    const current = await getAction(id);
    if (!current) return badRequest("Action not found");
    if (current.status !== "awaiting_approval") return badRequest("Action not awaiting approval");
    if (!current.evidence_snapshot_id) return badRequest("Missing evidence snapshot");
    if (current.expires_at && new Date(current.expires_at).getTime() < Date.now()) return badRequest("Action evidence expired");

    const hasMeasurementPlan = current.measurement_window && Object.keys(current.measurement_window).length > 0;
    if (!hasMeasurementPlan) return badRequest("Missing measurement plan");
    if (!Array.isArray(current.prepared_assets) || current.prepared_assets.length === 0) return badRequest("Missing prepared assets");

    // Require an execution preview (even though execution is disabled).
    const plan = current.execution_plan ?? {};
    const hasPreview = typeof (plan as Record<string, unknown>)["preview"] === "string" || Array.isArray((plan as Record<string, unknown>)["steps"]);
    if (!hasPreview) return badRequest("Missing execution preview (execution_plan.preview or execution_plan.steps required)");

    const requirements = current.approval_requirements ?? {};

    // Budget requirement (generic): if the action says it needs a budget, require a numeric budget.
    if ((requirements as Record<string, unknown>)["requires_budget"] === true) {
      const budget = (requirements as Record<string, unknown>)["budget_usd"];
      if (!(typeof budget === "number" && Number.isFinite(budget) && budget > 0)) {
        return badRequest("Budget required (approval_requirements.budget_usd)");
      }
    }

    // Rollback plan requirement for high-risk surfaces.
    const requiresRollback = current.category === "website" || current.category === "pricing" || current.category === "inventory";
    if (requiresRollback) {
      const rollback = (plan as Record<string, unknown>)["rollback_plan"];
      if (!(typeof rollback === "string" && rollback.trim().length > 0)) {
        return badRequest("Rollback plan required (execution_plan.rollback_plan)");
      }
    }

    // Recipient/audience preview requirement (generic)
    if ((requirements as Record<string, unknown>)["requires_recipient_preview"] === true) {
      const preview = (plan as Record<string, unknown>)["recipient_preview"];
      if (!preview) return badRequest("Recipient preview required (execution_plan.recipient_preview)");
    }

    const updated = await transitionAction({
      actionId: id,
      to_status: "approved",
      to_level: "L4_APPROVED_FOR_EXECUTION",
      actor,
      idempotencyKey,
      note: "Approved for future execution (no external execution performed)",
      metadata: { external_side_effects: 0 }
    });
    return ok({ ok: true, action: updated, warning: "Approved for future execution. No external action has been performed." });
  } catch (error) {
    return serverError("Failed to approve", { message: error instanceof Error ? error.message : String(error) });
  }
}
