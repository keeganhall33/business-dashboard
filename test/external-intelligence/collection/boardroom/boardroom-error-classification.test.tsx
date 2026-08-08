import test from "node:test";
import assert from "node:assert/strict";

import { __test__classifyBoardroomErrorCode } from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import { PersistenceIdempotencyConflictError } from "@/lib/external-intelligence/persistence/errors";

test("Boardroom lane: persistence integrity conflicts do not masquerade as invalid_configuration", () => {
  const err = new PersistenceIdempotencyConflictError("integrity_conflict");
  const code = __test__classifyBoardroomErrorCode({ error: err, error_summary: "integrity_conflict" });
  assert.equal(code, "persistence_integrity_conflict");
});

test("Boardroom lane: boardroom_timeout remains handler_timeout", () => {
  const code = __test__classifyBoardroomErrorCode({
    error: new Error("boardroom_timeout"),
    error_summary: "boardroom_timeout"
  });
  assert.equal(code, "handler_timeout");
});

