import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { assertTransition, V4_STATES } from '../state-machine.mjs';

const SHA = /^[0-9a-f]{40}$/i;

function ensureColumn(db, name, definition) {
  const existing = new Set(db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name));
  if (!existing.has(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
}

export function openV4StateStore(dbPath) {
  if (!path.isAbsolute(dbPath)) throw new Error('V4_STATE_DB_PATH_MUST_BE_ABSOLUTE');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  
  // Create github_sync_markers table for incremental sync tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_sync_markers (
      task_id TEXT PRIMARY KEY,
      last_state TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
  `);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      issue_number INTEGER NOT NULL,
      stream TEXT NOT NULL,
      slot_id TEXT,
      state TEXT NOT NULL,
      base_sha TEXT NOT NULL,
      workspace_path TEXT,
      process_group_id INTEGER,
      child_pid INTEGER,
      semantic_progress_at TEXT,
      semantic_progress_seq INTEGER NOT NULL DEFAULT 0,
      attempt INTEGER NOT NULL DEFAULT 0,
      terminal_reason TEXT,
      contract_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(issue_number)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_live_slot_unique
      ON tasks(slot_id)
      WHERE slot_id IS NOT NULL AND state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED');
  `);
  
  ensureColumn(db, 'contract_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'result_json', 'TEXT');
  
  return db;
}

function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

export function insertReadyTask(db, { taskId, issueNumber, stream, baseSha, contract = {}, now = new Date() }) {
  if (!taskId) throw new Error('V4_STATE_TASK_ID_REQUIRED');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('V4_STATE_ISSUE_REQUIRED');
  if (!stream) throw new Error('V4_STATE_STREAM_REQUIRED');
  if (!SHA.test(String(baseSha || '')) && !baseSha.startsWith('refs/')) { 
    // Accept refs/... prefix as valid
  }
  const timestamp = nowIso(now);
  const contractJson = JSON.stringify(contract ?? {});
  db.prepare(`INSERT OR IGNORE INTO tasks(task_id,issue_number,stream,state,base_sha,contract_json,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?)`).run(taskId, issueNumber, stream, V4_STATES.READY, baseSha, contractJson, timestamp, timestamp);
  return getTask(db, taskId);
}

export function getTask(db, taskId) {
  return db.prepare('SELECT * FROM tasks WHERE task_id=?').get(taskId) ?? null;
}

export function getTaskContract(task) {
  try { return JSON.parse(task?.contract_json || '{}'); } catch { throw new Error('V4_STATE_CONTRACT_JSON_INVALID'); }
}

export function listTasks(db) {
  return db.prepare('SELECT * FROM tasks ORDER BY created_at, task_id').all();
}

export function recordTaskResult(db, { taskId, result, now = new Date() }) {
  const timestamp = nowIso(now);
  const update = db.prepare('UPDATE tasks SET result_json=?, updated_at=? WHERE task_id=?').run(JSON.stringify(result ?? {}), timestamp, taskId);
  if (update.changes !== 1) throw new Error('V4_STATE_TASK_NOT_FOUND');
  return getTask(db, taskId);
}

export function claimTask(db, { taskId, slotId, expectedState = V4_STATES.READY, now = new Date() }) {
  assertTransition(expectedState, V4_STATES.CLAIMED);
  const timestamp = nowIso(now);
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getTask(db, taskId);
    if (!current) throw new Error('V4_STATE_TASK_NOT_FOUND');
    if (current.state !== expectedState) throw new Error(`V4_STATE_CAS_MISMATCH:${current.state}:${expectedState}`);
    const occupied = db.prepare(`SELECT task_id FROM tasks WHERE slot_id=? AND state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED')`).get(slotId);
    if (occupied) throw new Error(`V4_STATE_SLOT_OCCUPIED:${slotId}:${occupied.task_id}`);
    const result = db.prepare(`UPDATE tasks SET state=?,slot_id=?,attempt=attempt+1,updated_at=? WHERE task_id=? AND state=?`)
      .run(V4_STATES.CLAIMED, slotId, timestamp, taskId, expectedState);
    if (result.changes !== 1) throw new Error('V4_STATE_CLAIM_LOST_RACE');
    db.exec('COMMIT');
    return getTask(db, taskId);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function transitionTask(db, { taskId, expectedState, toState, patch = {}, now = new Date() }) {
  assertTransition(expectedState, toState);
  const timestamp = nowIso(now);
  const result = db.prepare(`UPDATE tasks SET state=?, workspace_path=COALESCE(?,workspace_path), process_group_id=COALESCE(?,process_group_id), child_pid=COALESCE(?,child_pid), terminal_reason=COALESCE(?,terminal_reason), updated_at=? WHERE task_id=? AND state=?`)
    .run(toState, patch.workspacePath ?? null, patch.processGroupId ?? null, patch.childPid ?? null, patch.terminalReason ?? null, timestamp, taskId, expectedState);
  if (result.changes !== 1) throw new Error('V4_STATE_CAS_MISMATCH');
  return getTask(db, taskId);
}

export function recordExecutionIdentity(db, { taskId, childPid, processGroupId, now = new Date() }) {
  if (!Number.isInteger(childPid) || childPid <= 0) throw new Error('V4_STATE_CHILD_PID_REQUIRED');
  if (!Number.isInteger(processGroupId) || processGroupId <= 0) throw new Error('V4_STATE_PROCESS_GROUP_REQUIRED');
  const timestamp = nowIso(now);
  const result = db.prepare(`UPDATE tasks SET child_pid=?, process_group_id=?, updated_at=? WHERE task_id=? AND state='RUNNING'`)
    .run(childPid, processGroupId, timestamp, taskId);
  if (result.changes !== 1) throw new Error('V4_STATE_EXECUTION_IDENTITY_NOT_ALLOWED');
  return getTask(db, taskId);
}

export function recordSemanticProgress(db, { taskId, observedAt = new Date() }) {
  const timestamp = nowIso(observedAt);
  const result = db.prepare(`UPDATE tasks SET semantic_progress_at=?, semantic_progress_seq=semantic_progress_seq+1, updated_at=? WHERE task_id=? AND state IN ('RUNNING','VALIDATING','PR_OPENED')`)
    .run(timestamp, timestamp, taskId);
  if (result.changes !== 1) throw new Error('V4_STATE_PROGRESS_NOT_ALLOWED');
  return getTask(db, taskId);
}

export function releaseSlotForTerminalTask(db, taskId) {
  const task = getTask(db, taskId);
  if (!task) throw new Error('V4_STATE_TASK_NOT_FOUND');
  if (![V4_STATES.COMPLETE,V4_STATES.BLOCKED,V4_STATES.FAILED,V4_STATES.TIMED_OUT].includes(task.state)) throw new Error('V4_STATE_RELEASE_REQUIRES_TERMINAL');
  db.prepare('UPDATE tasks SET slot_id=NULL, process_group_id=NULL, child_pid=NULL WHERE task_id=?').run(taskId);
  return getTask(db, taskId);
}

export function markGithubSyncComplete(db, { taskId, lastState }) {
  if (!taskId) throw new Error('V4_STATE_TASK_ID_REQUIRED');
  db.prepare('INSERT OR REPLACE INTO github_sync_markers(task_id, last_state, synced_at) VALUES(?,?,?)')
    .run(taskId, lastState, new Date().toISOString());
  return true;
}

export function getGithubSyncMarker(db, taskId) {
  const marker = db.prepare('SELECT * FROM github_sync_markers WHERE task_id=?').get(taskId);
  return marker ?? null;
}
