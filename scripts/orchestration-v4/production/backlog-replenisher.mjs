import { execFileSync } from 'node:child_process';
import { parseTaskContract, validateTaskContract } from './task-contract.mjs';

export const DEFAULT_READY_RESERVE_TARGET = 12;
export const READY_RESERVE_HARD_CAP = 20;

const ACTIVE_STATES = new Set(['CLAIMED', 'RUNNING', 'VALIDATING', 'PR_OPENED']);
const TERMINAL_STATES = new Set(['COMPLETE', 'BLOCKED', 'FAILED', 'TIMED_OUT']);
const INFRASTRUCTURE_STREAMS = new Set(['AGENT_ORCHESTRATION', 'ORCHESTRATION_SYSTEMS', 'INTEGRATION_RELEASE']);
const LIFECYCLE_LABELS = new Set([
  'orch:ready',
  'orch:claimed',
  'orch:running',
  'orch:validating',
  'orch:pr-opened',
  'orch:blocked',
  'orch:failed',
  'orch:complete',
  'orch:timed-out',
]);
const PRIORITY = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });

function labels(issue) {
  return new Set((issue?.labels || []).map((label) => label?.name || label).filter(Boolean));
}

function paths(value) {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function pathConflict(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function ownershipConflict(left, right) {
  const leftPaths = paths(left);
  const rightPaths = paths(right);
  return leftPaths.some((a) => rightPaths.some((b) => pathConflict(a, b)));
}

function contractForStoredTask(task) {
  try {
    return JSON.parse(task?.contract_json || '{}');
  } catch {
    return {};
  }
}

function dependencyIds(task, fields) {
  const ids = new Set((task.dependencies || []).map((dependency) => dependency.taskId));
  for (const entry of String(fields.depends_on || '').split(',').map((value) => value.trim()).filter(Boolean)) {
    if (entry.toUpperCase() !== 'NONE') ids.add(entry);
  }
  return [...ids];
}

function candidateReason(issue, { tasks, completedTaskIds, activeOwnership }) {
  const issueLabels = labels(issue);
  if (!issueLabels.has('agent-orchestration')) return 'AGENT_ORCHESTRATION_LABEL_REQUIRED';
  if ([...LIFECYCLE_LABELS].some((label) => issueLabels.has(label))) return 'LIFECYCLE_ALREADY_ASSIGNED';
  const fields = parseTaskContract(issue?.body || '');
  if (fields.continuity_candidate !== 'true') return 'CONTINUITY_AUTHORIZATION_REQUIRED';
  if (!/^KEEGAN_ACTION_REQUIRED=NO\.?$/m.test(String(issue?.body || ''))) return 'KEEGAN_ACTION_REQUIRED_UNKNOWN';
  const validation = validateTaskContract(issue);
  if (!validation.ok) return `CONTRACT_INVALID:${validation.errors.join(',')}`;
  const task = validation.task;
  if (tasks.some((stored) => Number(stored.issue_number) === Number(issue.number) || stored.task_id === task.taskId)) {
    return 'TASK_ALREADY_DURABLE';
  }
  if (dependencyIds(task, fields).some((taskId) => !completedTaskIds.has(taskId))) {
    return 'DEPENDENCY_NOT_COMPLETE';
  }
  if (activeOwnership.some((owned) => ownershipConflict(task.fileOwnership, owned))) {
    return 'ACTIVE_OWNERSHIP_CONFLICT';
  }
  return null;
}

function stableCandidateOrder(runtimeHealthy) {
  return (left, right) => {
    const leftFields = parseTaskContract(left.body || '');
    const rightFields = parseTaskContract(right.body || '');
    const leftValidation = validateTaskContract(left);
    const rightValidation = validateTaskContract(right);
    const leftInfrastructure = INFRASTRUCTURE_STREAMS.has(leftValidation.task?.stream);
    const rightInfrastructure = INFRASTRUCTURE_STREAMS.has(rightValidation.task?.stream);
    return (PRIORITY[leftFields.priority] ?? PRIORITY.P3) - (PRIORITY[rightFields.priority] ?? PRIORITY.P3)
      || (runtimeHealthy ? Number(leftInfrastructure) - Number(rightInfrastructure) : 0)
      || String(left.createdAt || left.created_at || '').localeCompare(String(right.createdAt || right.created_at || ''))
      || Number(left.number) - Number(right.number);
  };
}

export function planBacklogReplenishment({
  issues = [],
  tasks = [],
  reserveTarget = DEFAULT_READY_RESERVE_TARGET,
  hardCap = READY_RESERVE_HARD_CAP,
  runtimeHealthy = true,
} = {}) {
  if (!Number.isInteger(reserveTarget) || reserveTarget < 0 || reserveTarget > READY_RESERVE_HARD_CAP) {
    throw new Error('V4_REPLENISH_RESERVE_TARGET_INVALID');
  }
  if (!Number.isInteger(hardCap) || hardCap < 1 || hardCap > READY_RESERVE_HARD_CAP || reserveTarget > hardCap) {
    throw new Error('V4_REPLENISH_HARD_CAP_INVALID');
  }
  if (issues.length > 500 || tasks.length > 2_000) throw new Error('V4_REPLENISH_INPUT_UNBOUNDED');

  const completedTaskIds = new Set(tasks.filter((task) => task.state === 'COMPLETE').map((task) => task.task_id));
  const activeOwnership = tasks
    .filter((task) => ACTIVE_STATES.has(task.state))
    .map((task) => contractForStoredTask(task).fileOwnership)
    .filter(Boolean);
  const readyIssueNumbers = new Set(
    issues.filter((issue) => labels(issue).has('orch:ready')).map((issue) => Number(issue.number)),
  );
  for (const task of tasks.filter((task) => task.state === 'READY')) readyIssueNumbers.add(Number(task.issue_number));
  const readyBefore = readyIssueNumbers.size;
  const promotionLimit = Math.min(Math.max(0, reserveTarget - readyBefore), Math.max(0, hardCap - readyBefore));
  const rejected = [];
  const eligible = [];

  for (const issue of issues) {
    const reason = candidateReason(issue, { tasks, completedTaskIds, activeOwnership });
    if (reason) rejected.push(Object.freeze({ issueNumber: Number(issue.number), reason }));
    else eligible.push(issue);
  }

  eligible.sort(stableCandidateOrder(runtimeHealthy));
  const selected = [];
  const selectedOwnership = [];
  for (const issue of eligible) {
    if (selected.length >= promotionLimit) break;
    const task = validateTaskContract(issue).task;
    if (selectedOwnership.some((owned) => ownershipConflict(task.fileOwnership, owned))) {
      rejected.push(Object.freeze({ issueNumber: Number(issue.number), reason: 'CANDIDATE_OWNERSHIP_CONFLICT' }));
      continue;
    }
    selected.push(issue);
    selectedOwnership.push(task.fileOwnership);
  }

  const readyAfterPlan = readyBefore + selected.length;
  return Object.freeze({
    contractVersion: 'BacklogReplenishmentPlanV1',
    reserveTarget,
    hardCap,
    readyBefore,
    promotionLimit,
    eligibleCount: eligible.length,
    selected: Object.freeze(selected),
    rejected: Object.freeze(rejected),
    deficit: Math.max(0, reserveTarget - readyAfterPlan),
  });
}

export function listContinuityCandidateIssues({
  repoFullName,
  gh = 'gh',
  exec = execFileSync,
}) {
  if (!repoFullName) throw new Error('V4_REPLENISH_REPOSITORY_REQUIRED');
  const raw = exec(gh, [
    'issue', 'list',
    '--repo', repoFullName,
    '--state', 'open',
    '--label', 'agent-orchestration',
    '--limit', '500',
    '--json', 'number,title,body,labels,createdAt',
  ], { encoding: 'utf8', timeout: 15_000, maxBuffer: 16 * 1024 * 1024 });
  const issues = JSON.parse(String(raw || '[]'));
  if (!Array.isArray(issues) || issues.length > 500) throw new Error('V4_REPLENISH_GITHUB_RESPONSE_INVALID');
  return issues;
}

export function promoteContinuityCandidate({
  issue,
  repoFullName,
  gh = 'gh',
  exec = execFileSync,
}) {
  const run = (args) => String(exec(gh, args, {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  }));
  const current = JSON.parse(run([
    'issue', 'view', String(issue.number),
    '--repo', repoFullName,
    '--json', 'number,title,body,labels,state',
  ]) || '{}');
  const currentLabels = labels(current);
  if (current.state !== 'OPEN' && current.state !== 'open') return Object.freeze({ ok: false, issueNumber: issue.number, reason: 'ISSUE_NOT_OPEN' });
  if ([...LIFECYCLE_LABELS].some((label) => currentLabels.has(label))) {
    return Object.freeze({ ok: false, issueNumber: issue.number, reason: 'LIFECYCLE_RACE_DETECTED' });
  }
  if (!currentLabels.has('agent-orchestration')
      || parseTaskContract(current.body || '').continuity_candidate !== 'true'
      || !/^KEEGAN_ACTION_REQUIRED=NO\.?$/m.test(String(current.body || ''))
      || !validateTaskContract(current).ok) {
    return Object.freeze({ ok: false, issueNumber: issue.number, reason: 'AUTHORIZATION_RACE_DETECTED' });
  }
  run(['label', 'create', 'orch:ready', '--repo', repoFullName, '--force', '--description', 'Orchestration V4 ready state']);
  run(['issue', 'edit', String(issue.number), '--repo', repoFullName, '--add-label', 'orch:ready']);
  return Object.freeze({ ok: true, issueNumber: Number(issue.number) });
}

export function replenishBacklog({
  repoFullName,
  tasks = [],
  reserveTarget = DEFAULT_READY_RESERVE_TARGET,
  hardCap = READY_RESERVE_HARD_CAP,
  runtimeHealthy = true,
  gh = 'gh',
  exec = execFileSync,
  listIssues = listContinuityCandidateIssues,
  promote = promoteContinuityCandidate,
} = {}) {
  const issues = listIssues({ repoFullName, gh, exec });
  const plan = planBacklogReplenishment({ issues, tasks, reserveTarget, hardCap, runtimeHealthy });
  const promotions = [];
  for (const issue of plan.selected) {
    promotions.push(promote({ issue, repoFullName, gh, exec }));
  }
  const promoted = promotions.filter((entry) => entry.ok).length;
  return Object.freeze({
    contractVersion: 'BacklogReplenishmentResultV1',
    reserveTarget: plan.reserveTarget,
    hardCap: plan.hardCap,
    readyBefore: plan.readyBefore,
    promoted,
    promotedIssueNumbers: Object.freeze(promotions.filter((entry) => entry.ok).map((entry) => entry.issueNumber)),
    promotionFailures: Object.freeze(promotions.filter((entry) => !entry.ok)),
    eligibleCount: plan.eligibleCount,
    deficit: Math.max(0, plan.reserveTarget - plan.readyBefore - promoted),
    rejected: plan.rejected,
  });
}

export { ownershipConflict };
