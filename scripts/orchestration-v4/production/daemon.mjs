import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSlotRegistry } from '../slot-scheduler.mjs';
import { runReadyBatch } from '../runner/task-runner.mjs';
import { cleanupEphemeralAgentState, createEphemeralAgentState } from '../runner/agent-executor.mjs';
import { getTaskContract, listTasksPendingGithubSync, markGithubTaskStateSynced } from '../state-store/sqlite-store.mjs';
import { importReadyIssues, listReadyIssues, refreshCanonicalMain } from './github-intake.mjs';
import { publishImplementationResult } from './publisher.mjs';
import { runIntegrationTask } from './integration-executor.mjs';
import { syncTerminalTaskToGitHub } from './github-sync.mjs';
import { correctionPrompt } from '../policy/correction-loop.mjs';

const ENTRYPOINT = fileURLToPath(new URL('../runner/agent-task-entrypoint.mjs', import.meta.url));
const INTEGRATION_PROPOSAL_ENTRYPOINT = fileURLToPath(new URL('../runner/integration-resolution-entrypoint.mjs', import.meta.url));
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
    `Contract version: ${contract.contractVersion || 'LEGACY_V1'}`,
    `Business outcome: ${contract.businessOutcome || 'Not separately declared; preserve the authoritative issue goal.'}`,
    `Business reason: ${contract.businessReason || 'Not separately declared.'}`,
    `Success metric: ${contract.successMetric || 'Use the issue acceptance criteria.'}`,
    `Proof required: ${contract.proofRequired || 'Use the issue acceptance criteria and current-run evidence.'}`,
    `Verification owner: ${contract.verificationOwner || 'UNSPECIFIED'}`,
    `Risk lane: ${contract.riskProfile?.lane || 'LEGACY_UNCLASSIFIED'}`,
    `Required gate: ${contract.riskProfile?.requiredGate || 'Use existing deterministic and review gates.'}`,
    `Dependencies: ${JSON.stringify(contract.dependencies ?? [])}`,
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
    'Do not optimize for activity or code volume. Prefer the smallest complete change that advances the declared business outcome.',
    'Every completion claim must cite evidence produced or inspected during this run. Never treat your own confidence as verification.',
  ].join('\n');
}

export function promptForIntegrationConflict(task) {
  const contract = getTaskContract(task);
  if (!contract?.title || !contract?.body || !contract?.fileOwnership) {
    throw new Error(`V4_INTEGRATION_CONTRACT_INCOMPLETE:${task.task_id}`);
  }
  return [
    `You are proposing the semantic resolution for Orchestration V4 integration task ${task.task_id}.`,
    `Issue: #${task.issue_number}`,
    `Title: ${contract.title}`,
    `File ownership: ${contract.fileOwnership}`,
    '',
    'Authoritative integration request:',
    contract.body,
    '',
    'The supplied file contents contain real Git conflict markers from merging current canonical main into the referenced PR head.',
    'For each conflicted file, produce the complete resolved file contents.',
    'Preserve the PR intent while retaining newer compatible functionality from canonical main.',
    'Do not invent unrelated changes. Resolve only the supplied conflicted files.',
    'V4 itself will write, stage, validate, commit, and push the approved proposal.',
  ].join('\n');
}

export async function runConcurrentProductionQueues({ runExecutableQueue, runIntegrationQueue }) {
  if (typeof runExecutableQueue !== 'function' || typeof runIntegrationQueue !== 'function') {
    throw new Error('V4_PRODUCTION_QUEUE_RUNNERS_REQUIRED');
  }
  const executablePromise = Promise.resolve().then(runExecutableQueue);
  const integrationPromise = Promise.resolve().then(runIntegrationQueue);
  const [settled, integrationSettled] = await Promise.all([executablePromise, integrationPromise]);
  return Object.freeze({ settled, integrationSettled });
}

export async function syncPendingGithubTasks({
  db,
  repoFullName,
  gh = 'gh',
  limit = 1,
  sync = syncTerminalTaskToGitHub,
}) {
  const pending = listTasksPendingGithubSync(db, { limit });
  const results = [];
  for (const task of pending) {
    if (!TERMINAL_STATES.has(task.state)) continue;
    try {
      const result = await sync({ task, repoFullName, gh });
      if (result?.ok && !result?.skipped) {
        markGithubTaskStateSynced(db, { taskId: task.task_id, state: task.state });
      }
      results.push(result);
    } catch (error) {
      results.push({ ok: false, issueNumber: task.issue_number, error: String(error?.message || error) });
    }
  }
  return results;
}

export async function runProductionPoll({
  db,
  repoRoot,
  repoFullName,
  workspaceRoot,
  configPath,
  issues = null,
  openclaw = '/opt/homebrew/bin/openclaw',
  ollama = '/opt/homebrew/bin/ollama',
  gh = 'gh',
  timeoutMs = 100 * 60_000,
  agentTimeoutMs = 90 * 60_000,
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
        buildCorrectionAttempt: ({ packet, command, args }) => ({
          command,
          args: [args[0], `${args[1]}\n\n${correctionPrompt(packet)}`, ...args.slice(2)],
        }),
        maxCorrectionAttempts: 3,
      };
    }

    const { settled, integrationSettled } = await runConcurrentProductionQueues({
      runExecutableQueue: () => runReadyBatch({
        db,
        registry: createSlotRegistry(),
        repoRoot,
        workspaceRoot,
        commandsByTaskId,
        timeoutMs,
        stallMs,
        finalizeSuccess: ({ task, workspace }) => publishImplementationResult({ task, workspace, repoFullName, gh }),
      }),
      runIntegrationQueue: async () => {
        const results = [];
        for (const task of integrationReady) {
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
              resolverArgs: [INTEGRATION_PROPOSAL_ENTRYPOINT, resolverPrompt, String(Math.ceil(agentTimeoutMs / 1000)), ollama, 'qwen2.5-coder:14b'],
              gh,
              timeoutMs,
              stallMs,
            });
            results.push({ status: 'fulfilled', value: result });
          } catch (error) {
            results.push({ status: 'rejected', reason: String(error?.message || error) });
          }
        }
        return results;
      },
    });

    const githubSync = await syncPendingGithubTasks({ db, repoFullName, gh });

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
