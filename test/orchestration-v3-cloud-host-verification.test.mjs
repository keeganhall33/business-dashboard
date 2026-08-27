import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyChangedTestFiles,
  readObservedExecutionEvidence,
  shouldAttemptCloudHostVerification
} from "../scripts/orchestration-v3/execution-evidence.mjs";

test("cloud host verification is second-read only", () => {
  assert.equal(shouldAttemptCloudHostVerification(1), false);
  assert.equal(shouldAttemptCloudHostVerification(2), true);
  assert.equal(shouldAttemptCloudHostVerification(3), true);
});

test("local-only evidence remains strict on first read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jeeves-v3-evidence-999-local-a-test-"));
  const journal = path.join(dir, "commands.tsv");
  fs.writeFileSync(journal, [
    "1\tgit\t0\trev-parse --show-toplevel",
    "2\tgit\t0\tstatus --short --branch",
    "3\tgit\t0\tremote -v",
    ""
  ].join("\n"));
  const evidence = readObservedExecutionEvidence(journal);
  assert.equal(evidence.evidenceReadCount, 1);
  assert.equal(evidence.repoPreflightObserved, true);
  assert.equal(evidence.testExecutionObserved, false);
  assert.equal(evidence.gitDiffCheckObserved, false);
  assert.equal(evidence.gitMutationCommandObserved, false);
  assert.equal(evidence.hostVerification, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("changed test file classification is deterministic", () => {
  assert.deepEqual(classifyChangedTestFiles([
    "src/foo.ts",
    "test/financial-intelligence/snapshot-contract-v1.test.tsx",
    "src/widget.spec.ts",
    "tests/basic.mjs",
    "README.md"
  ]), [
    "test/financial-intelligence/snapshot-contract-v1.test.tsx",
    "src/widget.spec.ts",
    "tests/basic.mjs"
  ]);
});

test("source preserves strict local gate and adds host-verification requirements", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/execution-evidence.mjs", "utf8");
  assert.match(source, /evidenceReadCounts/);
  assert.match(source, /local-\[abcdef\]/);
  assert.match(source, /HOST_VERIFY_MATCHING_PR_REQUIRED/);
  assert.match(source, /git.*diff.*--check/si);
  assert.match(source, /HOST_VERIFY_FOCUSED_TEST_FAILED/);
  assert.match(source, /HOST_VERIFY_TYPECHECK_FAILED/);
  assert.match(source, /HOST_VERIFY_BUILD_FAILED/);
  assert.match(source, /HOST_VERIFY_WORKTREE_NOT_CLEAN/);
});

test("task mutability preserves implementation mutation gates and permits evidence-only zero mutation", () => {
  const workerSource = fs.readFileSync(
    "scripts/orchestration-v3/worker.mjs",
    "utf8"
  );
  const hostSource = fs.readFileSync(
    "scripts/orchestration-v3/execution-evidence.mjs",
    "utf8"
  );

  assert.match(
    workerSource,
    /VALIDATION_EVIDENCE_ONLY/
  );
  assert.match(
    workerSource,
    /IMPLEMENTATION_MUTATION_REQUIRED/
  );
  assert.match(
    workerSource,
    /if\s*\(\s*mutationRequired\s*&&\s*!roundExecutionEvidence\.gitMutationCommandObserved\s*\)/
  );
  assert.match(
    workerSource,
    /if\s*\(\s*mutationRequired\s*&&\s*!roundRealMutationObserved\s*\)/
  );

  assert.match(
    hostSource,
    /const mutationRequired = !\(explicitEvidenceOnly \|\| inferredEvidenceOnly\)/
  );
  assert.match(
    hostSource,
    /if\s*\(\s*mutationRequired\s*&&\s*\(!head \|\| !base \|\| head === base\)\s*\)/
  );
  assert.match(
    hostSource,
    /if\s*\(\s*mutationRequired\s*&&\s*!matchingPr\s*\)/
  );
  assert.match(
    hostSource,
    /if\s*\(\s*mutationRequired\s*&&\s*changedFiles\.length === 0\s*\)/
  );
  assert.match(
    hostSource,
    /\(!mutationRequired \|\| Boolean\(matchingPr\)\)/
  );
  assert.match(
    hostSource,
    /\(!mutationRequired \|\| changedFiles\.length > 0\)/
  );
});

test("explicit task_mutability metadata takes precedence over evidence-only prose", () => {
  const workerSource = fs.readFileSync(
    "scripts/orchestration-v3/worker.mjs",
    "utf8"
  );

  assert.match(
    workerSource,
    /const explicit = String\(taskField\(text, "task_mutability"\)/
  );
  assert.match(
    workerSource,
    /if \(explicit === "VALIDATION_EVIDENCE_ONLY"\) return "VALIDATION_EVIDENCE_ONLY"/
  );
  assert.match(
    workerSource,
    /if \(explicit === "IMPLEMENTATION_MUTATION_REQUIRED"\) return "IMPLEMENTATION_MUTATION_REQUIRED"/
  );
});
