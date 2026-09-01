import assert from 'node:assert/strict';
import test from 'node:test';
import { runConcurrentProductionQueues } from '../../../scripts/orchestration-v4/production/daemon.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('production executable and integration queues start concurrently', async () => {
  const executableStarted = deferred();
  const integrationStarted = deferred();
  const release = deferred();

  const resultPromise = runConcurrentProductionQueues({
    runExecutableQueue: async () => {
      executableStarted.resolve();
      await integrationStarted.promise;
      await release.promise;
      return ['executable-complete'];
    },
    runIntegrationQueue: async () => {
      integrationStarted.resolve();
      await executableStarted.promise;
      await release.promise;
      return ['integration-complete'];
    },
  });

  await Promise.all([executableStarted.promise, integrationStarted.promise]);
  release.resolve();

  const result = await resultPromise;
  assert.deepEqual(result.settled, ['executable-complete']);
  assert.deepEqual(result.integrationSettled, ['integration-complete']);
});

test('production queue orchestration permits peak occupancy of all six V4 lanes', async () => {
  const release = deferred();
  const allSixActive = deferred();
  let active = 0;
  let peak = 0;

  async function occupy(label) {
    active += 1;
    peak = Math.max(peak, active);
    if (active === 6) allSixActive.resolve();
    await release.promise;
    active -= 1;
    return label;
  }

  const resultPromise = runConcurrentProductionQueues({
    runExecutableQueue: () => Promise.all([
      occupy('local-a'),
      occupy('local-b'),
      occupy('local-c'),
      occupy('local-d'),
      occupy('local-f'),
    ]),
    runIntegrationQueue: () => occupy('local-e').then((value) => [value]),
  });

  await Promise.race([
    allSixActive.promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`V4_PEAK_CONCURRENCY_NOT_REACHED:${peak}`)), 1000)),
  ]);

  assert.equal(peak, 6);
  assert.equal(active, 6);
  release.resolve();

  const result = await resultPromise;
  assert.deepEqual(result.settled, ['local-a', 'local-b', 'local-c', 'local-d', 'local-f']);
  assert.deepEqual(result.integrationSettled, ['local-e']);
  assert.equal(active, 0);
});
