import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeErrorMessage, statusMatches, coerceObject } from "@/lib/actions/harness-utils";

test("statusMatches supports single and array expected", () => {
  assert.equal(statusMatches(200, 200), true);
  assert.equal(statusMatches(200, 400), false);
  assert.equal(statusMatches([200, 201], 201), true);
  assert.equal(statusMatches([200, 201], 204), false);
});

test("sanitizeErrorMessage handles string and object", () => {
  assert.equal(sanitizeErrorMessage("oops"), "oops");
  assert.equal(sanitizeErrorMessage({ message: "bad" }), "bad");
  assert.equal(sanitizeErrorMessage({ error: "nope" }), "nope");
});

test("coerceObject returns null for non-objects", () => {
  assert.equal(coerceObject(null), null);
  assert.equal(coerceObject("x"), null);
  assert.deepEqual(coerceObject({ a: 1 }), { a: 1 });
});
