import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isApplyPatchFormatFailure, runBoundedProcess, signalGroup } from '../../../scripts/orchestration-v4/runner/bounded-process.mjs';

function fakeChild(pid = 4321) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test('structured allowlisted stdout event is forwarded as semantic and process identity is reported', async () => {
  const child = fakeChild();
  const events = [];
  let started = null;
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
    spawnImpl: () => child,
    onStarted(value) { started = value; },
    onEvent(event) { events.push(event); return event.kind === 'WORKTREE_MUTATION' ? 'SEMANTIC' : 'TELEMETRY'; },
  });
  child.stdout.emit('data', 'hello\nV4_EVENT {"kind":"WORKTREE_MUTATION","data":"changed"}\n');
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(started.childPid, 4321);
  assert.equal(started.processGroupId, 4321);
  assert.ok(events.some((event) => event.kind === 'WORKTREE_MUTATION'));
  assert.equal(result.status, 'COMPLETE');
});

test('unknown structured event cannot forge semantic progress', async () => {
  const child = fakeChild(4322);
  const kinds = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
    spawnImpl: () => child,
    onEvent(event) { kinds.push(event.kind); return event.kind === 'COMPLETE' ? 'SEMANTIC' : 'TELEMETRY'; },
  });
  child.stdout.emit('data', 'V4_EVENT {"kind":"COMPLETE"}\n');
  child.emit('exit', 0, null);
  await promise;
  assert.equal(kinds.includes('COMPLETE'), false);
});

test('final semantic observation catches a mutation immediately before child exit', async () => {
  const child = fakeChild(4323);
  const events = [];
  let mutationVisible = false;
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
    spawnImpl: () => child,
    observeSemantic(observedAt) {
      return mutationVisible ? { kind: 'WORKTREE_MUTATION', data: 'late-change', observedAt } : null;
    },
    onEvent(event) { events.push(event); return event.kind === 'WORKTREE_MUTATION' ? 'SEMANTIC' : 'TELEMETRY'; },
  });
  mutationVisible = true;
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'COMPLETE');
  assert.ok(events.some((event) => event.kind === 'WORKTREE_MUTATION' && event.data === 'late-change'));
});

test('final semantic observer failure is telemetry and does not change a successful exit', async () => {
  const child = fakeChild(4324);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
    spawnImpl: () => child,
    observeSemantic() { throw new Error('observer-boom'); },
    onEvent(event) { events.push(event); return 'TELEMETRY'; },
  });
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'COMPLETE');
  assert.ok(events.some((event) => event.kind === 'STDERR' && String(event.data).includes('V4_SEMANTIC_OBSERVER_ERROR:observer-boom')));
});

test('process-group cleanup treats ESRCH and EPERM as nonfatal', () => {
  for (const code of ['ESRCH', 'EPERM']) {
    const result = signalGroup(9999, 'SIGTERM', () => {
      const error = new Error(code);
      error.code = code;
      throw error;
    });
    assert.equal(result, false);
  }
});

test('process-group cleanup still fails closed on unexpected errors', () => {
  assert.throws(() => signalGroup(9999, 'SIGTERM', () => {
    const error = new Error('EINVAL');
    error.code = 'EINVAL';
    throw error;
  }), /EINVAL/);
});

test('narrow classifier accepts observed parser-format messages only', () => {
  const accepted = [
    "[tools] apply_patch failed: Invalid patch hunk at line 3: 'export const X' is not a valid hunk header.",
    '[tools] apply_patch failed: Update file hunk for path x.mjs is empty',
    "[tools] apply_patch failed: Unknown Line: *** Remove File: x.mjs",
    "[tools] apply_patch failed: The last line of the patch must be '*** End Patch'",
    '[tools] apply_patch failed: conflicting directives for x.mjs',
  ];
  for (const line of accepted) assert.equal(isApplyPatchFormatFailure(line), true, line);

  const rejected = [
    '[tools] apply_patch failed: file not found',
    '[tools] apply_patch failed: permission denied',
    'source says [tools] apply_patch failed: Invalid patch hunk',
    'apply_patch failed: Invalid patch hunk',
    '[tools] another_tool failed: Invalid patch hunk',
  ];
  for (const line of rejected) assert.equal(isApplyPatchFormatFailure(line), false, line);
});

for (const stream of ['stdout', 'stderr']) {
  test(`recognized format failure on ${stream} signals child group and returns stable reason`, async () => {
    const child = fakeChild(stream === 'stdout' ? 4401 : 4402);
    const signals = [];
    const promise = runBoundedProcess({
      command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
      spawnImpl: () => child,
      killImpl(pid, signal) {
        signals.push({ pid, signal });
        if (signal === 'SIGTERM') queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
      },
    });
    child[stream].emit('data', "[tools] apply_patch failed: The last line of the patch must be '*** End Patch'\n");
    const result = await promise;
    assert.deepEqual(signals, [{ pid: -child.pid, signal: 'SIGTERM' }]);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
    assert.equal(result.observedSignal, 'SIGTERM');
  });
}

test('first recognized failure terminates before a scheduled second patch attempt', async () => {
  const child = fakeChild(4403);
  const signals = [];
  let secondAttemptEmitted = false;
  const secondAttempt = setTimeout(() => {
    secondAttemptEmitted = true;
    child.stderr.emit('data', '[tools] apply_patch failed: Invalid patch hunk at line 9\n');
  }, 40);
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
    spawnImpl: () => child,
    killImpl(pid, signal) {
      signals.push({ pid, signal });
      if (signal === 'SIGTERM') {
        clearTimeout(secondAttempt);
        queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
      }
    },
  });
  child.stderr.emit('data', '[tools] apply_patch failed: Invalid patch hunk at line 2\n');
  const result = await promise;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(secondAttemptEmitted, false);
  assert.deepEqual(signals, [{ pid: -child.pid, signal: 'SIGTERM' }]);
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('fragmented tool-result line is classified without broad chunk matching', async () => {
  const child = fakeChild(4404);
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
    spawnImpl: () => child,
    killImpl(_pid, signal) {
      if (signal === 'SIGTERM') queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
    },
  });
  child.stderr.emit('data', '[tools] apply_patch fai');
  child.stderr.emit('data', 'led: Update file hunk for path x.mjs is empty\n');
  const result = await promise;
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('ordinary anchored patch failure retains normal exit behavior', async () => {
  const child = fakeChild(4405);
  const signals = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 1000, stallMs: 500,
    spawnImpl: () => child,
    killImpl(pid, signal) { signals.push({ pid, signal }); },
  });
  child.stderr.emit('data', '[tools] apply_patch failed: file not found\n');
  child.emit('exit', 1, null);
  const result = await promise;
  assert.deepEqual(signals, []);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.reason, 'EXIT_1');
});
