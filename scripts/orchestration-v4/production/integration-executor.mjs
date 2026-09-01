import { execFileSync, spawnSync } from 'node:child_process';
import { prepareIntegrationWorkspace, reconcileAgainstCanonicalMain, assertPushTarget, cleanupIntegrationWorkspace } from '../integration/reconciler.mjs';
import { classifyProgress } from '../progress.mjs';
import { runBoundedProcess } from '../runner/bounded-process.mjs';
import { createWorkspaceProgressObserver } from '../runner/workspace-progress.mjs';
import { claimTask, getTask, getTaskContract, recordExecutionIdentity, recordSemanticProgress, recordTaskResult, releaseSlotForTerminalTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { V4_STATES } from '../state-machine.mjs';

const RESOLVER_RESULT_TO_STATE = Object.freeze({
  BLOCKED: V4_STATES.BLOCKED,
  FAILED: V4_STATES.FAILED,
  TIMED_OUT: V4_STATES.TIMED_OUT,
});

function parseReferencedPr(contract) {
  const text = `${contract?.title || ''}\n${contract?.body || ''}`;
  const patterns = [/(?:PR|pull request)\s*#?(\d+)/i, /#(\d+)\s+(?:PR|pull request)/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  throw new Error('V4_INTEGRATION_REFERENCED_PR_UNRESOLVED');
}

function loadPr({ repoFullName, prNumber, gh = 'gh' }) {
  const raw = execFileSync(gh, ['pr','view',String(prNumber),'--repo',repoFullName,'--json','number,headRefName,headRefOid,headRepositoryOwner,headRepository'], { encoding: 'utf8' });
  const pr = JSON.parse(raw);
  const owner = pr?.headRepositoryOwner?.login;
  const name = pr?.headRepository?.name;
  const headRepoFullName = owner && name ? `${owner}/${name}` : repoFullName;
  return { prNumber: pr.number, headBranch: pr.headRefName, headSha: pr.headRefOid, headRepoFullName };
}

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function gitMaybe(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function ensureIdentity(cwd) {
  if (!gitMaybe(cwd, 'config', '--get', 'user.name')) git(cwd, 'config', 'user.name', 'Jeeves Orchestration V4');
  if (!gitMaybe(cwd, 'config', '--get', 'user.email')) git(cwd, 'config', 'user.email', 'jeeves-v4@local.invalid');
}

function assertResolvedWorkspace({ workspacePath, canonicalMainSha }) {
  const unresolved = gitMaybe(workspacePath, 'diff', '--name-only', '--diff-filter=U');
  if (unresolved) throw new Error(`V4_INTEGRATION_UNRESOLVED_CONFLICTS:${unresolved.replace(/\n/g, ',')}`);

  const worktreeCheck = spawnSync('git', ['-C', workspacePath, 'diff', '--check'], { encoding: 'utf8' });
  if (worktreeCheck.status !== 0) throw new Error(`V4_INTEGRATION_WORKTREE_DIFF_CHECK_FAILED:${String(worktreeCheck.stderr || worktreeCheck.stdout || '').trim()}`);
  const indexCheck = spawnSync('git', ['-C', workspacePath, 'diff', '--cached', '--check'], { encoding: 'utf8' });
  if (indexCheck.status !== 0) throw new Error(`V4_INTEGRATION_INDEX_DIFF_CHECK_FAILED:${String(indexCheck.stderr || indexCheck.stdout || '').trim()}`);

  const mergeHead = gitMaybe(workspacePath, 'rev-parse', '-q', '--verify', 'MERGE_HEAD');
  if (mergeHead) {
    ensureIdentity(workspacePath);
    git(workspacePath, 'add', '-A');
    git(workspacePath, 'commit', '-m', `chore(v4-integration): reconcile with main ${canonicalMainSha.slice(0, 12)}`);
  }

  const ancestor = spawnSync('git', ['-C', workspacePath, 'merge-base', '--is-ancestor', canonicalMainSha, 'HEAD'], { encoding: 'utf8' });
  if (ancestor.status !== 0) throw new Error('V4_INTEGRATION_CANONICAL_MAIN_NOT_IN_HISTORY');
  return git(workspacePath, 'rev-parse', 'HEAD');
}

function pushResolvedHead({ workspacePath, branchName }) {
  const headSha = git(workspacePath, 'rev-parse', 'HEAD');
  git(workspacePath, 'push', 'origin', `HEAD:refs/heads/${branchName}`);
  const remote = git(workspacePath, 'ls-remote', 'origin', `refs/heads/${branchName}`);
  const remoteSha = String(remote || '').split(/\s+/)[0] || '';
  if (remoteSha !== headSha) throw new Error('V4_INTEGRATION_REMOTE_HEAD_MISMATCH');
  return headSha;
}

async function runConflictResolver({ db, taskId, workspacePath, resolverCommand, resolverArgs, timeoutMs, stallMs, executeResolver, now }) {
  if (!resolverCommand) throw new Error('V4_INTEGRATION_CONFLICT_RESOLVER_REQUIRED');
  const observeSemantic = createWorkspaceProgressObserver(workspacePath);
  return executeResolver({
    command: resolverCommand,
    args: resolverArgs ?? [],
    cwd: workspacePath,
    timeoutMs,
    stallMs,
    observeSemantic,
    onStarted({ childPid, processGroupId }) {
      recordExecutionIdentity(db, { taskId, childPid, processGroupId, now: now() });
    },
    onEvent(event) {
      const classification = classifyProgress(event);
      if (classification === 'SEMANTIC') recordSemanticProgress(db, { taskId, observedAt: new Date(event.observedAt) });
      return classification;
    },
  });
}

export async function runIntegrationTask({
  db,
  repoRoot,
  repoFullName,
  workspaceRoot,
  taskId,
  canonicalMainSha,
  resolverCommand = null,
  resolverArgs = [],
  executeResolver = runBoundedProcess,
  gh = 'gh',
  timeoutMs = 15 * 60_000,
  stallMs = 10 * 60_000,
  now = () => new Date(),
}) {
  const ready = getTask(db, taskId);
  if (!ready || ready.state !== V4_STATES.READY || ready.stream !== 'INTEGRATION_RELEASE') throw new Error('V4_INTEGRATION_TASK_NOT_READY');
  const contract = getTaskContract(ready);
  const prNumber = parseReferencedPr(contract);
  const pr = loadPr({ repoFullName, prNumber, gh });
  claimTask(db, { taskId, slotId: 'local-e', now: now() });
  let context = null;
  let resolverResult = null;
  let preserveWorkspace = false;
  try {
    const target = {
      issueNumber: ready.issue_number,
      prNumber,
      headSha: pr.headSha,
      headBranch: pr.headBranch,
      headRepoFullName: pr.headRepoFullName,
      canonicalRepoFullName: repoFullName,
    };
    context = prepareIntegrationWorkspace({ repoRoot, workspaceRoot, workerId: 'local-e', timeoutMs, target });
    transitionTask(db, { taskId, expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING, patch: { workspacePath: context.workspacePath }, now: now() });

    const reconciliation = reconcileAgainstCanonicalMain({ repoRoot, context, canonicalMainSha });
    let reconciliationState = 'CLEAN';
    if (!reconciliation.ok) {
      reconciliationState = 'RESOLVED';
      resolverResult = await runConflictResolver({
        db,
        taskId,
        workspacePath: context.workspacePath,
        resolverCommand,
        resolverArgs,
        timeoutMs,
        stallMs,
        executeResolver,
        now,
      });
      if (resolverResult.status !== 'COMPLETE') {
        preserveWorkspace = true;
        const terminalState = RESOLVER_RESULT_TO_STATE[resolverResult.status] ?? V4_STATES.FAILED;
        recordTaskResult(db, { taskId, result: { prNumber, reconciliation: 'CONFLICT', mergeBase: reconciliation.mergeBase, resolver: resolverResult, workspacePreserved: true }, now: now() });
        transitionTask(db, { taskId, expectedState: V4_STATES.RUNNING, toState: terminalState, patch: { terminalReason: resolverResult.reason ?? resolverResult.status ?? 'INTEGRATION_RESOLVER_FAILED' }, now: now() });
        return getTask(db, taskId);
      }
    }

    assertPushTarget({ context, remoteRepoFullName: repoFullName, branchName: pr.headBranch });
    transitionTask(db, { taskId, expectedState: V4_STATES.RUNNING, toState: V4_STATES.VALIDATING, now: now() });
    const headSha = assertResolvedWorkspace({ workspacePath: context.workspacePath, canonicalMainSha });
    const pushedHeadSha = pushResolvedHead({ workspacePath: context.workspacePath, branchName: pr.headBranch });
    if (pushedHeadSha !== headSha) throw new Error('V4_INTEGRATION_PUSHED_HEAD_CHANGED');

    recordTaskResult(db, {
      taskId,
      result: {
        prNumber,
        reconciliation: reconciliationState,
        mergeBase: reconciliation.mergeBase,
        pushTargetValidated: true,
        pushed: true,
        headSha,
        duplicatePrCreated: false,
        workspacePreserved: false,
        ...(resolverResult ? { resolver: resolverResult } : {}),
      },
      now: now(),
    });
    transitionTask(db, { taskId, expectedState: V4_STATES.VALIDATING, toState: V4_STATES.COMPLETE, now: now() });
    return getTask(db, taskId);
  } catch (error) {
    preserveWorkspace = Boolean(context);
    const current = getTask(db, taskId);
    try {
      if (current) recordTaskResult(db, { taskId, result: { error: String(error?.message || error), workspacePreserved: preserveWorkspace, ...(resolverResult ? { resolver: resolverResult } : {}) }, now: now() });
    } catch {}
    if (current && [V4_STATES.CLAIMED,V4_STATES.RUNNING,V4_STATES.VALIDATING].includes(current.state)) {
      try { transitionTask(db, { taskId, expectedState: current.state, toState: V4_STATES.FAILED, patch: { terminalReason: String(error?.message || error) }, now: now() }); } catch {}
    }
    throw error;
  } finally {
    if (context && !preserveWorkspace) { try { cleanupIntegrationWorkspace({ repoRoot, context }); } catch {} }
    const terminal = getTask(db, taskId);
    if (terminal && [V4_STATES.COMPLETE,V4_STATES.BLOCKED,V4_STATES.FAILED,V4_STATES.TIMED_OUT].includes(terminal.state)) releaseSlotForTerminalTask(db, taskId);
  }
}
