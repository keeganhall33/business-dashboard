import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { executionError, ok } from "@/lib/api/execution-responses";
import { applyM12HarnessOverrides, getExecutionActor, getHarnessGateOverrides } from "@/lib/actions/execution/api-actor";

import { createMilestone12AdapterRegistry } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import { orchestrateExecutionAttempt } from "@/lib/actions/execution/execution-orchestrator";
import { getExecutionRequestById } from "@/lib/actions/execution/execution-repo";
import { getAction } from "@/lib/actions/action-store";
import { acquireExecutionLock, releaseExecutionLock } from "@/lib/actions/execution/lock-manager";
import { upsertIdempotencyRecord, completeIdempotencyRecord, computeRequestHash } from "@/lib/actions/execution/idempotency-service";
import { insertAuditEvent } from "@/lib/actions/action-store";
import type { ExecutionAdapterId, ExecutionState } from "@/lib/actions/execution/adapter-contract";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";

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

    const overrides = getHarnessGateOverrides(request);

    // More precise preconditions than the orchestrator's generic "must be confirmed".
    if (req.execution_state === "requested") {
      throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: "Dry run required before execution", httpStatus: 400 });
    }
    if (req.execution_state === "dry_run_succeeded" || req.execution_state === "confirmation_required") {
      throw new ExecutionDomainError({ code: "EXECUTION_CONFIRMATION_REQUIRED", message: "Operator confirmation required before execution", httpStatus: 400 });
    }

    const registry = createMilestone12AdapterRegistry({
      enabledAdapters: new Set(["mock"]),
      enabledCategories: new Set(["email"]),
      emergencyStopActionIds: new Set()
    });
    const adapter = registry.getAdapter(req.adapter_id as ExecutionAdapterId);
    if (!adapter) throw new Error("Unknown adapter");

    const applied = applyM12HarnessOverrides({
      registry,
      actionId: req.action_id,
      adapterId: "mock",
      category: "email",
      overrides
    });
    const registryOverride = {
      ...registry,
      isAdapterEnabled: () => applied.adapterEnabled,
      isCategoryEnabled: () => applied.categoryEnabled,
      isEmergencyStopEnabled: () => applied.emergencyStop
    };

    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

    const result = await orchestrateExecutionAttempt({
      executionRequestId,
      operatorId: actor,
      idempotencyKey,
      supabaseUrl,
      registry: registryOverride,
      adapter,
      runtime: applied.runtime,
      deps: {
        nowUtc: () => new Date().toISOString(),
        idempotency: {
          computeRequestHash: (v) => computeRequestHash(v),
          start: async (input) => {
            const rec = await upsertIdempotencyRecord({
              operationType: input.operationType,
              actionId: input.actionId,
              executionRequestId: input.executionRequestId,
              idempotencyKey: input.idempotencyKey,
              requestHash: input.requestHash,
              responseSnapshot: input.responseSnapshot,
              completionState: "started"
            });
            return { replay: rec.replay, id: rec.record.id, response_snapshot: rec.record.response_snapshot as Record<string, unknown> };
          },
          complete: async (input) => {
            await completeIdempotencyRecord({
              id: input.id,
              completionState: input.completionState,
              responseSnapshot: input.responseSnapshot
            });
          }
        },
        getAction: async (actionId) => getAction(actionId),
        repo: {
          getExecutionRequestById: async (id) => getExecutionRequestById(id),
          getCurrentConfirmation: async (rid) => {
            const { getCurrentConfirmation } = await import("@/lib/actions/execution/execution-repo");
            return getCurrentConfirmation(rid);
          },
          updateExecutionRequestState: async (input: { id: string; execution_state: ExecutionState; payload_json_patch?: Record<string, unknown> }) => {
            const { updateExecutionRequestState } = await import("@/lib/actions/execution/execution-repo");
            await updateExecutionRequestState({ id: input.id, execution_state: input.execution_state, payload_json_patch: input.payload_json_patch });
          },
          insertAttempt: async (row) => {
            const { insertExecutionAttempt } = await import("@/lib/actions/execution/execution-repo");
            const inserted = await insertExecutionAttempt(row);
            return { id: inserted.id, started_at: inserted.started_at };
          },
          insertStep: async (row) => {
            const { insertExecutionStep } = await import("@/lib/actions/execution/execution-repo");
            await insertExecutionStep(row);
          },
          updateAttempt: async (input) => {
            const { updateExecutionAttempt } = await import("@/lib/actions/execution/execution-repo");
            await updateExecutionAttempt(input);
          }
        },
        lock: {
          acquire: async (l) => {
            const lock = await acquireExecutionLock({
              actionId: l.actionId,
              executionRequestId: l.executionRequestId,
              owner: l.owner,
              reason: l.reason,
              ttlSeconds: l.ttlSeconds,
              idempotencyKey: l.idempotencyKey
            });
            return lock.ok ? ({ ok: true } as const) : ({ ok: false } as const);
          },
          release: async (l) => {
            await releaseExecutionLock({ actionId: l.actionId, owner: l.owner, idempotencyKey: l.idempotencyKey });
          }
        },
        audit: {
          event: async (e) => {
            await insertAuditEvent({
              action_id: e.action_id,
              event_type: e.event_type,
              from_status: null,
              to_status: null,
              from_level: null,
              to_level: null,
              actor: e.actor,
              idempotency_key: e.idempotency_key,
              note: e.note,
              metadata: e.metadata
            });
          }
        }
      }
    });

    return ok({ ok: true, result: result.result });
  } catch (error) {
    return executionError(error, "Failed to execute action");
  }
}
