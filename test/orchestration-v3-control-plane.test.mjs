import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ORCHESTRATION_V3, workerForStream } from "../scripts/orchestration-v3/config.mjs";

test("V3 uses one fixed four-worker map", () => {
  assert.deepEqual(Object.keys(ORCHESTRATION_V3.workers), ["local-a", "local-b", "local-c", "local-d"]);
  assert.equal(workerForStream("CORE_INTELLIGENCE"), "local-a");
  assert.equal(workerForStream("DISCOVERY_INTELLIGENCE"), "local-b");
  assert.equal(workerForStream("INTELLIGENCE_UX"), "local-c");
  assert.equal(workerForStream("PRODUCTION_VALUE"), "local-c");
  assert.equal(workerForStream("AGENT_ORCHESTRATION"), "local-d");
  assert.equal(workerForStream("ORCHESTRATION_SYSTEMS"), "local-d");
  assert.equal(workerForStream("UNKNOWN"), null);
});

test("V3 acceptance runtime is Ollama-only Qwen 3.5", () => {
  assert.equal(ORCHESTRATION_V3.model.provider, "ollama");
  assert.equal(ORCHESTRATION_V3.model.id, "ollama/qwen3.5:9b");
  assert.equal(ORCHESTRATION_V3.model.cloudFallbackAllowed, false);
});

test("V3 runtime is isolated from the development checkout", () => {
  assert.match(ORCHESTRATION_V3.runtime.root, /\.openclaw\/runtime-v3\/business-dashboard$/);
});

test("V3 watcher has no historical task resurrection path", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.doesNotMatch(source, /selfHealMissingReady|listHealCandidates/);
  assert.match(source, /queue\.ready/);
});

test("V3 worker refuses synthetic review state for no-human tasks", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /V3 never creates a fake review gate/);
  assert.match(source, /queue\.blocked/);
});

test("V3 worker invokes the assigned local agent and never main", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /"--agent", workerId/);
  assert.doesNotMatch(source, /"--agent", "main"/);
  assert.match(source, /ORCH_CLOUD_AGENT_ID: workerId/);
  assert.match(source, /OPENCLAW_FALLBACK_MODELS: ""/);
});

test("V3 intentional rebuild archives matching OpenClaw workspace attestations", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/prepare-host.mjs", "utf8");
  assert.match(source, /createHash\("sha256"\)\.update\(workspace\)/);
  assert.match(source, /workspace-attestations/);
  assert.match(source, /workspace-attestation\.attested/);
  assert.match(source, /archiveWorkspaceAttestation/);
});

test("V3 local strict retry preserves full task context and concrete task id", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(source, /### FULL TASK CONTEXT/);
  assert.match(source, /TASK_ID MUST BE/);
  assert.doesNotMatch(source, /Task context omitted for retry \(intentional\)/);
});

test("V3 Ollama usage is not reported as cloud usage", () => {
  const source = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(source, /providerUsed === "ollama" \? null : \(meta\?\.usage \?\? null\)/);
  assert.match(source, /LOCAL_USAGE: localUsage/);
  assert.match(source, /localResult = "SUCCESS"/);
});

test("V3 rejects model PASS without git or GitHub mutation evidence", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  assert.match(source, /verifyPassEvidence/);
  assert.match(source, /PASS_REJECTED_BY_EVIDENCE/);
  assert.match(source, /git HEAD and open PR heads did not change/);
  assert.match(source, /no referenced or worker-HEAD-linked PR changed/);
  assert.match(source, /EVIDENCE_REJECTED/);
});

test("V3 worker requires real repo-root tools from an isolated OpenClaw workspace", () => {
  const worker = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");
  const prepare = fs.readFileSync("scripts/orchestration-v3/prepare-host.mjs", "utf8");
  for (const cfg of Object.values(ORCHESTRATION_V3.workers)) {
    assert.notEqual(cfg.agentWorkspace, cfg.worktree);
    assert.match(cfg.agentWorkspace, /\.openclaw\/agent-workspaces-v3\/local-[abcd]$/);
    assert.match(cfg.worktree, /\.openclaw\/worktrees\/local-[abcd]$/);
  }
  assert.match(worker, /This OpenClaw workspace is a disposable control workspace/);
  assert.match(worker, /Protected repository root:/);
  assert.match(worker, /Never delete, initialize, reseed, clean, or replace the protected repository root as a workspace/);
  assert.match(worker, /cd \$\{quotedRepoRoot\} && pwd && git rev-parse --show-toplevel && git status --short --branch && git remote -v/);
  assert.match(worker, /Actually invoke the tool/);
  assert.match(worker, /ORCH_WORKTREE_ROOT/);
  assert.match(worker, /cwd: runtimeContract\.agentWorkspace/);
  assert.match(worker, /runnerPath = path\.join\(ORCHESTRATION_V3\.runtime\.root/);
  assert.match(prepare, /workspace: cfg\.agentWorkspace/);
  assert.match(prepare, /OPENCLAW_WORKSPACE_POINTS_AT_GIT_WORKTREE/);
  assert.match(prepare, /OPENCLAW_WORKSPACE_MUST_NOT_EQUAL_GIT_WORKTREE/);
});
