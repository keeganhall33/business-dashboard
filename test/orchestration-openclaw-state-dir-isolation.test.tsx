import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("orchestration runner sets OPENCLAW_STATE_DIR for embedded local isolation", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  // Guardrail: ensure we set OPENCLAW_STATE_DIR when useEmbeddedLocal=true.
  assert.match(text, /OPENCLAW_STATE_DIR/);
  assert.match(text, /useEmbeddedLocal[\s\S]*OPENCLAW_STATE_DIR/);
});

