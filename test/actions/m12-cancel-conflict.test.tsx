import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateCancellation } from "@/lib/actions/execution/cancel-orchestrator";
import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";
import { createInMemoryIdempotency, createInMemoryLock } from "./m12-test-doubles";

test("cancellation conflict replay: same key different request hash returns deterministic conflict and no audit/state mutation", async () => {
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  const adapter = getMockExecutionAdapter();
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
    audits: 0
  };

  const deps = {
    nowUtc: () => new Date().toISOString(),
    idempotency: {
      computeRequestHash: memIdem.computeRequestHash,
      start: async (input: { operationType: string; actionId: string; executionRequestId: string; idempotencyKey: string; requestHash: string; responseSnapshot: Record<string, unknown> }) =>
        memIdem.start(input),
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
      event: async () => {
        state.audits += 1;
      }
    }
  };

  await orchestrateCancellation({
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
  const auditsAfter = state.audits;
  const stateAfter = state.request.execution_state;

  await assert.rejects(
    () =>
      orchestrateCancellation({
        executionRequestId: "req1",
        operatorId: "other",
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
      }),
    (e: unknown) => (e as { code?: string } | null)?.code === "EXECUTION_IDEMPOTENCY_CONFLICT"
  );

  assert.equal(state.audits, auditsAfter);
  assert.equal(state.request.execution_state, stateAfter);
  assert.equal(memLock.isLocked(), false);
});
