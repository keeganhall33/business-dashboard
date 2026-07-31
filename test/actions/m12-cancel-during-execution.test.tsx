import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateCancellation } from "@/lib/actions/execution/cancel-orchestrator";
import type { ExecutionAdapter, ExecutionContext } from "@/lib/actions/execution/adapter-contract";
import { createInMemoryIdempotency, createInMemoryLock } from "./m12-test-doubles";

function createCheckpointCancelAdapter(): ExecutionAdapter {
  let cancelCalled = 0;
  const adapter: ExecutionAdapter = {
    id: "mock",
    capabilities: () => ({
      supportsCancel: true,
      supportsRollback: true,
      supportsPartialRollback: true,
      supportsVerification: true,
      irreversibleOperations: []
    }),
    validate: async () => ({ ok: true, errors: [] }),
    preview: async () => ({ ok: true, summary: "", warnings: [] }),
    estimateImpact: async () => ({}),
    estimateCost: async () => ({}),
    dryRun: async () => {
      throw new Error("not used");
    },
    execute: async () => {
      throw new Error("not used");
    },
    verify: async () => ({ ok: true, details: {} }),
    getRollbackPreview: async () => ({ ok: true, summary: "", warnings: [] }),
    rollback: async () => {
      throw new Error("not used");
    },
    cancel: async (ctx: ExecutionContext) => {
      cancelCalled += 1;
      return { ok: true, status: "cancelled", details: { checkpoint: true, actionId: ctx.actionId } };
    },
    getStatus: async () => ({ status: "cancelled", details: {} })
  };
  return Object.assign(adapter, { _debug: { cancelCalled: () => cancelCalled } }) as unknown as ExecutionAdapter;
}

test("cancellation during execution is deterministic and idempotent", async () => {
  const adapter = createCheckpointCancelAdapter() as unknown as ExecutionAdapter & { _debug: { cancelCalled: () => number } };
  const memIdem = createInMemoryIdempotency();
  const memLock = createInMemoryLock();

  const state = {
    request: {
      id: "req1",
      action_id: "a1",
      execution_state: "started" as const,
      payload_hash: "ph",
      payload_json: { mock: { mode: "cancel_during_execution" } },
      action_state_hash: "ash",
      reversibility: "reversible" as const,
      irreversible_reason: null
    },
    audit: [] as Array<Record<string, unknown>>
  };

  const deps = {
    nowUtc: () => new Date().toISOString(),
    idempotency: {
      computeRequestHash: memIdem.computeRequestHash,
      start: async (input: {
        operationType: string;
        actionId: string;
        executionRequestId: string;
        idempotencyKey: string;
        requestHash: string;
        responseSnapshot: Record<string, unknown>;
      }) => memIdem.start(input),
      complete: memIdem.complete
    },
    repo: {
      getExecutionRequestById: async () => state.request,
      updateExecutionRequestState: async (input: { execution_state: string }) => {
        state.request.execution_state = input.execution_state as typeof state.request.execution_state;
      }
    },
    lock: {
      acquire: async () => memLock.acquire(),
      release: async () => memLock.release()
    },
    audit: {
      event: async (e: Record<string, unknown>) => {
        state.audit.push(e);
      }
    }
  };

  const r1 = await orchestrateCancellation({
    executionRequestId: "req1",
    operatorId: "ceo",
    idempotencyKey: "K",
    adapter,
    env: {
      supabaseUrl: "https://staging.supabase.co",
      category: "email",
      adapterEnabled: true,
      categoryEnabled: true,
      emergencyStop: false
    },
    deps: deps as unknown as Parameters<typeof orchestrateCancellation>[0]["deps"]
  });
  assert.equal(r1.ok, true);
  assert.equal(state.request.execution_state, "cancelled");
  assert.equal(adapter._debug.cancelCalled(), 1);
  const auditTypes1 = state.audit.map((e) => String(e["event_type"]));
  assert.ok(auditTypes1.includes("cancellation_requested"));
  assert.ok(auditTypes1.includes("execution_cancelled"));

  // Replay: must not call adapter or write duplicate audit.
  const auditCount = state.audit.length;
  const r2 = await orchestrateCancellation({
    executionRequestId: "req1",
    operatorId: "ceo",
    idempotencyKey: "K",
    adapter,
    env: {
      supabaseUrl: "https://staging.supabase.co",
      category: "email",
      adapterEnabled: true,
      categoryEnabled: true,
      emergencyStop: false
    },
    deps: deps as unknown as Parameters<typeof orchestrateCancellation>[0]["deps"]
  });
  assert.equal(r2.ok, true);
  assert.equal(adapter._debug.cancelCalled(), 1);
  assert.equal(state.audit.length, auditCount);
});
