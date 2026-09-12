import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSlotRegistry } from '../slot-scheduler.mjs';
import { runReadyBatch } from '../runner/task-runner.mjs';
import { AGENT_MUTATION_MODES, cleanupEphemeralAgentState, createEphemeralAgentState, validateAgentMutationMode } from '../runner/agent-executor.mjs';
import { getTaskContract, listTasksPendingGithubSync, markGithubTaskStateSynced } from '../state-store/sqlite-store.mjs';
import { importReadyIssues, listReadyIssues, refreshCanonicalMain } from './github-intake.mjs';
import { publishImplementationResult } from './publisher.mjs';
import { runIntegrationTask } from './integration-executor.mjs';
import { syncTerminalTaskToGitHub } from './github-sync.mjs';
import { CORRECTION_MUTATION_MODES, correctionMutationMode, correctionPrompt } from '../policy/correction-loop.mjs';
import { deliveryMetadata, selectDeliveryReadyTasks } from '../delivery-policy.mjs';

const ENTRYPOINT = fileURLToPath(new URL('../runner/agent-task-entrypoint.mjs', import.meta.url));
const INTEGRATION_PROPOSAL_ENTRYPOINT = fileURLToPath(new URL('../runner/integration-resolution-entrypoint.mjs', import.meta.url));
const TERMINAL_STATES = new Set(['COMPLETE','BLOCKED','FAILED','TIMED_OUT']);
const MUTATION_MODE_DIRECTIVE = '**mutation_mode:**';

export function taskMutationMode(task) {
  const body = String(getTaskContract(task)?.body ?? '');
  const directives = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(MUTATION_MODE_DIRECTIVE));

  if (directives.length === 0) return AGENT_MUTATION_MODES.DEFAULT;
  if (directives.length !== 1) throw new Error('V4_PRODUCTION_MUTATION_MODE_DIRECTIVE_INVALID');

  const match = directives[0].match(/^\*\*mutation_mode:\*\*\s+(DEFAULT|SHELL_ONLY)$/);
  if (!match) throw new Error('V4_PRODUCTION_MUTATION_MODE_DIRECTIVE_INVALID');
  return validateAgentMutationMode(match[1]);
}

export function taskAttemptLimit(task) {
  const value = getTaskContract(task)?.maxAttempts;
  return Number.isInteger(value) && value >= 1 ? value : 3;
}

export function buildCorrectionAgentAttempt({ packet, command, args, createState = createEphemeralAgentState, retainState = () => {} }) {
  const prompt = `${args[1]}\n\n${correctionPrompt(packet)}`;
  if (correctionMutationMode(packet) !== CORRECTION_MUTATION_MODES.SHELL_ONLY) {
    return { command, args: [args[0], prompt, ...args.slice(2)] };
  }
  const state = createState({ taskId: `${packet.unitId}-correction-${packet.attempt}`, applyPatchEnabled: false });
  retainState(state);
  return {
    command,
    args: [args[0], prompt, state.configPath, state.stateDir, ...args.slice(4)],
  };
}

export function cleanupProductionAgentStates(states) {
  for (const state of states ?? []) cleanupEphemeralAgentState(state);
}

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
    `Delivery mode: ${deliveryMetadata(contract).mode}`,
    `Vertical slice: ${deliveryMetadata(contract).sliceId ?? 'none'}`,
    `Slice stage: ${deliveryMetadata(contract).stage ?? 'none'}`,
    `Feature: ${deliveryMetadata(contract).featureName ?? 'none'}`,
    `Release target: ${deliveryMetadata(contract).releaseTarget ?? 'unassigned'}`,
    `Launch policy: ${deliveryMetadata(contract).launchPolicy ?? 'unspecified'}`,
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
    'Optimize for the stated user outcome and end-to-end flow, not merely file completion.',
    'A task is coded when its acceptance passes; a slice is operational only after its PRODUCTION_VERIFICATION stage passes.',
    'A production-verified feature with IMMEDIATE_AFTER_VERIFICATION launches independently. Do not hold it for the full version milestone.',
    ...(deliveryMetadata(contract).stage === 'PRODUCTION_VERIFICATION' ? [
      '',
      'Production verification completion is fail-closed and requires a machine-readable evidence artifact.',
      'Only after the live verification and every required safety check pass, write `.openclaw/tmp/production-verification-v1.json` with this exact schema:',
      '{"contractVersion":"PRODUCTION_VERIFICATION_V1","taskId":"TASK_ID","issueNumber":ISSUE_NUMBER,"verdict":"PASS","observedAt":"ISO_8601","liveExecution":true,"repositoryClean":true,"privacySafe":true,"externalMutation":false,"checks":[{"id":"NON_SECRET_CHECK_ID","passed":true}],"telemetry":{"NON_SECRET_METRIC":0}}',
      'Use the current task id and issue number. Include only redacted aggregate telemetry and non-secret check identifiers.',
      'Never write the artifact when the live command was skipped, blocked, failed, partial, timed out, or lacked required proof.',
      'Never include credentials, addresses, subjects, message identifiers, bodies, attachment bytes, secret references, tokens, or raw provider errors.',
    ] : []),
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
  const allTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at,task_id').all();
  const ready = allTasks.filter((task) => task.state === 'READY');
  const deliverySelection = selectDeliveryReadyTasks(allTasks);
  const integrationReady = ready.filter((task) => task.stream === 'INTEGRATION_RELEASE').slice(0, 1);
  const executable = deliverySelection.selected;
  const ephemeral = [];
  const commandsByTaskId = {};

  try {
    for (const task of executable) {
      const mode = taskMutationMode(task);
      const state = createEphemeralAgentState({
        taskId: task.task_id,
        applyPatchEnabled: mode !== AGENT_MUTATION_MODES.SHELL_ONLY,
      });
      ephemeral.push(state);
      commandsByTaskId[task.task_id] = {
        command: process.execPath,
        args: [ENTRYPOINT, promptForTask(task), state.configPath, state.stateDir, String(Math.ceil(agentTimeoutMs / 1000)), openclaw],
        buildCorrectionAttempt: ({ packet, command, args }) => buildCorrectionAgentAttempt({
          packet,
          command,
          args,
          retainState: (correctionState) => ephemeral.push(correctionState),
        }),
        maxCorrectionAttempts: taskAttemptLimit(task),
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
      deliveryPolicy: {
        selected: deliverySelection.selected.map((task) => task.task_id),
        deferred: deliverySelection.deferred,
        activeSliceIds: deliverySelection.activeSliceIds,
      },
    });
  } finally {
    cleanupProductionAgentStates(ephemeral);
  }
}
