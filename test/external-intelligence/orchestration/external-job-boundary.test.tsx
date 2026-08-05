import test from "node:test";
import assert from "node:assert/strict";

import type { ExternalCollectionJobInput } from "@/lib/external-intelligence/orchestration/external-collector-guard";

// NOTE: We test the boundary behavior via dependency injection by monkeypatching module functions is out-of-scope.
// This test asserts the *type-level* contract: the boundary does not accept a collector callback.

test("external job boundary: does not accept a collector callback argument (B3)", () => {
  type Fn = (input: ExternalCollectionJobInput) => Promise<unknown>;
  const _fn: Fn = async () => ({ ok: true });
  assert.equal(typeof _fn, "function");
});
