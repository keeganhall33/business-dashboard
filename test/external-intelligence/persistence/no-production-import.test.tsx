import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// This is a guard that the in-memory store exists only for contract verification.
// It must not be imported by production execution paths.
//
// NOTE: Do not dynamically import Next/server-only modules in Node tests.

test("fusion production candidate loaders do not reference the in-memory persistence store", () => {
  const p = path.join(process.cwd(), "src/lib/fusion-v1/production/candidate-loaders.ts");
  const txt = fs.readFileSync(p, "utf8");
  assert.equal(txt.includes("external-intelligence/persistence/in-memory-store"), false);
});
