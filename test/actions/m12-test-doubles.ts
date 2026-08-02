import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { canonicalJsonSha256Hex } from "@/lib/actions/execution/canonical-json";

export function createInMemoryIdempotency() {
  const records = new Map<string, { id: string; requestHash: string; response: Record<string, unknown> }>;
  let seq = 0;

  function key(input: { operationType: string; actionId: string; idempotencyKey: string }) {
    return `${input.operationType}:${input.actionId}:${input.idempotencyKey}`;
  }

  return {
    computeRequestHash: (v: unknown) => canonicalJsonSha256Hex(v),
    start: async (input: {
      operationType: string;
      actionId: string;
      executionRequestId: string;
      idempotencyKey: string;
      requestHash: string;
      responseSnapshot: Record<string, unknown>;
    }) => {
      const k = key(input);
      const existing = records.get(k);
      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new ExecutionDomainError({ code: "EXECUTION_IDEMPOTENCY_CONFLICT", message: "Idempotency key reused with different request hash", httpStatus: 409 });
        }
        return { replay: true, id: existing.id, response_snapshot: existing.response };
      }
      const id = `idem-${++seq}`;
      records.set(k, { id, requestHash: input.requestHash, response: input.responseSnapshot });
      return { replay: false, id, response_snapshot: input.responseSnapshot };
    },
    complete: async (input: { id: string; completionState: "completed" | "failed"; responseSnapshot: Record<string, unknown> }) => {
      for (const [k, v] of records.entries()) {
        if (v.id === input.id) {
          records.set(k, { ...v, response: input.responseSnapshot });
          return;
        }
      }
      throw new Error("Missing idempotency record");
    },
    _debug: {
      count: () => records.size,
      entries: () => [...records.entries()].map(([k, v]) => ({ key: k, id: v.id, requestHash: v.requestHash }))
    }
  };
}

export function createInMemoryLock() {
  let locked = false;
  let acquireCount = 0;
  let releaseCount = 0;
  return {
    acquire: async () => {
      if (locked) return { ok: false } as const;
      locked = true;
      acquireCount += 1;
      return { ok: true } as const;
    },
    release: async () => {
      locked = false;
      releaseCount += 1;
    },
    isLocked: () => locked
    ,
    counts: () => ({ acquireCount, releaseCount })
  };
}
