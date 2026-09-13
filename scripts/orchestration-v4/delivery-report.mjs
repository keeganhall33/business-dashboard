import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openV4StateStore, listTasks } from './state-store/sqlite-store.mjs';
import { buildDeliveryHealth, selectDeliveryReadyTasks } from './delivery-policy.mjs';

export function latestContinuityState(db) {
  const row = db.prepare("SELECT payload_json FROM orchestration_events WHERE type='CONTINUITY_STATE_V1' ORDER BY event_id DESC LIMIT 1").get();
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload_json || '{}');
    return payload?.state?.contractVersion === 'DeliveryContinuityStateV1' ? payload.state : null;
  } catch {
    return null;
  }
}

export function createDeliveryReport(db, generatedAt = new Date().toISOString()) {
  const tasks = listTasks(db);
  const correctionAttempts = db.prepare('SELECT * FROM correction_attempts ORDER BY task_id,attempt').all();
  const selection = selectDeliveryReadyTasks(tasks);
  return Object.freeze({
    ...buildDeliveryHealth(tasks, generatedAt, correctionAttempts),
    continuity: latestContinuityState(db),
    readyNow: selection.selected.map((task) => task.task_id),
    deferred: selection.deferred,
    wip: {
      maximumActiveSlices: 3,
      maximumConcurrentTasksPerSlice: 3,
      maximumExecutableTasksPerPoll: 5,
    },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stateRoot = path.resolve(process.env.JEEVES_V4_STATE_ROOT || path.join(process.env.HOME || '.', '.openclaw/state/orchestration-v4'));
  const db = openV4StateStore(path.join(stateRoot, 'state.sqlite'));
  try { process.stdout.write(`${JSON.stringify(createDeliveryReport(db), null, 2)}\n`); }
  finally { db.close(); }
}
