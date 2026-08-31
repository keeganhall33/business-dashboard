import { execFileSync } from 'node:child_process';

const TERMINAL_LABEL = Object.freeze({
  COMPLETE: 'orch:complete',
  BLOCKED: 'orch:blocked',
  FAILED: 'orch:failed',
  TIMED_OUT: 'orch:timed-out',
});

function ghJson(args, gh = 'gh') {
  const raw = execFileSync(gh, args, { encoding: 'utf8' });
  return JSON.parse(raw || '{}');
}

function ensureLabel(repoFullName, label, gh = 'gh') {
  execFileSync(gh, ['label','create',label,'--repo',repoFullName,'--force','--description','Orchestration V4 terminal state'], { encoding: 'utf8' });
}

export function syncTerminalTaskToGitHub({ task, repoFullName, gh = 'gh' }) {
  const terminalLabel = TERMINAL_LABEL[task?.state];
  if (!terminalLabel) return { ok: true, skipped: true };
  const issue = ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh);
  const current = new Set((issue.labels || []).map((label) => label.name));
  ensureLabel(repoFullName, terminalLabel, gh);

  const remove = ['orch:ready','orch:running','orch:complete','orch:blocked','orch:failed','orch:timed-out']
    .filter((label) => label !== terminalLabel && current.has(label));
  const args = ['issue','edit',String(task.issue_number),'--repo',repoFullName];
  for (const label of remove) args.push('--remove-label', label);
  if (!current.has(terminalLabel)) args.push('--add-label', terminalLabel);
  if (args.length > 6) execFileSync(gh, args, { encoding: 'utf8' });
  return { ok: true, skipped: false, label: terminalLabel, removed: remove };
}
