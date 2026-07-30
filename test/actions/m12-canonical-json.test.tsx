import test from "node:test";
import assert from "node:assert/strict";

import { canonicalJsonString, canonicalJsonSha256Hex } from "@/lib/actions/execution/canonical-json";

test("canonicalJsonString sorts keys and omits undefined", () => {
  const s = canonicalJsonString({ b: 2, a: 1, c: undefined, d: { z: 1, y: 2 } });
  assert.equal(s, JSON.stringify({ a: 1, b: 2, d: { y: 2, z: 1 } }));
});

test("canonicalJsonSha256Hex is deterministic (test vector)", () => {
  const input = { b: 2, a: 1, arr: [3, { z: 1, y: 2 }] };
  const h1 = canonicalJsonSha256Hex(input);
  const h2 = canonicalJsonSha256Hex({ a: 1, b: 2, arr: [3, { y: 2, z: 1 }] });
  assert.equal(h1, h2);
  // Lock in a concrete vector.
  assert.equal(h1, "007164faef5105fa697fdc475ee1ee5dbe06cfc1016ea7b89aba2aec88544822");
});

test("canonicalJson rejects non-finite numbers and cycles", () => {
  assert.throws(() => canonicalJsonString({ n: Number.NaN }), /non-finite/);
  const obj: { a: number; self?: unknown } = { a: 1 };
  obj.self = obj;
  assert.throws(() => canonicalJsonString(obj), /cyclic/);
});
