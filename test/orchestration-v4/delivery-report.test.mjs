import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDeliveryReport, latestContinuityState } from '../../scripts/orchestration-v4/delivery-report.mjs';
import { openV4StateStore, recordOrchestrationEvent } from '../../scripts/orchestration-v4/state-store/sqlite-store.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-delivery-report-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  return {
    db,
    close() {
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('delivery report exposes the latest privacy-safe continuity state', () => {
  const current = fixture();
  try {
    const first = {
      contractVersion: 'DeliveryContinuityStateV1',
      generatedAt: '2026-09-13T20:00:00.000Z',
      utilization: { activeSlots: 2, allowedSlots: 6 },
      eligibleReadyCount: 3,
      readyCount: 3,
      lastSemanticProgressAt: '2026-09-13T19:59:00.000Z',
      mostRecentContinuityAction: 'CLAIM_READY_TASK',
      stalledWorkerCount: 0,
      correctionCeilingsReached: 0,
      runtimeRefreshState: 'CURRENT',
      backlogHealth: 'BACKLOG_LOW',
      intake: { imported: 1, rejected: 0, duplicates: 0, rejectionReasonCodes: [] },
      actions: [{ type: 'CLAIM_READY_TASK', taskId: 'safe-task', slotId: 'local-a' }],
    };
    const latest = { ...first, generatedAt: '2026-09-13T20:01:00.000Z', utilization: { activeSlots: 5, allowedSlots: 6 } };
    recordOrchestrationEvent(current.db, { type: 'CONTINUITY_STATE_V1', payload: { stateHash: 'one', state: first } });
    recordOrchestrationEvent(current.db, { type: 'CONTINUITY_STATE_V1', payload: { stateHash: 'two', state: latest } });

    assert.deepEqual(latestContinuityState(current.db), latest);
    assert.deepEqual(createDeliveryReport(current.db, latest.generatedAt).continuity, latest);
  } finally {
    current.close();
  }
});

test('missing or malformed continuity telemetry remains truthfully unavailable', () => {
  const current = fixture();
  try {
    assert.equal(latestContinuityState(current.db), null);
    recordOrchestrationEvent(current.db, { type: 'CONTINUITY_STATE_V1', payload: { state: { contractVersion: 'WRONG' } } });
    assert.equal(latestContinuityState(current.db), null);
    assert.equal(createDeliveryReport(current.db).continuity, null);
  } finally {
    current.close();
  }
});
