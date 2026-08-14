import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("local agents use explicit --session-id for per-run isolation", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(text, /--session-id/);
  assert.match(text, /orch-.*issue-/);
});

