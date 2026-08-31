import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openV4StateStore, listTasks } from '../state-store/sqlite-store.mjs';
import { runProductionPoll } from './daemon.mjs';

function ghJson(args, gh = 'gh') {
  const raw = execFileSync(gh, args, { encoding: 'utf8' });
  return JSON.parse(raw || '{}');
}

export function loadFixtureIssue({ repoFullName, issueNumber, gh = 'gh' }) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('V4_SMOKE_ISSUE_REQUIRED');
  return ghJson(['issue','view',String(issueNumber),'--repo',repoFullName,'--json','number,title,body,labels,state'], gh);
}

export function inspectPublishedPr({ repoFullName, prNumber, gh = 'gh' }) {
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('V4_SMOKE_PR_REQUIRED');
  return ghJson(['pr','view',String(prNumber),'--repo',repoFullName,'--json','number,state,url,headRefName,headRefOid,baseRefName'], gh);
}

export async function runLiveProductionSmoke({
  repoRoot,
  issueNumber,
  repoFullName = 'keeganhall33/business-dashboard',
  configPath = path.join(os.homedir(), '.openclaw', 'config.json'),
  openclaw = '/opt/homebrew/bin/openclaw',
  timeoutMs = 5 * 60_000,
  stallMs = 2 * 60_000,
  gh = 'gh',
  loadIssue = loadFixtureIssue,
  inspectPr = inspectPublishedPr,
  openStore = openV4StateStore,
  poll = runProductionPoll,
  tempRoot = null,
} = {}) {
  if (!repoRoot || !path.isAbsolute(repoRoot)) throw new Error('V4_SMOKE_REPO_ROOT_REQUIRED');
  if (!repoFullName) throw new Error('V4_SMOKE_REPO_REQUIRED');
  if (!path.isAbsolute(configPath)) throw new Error('V4_SMOKE_CONFIG_PATH_REQUIRED');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('V4_SMOKE_ISSUE_REQUIRED');

  const root = tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'jeeves-v4-production-smoke-'));
  const workspaceRoot = path.join(root, 'workspaces');
  const statePath = path.join(root, 'state.sqlite');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const db = openStore(statePath);

  try {
    const issue = await loadIssue({ repoFullName, issueNumber, gh });
    const labels = new Set((issue.labels || []).map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean));
    if (!labels.has('agent-orchestration') || !labels.has('orch:ready')) throw new Error('V4_SMOKE_FIXTURE_NOT_READY');

    const result = await poll({
      db,
      repoRoot,
      repoFullName,
      workspaceRoot,
      configPath,
      issues: [issue],
      openclaw,
      timeoutMs,
      stallMs,
      gh,
    });

    const tasks = listTasks(db);
    if (tasks.length !== 1) throw new Error(`V4_SMOKE_EXPECTED_ONE_TASK:${tasks.length}`);
    const task = tasks[0];
    const parsedResult = task.result_json ? JSON.parse(task.result_json) : null;
    if (task.issue_number !== issueNumber) throw new Error('V4_SMOKE_TASK_ISSUE_MISMATCH');
    if (task.base_sha !== result.baseSha) throw new Error('V4_SMOKE_BASE_SHA_MISMATCH');
    if (task.state !== 'COMPLETE') throw new Error(`V4_SMOKE_TASK_NOT_COMPLETE:${task.state}:${task.terminal_reason || ''}`);
    if (!parsedResult?.publicationRequired || !Number.isInteger(parsedResult?.prNumber)) throw new Error('V4_SMOKE_PR_RESULT_REQUIRED');
    if (task.slot_id !== null || task.child_pid !== null || task.process_group_id !== null) throw new Error('V4_SMOKE_SLOT_NOT_RELEASED');
    if (task.workspace_path && fs.existsSync(task.workspace_path)) throw new Error('V4_SMOKE_WORKSPACE_NOT_CLEANED');

    const pr = await inspectPr({ repoFullName, prNumber: parsedResult.prNumber, gh });
    if (Number(pr.number) !== parsedResult.prNumber) throw new Error('V4_SMOKE_PR_NUMBER_MISMATCH');
    if (pr.baseRefName !== 'main') throw new Error('V4_SMOKE_PR_BASE_MISMATCH');
    if (pr.headRefOid && parsedResult.headSha && pr.headRefOid !== parsedResult.headSha) throw new Error('V4_SMOKE_PR_HEAD_MISMATCH');

    return Object.freeze({
      ok: true,
      issueNumber,
      taskId: task.task_id,
      baseSha: result.baseSha,
      state: task.state,
      semanticProgressSeq: task.semantic_progress_seq,
      prNumber: parsedResult.prNumber,
      prUrl: pr.url || parsedResult.prUrl || null,
      prState: pr.state || null,
      headSha: parsedResult.headSha || pr.headRefOid || null,
      branch: parsedResult.branch || pr.headRefName || null,
      slotsReleased: true,
      cleanupOk: true,
      githubTerminalSync: true,
      v3MutationPerformed: false,
    });
  } finally {
    try { db.close(); } catch {}
    if (!tempRoot) fs.rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(process.argv[2] || process.cwd());
  const issueNumber = Number(process.argv[3]);
  const report = await runLiveProductionSmoke({ repoRoot, issueNumber });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
