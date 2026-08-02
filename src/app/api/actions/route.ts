import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { listActions, createActionFromRecommendation } from "@/lib/actions/action-store";
import { computeRecommendationFingerprint } from "@/lib/actions/action-fingerprint";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const actions = await listActions();
    return ok({ ok: true, actions });
  } catch (error) {
    return serverError("Failed to list actions", { message: error instanceof Error ? error.message : String(error) });
  }
}

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const bodyUnknown: unknown = await request.json().catch(() => null);
    if (!bodyUnknown || typeof bodyUnknown !== "object") return badRequest("Missing JSON body");
    const body = bodyUnknown as Record<string, unknown>;

    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const recommendationUnknown = body["recommendation"];
    const evidence_snapshot = body["evidence_snapshot"];
    const recommendation = (recommendationUnknown && typeof recommendationUnknown === "object")
      ? (recommendationUnknown as Record<string, unknown>)
      : null;
    if (!recommendation || !evidence_snapshot || typeof evidence_snapshot !== "object") {
      return badRequest("Missing recommendation or evidence_snapshot");
    }
    const evidenceSnapshot = evidence_snapshot as Record<string, unknown>;

    const windowObj = (body["window"] && typeof body["window"] === "object") ? (body["window"] as Record<string, unknown>) : {};

    const fingerprint = computeRecommendationFingerprint({
      category: String(recommendation["category"] ?? "unknown"),
      channel: String((Array.isArray(recommendation["affected_channels"]) ? (recommendation["affected_channels"] as unknown[])[0] : "unknown") ?? "unknown"),
      affected_products: Array.isArray(recommendation["affected_products"]) ? (recommendation["affected_products"] as string[]) : [],
      affected_audiences: Array.isArray(recommendation["affected_audiences"]) ? (recommendation["affected_audiences"] as string[]) : [],
      action_key: String(recommendation["id"] ?? "unknown"),
      evidence_window: {
        startDate: String(windowObj["startDate"] ?? ""),
        endDate: String(windowObj["endDate"] ?? "")
      }
    });

    const actor = String(body["actor"] ?? "ceo");
    if (!actor || actor.toLowerCase().includes("agent")) return badRequest("Invalid actor");

    const action = await createActionFromRecommendation({
      recommendationId: String(recommendation["id"] ?? ""),
      opportunityId: (recommendation["opportunity_id"] as string | null) ?? null,
      fingerprint,
      title: String(recommendation["title"] ?? ""),
      description: (recommendation["reason"] as string | null) ?? null,
      category: String(recommendation["category"] ?? "unknown"),
      channel: String((Array.isArray(recommendation["affected_channels"]) ? (recommendation["affected_channels"] as unknown[])[0] : "unknown") ?? "unknown"),
      affected_products: (Array.isArray(recommendation["affected_products"]) ? (recommendation["affected_products"] as string[]) : []),
      affected_audiences: (Array.isArray(recommendation["affected_audiences"]) ? (recommendation["affected_audiences"] as string[]) : []),
      priority_score: ((recommendation["priority_score"] as Record<string, unknown>) ?? ({} as Record<string, unknown>)),
      confidence: (recommendation["confidence"] as string) ?? "possible",
      expected_outcome: (recommendation["expected_outcome"] as string) ?? "",
      estimated_impact: ((recommendation["estimated_incremental_revenue"] as Record<string, unknown>) ?? ({} as Record<string, unknown>)),
      estimated_cost: ((recommendation["estimated_cost"] as Record<string, unknown>) ?? ({} as Record<string, unknown>)),
      estimated_effort: ((recommendation["estimated_effort"] as Record<string, unknown>) ?? ({} as Record<string, unknown>)),
      risk: ((recommendation["risk"] as "low" | "medium" | "high") ?? "medium"),
      evidence_snapshot: evidenceSnapshot,
      approval_requirements: ((recommendation["approval_requirements"] as Record<string, unknown>) ?? ({} as Record<string, unknown>)),
      measurement_window: ((recommendation["measurement_window"] as Record<string, unknown>) ?? ({} as Record<string, unknown>)),
      idempotencyKey,
      actor
    });

    return ok({ ok: true, action });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Deterministic client-facing failures for known policy blocks.
    if (
      message.includes("permanently suppressed") ||
      message.includes("rejected") ||
      message.includes("evidence")
    ) {
      return badRequest(message);
    }
    return serverError("Failed to create action", { message });
  }
}
