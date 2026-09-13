import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planBacklogReplenishment,
  promoteContinuityCandidate,
  replenishBacklog,
} from '../../../scripts/orchestration-v4/production/backlog-replenisher.mjs';

function candidate(number, {
  priority = 'P0',
  stream = 'CORE_INTELLIGENCE',
  ownership = `src/candidate-${number}.ts`,
  labels = ['agent-orchestration'],
  continuity = true,
  humanApproval = false,
  actionRequired = 'NO',
  dependsOn = 'NONE',
  taskId = `candidate-${number}`,
  createdAt = `2026-09-13T20:${String(number).padStart(2, '0')}:00Z`,
} = {}) {
  return {
    number,
    title: `Candidate ${number}`,
    createdAt,
    labels: labels.map((name) => ({ name })),
    body: [
      '**task_id:** ' + taskId,
      '**contract_version:** BUSINESS_VALUE_V2',
      '**stream:** ' + stream,
      '**priority:** ' + priority,
      '**verification_owner:** INDEPENDENT',
      '**human_approval_required:** ' + String(humanApproval),
      '**task_mutability:** IMPLEMENTATION_MUTATION_REQUIRED',
      '**file_ownership:** ' + ownership,
      '**delivery_mode:** DEFECT',
      '**depends_on:** ' + dependsOn,
      '**quality_gates:** DIFF_CHECK,TYPECHECK,TEST',
      '**continuity_candidate:** ' + String(continuity),
      '',
      '## Business outcome',
      'Deliver useful product value.',
      '',
      '## Business reason',
      'Keep the roadmap moving.',
      '',
      '## Success metric',
      'A bounded verified result.',
      '',
      '## Proof required',
      'Exact-head tests and review.',
      '',
      `KEEGAN_ACTION_REQUIRED=${actionRequired}.`,
    ].join('\n'),
  };
}

test('startup replenishment fills only the reserve deficit and respects the hard cap', () => {
  const issues = Array.from({ length: 30 }, (_, index) => candidate(index + 1));
  const plan = planBacklogReplenishment({ issues });
  assert.equal(plan.selected.length, 12);
  assert.equal(plan.deficit, 0);
  const capped = planBacklogReplenishment({ issues, reserveTarget: 20, hardCap: 20 });
  assert.equal(capped.selected.length, 20);
});

test('existing READY work reduces promotion and repeated planning is idempotent', () => {
  const issues = [
    candidate(1, { labels: ['agent-orchestration', 'orch:ready'] }),
    candidate(2),
    candidate(3),
  ];
  const first = planBacklogReplenishment({ issues, reserveTarget: 2 });
  assert.deepEqual(first.selected.map((issue) => issue.number), [2]);
  const after = issues.map((issue) => issue.number === 2 ? { ...issue, labels: [...issue.labels, { name: 'orch:ready' }] } : issue);
  assert.equal(planBacklogReplenishment({ issues: after, reserveTarget: 2 }).selected.length, 0);
});

test('priority ordering favors P0, then product work, then older authorized candidates', () => {
  const issues = [
    candidate(1, { priority: 'P1', createdAt: '2026-09-13T20:00:00Z' }),
    candidate(2, { priority: 'P0', stream: 'AGENT_ORCHESTRATION', createdAt: '2026-09-13T19:00:00Z' }),
    candidate(3, { priority: 'P0', stream: 'CORE_INTELLIGENCE', createdAt: '2026-09-13T21:00:00Z' }),
    candidate(4, { priority: 'P0', stream: 'CORE_INTELLIGENCE', createdAt: '2026-09-13T20:00:00Z' }),
  ];
  assert.deepEqual(
    planBacklogReplenishment({ issues, reserveTarget: 4 }).selected.map((issue) => issue.number),
    [4, 3, 2, 1],
  );
});

test('rejects dependencies, active ownership, terminal history, human action, malformed contracts, and missing authorization', () => {
  const issues = [
    candidate(1, { dependsOn: 'missing-task' }),
    candidate(2, { ownership: 'src/active/file.ts' }),
    candidate(3, { labels: ['agent-orchestration', 'orch:blocked'] }),
    candidate(4, { humanApproval: true }),
    candidate(5, { actionRequired: 'YES' }),
    candidate(6, { continuity: false }),
    { ...candidate(7), body: '**continuity_candidate:** true\nKEEGAN_ACTION_REQUIRED=NO.' },
  ];
  const tasks = [{
    task_id: 'active',
    issue_number: 99,
    state: 'RUNNING',
    contract_json: JSON.stringify({ fileOwnership: 'src/active' }),
  }];
  const plan = planBacklogReplenishment({ issues, tasks, reserveTarget: 12 });
  assert.equal(plan.selected.length, 0);
  assert.equal(plan.deficit, 12);
  assert.deepEqual(new Set(plan.rejected.map((entry) => entry.reason.split(':')[0])), new Set([
    'DEPENDENCY_NOT_COMPLETE',
    'ACTIVE_OWNERSHIP_CONFLICT',
    'LIFECYCLE_ALREADY_ASSIGNED',
    'CONTRACT_INVALID',
    'KEEGAN_ACTION_REQUIRED_UNKNOWN',
    'CONTINUITY_AUTHORIZATION_REQUIRED',
  ]));
});

test('completed dependencies unlock candidates while terminal task identities remain preserved', () => {
  const issues = [
    candidate(1, { dependsOn: 'complete-task' }),
    candidate(2, { taskId: 'terminal-task' }),
  ];
  const tasks = [
    { task_id: 'complete-task', issue_number: 90, state: 'COMPLETE', contract_json: '{}' },
    { task_id: 'terminal-task', issue_number: 91, state: 'FAILED', contract_json: '{}' },
  ];
  const plan = planBacklogReplenishment({ issues, tasks, reserveTarget: 2 });
  assert.deepEqual(plan.selected.map((issue) => issue.number), [1]);
  assert.equal(plan.rejected.some((entry) => entry.issueNumber === 2 && entry.reason === 'TASK_ALREADY_DURABLE'), true);
});

test('candidate ownership conflicts are not promoted into the same reserve', () => {
  const issues = [
    candidate(1, { ownership: 'src/shared' }),
    candidate(2, { ownership: 'src/shared/file.ts' }),
  ];
  const plan = planBacklogReplenishment({ issues, reserveTarget: 2 });
  assert.equal(plan.selected.length, 1);
  assert.equal(plan.deficit, 1);
  assert.equal(plan.rejected.some((entry) => entry.reason === 'CANDIDATE_OWNERSHIP_CONFLICT'), true);
});

test('promotion rechecks live lifecycle and authorization before adding ready', () => {
  const calls = [];
  const issue = candidate(1);
  const exec = (_command, args) => {
    calls.push(args);
    if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ ...issue, state: 'OPEN' });
    return '';
  };
  assert.equal(promoteContinuityCandidate({ issue, repoFullName: 'owner/repo', exec }).ok, true);
  assert.equal(calls.some((args) => args.includes('--add-label') && args.includes('orch:ready')), true);

  const raced = (_command, args) => args[0] === 'issue' && args[1] === 'view'
    ? JSON.stringify({ ...issue, state: 'OPEN', labels: [{ name: 'agent-orchestration' }, { name: 'orch:running' }] })
    : '';
  assert.equal(promoteContinuityCandidate({ issue, repoFullName: 'owner/repo', exec: raced }).reason, 'LIFECYCLE_RACE_DETECTED');

  const authorizationRaced = (_command, args) => args[0] === 'issue' && args[1] === 'view'
    ? JSON.stringify({ ...issue, state: 'OPEN', body: issue.body.replace('continuity_candidate:** true', 'continuity_candidate:** false') })
    : '';
  assert.equal(
    promoteContinuityCandidate({ issue, repoFullName: 'owner/repo', exec: authorizationRaced }).reason,
    'AUTHORIZATION_RACE_DETECTED',
  );
});

test('replenishment reports the exact honest candidate deficit', () => {
  const issues = [candidate(1), candidate(2)];
  const result = replenishBacklog({
    repoFullName: 'owner/repo',
    reserveTarget: 6,
    listIssues: () => issues,
    promote: ({ issue }) => ({ ok: true, issueNumber: issue.number }),
  });
  assert.equal(result.promoted, 2);
  assert.equal(result.deficit, 4);
  assert.deepEqual(result.promotedIssueNumbers, [1, 2]);
});
