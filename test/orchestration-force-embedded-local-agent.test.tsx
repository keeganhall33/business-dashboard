import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("runner forces local-* agentIds through embedded --local entrypoint", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  // Guardrail: runOpenclaw() must route local-* ids to runOpenclawWithPrompt() (embedded local).
  assert.match(text, /function runOpenclaw\(agentId\)[\s\S]*startsWith\(\"local-\"\)/);
  assert.match(text, /if \(isLocal\) return runOpenclawWithPrompt\(agentId, prompt\)/);
});

