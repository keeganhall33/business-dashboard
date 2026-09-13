import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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

const DEFAULT_GITHUB_TIMEOUT_MS = 10_000;
const CONTINUITY_ISSUE_NUMBER = 1528;
const CONTINUITY_REFRESH_MS = 15 * 60_000;
const CONTINUITY_MARKER_START = '<!-- JEEVES_V4_CONTINUITY_STATUS:START -->';
const CONTINUITY_MARKER_END = '<!-- JEEVES_V4_CONTINUITY_STATUS:END -->';
const SAFE_CODE = /^[A-Z0-9_:-]{1,120}$/;
const SAFE_SLOT = /^[a-z0-9_-]{1,40}$/;
const SAFE_ACTIVE_STATE = new Set(['CLAIMED', 'RUNNING', 'VALIDATING', 'PR_OPENED']);

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

function safeIso(value) {
  const time = Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeCode(value) {
  const code = String(value ?? '');
  return SAFE_CODE.test(code) ? code : null;
}

export function buildContinuityStatus({ heartbeat = {}, tasks = [] } = {}) {
  const continuity = heartbeat?.continuity || {};
  const utilization = continuity?.utilization || {};
  const allowedSlots = Number.isInteger(utilization.allowedSlots) ? utilization.allowedSlots : 6;
  const eligibleReadyCount = Number.isInteger(continuity.eligibleReadyCount) ? continuity.eligibleReadyCount : 0;
  const rejected = Number.isInteger(continuity?.intake?.rejected) ? continuity.intake.rejected : 0;
  const activeTasks = (tasks || [])
    .filter((task) => SAFE_ACTIVE_STATE.has(String(task?.state ?? '')))
    .map((task) => ({
      issueNumber: Number.isInteger(Number(task.issue_number)) ? Number(task.issue_number) : null,
      state: String(task.state),
      slotId: SAFE_SLOT.test(String(task.slot_id ?? '')) ? String(task.slot_id) : null,
      semanticProgressAt: safeIso(task.semantic_progress_at),
      updatedAt: safeIso(task.updated_at),
    }))
    .filter((task) => task.issueNumber !== null)
    .sort((left, right) => left.issueNumber - right.issueNumber)
    .slice(0, 6);
  const activeSlots = activeTasks.length;
  const status = rejected > 0
    ? 'INTAKE_REPAIR_REQUIRED'
    : activeSlots < allowedSlots && eligibleReadyCount === 0
      ? 'REFILL_REQUIRED'
      : activeSlots < allowedSlots
        ? 'UNDERFILLED'
        : 'HEALTHY';
  return Object.freeze({
    contractVersion: 'JeevesContinuityGitHubV1',
    generatedAt: safeIso(heartbeat.generatedAt),
    runtimeCommit: /^[a-f0-9]{40}$/.test(String(heartbeat.runtimeCommit ?? '')) ? heartbeat.runtimeCommit : null,
    pollState: safeCode(heartbeat.pollState) || 'UNKNOWN',
    status,
    utilization: { activeSlots, allowedSlots },
    eligibleReadyCount,
    ineligibleReadyCount: Number.isInteger(continuity.ineligibleReadyCount) ? continuity.ineligibleReadyCount : 0,
    readyCount: Number.isInteger(continuity.readyCount) ? continuity.readyCount : 0,
    backlogHealth: safeCode(continuity.backlogHealth) || 'UNKNOWN',
    lastSemanticProgressAt: safeIso(continuity.lastSemanticProgressAt),
    mostRecentContinuityAction: safeCode(continuity.mostRecentContinuityAction),
    mostRecentContinuityActionAt: safeIso(continuity.mostRecentContinuityActionAt),
    stalledWorkerCount: Number.isInteger(continuity.stalledWorkerCount) ? continuity.stalledWorkerCount : 0,
    intake: {
      rejected,
      rejectionReasonCodes: [...new Set((continuity?.intake?.rejectionReasonCodes || []).map(safeCode).filter(Boolean))].sort().slice(0, 20),
    },
    activeTasks,
  });
}

export function continuityStatusMaterialHash(status) {
  return createHash('sha256').update(JSON.stringify({ ...status, generatedAt: null })).digest('hex');
}

export function renderContinuityStatusComment(status, materialHash = continuityStatusMaterialHash(status)) {
  return [
    CONTINUITY_MARKER_START,
    '## Jeeves continuity status',
    '',
    `Status: **${status.status}**`,
    '',
    '```json',
    JSON.stringify({ ...status, materialHash }, null, 2),
    '```',
    CONTINUITY_MARKER_END,
  ].join('\n');
}

export function publishContinuityStatusToGitHub({
  repoFullName,
  heartbeat,
  tasks = [],
  publisherState = {},
  issueNumber = CONTINUITY_ISSUE_NUMBER,
  refreshMs = CONTINUITY_REFRESH_MS,
  now = new Date(),
  gh = 'gh',
  timeoutMs = DEFAULT_GITHUB_TIMEOUT_MS,
  exec = execFileSync,
}) {
  if (!repoFullName) return { ok: true, skipped: true, reason: 'REPOSITORY_UNAVAILABLE' };
  const status = buildContinuityStatus({ heartbeat, tasks });
  const materialHash = continuityStatusMaterialHash(status);
  const nowMs = new Date(now).getTime();
  const lastPublishedMs = Date.parse(String(publisherState.lastPublishedAt ?? ''));
  const fresh = Number.isFinite(lastPublishedMs) && nowMs - lastPublishedMs < refreshMs;
  if (publisherState.materialHash === materialHash && fresh) {
    return { ok: true, skipped: true, reason: 'UNCHANGED', materialHash };
  }

  const options = { gh, timeoutMs, exec };
  let commentId = Number(publisherState.commentId) || null;
  if (!commentId) {
    const comments = ghJson(['api', '--paginate', `repos/${repoFullName}/issues/${issueNumber}/comments`], options);
    const match = (Array.isArray(comments) ? comments : []).find((comment) => String(comment?.body ?? '').includes(CONTINUITY_MARKER_START));
    commentId = Number(match?.id) || null;
  }
  const body = renderContinuityStatusComment(status, materialHash);
  const response = commentId
    ? ghJson(['api', `repos/${repoFullName}/issues/comments/${commentId}`, '--method', 'PATCH', '--field', `body=${body}`], options)
    : ghJson(['api', `repos/${repoFullName}/issues/${issueNumber}/comments`, '--method', 'POST', '--field', `body=${body}`], options);
  if (!Number(response?.id) || !String(response?.body ?? '').includes(CONTINUITY_MARKER_START)) {
    throw new Error('V4_GITHUB_CONTINUITY_SYNC_MISMATCH');
  }
  publisherState.commentId = Number(response.id);
  publisherState.materialHash = materialHash;
  publisherState.lastPublishedAt = new Date(nowMs).toISOString();
  return { ok: true, skipped: false, commentId: publisherState.commentId, materialHash, status: status.status };
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
