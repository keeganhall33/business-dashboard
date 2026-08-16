import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 worker handshake uses compact Code Mode shell bridge", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  const handshake = source.match(/const handshakePrompt = \[[\s\S]*?const handshakeEvidence/iu)?.[0] ?? "";
  assert.match(handshake, /EXECUTION_HANDSHAKE_V1/);
  assert.match(handshake, /openclaw:core:exec/);
  assert.match(handshake, /tools\.callValue/);
  assert.match(handshake, /"--code-mode", "code"/);
  assert.doesNotMatch(handshake, /"--code-mode", "direct"/);
  assert.match(handshake, /Never place raw shell directly in the outer Code Mode exec tool/);
  assert.match(handshake, /git rev-parse --show-toplevel/);
  assert.match(handshake, /git status --short --branch/);
  assert.match(handshake, /git remote -v/);
  assert.match(handshake, /workdir: \$\{JSON\.stringify\(runtimeContract\.repoRoot\)\}/);
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
