import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseMachineEnvelope } from "../scripts/orchestration-v3/diagnose-local-tool-observed.mjs";

test("machine envelope accepts current OpenClaw provider/model key variants", () => {
  const machine = parseMachineEnvelope(JSON.stringify({
    result: {
      providerId: "ollama",
      modelId: "qwen3.5:9b",
      fallback_used: false,
      toolCalls: 12,
      toolFailures: 0
    }
  }));
  assert.equal(machine.provider, "ollama");
  assert.equal(machine.model, "qwen3.5:9b");
  assert.equal(machine.fallbackUsed, false);
  assert.equal(machine.toolCalls, 12);
  assert.equal(machine.toolFailures, 0);
});

test("local-f git wrapper blocks persistent QA mutation commands", () => {
  const source = fs.readFileSync(new URL("../scripts/orchestration-v3/execution-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /workerId === "local-f"/);
  assert.match(source, /add\|commit\|push\|merge\|rebase\|cherry-pick\|checkout\|switch\|reset\|clean/);
  assert.match(source, /GUARD_QA_READ_ONLY/);
});

test("QA host verification uses referenced PR head in a disposable worktree", () => {
  const source = fs.readFileSync(new URL("../scripts/orchestration-v3/execution-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /referencedPrNumber/);
  assert.match(source, /pull\/\$\{prNumber\}\/head/);
  assert.match(source, /worktree", "add", "--detach"/);
  assert.match(source, /worktree", "remove", "--force"/);
  assert.match(source, /HOST_VERIFY_BASELINE_TYPECHECK_FAILED/);
  assert.match(source, /HOST_VERIFY_BASELINE_BUILD_FAILED/);
});
