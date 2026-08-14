import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("#353: AUTO_CONTINUE invalid structured output does not trigger extra cloud escalation after local-first wrapper", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(text, /AUTO_CONTINUE already performed its bounded local retry/);
  // Ensure we use the wrapper.
  assert.match(text, /executeAutoContinueOnceV1/);
});

