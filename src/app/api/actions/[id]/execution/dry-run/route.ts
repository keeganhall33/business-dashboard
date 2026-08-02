import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { executionError, ok } from "@/lib/api/execution-responses";
import { getExecutionActor } from "@/lib/actions/execution/api-actor";

import { createMilestone12AdapterRegistry } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import { getExecutionRequestById } from "@/lib/actions/execution/execution-repo";
import { runExecutionDryRun } from "@/lib/actions/execution/dry-run-service";
import type { ExecutionAdapterId } from "@/lib/actions/execution/adapter-contract";

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

    const req = await getExecutionRequestById(executionRequestId);
    if (!req) throw new Error("Execution request not found");

    const registry = createMilestone12AdapterRegistry();
    const adapter = registry.getAdapter(req.adapter_id as ExecutionAdapterId);
    if (!adapter) throw new Error("Unknown adapter");

    const result = await runExecutionDryRun({
      executionRequestId,
      adapter,
      operatorId: actor,
      actionStateHash: req.action_state_hash,
      payloadHash: req.payload_hash,
      idempotencyKey
    });

    return ok({ ...result });
  } catch (error) {
    return executionError(error, "Failed to run dry run");
  }
}
