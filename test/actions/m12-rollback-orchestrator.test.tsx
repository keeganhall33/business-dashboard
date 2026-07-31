import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateRollback } from "@/lib/actions/execution/rollback-orchestrator";
import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";
import { createInMemoryIdempotency, createInMemoryLock } from "./m12-test-doubles";

test("rollback success: failed -> rollback_requested -> rolled_back; separate rollback record; lock released", async () => {
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
      execution_state: "failed",
      payload_hash: "ph",
      payload_json: { mock: { mode: "rollback_success" } },
      action_state_hash: "ash",
      reversibility: "reversible" as const,
      irreversible_reason: null
    },
    rollbackRows: [] as Array<Record<string, unknown>>,
    auditTypes: [] as string[]
  };

  const res = await orchestrateRollback({
    executionRequestId: state.request.id,
    operatorId: "ceo",
    idempotencyKey: "RIDEM",
    adapter,
    env: {
      supabaseUrl: "https://staging.supabase.co",
      category: "email",
      adapterEnabled: true,
      categoryEnabled: true,
      emergencyStop: false
    },
    rollbackPlan: { hash: "rph", raw: { plan: true }, preview: { summary: "preview", warnings: [] } },
    confirmed: true,
    deps: {
      nowUtc: () => new Date().toISOString(),
      idempotency: {
        computeRequestHash: memIdem.computeRequestHash,
        start: async (input) => memIdem.start(input),
        complete: memIdem.complete
      },
      repo: {
        getExecutionRequestById: async () => state.request,
        updateExecutionRequestState: async ({ execution_state }) => {
          state.request.execution_state = execution_state;
        },
        insertRollback: async (row) => {
          const id = `rb-${state.rollbackRows.length + 1}`;
          state.rollbackRows.push({ id, ...row });
          return { id };
        },
        updateRollback: async (input) => {
          const r = state.rollbackRows.find((x) => x["id"] === input.id);
          if (r) Object.assign(r, input);
        }
      },
      lock: {
        acquire: async () => memLock.acquire(),
        release: async () => memLock.release()
      },
      audit: {
        event: async (e) => {
          state.auditTypes.push(String(e.event_type));
        }
      }
    }
  });

  assert.equal(res.ok, true);
  assert.equal(state.request.execution_state, "rolled_back");
  assert.equal(state.rollbackRows.length, 1);
  assert.equal(memLock.isLocked(), false);
  assert.ok(state.auditTypes.includes("rollback_requested"));
  assert.ok(state.auditTypes.includes("execution_rollback_completed"));
  assert.equal(res.result.externalSideEffects, 0);
});

test("rollback failure: partial_succeeded -> rollback_failed", async () => {
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
      execution_state: "partial_succeeded",
      payload_hash: "ph",
      payload_json: { mock: { mode: "rollback_failure" } },
      action_state_hash: "ash",
      reversibility: "reversible" as const,
      irreversible_reason: null
    },
    rollbackRows: [] as Array<Record<string, unknown>>
  };

  const res = await orchestrateRollback({
    executionRequestId: state.request.id,
    operatorId: "ceo",
    idempotencyKey: "RIDEM",
    adapter,
    env: {
      supabaseUrl: "https://staging.supabase.co",
      category: "email",
      adapterEnabled: true,
      categoryEnabled: true,
      emergencyStop: false
    },
    rollbackPlan: { hash: "rph", raw: { plan: true }, preview: { summary: "preview", warnings: [] } },
    confirmed: true,
    deps: {
      nowUtc: () => new Date().toISOString(),
      idempotency: {
        computeRequestHash: memIdem.computeRequestHash,
        start: async (input) => memIdem.start(input),
        complete: memIdem.complete
      },
      repo: {
        getExecutionRequestById: async () => state.request,
        updateExecutionRequestState: async ({ execution_state }) => {
          state.request.execution_state = execution_state;
        },
        insertRollback: async (row) => {
          const id = `rb-${state.rollbackRows.length + 1}`;
          state.rollbackRows.push({ id, ...row });
          return { id };
        },
        updateRollback: async (input) => {
          const r = state.rollbackRows.find((x) => x["id"] === input.id);
          if (r) Object.assign(r, input);
        }
      },
      lock: {
        acquire: async () => memLock.acquire(),
        release: async () => memLock.release()
      },
      audit: {
        event: async () => {}
      }
    }
  });

  assert.equal(res.ok, true);
  assert.equal(state.request.execution_state, "rollback_failed");
  assert.equal(state.rollbackRows.length, 1);
  assert.equal(memLock.isLocked(), false);
  assert.equal(res.result.externalSideEffects, 0);
});

test("irreversible rollback is blocked deterministically and does not call adapter", async () => {
  const adapter = getMockExecutionAdapter();
  const memIdem = createInMemoryIdempotency();
  const memLock = createInMemoryLock();
  const state = {
    request: {
      id: "req1",
      action_id: "a1",
      execution_state: "failed",
      payload_hash: "ph",
      payload_json: { mock: { mode: "rollback_success" } },
      action_state_hash: "ash",
      reversibility: "irreversible" as const,
      irreversible_reason: "x"
    },
    rollbackRows: [] as Array<Record<string, unknown>>
  };

  await assert.rejects(
    () =>
      orchestrateRollback({
        executionRequestId: state.request.id,
        operatorId: "ceo",
        idempotencyKey: "RIDEM",
        adapter,
        env: {
          supabaseUrl: "https://staging.supabase.co",
          category: "email",
          adapterEnabled: true,
          categoryEnabled: true,
          emergencyStop: false
        },
        rollbackPlan: { hash: "rph", raw: { plan: true }, preview: { summary: "preview", warnings: [] } },
        confirmed: true,
        deps: {
          nowUtc: () => new Date().toISOString(),
          idempotency: {
            computeRequestHash: memIdem.computeRequestHash,
            start: async (input) => memIdem.start(input),
            complete: memIdem.complete
          },
          repo: {
            getExecutionRequestById: async () => state.request,
            updateExecutionRequestState: async () => {
              throw new Error("should not mutate");
            },
            insertRollback: async () => {
              throw new Error("should not insert rollback");
            },
            updateRollback: async () => {
              throw new Error("should not update rollback");
            }
          },
          lock: {
            acquire: async () => {
              throw new Error("should not acquire lock");
            },
            release: async () => {
              throw new Error("should not release lock");
            }
          },
          audit: {
            event: async () => {
              throw new Error("should not audit");
            }
          }
        }
      }),
    (e: unknown) => (e as { code?: string } | null)?.code === "EXECUTION_ROLLBACK_NOT_ALLOWED"
  );
  assert.equal(memLock.isLocked(), false);
  assert.equal(state.rollbackRows.length, 0);
});
