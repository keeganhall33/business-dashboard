import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runBoundedProcess } from '../../../scripts/orchestration-v4/runner/bounded-process.mjs';

function fakeChild(pid = 999999) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test('semantic stall preserves BLOCKED result but waits for child exit before resolving', async () => {
  const child = fakeChild();
  const started = Date.now();
  const promise = runBoundedProcess({
    command: 'fixture',
    cwd: '/tmp',
    timeoutMs: 1000,
    stallMs: 20,
    spawnImpl: () => child,
  });

  setTimeout(() => child.emit('exit', null, 'SIGTERM'), 60);
  const result = await promise;

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'SEMANTIC_PROGRESS_STALL');
  assert.equal(result.observedSignal, 'SIGTERM');
  assert.ok(Date.now() - started >= 50);
});
