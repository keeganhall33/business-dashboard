import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runBoundedProcess } from '../../../scripts/orchestration-v4/runner/bounded-process.mjs';

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
