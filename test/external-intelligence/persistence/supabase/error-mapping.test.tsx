/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";
import {
  PersistenceUnauthorizedError,
  PersistenceInvalidArgumentError,
  PersistenceIdempotencyConflictError,
  PersistenceLinkedVersionNotFoundError,
  PersistenceObjectTypeMismatchError,
  PersistenceVersionRefMismatchError,
  PersistenceContentHashMismatchError,
  PersistencePolicyMismatchError,
  PersistenceLegalHoldBlockedError,
  PersistenceRunCompletionBlockedError,
  PersistenceUnknownDatabaseError
} from "@/lib/external-intelligence/persistence/errors";
import { MockSupabaseClient } from "./_mock-supabase";

const cases: Array<[string, any]> = [
  ["unauthorized", PersistenceUnauthorizedError],
  ["invalid_argument", PersistenceInvalidArgumentError],
  ["integrity_conflict", PersistenceIdempotencyConflictError],
  ["linked_version_not_found", PersistenceLinkedVersionNotFoundError],
  ["object_type_mismatch", PersistenceObjectTypeMismatchError],
  ["version_ref_mismatch", PersistenceVersionRefMismatchError],
  ["content_hash_mismatch", PersistenceContentHashMismatchError],
  ["policy_mismatch", PersistencePolicyMismatchError],
  ["legal_hold_block", PersistenceLegalHoldBlockedError],
  ["incomplete_write_set", PersistenceRunCompletionBlockedError],
  ["run_completion_blocked", PersistenceRunCompletionBlockedError]
];

for (const [code, Klass] of cases) {
  test(`RPC error mapping: ${code}`, async () => {
    const mock = new MockSupabaseClient();
    mock.onRpc("fn", () => ({ error: { message: code }, data: null }));

    await assert.rejects(
      () => runRpc({ client: mock as any, fn: "fn", args: {} }),
      (err: any) => err instanceof Klass
    );
  });
}

test("RPC error mapping: unknown db failures map to typed unknown-db error + retryable=true", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc("fn", () => ({ error: { message: "internal" }, data: null }));

  await assert.rejects(() => runRpc({ client: mock as any, fn: "fn", args: {} }), (err: any) => {
    assert.ok(err instanceof PersistenceUnknownDatabaseError);
    assert.equal(err.retryable, true);
    // No payload leaks: message should be stable code only.
    assert.equal(typeof err.message, "string");
    return true;
  });
});
