import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ORCHESTRATION_V3, workerForStream } from "../scripts/orchestration-v3/config.mjs";
import { readObservedExecutionEvidence, requiresTestExecution, requiresDiffCheck } from "../scripts/orchestration-v3/execution-evidence.mjs";

test("V3 uses one fixed six-worker map with specialized non-product lanes", () => {
  assert.deepEqual(Object.keys(ORCHESTRATION_V3.workers), ["local-a", "local-b", "local-c", "local-d", "local-e", "local-f"]);
  assert.equal(workerForStream("CORE_INTELLIGENCE"), "local-a");
  assert.equal(workerForStream("DISCOVERY_INTELLIGENCE"), "local-b");
  assert.equal(workerForStream("DATA_EVIDENCE_LEARNING"), "local-b");
  assert.equal(workerForStream("INTELLIGENCE_UX"), "local-c");
  assert.equal(workerForStream("PRODUCTION_VALUE"), "local-c");
  assert.equal(workerForStream("AGENT_ORCHESTRATION"), "local-d");
  assert.equal(workerForStream("ORCHESTRATION_SYSTEMS"), "local-d");
  assert.equal(workerForStream("HIGHEST_VALUE_SPECIALIST"), "local-d");
  assert.equal(workerForStream("INTEGRATION_RELEASE"), "local-e");
  assert.equal(workerForStream("QA_EVALUATION"), "local-f");
  assert.equal(workerForStream("NOT_A_REAL_STREAM"), null);
  assert.deepEqual(ORCHESTRATION_V3.capacity.productWorkers, ["local-a", "local-b", "local-c", "local-d"]);
  assert.deepEqual(ORCHESTRATION_V3.capacity.integrationReleaseWorkers, ["local-e"]);
  assert.deepEqual(ORCHESTRATION_V3.capacity.qaEvaluationWorkers, ["local-f"]);
});

test("V3 acceptance runtime is Ollama-only Qwen 3.5", () => {
  assert.equal(ORCHESTRATION_V3.model.provider, "ollama");
  assert.equal(ORCHESTRATION_V3.model.id, "ollama/qwen3.5:9b");
  assert.equal(ORCHESTRATION_V3.model.cloudFallbackAllowed, false);
});

test("V3 watcher has no historical task resurrection path", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.doesNotMatch(source, /selfHealMissingReady|listHealCandidates/);
  assert.match(source, /queue\.ready/);
});

test("V3 real worker uses capability-aware agent exec and Code Mode bridge", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /probeWorkerExecCapabilities/);
  assert.match(source, /buildWorkerExecInvocation/);
  assert.match(source, /codeModeShellInstruction/);
  assert.match(source, /CODE MODE SHELL BRIDGE IS AUTHORITATIVE/);
  assert.doesNotMatch(source, /"agent", "--local"/);
});

test("V3 worker uses absolute observed wrappers for all repo execution evidence", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /createObservedExecutionHarness/);
  assert.match(source, /path\.join\(harness\.shimRoot, name\)/);
  assert.match(source, /Do not substitute \/usr\/bin\/git/);
  assert.match(source, /For every git command use this exact executable/);
  assert.match(source, /For every pnpm command use/);
  assert.match(source, /MISSING_OBSERVED_REPO_PREFLIGHT/);
  assert.match(source, /MISSING_OBSERVED_TEST_BUILD_TYPECHECK/);
  assert.match(source, /MISSING_OBSERVED_GIT_DIFF/);
  assert.match(source, /MISSING_OBSERVED_GIT_DIFF_CHECK/);
  assert.match(source, /MISSING_OBSERVED_GIT_MUTATION_COMMAND/);
});

test("V3 keeps Ollama acceptance strict while allowing product escalation", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");

  // Local acceptance path remains strict.
  assert.match(source, /sanitizeCloudEnv/);
  assert.match(source, /OPENCLAW_FALLBACK_MODELS = ""/);
  assert.match(source, /PROVIDER_MISMATCH/);
  assert.match(source, /MODEL_MISMATCH/);
  assert.match(source, /FALLBACK_NOT_PROVEN_FALSE/);

  // #337 is the only strict 4\/4 Ollama proof.
  assert.match(source, /issue !== 337/);

  // Normal product work may escalate after its bounded local failure.
  assert.match(source, /PRODUCT_ESCALATION_START/);
  assert.match(source, /"agent",\s*"--agent",\s*"main"/);
  assert.match(source, /LOCAL_FIRST_WITH_CLOUD_ESCALATION/);
  assert.match(source, /ESCALATED_TO_CLOUD:\s*true/);
  assert.match(source, /Machine evidence rejected an unproven stronger-path PASS/);
});

test("V3 worker preserves human approval and real mutation gates", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /humanApprovalRequired/);
  assert.match(source, /KEEGAN_APPROVAL_REQUIRED/);
  assert.match(source, /gitMutationCommandObserved/);
  assert.match(source, /realMutationObserved/);
  assert.match(source, /NO_REAL_GIT_OR_PR_STATE_MUTATION/);
  assert.match(source, /Machine evidence rejected an unproven model PASS/);
});

test("V3 worker keeps repo and OpenClaw control workspace isolated", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  for (const cfg of Object.values(ORCHESTRATION_V3.workers)) {
    assert.notEqual(cfg.agentWorkspace, cfg.worktree);
    assert.match(cfg.agentWorkspace, /\.openclaw\/agent-workspaces-v3\/local-[abcdef]$/);
    assert.match(cfg.worktree, /\.openclaw\/worktrees\/local-[abcdef]$/);
  }
  assert.match(source, /OPENCLAW_WORKSPACE_MUST_NOT_EQUAL_GIT_WORKTREE/);
  assert.match(source, /Protected repository/);
  assert.match(source, /Never initialize, delete, clean, or reseed/);
});

test("V3 health output exposes machine-readable 6/6 and role capacity", () => {
  const doctor = fs.readFileSync("scripts/orchestration-v3/doctor.mjs", "utf8");
  const liveness = fs.readFileSync("scripts/orchestration-v3/liveness-report.mjs", "utf8");

  assert.match(doctor, /ACCEPTANCE_PROOF/);
  assert.match(doctor, /LIVE_BY_ROLE/);
  assert.match(doctor, /INTEGRATION_RELEASE/);
  assert.match(doctor, /QA_EVALUATION/);
  assert.match(liveness, /capacity_acceptance_proof/);
  assert.match(liveness, /role_utilization/);
  assert.match(liveness, /integration_release/);
  assert.match(liveness, /qa_evaluation/);
});

test("V3 bootstrap quiesces watcher and workers before worktree preparation", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/bootstrap-host.mjs", "utf8");
  const quiesce = source.indexOf("=== V3 BOOTSTRAP: QUIESCE EXISTING CONTROL PLANE ===");
  const prepare = source.indexOf("=== V3 BOOTSTRAP: SAFE PREPARE ===");
  assert.ok(quiesce >= 0 && prepare > quiesce);
  assert.match(source, /scripts\/orchestration-v3\/worker\.mjs/);
});

test("V3 live watcher and worker never call legacy orchestration entrypoints", () => {
  const forbidden = [
    "scripts/orchestration-watch.mjs",
    "scripts/launch-orchestration-nl-detached.mjs",
    "scripts/orchestration-run-issue-openclaw.mjs"
  ];
  for (const file of ["scripts/orchestration-v3/watcher.mjs", "scripts/orchestration-v3/worker.mjs"]) {
    const source = fs.readFileSync(file, "utf8");
    for (const legacy of forbidden) assert.equal(source.includes(legacy), false, `${file} must not reference ${legacy}`);
  }
});

test("V3 activation retires every legacy runtime surface and doctor fails if one survives", () => {
  const activation = fs.readFileSync("scripts/orchestration-v3/activate-host.mjs", "utf8");
  const bootstrap = fs.readFileSync("scripts/orchestration-v3/bootstrap-host.mjs", "utf8");
  const doctor = fs.readFileSync("scripts/orchestration-v3/doctor.mjs", "utf8");
  for (const legacy of ["scripts/orchestration-watch.mjs", "scripts/launch-orchestration-nl-detached.mjs", "scripts/orchestration-run-issue-openclaw.mjs"]) {
    assert.match(activation, new RegExp(legacy.replaceAll(".", "\\.")));
    assert.match(bootstrap, new RegExp(legacy.replaceAll(".", "\\.")));
    assert.match(doctor, new RegExp(legacy.replaceAll(".", "\\.")));
  }
  assert.match(activation, /archiveLegacyPlist/);
  assert.match(doctor, /LEGACY_LAUNCHAGENT_PLIST_ACTIVE/);
  assert.match(doctor, /legacyRetired/);
});

test("V3 doctor tolerates only bounded worktree dirt from the worker that is actively running", () => {
  const doctor = fs.readFileSync("scripts/orchestration-v3/doctor.mjs", "utf8");
  assert.match(doctor, /workerForStream/);
  assert.match(doctor, /ACTIVE_WORKERS/);
  assert.match(doctor, /TOLERATED_ACTIVE_WORKER_ERRORS/);
  assert.match(doctor, /TRACKED_WORKTREE_DIRTY/);
  assert.match(doctor, /UNEXPECTED_UNTRACKED_FILES/);
  assert.match(doctor, /if \(!activeWorkers\.has\(workerId\)\) return false/);
  assert.doesNotMatch(doctor, /MASS_TRACKED_DELETION[\s\S]*TOLERATED_ACTIVE_WORKER_ERRORS/);
});

test("observed execution journal classifies only successful required stages", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-evidence-test-"));
  const journal = path.join(dir, "commands.tsv");
  fs.writeFileSync(journal, [
    "1\tgit\t0\trev-parse --show-toplevel",
    "2\tgit\t0\tstatus --short --branch",
    "3\tgit\t0\tremote -v",
    "4\tpnpm\t0\trun build",
    "5\tgit\t0\tdiff",
    "6\tgit\t0\tdiff --check",
    "7\tgit\t0\tadd src/example.ts",
    "8\tgit\t0\tcommit -m fix",
    "9\tgit\t0\tpush origin HEAD",
    ""
  ].join("\n"));
  const evidence = readObservedExecutionEvidence(journal);
  assert.equal(evidence.toolCallCount, 9);
  assert.equal(evidence.repoPreflightObserved, true);
  assert.equal(evidence.testExecutionObserved, true);
  assert.equal(evidence.gitDiffObserved, true);
  assert.equal(evidence.gitDiffCheckObserved, true);
  assert.equal(evidence.gitMutationCommandObserved, true);
  assert.equal(requiresTestExecution("run focused tests + build"), true);
  assert.equal(requiresDiffCheck("then git diff --check"), true);
  fs.rmSync(dir, { recursive: true, force: true });
});
