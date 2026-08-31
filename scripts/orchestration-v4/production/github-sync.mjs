import { execFileSync } from 'node:child_process';

const TERMINAL_LABEL = Object.freeze({ COMPLETE: 'orch:complete', BLOCKED: 'orch:blocked', FAILED: 'orch:failed', TIMED_OUT: 'orch:timed-out' });
const ALL_STATE_LABELS = ['orch:ready','orch:running','orch:complete','orch:blocked','orch:failed','orch:timed-out'];

function ghJson(args, gh = 'gh') {
  const raw = execFileSync(gh, args, { encoding: 'utf8' });
  return JSON.parse(raw || '{}');
}

function ensureLabel(repoFullName, label, gh = 'gh') {
  execFileSync(gh, ['label','create',label,'--repo',repoFullName,'--force','--description','Orchestration V4 terminal state'], { encoding: 'utf8' });
}

function labelsForIssue(issue) {
  return new Set((issue?.labels || []).map((label) => label?.name || label).filter(Boolean));
}

export function syncTerminalTaskToGitHub({ task, repoFullName, gh = 'gh' }) {
  const terminalLabel = TERMINAL_LABEL[task?.state];
  if (!terminalLabel) return { ok: true, skipped: true };
  ensureLabel(repoFullName, terminalLabel, gh);

  let current = labelsForIssue(ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
  const removed = [];
  for (const label of ALL_STATE_LABELS) {
    if (label === terminalLabel || !current.has(label)) continue;
    execFileSync(gh, ['issue','edit',String(task.issue_number),'--repo',repoFullName,'--remove-label',label], { encoding: 'utf8' });
    removed.push(label);
  }
  current = labelsForIssue(ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
  if (!current.has(terminalLabel)) {
    execFileSync(gh, ['issue','edit',String(task.issue_number),'--repo',repoFullName,'--add-label',terminalLabel], { encoding: 'utf8' });
  }

  const verified = labelsForIssue(ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
  const forbidden = ALL_STATE_LABELS.filter((label) => label !== terminalLabel && verified.has(label));
  if (!verified.has(terminalLabel) || forbidden.length) {
    throw new Error(`V4_GITHUB_TERMINAL_SYNC_MISMATCH:${terminalLabel}:${forbidden.join(',')}`);
  }
  return { ok: true, skipped: false, label: terminalLabel, removed, verified: [...verified].sort() };
}
