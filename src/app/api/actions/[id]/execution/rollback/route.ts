import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { executionError, ok } from "@/lib/api/execution-responses";
import { getExecutionActor } from "@/lib/actions/execution/api-actor";

import { createMilestone12AdapterRegistry } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import { orchestrateRollback } from "@/lib/actions/execution/rollback-orchestrator";
import { getExecutionRequestById, insertExecutionRollback, updateExecutionRollbackState } from "@/lib/actions/execution/execution-repo";
import { acquireExecutionLock, releaseExecutionLock } from "@/lib/actions/execution/lock-manager";
import { completeIdempotencyRecord, computeRequestHash, upsertIdempotencyRecord } from "@/lib/actions/execution/idempotency-service";
import { insertAuditEvent } from "@/lib/actions/action-store";
import type { ExecutionAdapterId, ExecutionContext, ExecutionState } from "@/lib/actions/execution/adapter-contract";

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

    const rollbackPlan = (body["rollbackPlan"] && typeof body["rollbackPlan"] === "object") ? (body["rollbackPlan"] as Record<string, unknown>) : null;
    const preview = (body["rollbackPreview"] && typeof body["rollbackPreview"] === "object") ? (body["rollbackPreview"] as Record<string, unknown>) : null;
    const confirmed = Boolean(body["confirmed"] ?? false);

    if (!rollbackPlan) throw new Error("Missing rollbackPlan");
    if (!preview) throw new Error("Missing rollbackPreview");
    const planHash = String(rollbackPlan["hash"] ?? "").trim();
    const planRaw = (rollbackPlan["raw"] && typeof rollbackPlan["raw"] === "object") ? (rollbackPlan["raw"] as Record<string, unknown>) : null;
    const previewSummary = String(preview["summary"] ?? "").trim();
    const previewWarnings = Array.isArray(preview["warnings"]) ? (preview["warnings"] as string[]) : [];
    if (!planHash || !planRaw) throw new Error("Invalid rollbackPlan");
    if (!previewSummary) throw new Error("Invalid rollbackPreview");

    const registry = createMilestone12AdapterRegistry();
    const adapter = registry.getAdapter(req.adapter_id as ExecutionAdapterId);
    if (!adapter) throw new Error("Unknown adapter");

    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const env: ExecutionContext["env"] = {
      supabaseUrl,
      category: String(body["category"] ?? "email"),
      adapterEnabled: true,
      categoryEnabled: true,
      emergencyStop: false
    };

    const result = await orchestrateRollback({
      executionRequestId,
      operatorId: actor,
      idempotencyKey,
      adapter,
      env,
      rollbackPlan: { hash: planHash, raw: planRaw, preview: { summary: previewSummary, warnings: previewWarnings } },
      confirmed,
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
            await completeIdempotencyRecord({ id: input.id, completionState: input.completionState, responseSnapshot: input.responseSnapshot });
          }
        },
        repo: {
          getExecutionRequestById: async (id) => {
            const row = await getExecutionRequestById(id);
            if (!row) return null;
            return {
              id: row.id,
              action_id: row.action_id,
              execution_state: row.execution_state as ExecutionState,
              payload_hash: row.payload_hash,
              payload_json: row.payload_json,
              action_state_hash: row.action_state_hash,
              reversibility: row.reversibility,
              irreversible_reason: row.irreversible_reason
            };
          },
          updateExecutionRequestState: async (input: { id: string; execution_state: ExecutionState }) => {
            const { updateExecutionRequestState } = await import("@/lib/actions/execution/execution-repo");
            await updateExecutionRequestState({ id: input.id, execution_state: input.execution_state });
          },
          insertRollback: async (row) => {
            const inserted = await insertExecutionRollback(row as unknown as Parameters<typeof insertExecutionRollback>[0]);
            return { id: inserted.id };
          },
          updateRollback: async (input) => {
            await updateExecutionRollbackState({
              id: input.id,
              rollback_state: input.rollback_state,
              result_json: input.result_json ?? null,
              started_at: input.started_at ?? null,
              ended_at: input.ended_at ?? null
            });
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

    return ok({ ...result });
  } catch (error) {
    return executionError(error, "Failed to rollback execution");
  }
}
