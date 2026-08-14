import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("embedded local runs enforce a bounded timeout floor (>=180s)", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(text, /useEmbeddedLocal\s*\?\s*Math\.max\(Number\(timeoutSeconds\)/);
  assert.match(text, /,\s*180\)/);
});

