import path from 'node:path';
import { createSlotRegistry } from '../slot-scheduler.mjs';
import { runReadyBatch } from '../runner/task-runner.mjs';
import { buildAgentInvocation, cleanupEphemeralAgentState, createEphemeralAgentState, probeAgentCapabilities } from '../runner/agent-executor.mjs';
import { importReadyIssues, listReadyIssues, refreshCanonicalMain } from './github-intake.mjs';

function promptForTask(task) {
  return [
    `You are executing Orchestration V4 task ${task.task_id}.`,
    `Issue: #${task.issue_number}`,
    `Stream: ${task.stream}`,
    'Work only inside the supplied disposable workspace.',
    'Respect the issue file ownership exactly. Do not mutate V3 orchestration files unless the issue explicitly owns them.',
    'Use local tools and complete the implementation, tests, and validation required by the issue.',
  ].join('\n');
}

export async function runProductionPoll({
  db,
  repoRoot,
  repoFullName,
  workspaceRoot,
  configPath,
  issues = null,
  capabilities = null,
  openclaw = '/opt/homebrew/bin/openclaw',
  timeoutMs = 15 * 60_000,
  stallMs = 4 * 60_000,
}) {
  const baseSha = refreshCanonicalMain(repoRoot);
  const snapshots = issues ?? listReadyIssues({ repoFullName });
  const intake = importReadyIssues({ db, issues: snapshots, baseSha });
  const ready = db.prepare("SELECT * FROM tasks WHERE state='READY' ORDER BY created_at,task_id").all();
  const integrationReady = ready.filter((task) => task.stream === 'INTEGRATION_RELEASE');
  const executable = ready.filter((task) => task.stream !== 'INTEGRATION_RELEASE');
  const agentCaps = capabilities ?? probeAgentCapabilities(openclaw);
  const ephemeral = [];
  const commandsByTaskId = {};

  try {
    for (const task of executable) {
      const state = createEphemeralAgentState({ taskId: task.task_id });
      ephemeral.push(state);
      const invocation = buildAgentInvocation({
        capabilities: agentCaps,
        prompt: promptForTask(task),
        workspacePath: path.join(workspaceRoot, `${task.task_id}-${task.issue_number}`),
        configPath,
        stateDir: state.stateDir,
        timeoutSeconds: Math.ceil(timeoutMs / 1000),
        openclaw,
      });
      commandsByTaskId[task.task_id] = invocation;
    }

    const result = await runReadyBatch({
      db,
      registry: createSlotRegistry(),
      repoRoot,
      workspaceRoot,
      commandsByTaskId,
      timeoutMs,
      stallMs,
    });

    return Object.freeze({
      baseSha,
      intake,
      attempted: result.length,
      settled: result,
      integrationPending: integrationReady.map((task) => ({ taskId: task.task_id, issueNumber: task.issue_number })),
    });
  } finally {
    for (const state of ephemeral) cleanupEphemeralAgentState(state);
  }
}
