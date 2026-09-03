import { execFileSync } from 'node:child_process';

export const TERMINAL_LABEL = Object.freeze({
  COMPLETE: 'orch:complete',
  BLOCKED: 'orch:blocked',
  FAILED: 'orch:failed',
  TIMED_OUT: 'orch:timed-out',
});

export const ALL_STATE_LABELS = Object.freeze([
  'orch:ready',
  'orch:running',
  'orch:complete',
  'orch:blocked',
  'orch:failed',
  'orch:timed-out',
]);

const DEFAULT_GITHUB_TIMEOUT_MS = 15_000;

function runGithubCommand(args, {
  gh = 'gh',
  timeoutMs = DEFAULT_GITHUB_TIMEOUT_MS,
  exec = execFileSync,
} = {}) {
  try {
    return exec(gh, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    if (error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM' || error?.killed) {
      throw new Error(`V4_GITHUB_COMMAND_TIMED_OUT:${args.slice(0, 3).join(':')}`, { cause: error });
    }
    throw error;
  }
}

function ghJson(args, options) {
  const raw = runGithubCommand(args, options);
  try {
    return JSON.parse(raw || '{}');
  } catch (error) {
    throw new Error('V4_GITHUB_JSON_INVALID', { cause: error });
  }
}

function labelsForIssue(issue) {
  return new Set((issue?.labels || []).map((label) => label?.name || label).filter(Boolean));
}

export function syncTerminalTaskToGitHub({
  task,
  repoFullName,
  gh = 'gh',
  timeoutMs = DEFAULT_GITHUB_TIMEOUT_MS,
  exec = execFileSync,
}) {
  const terminalLabel = TERMINAL_LABEL[task?.state];
  if (!terminalLabel) return { ok: true, skipped: true };

  const options = { gh, timeoutMs, exec };
  runGithubCommand(
    ['label','create',terminalLabel,'--repo',repoFullName,'--force','--description','Orchestration V4 terminal state'],
    options,
  );

  let current = labelsForIssue(ghJson(
    ['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'],
    options,
  ));
  const removed = [];
  for (const label of ALL_STATE_LABELS) {
    if (label === terminalLabel || !current.has(label)) continue;
    runGithubCommand(
      ['issue','edit',String(task.issue_number),'--repo',repoFullName,'--remove-label',label],
      options,
    );
    removed.push(label);
  }

  current = labelsForIssue(ghJson(
    ['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'],
    options,
  ));
  if (!current.has(terminalLabel)) {
    runGithubCommand(
      ['issue','edit',String(task.issue_number),'--repo',repoFullName,'--add-label',terminalLabel],
      options,
    );
  }

  const verified = labelsForIssue(ghJson(
    ['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'],
    options,
  ));
  const forbidden = ALL_STATE_LABELS.filter((label) => label !== terminalLabel && verified.has(label));
  if (!verified.has(terminalLabel) || forbidden.length) {
    throw new Error(`V4_GITHUB_TERMINAL_SYNC_MISMATCH:${terminalLabel}:${forbidden.join(',')}`);
  }
  return { ok: true, skipped: false, label: terminalLabel, removed, verified: [...verified].sort() };
}
