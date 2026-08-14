import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("runner extracts JSON from combined stdout+stderr", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(text, /function extractOpenclawJson\(stdout, stderr\)/);
  assert.ok(text.includes('raw.indexOf("{")'));
  assert.ok(text.includes('raw.lastIndexOf("}")'));
});
