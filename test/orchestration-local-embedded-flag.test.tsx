import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("local-* agents use embedded --local to avoid gateway+embedded double-run contention", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("useEmbeddedLocal"));
  assert.ok(text.includes("--local"));
  assert.ok(text.includes("startsWith(\"local-\")"));
});

export {};
