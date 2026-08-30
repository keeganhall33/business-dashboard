import { createExecutionContext } from '../execution-context.mjs';
import { createDisposableWorkspace, cleanupDisposableWorkspace } from '../disposable-workspace.mjs';
import { classifyProgress } from '../progress.mjs';
import { V4_STATES } from '../state-machine.mjs';
import { claimTask, getTask, recordExecutionIdentity, recordSemanticProgress, releaseSlotForTerminalTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { runBoundedProcess } from './bounded-process.mjs';
import { createWorkspaceProgressObserver } from './workspace-progress.mjs';

const RESULT_TO_STATE = Object.freeze({
  COMPLETE: V4_STATES.COMPLETE,
  BLOCKED: V4_STATES.BLOCKED,
  FAILED: V4_STATES.FAILED,
  TIMED_OUT: V4_STATES.TIMED_OUT,
});

export async function runV4Task({ db, repoRoot, workspaceRoot, taskId, slotId, command, args = [], timeoutMs = 15 * 60_000, stallMs = 4 * 60_000, execute = runBoundedProcess, now = () => new Date() }) {
  const ready = getTask(db, taskId);
  if (!ready) throw new Error(`V4_RUNNER_TASK_NOT_FOUND:${taskId}`);
  if (ready.state !== V4_STATES.READY) throw new Error(`V4_RUNNER_TASK_NOT_READY:${taskId}:${ready.state}`);
  if (ready.stream === 'INTEGRATION_RELEASE') throw new Error('V4_RUNNER_INTEGRATION_REQUIRES_RECONCILER');

  const claimed = claimTask(db, { taskId, slotId, now: now() });
  const context = createExecutionContext({ taskId, issueNumber: claimed.issue_number, workerId: slotId, baseSha: claimed.base_sha, workspaceRoot, now: now(), timeoutMs });
  let workspaceReady = false;
  try {
    const workspace = createDisposableWorkspace({ repoRoot, context });
    workspaceReady = true;
    transitionTask(db, { taskId, expectedState: V4_STATES.CLAIMED, toState: V4_STATES.RUNNING, patch: { workspacePath: workspace.workspacePath }, now: now() });
    const observeSemantic = createWorkspaceProgressObserver(workspace.workspacePath);

    const result = await execute({
      command,
      args,
      cwd: workspace.workspacePath,
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

    if (result.status === 'COMPLETE') {
      transitionTask(db, { taskId, expectedState: V4_STATES.RUNNING, toState: V4_STATES.VALIDATING, now: now() });
      transitionTask(db, { taskId, expectedState: V4_STATES.VALIDATING, toState: V4_STATES.COMPLETE, now: now() });
    } else {
      const terminalState = RESULT_TO_STATE[result.status] ?? V4_STATES.FAILED;
      transitionTask(db, { taskId, expectedState: V4_STATES.RUNNING, toState: terminalState, patch: { terminalReason: result.reason ?? result.status ?? 'EXECUTION_FAILED' }, now: now() });
    }
    return { task: getTask(db, taskId), result, context: workspace };
  } catch (error) {
    const current = getTask(db, taskId);
    if (current && [V4_STATES.CLAIMED, V4_STATES.RUNNING, V4_STATES.VALIDATING].includes(current.state)) {
      try { transitionTask(db, { taskId, expectedState: current.state, toState: V4_STATES.FAILED, patch: { terminalReason: String(error?.message ?? error) }, now: now() }); } catch {}
    }
    throw error;
  } finally {
    if (workspaceReady) {
      try { cleanupDisposableWorkspace({ repoRoot, context }); } catch {}
    }
    const terminal = getTask(db, taskId);
    if (terminal && [V4_STATES.COMPLETE, V4_STATES.BLOCKED, V4_STATES.FAILED, V4_STATES.TIMED_OUT].includes(terminal.state)) releaseSlotForTerminalTask(db, taskId);
  }
}

export async function runReadyBatch({ db, registry, repoRoot, workspaceRoot, commandsByTaskId, timeoutMs, stallMs, execute }) {
  const readyTasks = db.prepare("SELECT * FROM tasks WHERE state='READY' ORDER BY created_at, task_id").all();
  const occupied = new Set(db.prepare("SELECT slot_id FROM tasks WHERE slot_id IS NOT NULL AND state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED')").all().map((row) => row.slot_id));
  const jobs = [];
  for (const task of readyTasks) {
    if (task.stream === 'INTEGRATION_RELEASE') continue;
    const slot = [...registry.values()].find((candidate) => !occupied.has(candidate.workerId) && candidate.streams.includes(task.stream));
    if (!slot) continue;
    const spec = commandsByTaskId?.[task.task_id];
    if (!spec?.command) continue;
    occupied.add(slot.workerId);
    jobs.push(runV4Task({ db, repoRoot, workspaceRoot, taskId: task.task_id, slotId: slot.workerId, command: spec.command, args: spec.args ?? [], timeoutMs, stallMs, execute }));
  }
  return Promise.allSettled(jobs);
}
