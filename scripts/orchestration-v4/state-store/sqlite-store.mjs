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
    CREATE TABLE IF NOT EXISTS github_sync_markers (
      task_id TEXT PRIMARY KEY,
      last_state TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      depends_on_task_id TEXT NOT NULL,
      artifact TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(task_id, depends_on_task_id, artifact),
      FOREIGN KEY(task_id) REFERENCES tasks(task_id),
      FOREIGN KEY(depends_on_task_id) REFERENCES tasks(task_id)
    );
    CREATE TABLE IF NOT EXISTS correction_attempts (
      task_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence TEXT NOT NULL,
      scope TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(task_id, attempt),
      FOREIGN KEY(task_id) REFERENCES tasks(task_id)
    );
    CREATE TABLE IF NOT EXISTS orchestration_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(task_id)
    );
    CREATE TABLE IF NOT EXISTS learning_constraints (
      constraint_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      constraint_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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
  if (!SHA.test(String(baseSha || ''))) throw new Error('V4_STATE_BASE_SHA_REQUIRED');
  const timestamp = nowIso(now);
  const contractJson = JSON.stringify(contract ?? {});
  db.prepare(`INSERT INTO tasks(task_id,issue_number,stream,state,base_sha,contract_json,created_at,updated_at)
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

export function addTaskDependency(db, { taskId, dependsOnTaskId, artifact, now = new Date() }) {
  if (!taskId || !dependsOnTaskId || taskId === dependsOnTaskId || !String(artifact ?? '').trim()) {
    throw new Error('V4_STATE_DEPENDENCY_INVALID');
  }
  if (!getTask(db, taskId) || !getTask(db, dependsOnTaskId)) throw new Error('V4_STATE_DEPENDENCY_TASK_NOT_FOUND');
  const cycle = db.prepare(`
    WITH RECURSIVE upstream(task_id) AS (
      SELECT depends_on_task_id FROM task_dependencies WHERE task_id=?
      UNION
      SELECT dependency.depends_on_task_id
      FROM task_dependencies AS dependency
      JOIN upstream ON dependency.task_id=upstream.task_id
    )
    SELECT 1 AS found FROM upstream WHERE task_id=? LIMIT 1
  `).get(dependsOnTaskId, taskId);
  if (cycle) throw new Error('V4_STATE_DEPENDENCY_CYCLE');
  db.prepare(`INSERT INTO task_dependencies(task_id,depends_on_task_id,artifact,created_at) VALUES(?,?,?,?)`)
    .run(taskId, dependsOnTaskId, String(artifact).trim(), nowIso(now));
}

export function listRunnableTasks(db) {
  return db.prepare(`
    SELECT candidate.*
    FROM tasks AS candidate
    WHERE candidate.state='READY'
      AND NOT EXISTS (
        SELECT 1 FROM task_dependencies AS dependency
        JOIN tasks AS upstream ON upstream.task_id=dependency.depends_on_task_id
        WHERE dependency.task_id=candidate.task_id AND upstream.state<>'COMPLETE'
      )
    ORDER BY candidate.created_at,candidate.rowid
  `).all();
}

export function blockTasksWithFailedDependencies(db, { now = new Date() } = {}) {
  const timestamp = nowIso(now);
  const candidates = db.prepare(`
    SELECT DISTINCT candidate.task_id
    FROM tasks AS candidate
    JOIN task_dependencies AS dependency ON dependency.task_id=candidate.task_id
    JOIN tasks AS upstream ON upstream.task_id=dependency.depends_on_task_id
    WHERE candidate.state='READY' AND upstream.state IN ('BLOCKED','FAILED','TIMED_OUT')
  `).all();
  for (const candidate of candidates) {
    db.prepare(`UPDATE tasks SET state='BLOCKED',terminal_reason='UPSTREAM_DEPENDENCY_FAILED',updated_at=? WHERE task_id=? AND state='READY'`)
      .run(timestamp, candidate.task_id);
    recordOrchestrationEvent(db, { taskId: candidate.task_id, type: 'DEPENDENCY_BLOCKED', payload: {}, now });
  }
  return candidates.map((candidate) => candidate.task_id);
}

export function recordCorrectionAttempt(db, { taskId, packet, now = new Date() }) {
  if (!getTask(db, taskId)) throw new Error('V4_STATE_TASK_NOT_FOUND');
  db.prepare(`INSERT INTO correction_attempts(task_id,attempt,verdict,reason,evidence,scope,action,created_at)
              VALUES(?,?,?,?,?,?,?,?)`)
    .run(taskId, packet.attempt, packet.verdict, packet.reason, packet.evidence, packet.scope, packet.action, nowIso(now));
  recordOrchestrationEvent(db, { taskId, type: 'CORRECTION_ATTEMPT', payload: packet, now });
}

export function listCorrectionAttempts(db, taskId) {
  return db.prepare('SELECT * FROM correction_attempts WHERE task_id=? ORDER BY attempt').all(taskId);
}

export function recordOrchestrationEvent(db, { taskId = null, type, payload = {}, now = new Date() }) {
  if (!type) throw new Error('V4_STATE_EVENT_TYPE_REQUIRED');
  db.prepare('INSERT INTO orchestration_events(task_id,type,payload_json,created_at) VALUES(?,?,?,?)')
    .run(taskId, String(type), JSON.stringify(payload ?? {}), nowIso(now));
}

export function listOrchestrationEvents(db) {
  return db.prepare('SELECT * FROM orchestration_events ORDER BY event_id').all().map((event) => ({
    ...event,
    payload: JSON.parse(event.payload_json),
  }));
}

export function saveLearningConstraint(db, { constraint, now = new Date() }) {
  if (!constraint?.id || !constraint?.status) throw new Error('V4_STATE_LEARNING_CONSTRAINT_INVALID');
  const timestamp = nowIso(now);
  db.prepare(`
    INSERT INTO learning_constraints(constraint_id,status,constraint_json,created_at,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(constraint_id) DO UPDATE SET
      status=excluded.status,
      constraint_json=excluded.constraint_json,
      updated_at=excluded.updated_at
  `).run(constraint.id, constraint.status, JSON.stringify(constraint), timestamp, timestamp);
  return getLearningConstraint(db, constraint.id);
}

export function getLearningConstraint(db, constraintId) {
  const row = db.prepare('SELECT * FROM learning_constraints WHERE constraint_id=?').get(constraintId);
  return row ? { ...row, constraint: JSON.parse(row.constraint_json) } : null;
}

export function listLearningConstraints(db, { status = null } = {}) {
  const rows = status
    ? db.prepare('SELECT * FROM learning_constraints WHERE status=? ORDER BY created_at').all(status)
    : db.prepare('SELECT * FROM learning_constraints ORDER BY created_at').all();
  return rows.map((row) => ({ ...row, constraint: JSON.parse(row.constraint_json) }));
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


const GITHUB_SYNC_TERMINAL_STATES = Object.freeze([
  V4_STATES.COMPLETE,
  V4_STATES.BLOCKED,
  V4_STATES.FAILED,
  V4_STATES.TIMED_OUT,
]);

export function listTasksPendingGithubSync(db, { limit = 1 } = {}) {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('V4_GITHUB_SYNC_LIMIT_INVALID');
  return db.prepare(`
    SELECT tasks.*
    FROM tasks
    LEFT JOIN github_sync_markers AS markers ON markers.task_id = tasks.task_id
    WHERE tasks.state IN ('COMPLETE','BLOCKED','FAILED','TIMED_OUT')
      AND (markers.task_id IS NULL OR markers.last_state <> tasks.state)
    ORDER BY tasks.updated_at DESC, tasks.task_id
    LIMIT ?
  `).all(limit);
}

export function getGithubSyncMarker(db, taskId) {
  return db.prepare('SELECT task_id,last_state,synced_at FROM github_sync_markers WHERE task_id=?').get(taskId) ?? null;
}

export function markGithubTaskStateSynced(db, { taskId, state, syncedAt = new Date() }) {
  if (!taskId) throw new Error('V4_GITHUB_SYNC_TASK_ID_REQUIRED');
  if (!GITHUB_SYNC_TERMINAL_STATES.includes(state)) throw new Error('V4_GITHUB_SYNC_STATE_INVALID');
  const current = getTask(db, taskId);
  if (!current) throw new Error('V4_STATE_TASK_NOT_FOUND');
  if (current.state !== state) throw new Error(`V4_GITHUB_SYNC_STATE_CHANGED:${current.state}:${state}`);
  db.prepare(`
    INSERT INTO github_sync_markers(task_id,last_state,synced_at)
    VALUES(?,?,?)
    ON CONFLICT(task_id) DO UPDATE SET
      last_state=excluded.last_state,
      synced_at=excluded.synced_at
  `).run(taskId, state, nowIso(syncedAt));
  return getGithubSyncMarker(db, taskId);
}
