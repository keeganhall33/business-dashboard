import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { executionError, ok } from "@/lib/api/execution-responses";
import { getExecutionActor, getHarnessGateOverrides } from "@/lib/actions/execution/api-actor";

import { createExecutionRequest } from "@/lib/actions/execution/execution-request-service";
import { createMilestone12AdapterRegistry } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import type { ExecutionAdapterId, Reversibility } from "@/lib/actions/execution/adapter-contract";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  const prevBoundary = process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY;
  const prevMock = process.env.ACTIONS_ENABLE_MOCK_EXECUTION;
  const prevNodeEnv = process.env.NODE_ENV;

  try {
    const { id: actionId } = await ctx.params;
    const { actor } = getExecutionActor(request);
    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) {
      return executionError(new Error("Missing x-idempotency-key"), "Bad request");
    }

    const bodyUnknown: unknown = await request.json().catch(() => null);
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return executionError(new Error("Missing JSON body"), "Bad request");
    }
    const body = bodyUnknown as Record<string, unknown>;

    const adapterId = String(body["adapterId"] ?? "mock") as ExecutionAdapterId;
    const reversibility = String(body["reversibility"] ?? "reversible") as Reversibility;
    const irreversibleReason = (body["irreversibleReason"] as string | null) ?? null;
    const payload = (body["payload"] && typeof body["payload"] === "object") ? (body["payload"] as Record<string, unknown>) : null;
    if (!payload) return executionError(new Error("Missing payload"), "Bad request");

    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

    const overrides = getHarnessGateOverrides(request);
    if (overrides.executionBoundaryEnabled === false) process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "0";
    if (overrides.mockExecutionEnabled === false) process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "0";

    // Harness-only override to force the production hard-block without contacting production.
    if (process.env.NODE_ENV !== "production" && String(request.headers.get("x-m12-force-node-env") ?? "") === "production") {
      (process.env as unknown as Record<string, string | undefined>)["NODE_ENV"] = "production";
    }

    const expiresAtUtc = String(body["expiresAtUtc"] ?? "").trim();
    if (!expiresAtUtc) {
      throw new Error("Missing expiresAtUtc");
    }
    const registry = createMilestone12AdapterRegistry({
      enabledAdapters: new Set(["mock"]),
      enabledCategories: new Set(["email"]),
      emergencyStopActionIds: new Set()
    });

    const adapterEnabled = overrides.adapterEnabled ?? registry.isAdapterEnabled("mock");
    const categoryEnabled = overrides.categoryEnabled ?? registry.isCategoryEnabled("email");
    const emergencyStop = overrides.emergencyStop ?? registry.isEmergencyStopEnabled(actionId);

    const registryOverride = {
      ...registry,
      isAdapterEnabled: () => adapterEnabled,
      isCategoryEnabled: () => categoryEnabled,
      isEmergencyStopEnabled: () => emergencyStop
    };

    const result = await createExecutionRequest({
      actionId,
      adapterId: adapterId as ExecutionAdapterId,
      operatorId: actor,
      idempotencyKey,
      supabaseUrl,
      payload,
      reversibility,
      irreversibleReason,
      expiresAtUtc,
      harnessRunId: (body["harnessRunId"] as string | null) ?? null,
      registry: registryOverride
    });

    return ok({ ...result });
  } catch (error) {
    return executionError(error, "Failed to request execution");
  } finally {
    process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = prevBoundary;
    process.env.ACTIONS_ENABLE_MOCK_EXECUTION = prevMock;
    (process.env as unknown as Record<string, string | undefined>)["NODE_ENV"] = prevNodeEnv;
  }
}
