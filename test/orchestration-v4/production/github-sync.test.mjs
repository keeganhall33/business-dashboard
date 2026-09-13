import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_STATE_LABELS,
  buildContinuityStatus,
  publishContinuityStatusToGitHub,
  renderContinuityStatusComment,
  syncTerminalTaskToGitHub,
} from '../../../scripts/orchestration-v4/production/github-sync.mjs';

function fakeGithub(initialLabels = ['orch:ready']) {
  const labels = new Set(initialLabels);
  const calls = [];
  const exec = (_command, args, options) => {
    calls.push({ args, options });
    if (args[0] === 'label') return '';
    if (args[0] === 'issue' && args[1] === 'view') {
      return JSON.stringify({ labels: [...labels].map((name) => ({ name })), state: 'OPEN' });
    }
    if (args[0] === 'issue' && args[1] === 'edit') {
      const removeAt = args.indexOf('--remove-label');
      const addAt = args.indexOf('--add-label');
      if (removeAt >= 0) labels.delete(args[removeAt + 1]);
      if (addAt >= 0) labels.add(args[addAt + 1]);
      return '';
    }
    throw new Error(`UNEXPECTED_FAKE_GH_CALL:${args.join(' ')}`);
  };
  return { labels, calls, exec };
}

test('terminal reconciliation leaves exactly one orchestration state label', () => {
  const fake = fakeGithub(['orch:ready', 'orch:running', 'product']);
  const result = syncTerminalTaskToGitHub({
    task: { issue_number: 1138, state: 'FAILED' },
    repoFullName: 'owner/repo',
    exec: fake.exec,
    timeoutMs: 1234,
  });
  assert.equal(result.ok, true);
  assert.deepEqual([...fake.labels].filter((label) => ALL_STATE_LABELS.includes(label)), ['orch:failed']);
  assert.equal(fake.labels.has('product'), true);
  assert.equal(fake.calls.every((call) => call.options.timeout === 1234), true);
});

test('hung GitHub subprocess is bounded and fails closed', () => {
  const timeout = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT', killed: true });
  assert.throws(
    () => syncTerminalTaskToGitHub({
      task: { issue_number: 1138, state: 'FAILED' },
      repoFullName: 'owner/repo',
      timeoutMs: 25,
      exec: (_command, _args, options) => {
        assert.equal(options.timeout, 25);
        throw timeout;
      },
    }),
    /V4_GITHUB_COMMAND_TIMED_OUT/,
  );
});

test('continuity status exposes only bounded operational fields and stable reason codes', () => {
  const status = buildContinuityStatus({
    heartbeat: {
      generatedAt: '2026-09-13T20:00:00.000Z',
      runtimeCommit: 'a'.repeat(40),
      pollState: 'RUNNING',
      continuity: {
        utilization: { activeSlots: 1, allowedSlots: 6 },
        eligibleReadyCount: 0,
        ineligibleReadyCount: 2,
        readyCount: 2,
        backlogHealth: 'BACKLOG_INELIGIBLE',
        lastSemanticProgressAt: '2026-09-13T19:59:00.000Z',
        mostRecentContinuityAction: 'WAIT_FOR_ACTIVE_PROGRESS',
        mostRecentContinuityActionAt: '2026-09-13T19:59:30.000Z',
        stalledWorkerCount: 0,
        intake: {
          rejected: 1,
          rejectionReasonCodes: ['VALID_REASON', 'user@example.com', 'op://vault/item'],
        },
      },
    },
    tasks: [{
      issue_number: 1538,
      state: 'RUNNING',
      slot_id: 'local-a',
      semantic_progress_at: '2026-09-13T19:59:00.000Z',
      updated_at: '2026-09-13T19:59:10.000Z',
      task_id: 'must-not-publish',
      workspace_path: '/private/workspace',
    }],
  });
  assert.equal(status.status, 'INTAKE_REPAIR_REQUIRED');
  assert.deepEqual(status.intake.rejectionReasonCodes, ['VALID_REASON']);
  assert.deepEqual(status.activeTasks, [{
    issueNumber: 1538,
    state: 'RUNNING',
    slotId: 'local-a',
    semanticProgressAt: '2026-09-13T19:59:00.000Z',
    updatedAt: '2026-09-13T19:59:10.000Z',
  }]);
  const rendered = renderContinuityStatusComment(status);
  assert.match(rendered, /JEEVES_V4_CONTINUITY_STATUS:START/);
  assert.doesNotMatch(rendered, /must-not-publish|private\/workspace|example\.com|op:\/\//);
});

function fakeContinuityGithub() {
  const comments = [];
  const calls = [];
  const exec = (_command, args) => {
    calls.push(args);
    if (args.includes('--paginate')) return JSON.stringify(comments);
    const bodyArg = args.find((value) => value.startsWith('body='));
    const body = bodyArg?.slice(5) || '';
    const id = Number(args.find((value) => value.includes('/issues/comments/'))?.split('/').at(-1)) || 77;
    const comment = { id, body };
    const existing = comments.findIndex((entry) => entry.id === id);
    if (existing >= 0) comments[existing] = comment;
    else comments.push(comment);
    return JSON.stringify(comment);
  };
  return { calls, comments, exec };
}

test('continuity publication creates one marker comment, skips unchanged state, and updates in place', () => {
  const fake = fakeContinuityGithub();
  const publisherState = {};
  const heartbeat = {
    generatedAt: '2026-09-13T20:00:00.000Z',
    runtimeCommit: 'b'.repeat(40),
    pollState: 'RUNNING',
    continuity: {
      utilization: { activeSlots: 1, allowedSlots: 6 },
      eligibleReadyCount: 0,
      readyCount: 0,
      backlogHealth: 'BACKLOG_STARVED',
      intake: { rejected: 0, rejectionReasonCodes: [] },
    },
  };
  const tasks = [{ issue_number: 1538, state: 'RUNNING', slot_id: 'local-a' }];
  const first = publishContinuityStatusToGitHub({ repoFullName: 'owner/repo', heartbeat, tasks, publisherState, exec: fake.exec, now: new Date('2026-09-13T20:00:00.000Z') });
  assert.equal(first.skipped, false);
  assert.equal(fake.comments.length, 1);
  const callsAfterFirst = fake.calls.length;
  const unchanged = publishContinuityStatusToGitHub({ repoFullName: 'owner/repo', heartbeat, tasks, publisherState, exec: fake.exec, now: new Date('2026-09-13T20:01:00.000Z') });
  assert.equal(unchanged.reason, 'UNCHANGED');
  assert.equal(fake.calls.length, callsAfterFirst);

  tasks.push({ issue_number: 1539, state: 'RUNNING', slot_id: 'local-b' });
  const changed = publishContinuityStatusToGitHub({ repoFullName: 'owner/repo', heartbeat, tasks, publisherState, exec: fake.exec, now: new Date('2026-09-13T20:02:00.000Z') });
  assert.equal(changed.skipped, false);
  assert.equal(fake.comments.length, 1);
  assert.equal(fake.calls.at(-1).includes('repos/owner/repo/issues/comments/77'), true);

  const callsAfterChange = fake.calls.length;
  publishContinuityStatusToGitHub({ repoFullName: 'owner/repo', heartbeat, tasks, publisherState, exec: fake.exec, now: new Date('2026-09-13T20:18:00.000Z') });
  assert.equal(fake.calls.length, callsAfterChange + 1);
  assert.equal(fake.comments.length, 1);
});
