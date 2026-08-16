import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 real worker uses direct embedded shell exec on the Mac-proven legacy API", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /"agent", "--local"/);
  assert.match(source, /"--session-key"/);
  assert.match(source, /"--message", prompt/);
  assert.match(source, /MANDATORY FIRST TOOL ACTION/);
  assert.match(source, /Use the shell exec tool for shell commands/);
  assert.doesNotMatch(source, /openclaw:core:exec|tools\.callValue|--code-mode|agent\", \"exec/);
});

test("V3 real worker preflight uses the absolute observed git wrapper", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /const preflightCommand = `\$\{q\(observed\.git\)\} rev-parse --show-toplevel && \$\{q\(observed\.git\)\} status --short --branch && \$\{q\(observed\.git\)\} remote -v`/);
  assert.match(source, /Do not substitute \/usr\/bin\/git/);
  assert.match(source, /For every git command use this exact executable/);
  assert.match(source, /readObservedExecutionEvidence\(harness\.journalPath\)/);
});

test("V3 standalone diagnostics retain modern compatibility coverage without controlling the real worker", () => {
  const modernDiagnostic = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool.mjs", "utf8");
  const observedDiagnostic = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool-observed.mjs", "utf8");
  assert.match(modernDiagnostic, /AGENT_EXEC/);
  assert.match(modernDiagnostic, /LEGACY_AGENT_LOCAL_MESSAGE/);
  assert.match(observedDiagnostic, /LEGACY_AGENT_LOCAL_ABSOLUTE_OBSERVED_WRAPPER/);
  assert.match(observedDiagnostic, /fallbackUsed/);
}
);
