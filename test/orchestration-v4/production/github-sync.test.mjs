import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_STATE_LABELS,
  buildContinuityStatus,
  buildTerminalEvidence,
  publishContinuityStatusToGitHub,
  renderContinuityStatusComment,
  renderTerminalEvidenceComment,
  syncTerminalTaskToGitHub,
} from '../../../scripts/orchestration-v4/production/github-sync.mjs';

function fakeGithub(initialLabels = ['orch:ready'], issueState = 'OPEN') {
  const labels = new Set(initialLabels);
  const comments = [];
  const calls = [];
  const exec = (_command, args, options) => {
    calls.push({ args, options });
    if (args[0] === 'label') return '';
    if (args[0] === 'issue' && args[1] === 'view') {
      return JSON.stringify({ labels: [...labels].map((name) => ({ name })), state: issueState });
    }
    if (args[0] === 'issue' && args[1] === 'edit') {
      const removeAt = args.indexOf('--remove-label');
      const addAt = args.indexOf('--add-label');
      if (removeAt >= 0) labels.delete(args[removeAt + 1]);
      if (addAt >= 0) labels.add(args[addAt + 1]);
      return '';
    }
    if (args[0] === 'api' && args.includes('--paginate')) return JSON.stringify(comments);
    if (args[0] === 'api') {
      const bodyArg = args.find((value) => value.startsWith('body='));
      const body = bodyArg?.slice(5) || '';
      const id = Number(args.find((value) => value.includes('/issues/comments/'))?.split('/').at(-1)) || 91;
      const comment = { id, body };
      const existing = comments.findIndex((entry) => entry.id === id);
      if (existing >= 0) comments[existing] = comment;
      else comments.push(comment);
      return JSON.stringify(comment);
    }
    throw new Error(`UNEXPECTED_FAKE_GH_CALL:${args.join(' ')}`);
  };
  return { labels, comments, calls, exec };
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
  assert.equal(result.evidenceCommentId, 91);
  assert.equal(fake.comments.length, 1);
  assert.match(fake.comments[0].body, /TerminalEvidenceV1/);
});

test('terminal evidence exposes only allow-listed privacy-safe classification', () => {
  const task = {
    task_id: 'secret-looking-task@example.com',
    issue_number: 1540,
    state: 'BLOCKED',
    attempt: 1,
    terminal_reason: 'REPLAN_REQUIRED',
    semantic_progress_seq: 7,
    semantic_progress_at: '2026-09-13T22:02:42.713Z',
    updated_at: '2026-09-13T22:06:00.834Z',
    workspace_path: '/Users/private/workspace',
    result_json: JSON.stringify({
      execution: {
        status: 'BLOCKED',
        code: 1,
        signal: null,
        reason: 'REPLAN_REQUIRED',
        stdout: 'customer@example.com',
        correctionPacket: {
          reason: 'EXIT_1',
          action: 'REPLAN',
          evidence: 'op://vault/private',
        },
      },
      prompt: 'do not publish',
    }),
  };
  assert.deepEqual(buildTerminalEvidence(task), {
    contractVersion: 'TerminalEvidenceV1',
    issueNumber: 1540,
    state: 'BLOCKED',
    attempt: 1,
    terminalReason: 'REPLAN_REQUIRED',
    execution: { status: 'BLOCKED', code: 1, signal: null, reason: 'REPLAN_REQUIRED' },
    correction: { reason: 'EXIT_1', action: 'REPLAN' },
    delivery: { state: null, blocker: null, mergeAttempts: null, mergeSha: null, deploymentId: null },
    semanticProgressSeq: 7,
    semanticProgressAt: '2026-09-13T22:02:42.713Z',
    terminalAt: '2026-09-13T22:06:00.834Z',
  });
  const rendered = renderTerminalEvidenceComment(task);
  assert.match(rendered, /JEEVES_V4_TERMINAL_EVIDENCE_V1/);
  assert.doesNotMatch(rendered, /secret-looking|private\/workspace|customer@example\.com|op:\/\/|do not publish/);
});

test('terminal evidence publishes safe deployed continuity once and updates idempotently', () => {
  const fake = fakeGithub(['orch:running']);
  const task = {
    task_id: 'delivery-terminal',
    issue_number: 1652,
    state: 'COMPLETE',
    result_json: JSON.stringify({
      finalization: {
        delivery: {
          state: 'DEPLOYED',
          mergeAttempts: 1,
          mergeSha: 'a'.repeat(40),
          deployment: { deploymentId: 812, environmentUrl: 'https://must-not-publish.example' },
        },
      },
    }),
  };
  const first = syncTerminalTaskToGitHub({ task, repoFullName: 'owner/repo', exec: fake.exec });
  const second = syncTerminalTaskToGitHub({ task, repoFullName: 'owner/repo', exec: fake.exec });
  assert.equal(first.evidenceCommentId, second.evidenceCommentId);
  assert.equal(fake.comments.length, 1);
  const evidence = JSON.parse(fake.comments[0].body.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(evidence.delivery, {
    state: 'DEPLOYED',
    blocker: null,
    mergeAttempts: 1,
    mergeSha: 'a'.repeat(40),
    deploymentId: 812,
  });
  assert.doesNotMatch(fake.comments[0].body, /must-not-publish/);
});

test('terminal evidence handles malformed result JSON and updates one existing marker comment', () => {
  const fake = fakeGithub(['orch:blocked']);
  const task = { task_id: 'terminal-one', issue_number: 1540, state: 'BLOCKED', result_json: '{bad' };
  const first = syncTerminalTaskToGitHub({ task, repoFullName: 'owner/repo', exec: fake.exec });
  const second = syncTerminalTaskToGitHub({ task: { ...task, attempt: 2 }, repoFullName: 'owner/repo', exec: fake.exec });
  assert.equal(first.evidenceCommentId, second.evidenceCommentId);
  assert.equal(fake.comments.length, 1);
  assert.equal(JSON.parse(fake.comments[0].body.match(/```json\n([\s\S]*?)\n```/)[1]).attempt, 2);
});

test('closed terminal issue reconciles labels without publishing evidence', () => {
  const fake = fakeGithub(['orch:running'], 'CLOSED');
  const result = syncTerminalTaskToGitHub({
    task: { task_id: 'closed-task', issue_number: 1594, state: 'COMPLETE' },
    repoFullName: 'owner/repo',
    exec: fake.exec,
  });
  assert.equal(result.evidenceCommentId, null);
  assert.equal(fake.comments.length, 0);
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
