import { execFileSync } from 'node:child_process';
import { addTaskDependency, insertReadyTask, transitionTask } from '../state-store/sqlite-store.mjs';
import { resolveCanonicalBaseSha } from '../disposable-workspace.mjs';
import { hasWatcherVisibleLabels, validateTaskContract } from './task-contract.mjs';

function git(repoRoot, ...args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

function readyContractRefreshAllowed(existing, task) {
  let current;
  try { current = JSON.parse(existing?.contract_json || '{}'); }
  catch { return false; }
  return existing?.state === 'READY'
    && existing?.issue_number === task.issueNumber
    && existing?.task_id === task.taskId
    && existing?.slot_id == null
    && Number(existing?.attempt) === 0
    && current.stream === task.stream
    && current.taskMutability === task.taskMutability
    && current.fileOwnership === task.fileOwnership
    && current.maxAttempts === task.maxAttempts
    && JSON.stringify(current.dependencies ?? []) === JSON.stringify(task.dependencies ?? []);
}

export function refreshCanonicalMain(repoRoot) {
  git(repoRoot, 'fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main');
  return resolveCanonicalBaseSha(repoRoot, 'refs/remotes/origin/main');
}

export function listReadyIssues({ repoFullName, gh = 'gh' }) {
  const raw = execFileSync(gh, [
    'issue', 'list', '--repo', repoFullName, '--state', 'open', '--label', 'orch:ready',
    '--limit', '100', '--json', 'number,title,body,labels'
  ], { encoding: 'utf8' });
  return JSON.parse(raw || '[]');
}

export function importReadyIssues({ db, issues, baseSha }) {
  const imported = [];
  const refreshed = [];
  const rejected = [];
  const duplicates = [];
  for (const issue of issues) {
    if (!hasWatcherVisibleLabels(issue)) {
      rejected.push({ issueNumber: issue.number, errors: ['WATCHER_VISIBLE_LABELS_REQUIRED'] });
      continue;
    }
    const validation = validateTaskContract(issue);
    if (!validation.ok) {
      rejected.push({ issueNumber: issue.number, errors: validation.errors });
      continue;
    }
    const task = validation.task;
    const existing = db.prepare(`
      SELECT task_id,issue_number,state,base_sha,contract_json,slot_id,attempt
      FROM tasks
      WHERE issue_number=? OR task_id=?
      LIMIT 1
    `).get(issue.number, task.taskId);
    if (existing) {
      const sameIdentity = existing.issue_number === issue.number && existing.task_id === task.taskId;
      if (sameIdentity && readyContractRefreshAllowed(existing, task)) {
        const update = db.prepare(`
          UPDATE tasks
          SET base_sha=?,contract_json=?,updated_at=?
          WHERE task_id=? AND issue_number=? AND state='READY' AND attempt=0 AND slot_id IS NULL
        `).run(baseSha, JSON.stringify(task), new Date().toISOString(), task.taskId, issue.number);
        if (update.changes !== 1) {
          rejected.push({ issueNumber: issue.number, errors: ['READY_CONTRACT_REFRESH_LOST_RACE'] });
          continue;
        }
        refreshed.push(task);
        continue;
      }
      if (sameIdentity && existing.state === 'READY' && existing.slot_id == null && Number(existing.attempt) === 0) {
        rejected.push({ issueNumber: issue.number, errors: ['READY_CONTRACT_REFRESH_FORBIDDEN'] });
        continue;
      }
      duplicates.push({
        issueNumber: issue.number,
        taskId: existing.task_id,
        state: existing.state,
        conflict: existing.issue_number === issue.number ? 'ISSUE_NUMBER' : 'TASK_ID',
      });
      continue;
    }
    insertReadyTask(db, {
      taskId: task.taskId,
      issueNumber: task.issueNumber,
      stream: task.stream,
      baseSha,
      contract: task,
    });
    imported.push(task);
  }
  const dependencyRejected = new Set();
  for (const task of imported) {
    for (const dependency of task.dependencies ?? []) {
      try {
        addTaskDependency(db, { taskId: task.taskId, dependsOnTaskId: dependency.taskId, artifact: dependency.artifact });
      } catch (error) {
        rejected.push({ issueNumber: task.issueNumber, errors: [String(error?.message || error)] });
        dependencyRejected.add(task.taskId);
        transitionTask(db, { taskId: task.taskId, expectedState: 'READY', toState: 'BLOCKED', patch: { terminalReason: 'DEPENDENCY_CONTRACT_INVALID' } });
        break;
      }
    }
  }
  return Object.freeze({ imported: imported.filter((task) => !dependencyRejected.has(task.taskId)), refreshed, rejected, duplicates });
}
