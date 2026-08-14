import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("embedded local runs enforce strict-json wrapper when OrchestrationResultContractV1 is required", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  // Guardrail: strict-json wrapper is conditionally applied for embedded local agents.
  assert.match(text, /shouldEnforceStrictJsonForLocal/);
  assert.match(text, /useEmbeddedLocal[\s\S]*buildStrictJsonRetryPrompt/);
  assert.match(text, /Return ONLY\s+OrchestrationResultContractV1\s+as strict JSON/);
});

