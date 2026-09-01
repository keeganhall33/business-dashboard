import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  assertPushTarget,
  cleanupIntegrationWorkspace,
  prepareIntegrationWorkspace,
  reconcileAgainstCanonicalMain,
} from './reconciler.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

export function runLiveIntegrationAcceptance({
  repoRoot,
  issueNumber,
  prNumber,
  headSha,
  headBranch,
  canonicalMainSha,
  repoFullName = 'keeganhall33/business-dashboard',
} = {}) {
  if (!repoRoot || !path.isAbsolute(repoRoot)) throw new Error('V4_LIVE_INTEGRATION_REPO_ROOT_REQUIRED');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jeeves-orchestration-v4-live-integration-'));
  let context = null;
  try {
    context = prepareIntegrationWorkspace({
      repoRoot,
      workspaceRoot: path.join(root, 'workspaces'),
      timeoutMs: 60_000,
      target: {
        issueNumber,
        prNumber,
        headSha,
        headBranch,
        headRepoFullName: repoFullName,
        canonicalRepoFullName: repoFullName,
      },
    });
    const workspaceHead = git(context.workspacePath, 'rev-parse', 'HEAD');
    const reconcile = reconcileAgainstCanonicalMain({ repoRoot, context, canonicalMainSha });
    const pushTargetValidated = assertPushTarget({
      context,
      remoteRepoFullName: repoFullName,
      branchName: headBranch,
    });
    return {
      ok: workspaceHead === headSha && pushTargetValidated === true,
      issueNumber,
      prNumber,
      headBranch,
      headSha,
      canonicalMainSha,
      workspaceHead,
      reconciliation: reconcile.conflict ? 'CONFLICT' : 'CLEAN',
      mergeBase: reconcile.mergeBase,
      pushTargetValidated,
      duplicatePrCreated: false,
    };
  } finally {
    if (context) cleanupIntegrationWorkspace({ repoRoot, context });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [repoRootArg, issueArg, prArg, headSha, headBranch, canonicalMainSha] = process.argv.slice(2);
  const report = runLiveIntegrationAcceptance({
    repoRoot: path.resolve(repoRootArg || process.cwd()),
    issueNumber: Number(issueArg),
    prNumber: Number(prArg),
    headSha,
    headBranch,
    canonicalMainSha,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
