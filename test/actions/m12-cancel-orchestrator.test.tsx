import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateCancellation } from "@/lib/actions/execution/cancel-orchestrator";
import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";
import { createInMemoryIdempotency, createInMemoryLock } from "./m12-test-doubles";

test("cancellation before start: confirmed -> cancel_requested -> cancelled; no adapter execution required", async () => {
  const adapter = getMockExecutionAdapter();
  const memIdem = createInMemoryIdempotency();
  const memLock = createInMemoryLock();
  const state = {
    request: {
      id: "req1",
      action_id: "a1",
      execution_state: "confirmed" as const,
      payload_hash: "ph",
      payload_json: { mock: { mode: "success" } },
      action_state_hash: "ash",
      reversibility: "reversible" as const,
      irreversible_reason: null
    },
    locked: false,
    auditCount: 0
  };

  const res = await orchestrateCancellation({
    executionRequestId: state.request.id,
    operatorId: "ceo",
    idempotencyKey: "idem",
    adapter,
    deps: {
      nowUtc: () => new Date().toISOString(),
      idempotency: {
        computeRequestHash: memIdem.computeRequestHash,
        start: memIdem.start,
        complete: memIdem.complete
      },
      repo: {
        getExecutionRequestById: async () => state.request,
        updateExecutionRequestState: async ({ execution_state }) => {
          state.request.execution_state = execution_state as typeof state.request.execution_state;
        }
      },
      lock: {
        acquire: async () => {
          const r = await memLock.acquire();
          state.locked = memLock.isLocked();
          return r;
        },
        release: async () => {
          await memLock.release();
          state.locked = memLock.isLocked();
        }
      },
      audit: {
        event: async () => {
          state.auditCount += 1;
        }
      }
    }
  });

  assert.equal(res.ok, true);
  assert.equal(res.finalState, "cancelled");
  assert.equal(state.request.execution_state, "cancelled");
  assert.equal(state.locked, false);
  // cancellation_requested + execution_cancelled
  assert.equal(state.auditCount, 2);
});
