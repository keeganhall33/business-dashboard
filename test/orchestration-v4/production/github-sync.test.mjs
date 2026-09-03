import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_STATE_LABELS, syncTerminalTaskToGitHub } from '../../../scripts/orchestration-v4/production/github-sync.mjs';

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
