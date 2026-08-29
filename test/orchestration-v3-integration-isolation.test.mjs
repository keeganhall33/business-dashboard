import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createObservedExecutionHarness } from "../scripts/orchestration-v3/execution-evidence.mjs";

test("local-e wrapper blocks risky Git operations in the persistent integration worktree", () => {
  const harness = createObservedExecutionHarness({ issue: 860, workerId: "local-e" });
  const shim = fs.readFileSync(`${harness.shimRoot}/git`, "utf8");
  assert.match(shim, /GUARD_INTEGRATION_PERSISTENT_WORKTREE/);
  assert.match(shim, /rebase/);
  assert.match(shim, /merge/);
  assert.match(shim, /cherry-pick/);
  assert.match(shim, /reset/);
  assert.match(shim, /clean/);
  assert.match(shim, /checkout/);
  assert.match(shim, /switch/);
  assert.match(shim, /disposable worktree or temporary clone/);
});

test("integration guard compares effective Git root to local-e rather than globally banning reconciliation", () => {
  const harness = createObservedExecutionHarness({ issue: 860, workerId: "local-e" });
  const shim = fs.readFileSync(`${harness.shimRoot}/git`, "utf8");
  assert.match(shim, /effective_root/);
  assert.match(shim, /PROTECTED_INTEGRATION_ROOT/);
  assert.match(shim, /if \[ "\$1" = "-C" \]/);
});

test("integration protection is machine-readable in execution evidence", () => {
  const source = fs.readFileSync(new URL("../scripts/orchestration-v3/execution-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /integrationPersistentGuardTriggered/);
  assert.match(source, /event\.status === 94/);
});
