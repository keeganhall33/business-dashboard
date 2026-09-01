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
