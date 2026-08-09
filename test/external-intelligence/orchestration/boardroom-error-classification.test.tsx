import test from "node:test";
import assert from "node:assert/strict";

import {
  __test__classifyBoardroomErrorCode
} from "@/lib/external-intelligence/orchestration/handlers/boardroom-collection-v1";
import {
  PersistenceClaimVersionIdentityConflictError,
  PersistenceIdempotencyConflictError
} from "@/lib/external-intelligence/persistence/errors";

test("Boardroom: claim identity conflict classified as persistence_integrity_conflict", () => {
  const error = new PersistenceClaimVersionIdentityConflictError("claim_version_identity_conflict");
  const code = __test__classifyBoardroomErrorCode({
    error,
    error_summary: "duplicate key value violates unique constraint \"external_claim_versions_v1__fingerprint_policy_uniq\""
  });
  assert.equal(code, "persistence_integrity_conflict");
});

test("Boardroom: integrity_conflict classified as persistence_integrity_conflict", () => {
  const error = new PersistenceIdempotencyConflictError("integrity_conflict");
  const code = __test__classifyBoardroomErrorCode({ error, error_summary: "integrity_conflict" });
  assert.equal(code, "persistence_integrity_conflict");
});

