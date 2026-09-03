import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const TERMINAL_LABEL = Object.freeze({ 
  COMPLETE: 'orch:complete', 
  BLOCKED: 'orch:blocked', 
  RUNNING: 'orch:running', 
  READY: 'orch:ready',
  CLAIMED: 'orch:ready',
  VALIDATING: 'orch:validating',
  PR_OPENED: 'orch:opened',
  FAILED: 'orch:failed', 
  TIMED_OUT: 'orch:timed-out' 
});

const ALL_STATE_LABELS = ['orch:ready','orch:running','orch:complete','orch:blocked','orch:failed','orch:timed-out'];

async function ghJson(args, gh = 'gh') {
  let stdout = '';
  let stderr = '';
  const child = spawnSync(gh, args, { encoding: 'utf8' });
  if (child.status !== 0) throw new Error(`V4_GITHUB_COMMAND_EXIT_CODE:${child.status}:${child.stderr}`);
  return JSON.parse(child.stdout || '{}');
}

function labelsForIssue(issue) {
  return new Set((issue?.labels || []).map((label) => label?.name || label).filter(Boolean));
}

export async function syncTerminalTaskToGitHub({ task, repoFullName, gh = 'gh', db }) {
  if (!db) {
    return { ok: true, skipped: true, reason: 'V4_NO_DB_SKIP_SYNC' };
  }
  
  const lastSyncMarker = db.prepare('SELECT synced_at FROM github_sync_markers WHERE task_id=?').get(task.task_id);
  if (lastSyncMarker && task.state === lastSyncMarker.last_state) {
    return { ok: true, skipped: true, reason: 'V4_INCREMENTAL_SYNC_SKIPPED', sync_marker: lastSyncMarker.synced_at };
  }
  
  const terminalLabel = TERMINAL_LABEL[task?.state];
  if (!terminalLabel) return { ok: true, skipped: true };

  await ghJson(['label','create',terminalLabel,'--repo',repoFullName,'--force','--description','Orchestration V4 terminal state'], gh);

  let current;
  try {
    current = labelsForIssue(await ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
  } catch (error) {
    if (error.message.includes('V4_GITHUB_COMMAND_TIMED_OUT')) {
      return { ok: false, skipped: true, error: 'V4_GITHUB_SYNC_TIMEOUT:' + error.message };
    }
    throw error;
  }
  
  const removed = [];
  for (const label of ALL_STATE_LABELS) {
    if (label === terminalLabel || !current.has(label)) continue;
    try {
      await ghJson(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--remove-label',label], gh);
      removed.push(label);
    } catch (error) {
      console.error(`V4_GITHUB_LABEL_REMOVAL_SKIPPED:${task.issue_number}:${label}:${error.message}`);
    }
  }
  
  try {
    current = labelsForIssue(await ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
    if (!current.has(terminalLabel)) {
      await ghJson(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--add-label',terminalLabel], gh);
    }
  } catch (error) {
    if (error.message.includes('V4_GITHUB_COMMAND_TIMED_OUT')) {
      return { ok: false, skipped: true, error: 'V4_GITHUB_SYNC_TIMEOUT:' + error.message };
    }
    throw error;
  }

  const verified = labelsForIssue(await ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
  const forbidden = ALL_STATE_LABELS.filter((label) => label !== terminalLabel && verified.has(label));
  if (!verified.has(terminalLabel) || forbidden.length) {
    throw new Error(`V4_GITHUB_TERMINAL_SYNC_MISMATCH:${terminalLabel}:${forbidden.join(',')}`);
  }
  
  // Mark this task as synced in the database for incremental sync
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR REPLACE INTO github_sync_markers(task_id, last_state, synced_at) VALUES(?,?,?)')
      .run(task.task_id, terminalLabel, new Date().toISOString());
  } finally {
    db.exec('COMMIT');
  }
  
  return { ok: true, skipped: false, label: terminalLabel, removed, verified: [...verified].sort(), sync_marker: new Date().toISOString() };
}

export function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

export async function releaseSlot({ task, repoFullName, gh = 'gh' }) {
  if (task.state === V4_STATES.TIMED_OUT) throw new Error(`V4_RELEASE_SLOT_TIMED_OUT`);
  const label = TERMINAL_LABEL[task?.state];
  if (!label) return { ok: true };
  await ensureLabel(repoFullName, label, gh);
  try {
    ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh);
    const removed = [];
    for (const lbl of ALL_STATE_LABELS) {
      if (lbl === label || !(await ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels'], gh)).has(lbl)) continue;
      await ghJson(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--remove-label',lbl], gh);
      removed.push(lbl);
    }
    const verified = (await ghJson(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels'], gh)).keys();
    return { ok: true, removed, label, verified };
  } catch (error) {
    console.error(`V4_RELEASE_SLOT_ERROR:${task.task_id}:${error.message}`);
    throw error;
  }
}

function ensureLabel(repoFullName, label, gh = 'gh') {
  try {
    ghJson(['label','create',label,'--repo',repoFullName,'--force','--description','Orchestration V4 terminal state'], gh);
    return { ok: true };
  } catch (error) {
    if (!error.message.includes('V4_GITHUB_COMMAND_TIMED_OUT')) {
      console.error(`V4_LABEL_CREATE_ERROR:${label}:${error.message}`);
    }
    throw error;
  }
}

export function listTerminalTasks(db) {
  return db.prepare("SELECT * FROM tasks WHERE state IN ('CLAIMED','RUNNING','VALIDATING','PR_OPENED')").all();
}

export function getTaskContract(task) {
  try { return JSON.parse(task?.contract_json || '{}'); } catch { throw new Error('V4_STATE_CONTRACT_JSON_INVALID'); }
}

export async function runIntegrationQueue({ repoRoot, workspaceRoot, db, registry }) {
  const tasks = listTerminalTasks(db);
  if (tasks.length === 0) return [];
  
  try {
    let latestSha = 'refs/remotes/origin/main';
    let resolvedPrs = new Map();
    const results = [];
    for (const task of tasks) {
      const result = registry.create({
        taskId: task.task_id,
        repoRoot,
        workspaceRoot,
        db,
        stream: 'INTEGRATION_RELEASE',
        canonicalMainSha: latestSha,
        currentPrs: resolvedPrs,
        state: task.state,
        contract: getTaskContract(task),
      });
      
      try {
        const output = await execFileSync(result.command, result.args, { encoding: 'utf8' });
        if (output.includes('V4_INTEGRATION_RESOLVED')) resolvedPrs.set(task.task_id, latestSha);
        results.push({ status: 'fulfilled', value: task.task_id, stdout: output });
      } catch (error) {
        results.push({ status: 'rejected', reason: error.message || error });
      }
    }
    return results;
  } finally {
    const tasks = db.prepare("SELECT * FROM tasks WHERE state='RUNNING'").all();
    for (const task of tasks) await releaseSlot({ task, repoFullName, gh: 'gh' });
  }
}

export async function runReadyQueue({ repoRoot, workspaceRoot, db, registry }) {
  const tasks = listTerminalTasks(db);
  if (tasks.length === 0) return [];
  
  try {
    let latestSha = 'refs/remotes/origin/main';
    const results = [];
    for (const task of tasks) {
      const result = registry.create({
        taskId: task.task_id,
        repoRoot,
        workspaceRoot,
        db,
        stream: task.stream,
        canonicalMainSha: latestSha,
        state: task.state,
        contract: getTaskContract(task),
      });
      
      try {
        const output = await execFileSync(result.command, result.args, { encoding: 'utf8' });
        results.push({ status: 'fulfilled', value: task.task_id, stdout: output });
      } catch (error) {
        results.push({ status: 'rejected', reason: error.message || error });
      }
    }
    return results;
  } finally {
    const tasks = db.prepare("SELECT * FROM tasks WHERE state='RUNNING'").all();
    for (const task of tasks) await releaseSlot({ task, repoFullName, gh: 'gh' });
  }
}
