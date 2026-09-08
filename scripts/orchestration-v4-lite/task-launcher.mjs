import { fileURLToPath } from 'node:url';
import { runV4Task } from '../orchestration-v4/runner/task-runner.mjs';
import { createEphemeralAgentState, cleanupEphemeralAgentState, AGENT_MUTATION_MODES } from '../orchestration-v4/runner/agent-executor.mjs';
import { publishImplementationResult } from '../orchestration-v4/production/publisher.mjs';
import { runIntegrationTask } from '../orchestration-v4/production/integration-executor.mjs';
import { promptForTask, promptForIntegrationConflict, taskMutationMode } from '../orchestration-v4/production/daemon.mjs';

const AGENT_ENTRYPOINT = fileURLToPath(new URL('../orchestration-v4/runner/agent-task-entrypoint.mjs', import.meta.url));
const INTEGRATION_ENTRYPOINT = fileURLToPath(new URL('../orchestration-v4/runner/integration-resolution-entrypoint.mjs', import.meta.url));

export function createTaskLauncher({
  db,
  repoRoot,
  repoFullName,
  workspaceRoot,
  openclaw = '/opt/homebrew/bin/openclaw',
  ollama = '/opt/homebrew/bin/ollama',
  gh = 'gh',
  timeoutMs = 100 * 60_000,
  agentTimeoutMs = 90 * 60_000,
  stallMs = 30 * 60_000,
  createState = createEphemeralAgentState,
  cleanupState = cleanupEphemeralAgentState,
  runTask = runV4Task,
  runIntegration = runIntegrationTask,
  publish = publishImplementationResult,
}) {
  if (!db || !repoRoot || !repoFullName || !workspaceRoot) throw new Error('V4_LITE_LAUNCHER_CONFIG_REQUIRED');
  if (!Number.isInteger(agentTimeoutMs) || agentTimeoutMs <= 0 || agentTimeoutMs >= timeoutMs) throw new Error('V4_LITE_AGENT_TIMEOUT_INVALID');
  if (!Number.isInteger(stallMs) || stallMs <= 0 || stallMs >= timeoutMs) throw new Error('V4_LITE_STALL_TIMEOUT_INVALID');

  return function launchTask({ task, slotId, canonicalMainSha }) {
    if (!task?.task_id || !slotId) throw new Error('V4_LITE_LAUNCH_IDENTITY_REQUIRED');
    if (task.stream === 'INTEGRATION_RELEASE') {
      return runIntegration({
        db,
        repoRoot,
        repoFullName,
        workspaceRoot,
        taskId: task.task_id,
        canonicalMainSha,
        resolverCommand: process.execPath,
        resolverArgs: [INTEGRATION_ENTRYPOINT, promptForIntegrationConflict(task), String(Math.ceil(agentTimeoutMs / 1000)), ollama, 'qwen2.5-coder:14b'],
        gh,
        timeoutMs,
        stallMs,
      });
    }

    const mode = taskMutationMode(task);
    const state = createState({ taskId: task.task_id, applyPatchEnabled: mode !== AGENT_MUTATION_MODES.SHELL_ONLY });
    const args = [AGENT_ENTRYPOINT, promptForTask(task), state.configPath, state.stateDir, String(Math.ceil(agentTimeoutMs / 1000)), openclaw];
    return Promise.resolve(runTask({
      db,
      repoRoot,
      workspaceRoot,
      taskId: task.task_id,
      slotId,
      command: process.execPath,
      args,
      timeoutMs,
      stallMs,
      buildCorrectionAttempt: null,
      maxCorrectionAttempts: 0,
      finalizeSuccess: ({ task: current, workspace }) => publish({ task: current, workspace, repoFullName, gh }),
    })).finally(() => cleanupState(state));
  };
}
