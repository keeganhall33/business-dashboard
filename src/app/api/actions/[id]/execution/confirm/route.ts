import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { executionError, ok } from "@/lib/api/execution-responses";
import { getExecutionActor } from "@/lib/actions/execution/api-actor";

import { confirmExecutionRequest } from "@/lib/actions/execution/confirmation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { actor } = getExecutionActor(request);
    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) throw new Error("Missing x-idempotency-key");

    const bodyUnknown: unknown = await request.json().catch(() => null);
    if (!bodyUnknown || typeof bodyUnknown !== "object") throw new Error("Missing JSON body");
    const body = bodyUnknown as Record<string, unknown>;
    const executionRequestId = String(body["executionRequestId"] ?? "").trim();
    if (!executionRequestId) throw new Error("Missing executionRequestId");

    const irreversibleAcknowledged = Boolean(body["irreversibleAcknowledged"] ?? false);
    const approvalSnapshot = (body["approvalSnapshot"] && typeof body["approvalSnapshot"] === "object")
      ? (body["approvalSnapshot"] as Record<string, unknown>)
      : {};

    const result = await confirmExecutionRequest({
      executionRequestId,
      operatorActor: actor,
      idempotencyKey,
      irreversibleAcknowledged,
      approvalSnapshot
    });

    return ok({ ...result });
  } catch (error) {
    return executionError(error, "Failed to confirm execution");
  }
}
