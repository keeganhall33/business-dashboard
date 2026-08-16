import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 real worker uses capability-aware agent exec Code Mode bridge", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  const helper = fs.readFileSync("scripts/orchestration-v3/worker-exec-invocation.mjs", "utf8");
  assert.match(source, /probeWorkerExecCapabilities/);
  assert.match(source, /buildWorkerExecInvocation/);
  assert.match(source, /MANDATORY FIRST TOOL ACTION/);
  assert.match(source, /CODE MODE SHELL BRIDGE IS AUTHORITATIVE/);
  assert.match(source, /codeModeShellInstruction/);
  assert.match(helper, /"agent", "exec"/);
  assert.match(helper, /--code-mode/);
  assert.match(helper, /--local-model-lean/);
  assert.match(helper, /tools\.callValue\("openclaw:core:exec"/);
  assert.doesNotMatch(source, /"agent", "--local"/);
});

test("V3 real worker preflight uses the absolute observed git wrapper", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /const preflightCommand = `\$\{q\(observed\.git\)\} rev-parse --show-toplevel && \$\{q\(observed\.git\)\} status --short --branch && \$\{q\(observed\.git\)\} remote -v`/);
  assert.match(source, /Do not substitute \/usr\/bin\/git/);
  assert.match(source, /For every git command use this exact executable/);
  assert.match(source, /readObservedExecutionEvidence\(harness\.journalPath\)/);
});

test("V3 standalone diagnostics retain legacy compatibility coverage without controlling the real worker", () => {
  const modernDiagnostic = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool.mjs", "utf8");
  const observedDiagnostic = fs.readFileSync("scripts/orchestration-v3/diagnose-local-tool-observed.mjs", "utf8");
  assert.match(modernDiagnostic, /AGENT_EXEC/);
  assert.match(modernDiagnostic, /LEGACY_AGENT_LOCAL_MESSAGE/);
  assert.match(observedDiagnostic, /LEGACY_AGENT_LOCAL_ABSOLUTE_OBSERVED_WRAPPER/);
  assert.match(observedDiagnostic, /fallbackUsed/);
});
