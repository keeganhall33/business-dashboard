import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 local coding path uses OpenClaw agent exec with forced code tools", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(source, /\["agent",\s*"exec"/);
  assert.match(source, /"--code-mode",\s*"code"/);
  assert.match(source, /"--local-model-lean"/);
  assert.match(source, /"--model",\s*ORCH_LOCAL_MODEL/);
  assert.match(source, /"--cwd"/);
  assert.doesNotMatch(source, /\["agent",\s*"--local",\s*"--agent"/);
});
