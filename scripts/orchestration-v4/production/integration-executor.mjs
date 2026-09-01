import { execFileSync } from 'node:child_process';
import { prepareIntegrationWorkspace, reconcileAgainstCanonicalMain, assertPushTarget, cleanupIntegrationWorkspace } from '../integration/reconciler.mjs';
import { claimTask, getTask, getTaskContract, recordTaskResult, releaseSlotForTerminalTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { V4_STATES } from '../state-machine.mjs';

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

export function runIntegrationTask({ db, repoRoot, repoFullName, workspaceRoot, taskId, canonicalMainSha, gh = 'gh', timeoutMs = 15 * 60_000 }) {
  const ready = getTask(db, taskId);
  if (!ready || ready.state !== V4_STATES.READY || ready.stream !== 'INTEGRATION_RELEASE') throw new Error('V4_INTEGRATION_TASK_NOT_READY');
  const contract = getTaskContract(ready);
  const prNumber = parseReferencedPr(contract);
  const pr = loadPr({ repoFullName, prNumber, gh });
  claimTask(db, { taskId, slotId: 'local-e' });
  let context = null;
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
    transitionTask(db, { taskId, expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING, patch: { workspacePath: context.workspacePath } });
    const reconciliation = reconcileAgainstCanonicalMain({ repoRoot, context, canonicalMainSha });
    if (!reconciliation.ok) {
      transitionTask(db, { taskId, expectedState: V4_STATES.RUNNING, toState: V4_STATES.BLOCKED, patch: { terminalReason: 'INTEGRATION_CONFLICT' } });
      recordTaskResult(db, { taskId, result: { prNumber, reconciliation: 'CONFLICT', mergeBase: reconciliation.mergeBase } });
      return getTask(db, taskId);
    }
    assertPushTarget({ context, remoteRepoFullName: repoFullName, branchName: pr.headBranch });
    transitionTask(db, { taskId, expectedState: V4_STATES.RUNNING, toState: V4_STATES.VALIDATING });
    recordTaskResult(db, { taskId, result: { prNumber, reconciliation: 'CLEAN', mergeBase: reconciliation.mergeBase, pushTargetValidated: true, duplicatePrCreated: false } });
    transitionTask(db, { taskId, expectedState: V4_STATES.VALIDATING, toState: V4_STATES.COMPLETE });
    return getTask(db, taskId);
  } catch (error) {
    const current = getTask(db, taskId);
    if (current && [V4_STATES.CLAIMED,V4_STATES.RUNNING,V4_STATES.VALIDATING].includes(current.state)) {
      try { transitionTask(db, { taskId, expectedState: current.state, toState: V4_STATES.FAILED, patch: { terminalReason: String(error?.message || error) } }); } catch {}
    }
    throw error;
  } finally {
    if (context) { try { cleanupIntegrationWorkspace({ repoRoot, context }); } catch {} }
    const terminal = getTask(db, taskId);
    if (terminal && [V4_STATES.COMPLETE,V4_STATES.BLOCKED,V4_STATES.FAILED,V4_STATES.TIMED_OUT].includes(terminal.state)) releaseSlotForTerminalTask(db, taskId);
  }
}
