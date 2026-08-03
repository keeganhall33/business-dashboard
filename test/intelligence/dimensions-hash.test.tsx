import test from "node:test";
import assert from "node:assert/strict";

import { computeDimensionsHash } from "@/lib/intelligence-v1/dimensions-hash";

test("dimensions_hash: identical objects with different key order hash the same", () => {
  const a = { device: "mobile", source: "google", nested: { b: 2, a: 1 } };
  const b = { source: "google", nested: { a: 1, b: 2 }, device: "mobile" };
  assert.equal(computeDimensionsHash(a), computeDimensionsHash(b));
});

test("dimensions_hash: empty dimensions is stable", () => {
  assert.equal(computeDimensionsHash({}), computeDimensionsHash({}));
  assert.equal(computeDimensionsHash(undefined), computeDimensionsHash({}));
});

test("dimensions_hash: different dimensions produce distinct hashes", () => {
  const a = { device: "mobile" };
  const b = { device: "desktop" };
  assert.notEqual(computeDimensionsHash(a), computeDimensionsHash(b));
});
