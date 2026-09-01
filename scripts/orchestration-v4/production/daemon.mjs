import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSlotRegistry } from '../slot-scheduler.mjs';
import { runReadyBatch } from '../runner/task-runner.mjs';
import { cleanupEphemeralAgentState, createEphemeralAgentState } from '../runner/agent-executor.mjs';
import { getTaskContract } from '../state-store/sqlite-store.mjs';
import { importReadyIssues, listReadyIssues, refreshCanonicalMain } from './github-intake.mjs';
import { publishImplementationResult } from './publisher.mjs';
import { runIntegrationTask } from './integration-executor.mjs';
import { syncTerminalTaskToGitHub } from './github-sync.mjs';

const ENTRYPOINT = fileURLToPath(new URL('../runner/agent-task-entrypoint.mjs', import.meta.url));
const TERMINAL_STATES = new Set(['COMPLETE','BLOCKED','FAILED','TIMED_OUT']);

export function promptForTask(task) {
  const contract = getTaskContract(task);
  if (!contract?.title || !contract?.body || !contract?.fileOwnership || !contract?.taskMutability) {
    throw new Error(`V4_PRODUCTION_CONTRACT_INCOMPLETE:${task.task_id}`);
  }
  return [
    `You are executing Orchestration V4 task ${task.task_id}.`,
    `Issue: #${task.issue_number}`,
    `Stream: ${task.stream}`,
    `Title: ${contract.title}`,
    `Task mutability: ${contract.taskMutability}`,
    `File ownership: ${contract.fileOwnership}`,
    '',
    'Authoritative issue body and acceptance criteria:',
    contract.body,
    '',
    'Work only inside the supplied disposable workspace.',
    'Respect file ownership exactly. Do not mutate V3 orchestration files unless the issue explicitly owns them.',
    'Begin with pwd, git status --short, and targeted inspection of the owned paths.',
    'Use read/exec/find for repository discovery. Do not use tool-search to discover repository files.',
    'If an owned file named by the acceptance criteria does not exist yet, create it rather than repeatedly searching for it.',
    'Use local tools and complete the implementation, tests, and validation required by the issue.',
  ].join('\n');
}

export function promptForIntegrationConflict(task) {
  const contract = getTaskContract(task);
  if (!contract?.title || !contract?.body || !contract?.fileOwnership) {
    throw new Error(`V4_INTEGRATION_CONTRACT_INCOMPLETE:${task.task_id}`);
  }
  return [
    `You are resolving a real Git merge conflict for Orchestration V4 integration task ${task.task_id}.`,
    `Issue: #${task.issue_number}`,
    `Title: ${contract.title}`,
    `File ownership: ${contract.fileOwnership}`,
    '',
    'Authoritative integration request:',
    contract.body,
    '',
    'The disposable workspace is already in the middle of merging current canonical main into the referenced PR head.',
    'Begin with pwd, git status --short, git diff --name-only --diff-filter=U, and inspect every conflict marker.',
    'Resolve conflicts semantically: preserve the PR intent while retaining newer compatible functionality from main.',
    'Do not abort the merge. Do not create another PR. Do not switch branches. Do not commit and do not push.',
    'Stage every resolved conflict with git add.',
    'Run targeted tests/typecheck/build checks that are practical for the touched area and run git diff --check plus git diff --cached --check.',
    'Finish only when git diff --name-only --diff-filter=U prints nothing and there are no conflict markers left.',
    'The V4 integration executor will perform the authoritative merge commit and push after your resolution validates.',
  ].join('\n');
}

export async function runProductionPoll({
  db,
  repoRoot,
  repoFullName,
  workspaceRoot,
  configPath,
  issues = null,
  openclaw = '/opt/homebrew/bin/openclaw',
  gh = 'gh',
  timeoutMs = 50 * 60_000,
  agentTimeoutMs = 45 * 60_000,
  stallMs = 30 * 60_000,
}) {
  if (!path.isAbsolute(repoRoot) || !path.isAbsolute(workspaceRoot) || !path.isAbsolute(configPath)) {
    throw new Error('V4_PRODUCTION_ABSOLUTE_PATHS_REQUIRED');
  }
  if (!Number.isInteger(agentTimeoutMs) || agentTimeoutMs <= 0 || agentTimeoutMs >= timeoutMs) {
    throw new Error('V4_PRODUCTION_AGENT_TIMEOUT_INVALID');
  }
  if (!Number.isInteger(stallMs) || stallMs <= 0 || stallMs >= timeoutMs) {
    throw new Error('V4_PRODUCTION_STALL_TIMEOUT_INVALID');
  }
  const baseSha = refreshCanonicalMain(repoRoot);
  const snapshots = issues ?? listReadyIssues({ repoFullName, gh });
  const intake = importReadyIssues({ db, issues: snapshots, baseSha });
  const ready = db.prepare("SELECT * FROM tasks WHERE state='READY' ORDER BY created_at,task_id").all();
  const integrationReady = ready.filter((task) => task.stream === 'INTEGRATION_RELEASE');
  const executable = ready.filter((task) => task.stream !== 'INTEGRATION_RELEASE');
  const ephemeral = [];
  const commandsByTaskId = {};

  try {
    for (const task of executable) {
      const state = createEphemeralAgentState({ taskId: task.task_id });
      ephemeral.push(state);
      commandsByTaskId[task.task_id] = {
        command: process.execPath,
        args: [ENTRYPOINT, promptForTask(task), state.configPath, state.stateDir, String(Math.ceil(agentTimeoutMs / 1000)), openclaw],
      };
    }

    const settled = await runReadyBatch({
      db,
      registry: createSlotRegistry(),
      repoRoot,
      workspaceRoot,
      commandsByTaskId,
      timeoutMs,
      stallMs,
      finalizeSuccess: ({ task, workspace }) => publishImplementationResult({ task, workspace, repoFullName, gh }),
    });

    const integrationSettled = [];
    for (const task of integrationReady) {
      const state = createEphemeralAgentState({ taskId: `${task.task_id}-integration-resolver` });
      ephemeral.push(state);
      const resolverPrompt = promptForIntegrationConflict(task);
      try {
        const result = await runIntegrationTask({
          db,
          repoRoot,
          repoFullName,
          workspaceRoot,
          taskId: task.task_id,
          canonicalMainSha: baseSha,
          resolverCommand: process.execPath,
          resolverArgs: [ENTRYPOINT, resolverPrompt, state.configPath, state.stateDir, String(Math.ceil(agentTimeoutMs / 1000)), openclaw],
          gh,
          timeoutMs,
          stallMs,
        });
        integrationSettled.push({ status: 'fulfilled', value: result });
      } catch (error) {
        integrationSettled.push({ status: 'rejected', reason: String(error?.message || error) });
      }
    }

    const terminal = db.prepare("SELECT * FROM tasks WHERE state IN ('COMPLETE','BLOCKED','FAILED','TIMED_OUT') ORDER BY updated_at,task_id").all();
    const githubSync = [];
    for (const task of terminal) {
      if (!TERMINAL_STATES.has(task.state)) continue;
      try { githubSync.push(syncTerminalTaskToGitHub({ task, repoFullName, gh })); }
      catch (error) { githubSync.push({ ok: false, issueNumber: task.issue_number, error: String(error?.message || error) }); }
    }

    return Object.freeze({
      baseSha,
      intake,
      attempted: settled.length,
      settled,
      integrationAttempted: integrationSettled.length,
      integrationSettled,
      githubSync,
    });
  } finally {
    for (const state of ephemeral) cleanupEphemeralAgentState(state);
  }
}
