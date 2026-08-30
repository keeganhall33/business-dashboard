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

test("integration release worker prepares referenced PR in a disposable worktree", () => {
  const workerSource = fs.readFileSync(
    "scripts/orchestration-v3/worker.mjs",
    "utf8"
  );

  assert.match(workerSource, /WORKER_INTEGRATION_PR_CONTEXT_PREPARED/);
  assert.match(workerSource, /snapshotStream === "INTEGRATION_RELEASE"/);
  assert.match(workerSource, /INTEGRATION_REFERENCED_PR_REQUIRED/);
  assert.match(
    workerSource,
    /git\(\s*\["worktree", "add", "-b", localBranch, integrationWorktreeRoot, headRefOid\][\s\S]*?persistentRepoRoot\s*\)/
  );
  assert.match(workerSource, /repoRoot = path\.resolve\(integrationWorktreeRoot\)/);
  assert.match(workerSource, /push origin HEAD:\$\{integrationTarget\.headRefName\}/);
  assert.match(workerSource, /Never checkout, merge, rebase, reset, clean, or otherwise mutate the persistent local-e worktree/);
  assert.match(workerSource, /git\(\["branch", "-D", integrationTarget\.localBranch\], persistentRepoRoot\)/);
  assert.match(workerSource, /referencedIntegrationPrChanged/);
  assert.match(
    workerSource,
    /roundRealMutationObserved = integrationTarget[\s\S]*?referencedIntegrationPrChanged/
  );
  assert.match(
    workerSource,
    /Number\(pr\.number\) === Number\(integrationTarget\.prNumber\)/
  );
});

test("integration protection is machine-readable in execution evidence", () => {
  const source = fs.readFileSync(new URL("../scripts/orchestration-v3/execution-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /integrationPersistentGuardTriggered/);
  assert.match(source, /event\.status === 94/);
});
