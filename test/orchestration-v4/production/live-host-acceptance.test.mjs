import test from 'node:test';
import assert from 'node:assert/strict';
import { runLiveHostAcceptance } from '../../../scripts/orchestration-v4/production/live-host-acceptance.mjs';

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
