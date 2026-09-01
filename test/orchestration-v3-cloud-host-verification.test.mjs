import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyChangedTestFiles,
  readObservedExecutionEvidence,
  shouldAttemptCloudHostVerification,
  taskMetadataValue
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

test("task metadata parser accepts plain and Markdown-bold colon forms", () => {
  const markdown = [
    "**stream:** QA_EVALUATION",
    "**task_mutability:** VALIDATION_EVIDENCE_ONLY"
  ].join("\n");
  const plain = [
    "stream: QA_EVALUATION",
    "task_mutability: VALIDATION_EVIDENCE_ONLY"
  ].join("\n");

  assert.equal(taskMetadataValue(markdown, "stream"), "QA_EVALUATION");
  assert.equal(taskMetadataValue(markdown, "task_mutability"), "VALIDATION_EVIDENCE_ONLY");
  assert.equal(taskMetadataValue(plain, "stream"), "QA_EVALUATION");
  assert.equal(taskMetadataValue(plain, "task_mutability"), "VALIDATION_EVIDENCE_ONLY");
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

test("integration release mutation verifies explicitly referenced existing PR instead of worker issue branch", () => {
  const source = fs.readFileSync(
    "scripts/orchestration-v3/execution-evidence.mjs",
    "utf8"
  );

  assert.match(source, /integrationReleaseStream = stream === "INTEGRATION_RELEASE"/);
  assert.match(source, /verifyReferencedMutationPr = mutationRequired && integrationReleaseStream && Boolean\(referencedPr\)/);
  assert.match(source, /HOST_VERIFY_REFERENCED_MUTATION_PR_LOOKUP_FAILED/);
  assert.match(source, /HOST_VERIFY_REFERENCED_MUTATION_PR_REQUIRED/);
  assert.match(
    source,
    /if \(mutationRequired && !verifyReferencedMutationPr && \(!persistentHead \|\| !base \|\| persistentHead === base\)\)/
  );
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

  assert.match(workerSource, /VALIDATION_EVIDENCE_ONLY/);
  assert.match(workerSource, /IMPLEMENTATION_MUTATION_REQUIRED/);
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
    /const mutationRequired =\s*explicitMutationRequired \|\|\s*!\(explicitEvidenceOnly \|\| qaEvaluationStream \|\| inferredEvidenceOnly\)/
  );
  assert.match(
    hostSource,
    /if\s*\(\s*mutationRequired\s*&&\s*!verifyReferencedMutationPr\s*&&\s*\(!persistentHead \|\| !base \|\| persistentHead === base\)\s*\)/
  );
  assert.match(
    hostSource,
    /else if\s*\(\s*mutationRequired\s*\)[\s\S]*?if\s*\(\s*!matchingPr\s*\)\s*errors\.push\("HOST_VERIFY_MATCHING_PR_REQUIRED"\)/
  );
  assert.match(hostSource, /changedFiles\.length === 0/);
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

test("QA_EVALUATION defaults to validation evidence only unless explicitly mutation-required", () => {
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
    /stream === "QA_EVALUATION"\) return "VALIDATION_EVIDENCE_ONLY"/
  );

  assert.match(hostSource, /qaEvaluationStream/);
  assert.match(hostSource, /explicitMutationRequired/);
  assert.match(hostSource, /explicitMutationRequired \|\|[\s\S]*qaEvaluationStream/);
});

test("disposable QA verification installs local dependencies instead of symlinking node_modules", () => {
  const source = fs.readFileSync(
    "scripts/orchestration-v3/execution-evidence.mjs",
    "utf8"
  );

  assert.match(source, /npmExe, \["ci", "--no-audit", "--no-fund"\]/);
  assert.doesNotMatch(source, /symlinkSync\([^\n]*node_modules/i);
  assert.match(source, /HOST_VERIFY_QA_DEPENDENCY_INSTALL_FAILED/);
});

test("evidence-only QA uses a local provider probe plus authoritative host verification", () => {
  const workerSource = fs.readFileSync(
    "scripts/orchestration-v3/worker.mjs",
    "utf8"
  );

  assert.match(workerSource, /V3_QA_PROVIDER_PROBE_V1/);
  assert.match(workerSource, /QA_HOST_VERIFICATION_WITH_LOCAL_PROVIDER_PROBE/);
  assert.match(workerSource, /const authoritativeEvidence = readObservedExecutionEvidence\(harness\.journalPath\)/);
  assert.match(workerSource, /if \(!hostVerification\?\.verified\) qaBlockers\.push\("HOST_VERIFY_QA_NOT_VERIFIED"\)/);
});

test("evidence-only QA proves no-cloud fallback from fail-closed local policy and observed Ollama", () => {
  const workerSource = fs.readFileSync(
    "scripts/orchestration-v3/worker.mjs",
    "utf8"
  );

  assert.match(workerSource, /function localRuntimePolicyProvesNoCloud/);
  assert.match(workerSource, /ORCHESTRATION_V3\.model\.cloudFallbackAllowed === false/);
  assert.match(workerSource, /OPENCLAW_FALLBACK_MODELS/);
  assert.match(workerSource, /const runtimeNoCloud = providerOk && localRuntimePolicyProvesNoCloud\(env\)/);
  assert.match(workerSource, /fallbackUsed: fallbackProvenFalse \? false : resultMachine\.fallbackUsed/);
});

test("evidence-only QA rejects any persistent local-f mutation even after preservation-first recovery", () => {
  const workerSource = fs.readFileSync(
    "scripts/orchestration-v3/worker.mjs",
    "utf8"
  );

  assert.match(workerSource, /recoveryObservedPersistentMutation/);
  assert.match(workerSource, /HOST_VERIFY_QA_PERSISTENT_MUTATION/);
  assert.match(workerSource, /qaPersistentMutationObserved = qaPersistentMutationObserved \|\| currentHead !== beforeHead/);
  assert.match(workerSource, /if \(mutationRequired && finalValue\.STATUS !== "PASS"/);
});
