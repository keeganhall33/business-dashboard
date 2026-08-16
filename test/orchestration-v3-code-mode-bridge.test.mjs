import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 worker handshake uses compact Code Mode shell bridge", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /EXECUTION_HANDSHAKE_V1/);
  assert.match(source, /const bridgeCall = `return await tools\.callValue\("openclaw:core:exec"/);
  assert.match(source, /"--code-mode", "code"/);
  assert.doesNotMatch(source, /"--code-mode", "direct"/);
  assert.match(source, /Never place raw shell directly in the outer Code Mode exec tool/);
  assert.match(source, /const repoCommand = "pwd && git rev-parse --show-toplevel && git status --short --branch && git remote -v"/);
  assert.match(source, /workdir: \$\{JSON\.stringify\(runtimeContract\.repoRoot\)\}/);
});

test("all local V3 agent-exec entrypoints reject direct Code Mode", () => {
  const worker = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  const diagnostic = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool.mjs", "utf8");
  const runner = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.doesNotMatch(worker, /"--code-mode",\s*"direct"/);
  assert.doesNotMatch(diagnostic, /"--code-mode",\s*"direct"/);
  assert.doesNotMatch(runner, /"--code-mode",\s*"direct"/);
  assert.match(worker, /"--code-mode",\s*"code"/);
  assert.match(diagnostic, /"--code-mode",\s*"code"/);
  assert.match(runner, /"--code-mode",\s*"code"/);
});
