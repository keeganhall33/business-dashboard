import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeliveryCanaryAcceptance, runLiveHostAcceptance } from '../../../scripts/orchestration-v4/production/live-host-acceptance.mjs';

test('live host acceptance proves restart-safe single-cycle host without task admission', async () => {
  const report = await runLiveHostAcceptance();
  assert.equal(report.ok, true);
  assert.equal(report.first.cycles, 1);
  assert.equal(report.second.cycles, 1);
  assert.equal(report.lockGoneAfterFirst, true);
  assert.equal(report.lockGoneAfterSecond, true);
  assert.equal(report.dbExists, true);
  assert.deepEqual(report.observations.map((row) => row.taskCount), [0, 0]);
});

test('delivery canary reaches deployed complete and starts the next task without a prompt', async () => {
  const report = await runDeliveryCanaryAcceptance();
  assert.equal(report.ok, true);
  assert.equal(report.nextTaskStarted, true);
  assert.deepEqual(report.transitions, [
    'READY', 'RUNNING', 'PR_OPEN', 'CI_PENDING', 'REVIEW_PENDING', 'MERGE_READY',
    'MERGING', 'DEPLOY_PENDING', 'DEPLOYED', 'COMPLETE', 'NEXT_TASK_RUNNING',
  ]);
});
