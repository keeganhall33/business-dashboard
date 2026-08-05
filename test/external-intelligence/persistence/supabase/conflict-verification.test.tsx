import test from "node:test";
import assert from "node:assert/strict";

import { verifySameHashSamePayload } from "@/lib/external-intelligence/persistence/supabase/conflict-verification";

test("conflict verification: idempotent_success when canonical bytes match", () => {
  const res = verifySameHashSamePayload({ expectedPayload: { a: 1, b: [2, 3] }, existingPayload: { b: [2, 3], a: 1 }, label: "x" });
  assert.equal(res.kind, "idempotent_success");
});

test("conflict verification: integrity_conflict when canonical bytes differ", () => {
  const res = verifySameHashSamePayload({ expectedPayload: { a: 1 }, existingPayload: { a: 2 }, label: "claim" });
  assert.equal(res.kind, "integrity_conflict");
  assert.match(res.message, /claim: same content_hash but payload bytes differ/);
});
