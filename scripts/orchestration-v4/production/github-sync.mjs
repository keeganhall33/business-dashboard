import { execFile, spawn } from 'node:child_process';

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

const GITHUB_TIMEOUT_MS = Object.freeze({
  ISSUE_VIEW: 30_000,
  LABEL_CREATE: 15_000,
  ISSUE_EDIT: 30_000,
});

function ghJsonWithTimeout(args, gh = 'gh', timeoutMs = GITHUB_TIMEOUT_MS.ISSUE_VIEW) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(gh, args, { encoding: 'utf8', timeout: timeoutMs });
    
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    
    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout || '{}'));
        } catch (error) {
          reject(new Error(`V4_GITHUB_JSON_PARSE_ERROR:${stderr}`));
        }
      } else {
        reject(new Error(`V4_GITHUB_COMMAND_EXIT_CODE:${code}:${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      if (error?.timeout) {
        reject(new Error('V4_GITHUB_COMMAND_TIMED_OUT'));
      } else {
        reject(error);
      }
    });
  });
}

async function ensureLabel(repoFullName, label, gh = 'gh') {
  try {
    await ghJsonWithTimeout(['label','create',label,'--repo',repoFullName,'--force','--description','Orchestration V4 terminal state'], gh, GITHUB_TIMEOUT_MS.LABEL_CREATE);
    return { ok: true };
  } catch (error) {
    if (!error.message.includes('V4_GITHUB_COMMAND_TIMED_OUT')) {
      console.error(`V4_LABEL_CREATE_ERROR:${label}:${error.message}`);
    }
    throw error;
  }
}

function labelsForIssue(issue) {
  return new Set((issue?.labels || []).map((label) => label?.name || label).filter(Boolean));
}

export async function syncTerminalTaskToGitHub({ task, repoFullName, gh = 'gh', db }) {
  // Check if this task has already been synced in the database (incremental sync)
  if (!db) {
    return { ok: true, skipped: true, reason: 'V4_NO_DB_SKIP_SYNC' };
  }
  
  const lastSyncMarker = db.prepare('SELECT synced_at FROM github_sync_markers WHERE task_id=?').get(task.task_id);
  if (lastSyncMarker && task.state === lastSyncMarker.last_state) {
    return { ok: true, skipped: true, reason: 'V4_INCREMENTAL_SYNC_SKIPPED', sync_marker: lastSyncMarker.synced_at };
  }
  
  const terminalLabel = TERMINAL_LABEL[task?.state];
  if (!terminalLabel) return { ok: true, skipped: true };

  await ensureLabel(repoFullName, terminalLabel, gh);

  let current;
  try {
    current = labelsForIssue(await ghJsonWithTimeout(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
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
      await ghJsonWithTimeout(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--remove-label',label], gh);
      removed.push(label);
    } catch (error) {
      // Skip removal on error, don't fail the whole sync
      console.error(`V4_GITHUB_LABEL_REMOVAL_SKIPPED:${task.issue_number}:${label}:${error.message}`);
    }
  }
  
  try {
    current = labelsForIssue(await ghJsonWithTimeout(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
    if (!current.has(terminalLabel)) {
      await ghJsonWithTimeout(['issue','edit',String(task.issue_number),'--repo',repoFullName,'--add-label',terminalLabel], gh);
    }
  } catch (error) {
    if (error.message.includes('V4_GITHUB_COMMAND_TIMED_OUT')) {
      return { ok: false, skipped: true, error: 'V4_GITHUB_SYNC_TIMEOUT:' + error.message };
    }
    throw error;
  }

  const verified = labelsForIssue(await ghJsonWithTimeout(['issue','view',String(task.issue_number),'--repo',repoFullName,'--json','labels,state'], gh));
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
