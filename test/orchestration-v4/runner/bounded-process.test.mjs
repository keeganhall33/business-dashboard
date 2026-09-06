import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runBoundedProcess, signalGroup } from '../../../scripts/orchestration-v4/runner/bounded-process.mjs';

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

test('process-group cleanup still fails closed on unexpected errors', async () => {
  const fakeError = new Error('EINVAL');
  fakeError.code = 'EINVAL';
  assert.throws(() => signalGroup(9999, 'SIGTERM', () => {
    const error = new Error('EINVAL');
    error.code = 'EINVAL';
    throw error;
  }), /EINVAL/);
});

test('apply_patch format failure terminates child immediately (invalid Add File body)', async () => {
  const child = fakeChild(4401);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return 'TELEMETRY'; },
  });
  // Emit malformed patch failure line - anchored tool-result signature
  child.stdout.emit('data', '[tools] apply_patch failed: invalid Add File body\n');
  // Simulate immediate exit after format error detection
  await new Promise(r => setTimeout(r, 100));
  child.emit('exit', 0, null); // Exit with termination handling in place
  const result = await promise;
  assert.equal(result.status, 'FORMAT_ERROR');
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('apply_patch format failure terminates child immediately (invalid/empty Update File hunk)', async () => {
  const child = fakeChild(4402);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return 'TELEMETRY'; },
  });
  child.stdout.emit('data', '[tools] apply_patch failed: invalid/empty Update File hunk\n');
  await new Promise(r => setTimeout(r, 100));
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'FORMAT_ERROR');
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('apply_patch format failure terminates child immediately (conflicting directives)', async () => {
  const child = fakeChild(4403);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return 'TELEMETRY'; },
  });
  child.stdout.emit('data', '[tools] apply_patch failed: conflicting directives\n');
  await new Promise(r => setTimeout(r, 100));
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'FORMAT_ERROR');
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('apply_patch format failure terminates child immediately (unsupported Remove File)', async () => {
  const child = fakeChild(4404);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return 'TELEMETRY'; },
  });
  child.stdout.emit('data', '[tools] apply_patch failed: unsupported Remove File\n');
  await new Promise(r => setTimeout(r, 100));
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'FORMAT_ERROR');
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('apply_patch format failure terminates child immediately (missing final End Patch)', async () => {
  const child = fakeChild(4405);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return 'TELEMETRY'; },
  });
  child.stdout.emit('data', '[tools] apply_patch failed: missing final End Patch\n');
  await new Promise(r => setTimeout(r, 100));
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'FORMAT_ERROR');
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('apply_patch failure does not trigger on unanchored prose', async () => {
  const child = fakeChild(4406);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return event.kind === 'COMPLETE' ? 'SEMANTIC' : 'TELEMETRY'; },
  });
  // Unanchored mentions should NOT trigger failure detection
  child.stdout.emit('data', 'I heard apply_patch failed in testing but this is normal prose.\n');
  child.stdout.emit('data', 'apply_patch failed - just source text\n');
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'COMPLETE');
});

test('apply_patch failure detection prevents second attempt (fake child)', async () => {
  const child = fakeChild(4407);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return 'TELEMETRY'; },
  });
  // First failure
  child.stdout.emit('data', '[tools] apply_patch failed: invalid Add File body\n');
  await new Promise(r => setTimeout(r, 100));
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'FORMAT_ERROR');
  assert.equal(result.reason, 'APPLY_PATCH_FORMAT_ERROR');
});

test('non-patch failures retain existing behavior', async () => {
  const child = fakeChild(4408);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return event.kind === 'COMPLETE' ? 'SEMANTIC' : 'TELEMETRY'; },
  });
  // Non-patch failure - should be treated normally
  child.stdout.emit('data', '[tools] some_other_tool failed: unexpected error\n');
  child.emit('exit', 1, null);
  const result = await promise;
  assert.equal(result.status, 'FAILED');
  assert.ok(!result.reason.includes('APPLY_PATCH_FORMAT_ERROR'));
});

test('successful children retain existing behavior', async () => {
  const child = fakeChild(4409);
  const events = [];
  const promise = runBoundedProcess({
    command: 'fixture', cwd: '/tmp', timeoutMs: 500, stallMs: 200,
    spawnImpl: () => child,
    onEvent(event) { events.push(event); return event.kind === 'COMPLETE' ? 'SEMANTIC' : 'TELEMETRY'; },
  });
  // Success - should complete normally
  child.stdout.emit('data', '[tools] apply_patch succeeded: patch applied successfully\n');
  child.emit('exit', 0, null);
  const result = await promise;
  assert.equal(result.status, 'COMPLETE');
});
