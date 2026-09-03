import { execFileSync } from 'node:child_process';
import { insertReadyTask } from '../state-store/sqlite-store.mjs';
import { resolveCanonicalBaseSha } from '../disposable-workspace.mjs';
import { hasWatcherVisibleLabels, validateTaskContract } from './task-contract.mjs';

function git(repoRoot, ...args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

export function refreshCanonicalMain(repoRoot) {
  git(repoRoot, 'fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main');
  return resolveCanonicalBaseSha(repoRoot, 'refs/remotes/origin/main');
}

export function listReadyIssues({ repoFullName, gh = 'gh' }) {
  const raw = execFileSync(gh, [
    'issue', 'list', '--repo', repoFullName, '--state', 'open', '--label', 'agent-orchestration', '--label', 'orch:ready',
    '--limit', '100', '--json', 'number,title,body,labels'
  ], { encoding: 'utf8' });
  return JSON.parse(raw || '[]');
}

export function importReadyIssues({ db, issues, baseSha }) {
  const imported = [];
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
      SELECT task_id,issue_number,state
      FROM tasks
      WHERE issue_number=? OR task_id=?
      LIMIT 1
    `).get(issue.number, task.taskId);
    if (existing) {
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
  return Object.freeze({ imported, rejected, duplicates });
}
