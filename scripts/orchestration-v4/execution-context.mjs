import path from 'node:path';

const TASK_ID = /^[A-Za-z0-9._-]+$/;
const WORKER_ID = /^[A-Za-z0-9._-]+$/;
const SHA = /^[0-9a-f]{40}$/i;

export function createExecutionContext({ taskId, issueNumber, workerId, baseSha, workspaceRoot, now = new Date(), timeoutMs }) {
  if (!TASK_ID.test(String(taskId ?? ''))) throw new Error('V4_INVALID_TASK_ID');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('V4_INVALID_ISSUE_NUMBER');
  if (!WORKER_ID.test(String(workerId ?? ''))) throw new Error('V4_INVALID_WORKER_ID');
  if (!SHA.test(String(baseSha ?? ''))) throw new Error('V4_INVALID_BASE_SHA');
  if (!path.isAbsolute(workspaceRoot)) throw new Error('V4_WORKSPACE_ROOT_MUST_BE_ABSOLUTE');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('V4_INVALID_TIMEOUT');

  const startedAt = new Date(now).toISOString();
  const deadlineAt = new Date(new Date(now).getTime() + timeoutMs).toISOString();
  const workspaceId = `${taskId}-${issueNumber}-${workerId}-${baseSha.slice(0, 12)}`;
  const workspacePath = path.join(workspaceRoot, workspaceId);

  return Object.freeze({
    version: 4,
    taskId,
    issueNumber,
    workerId,
    baseSha,
    workspaceId,
    workspacePath,
    startedAt,
    deadlineAt,
    timeoutMs,
    processGroupId: null,
    childPid: null,
  });
}

export function bindProcess(context, { childPid, processGroupId }) {
  if (!Number.isInteger(childPid) || childPid <= 0) throw new Error('V4_INVALID_CHILD_PID');
  if (!Number.isInteger(processGroupId) || processGroupId <= 0) throw new Error('V4_INVALID_PROCESS_GROUP_ID');
  return Object.freeze({ ...context, childPid, processGroupId });
}
