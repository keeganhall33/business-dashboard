import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { deliveryMetadata } from '../delivery-policy.mjs';
import { getTaskContract } from '../state-store/sqlite-store.mjs';

export const DETERMINISTIC_VERIFIERS = Object.freeze({
  IONOS_HISTORICAL_PREVIEW_V1: 'IONOS_HISTORICAL_PREVIEW_V1',
});

const ENTRYPOINT = fileURLToPath(import.meta.url);
const PREVIEW_SCRIPT = 'scripts/run-ionos-historical-intelligence-preview-v1.ts';
const REQUIRED_ENV = Object.freeze([
  'IONOS_MAILBOX_CONFIG_JSON',
  'IONOS_HISTORICAL_PREVIEW_JSON',
]);
const TASK_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;
const EXECUTION_TIMEOUT_MS = 10 * 60_000;
const TERMINATION_GRACE_MS = 5_000;
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve('tsx/cli');

function requireIdentity(taskId, issueNumber) {
  if (!TASK_ID.test(String(taskId ?? ''))) throw new Error('V4_DETERMINISTIC_TASK_ID_INVALID');
  const issue = Number(issueNumber);
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('V4_DETERMINISTIC_ISSUE_NUMBER_INVALID');
  return { taskId: String(taskId), issueNumber: issue };
}

function requireEnvironment(env) {
  for (const name of REQUIRED_ENV) {
    if (typeof env?.[name] !== 'string' || env[name].trim() === '') {
      throw new Error(`V4_DETERMINISTIC_REQUIRED_ENV_MISSING:${name}`);
    }
  }
}

export function deterministicVerificationCommandForTask(task) {
  const contract = getTaskContract(task);
  const verifier = contract?.deterministicVerifier;
  if (!verifier) return null;
  if (verifier !== DETERMINISTIC_VERIFIERS.IONOS_HISTORICAL_PREVIEW_V1) {
    throw new Error('V4_DETERMINISTIC_VERIFIER_NOT_ALLOWLISTED');
  }
  if (contract.taskMutability !== 'VALIDATION_EVIDENCE_ONLY'
      || deliveryMetadata(contract).stage !== 'PRODUCTION_VERIFICATION') {
    throw new Error('V4_DETERMINISTIC_VERIFIER_TASK_INELIGIBLE');
  }
  const identity = requireIdentity(task?.task_id, task?.issue_number);
  if (contract.taskId !== identity.taskId || contract.issueNumber !== identity.issueNumber) {
    throw new Error('V4_DETERMINISTIC_CONTRACT_IDENTITY_MISMATCH');
  }
  return Object.freeze({
    command: process.execPath,
    args: Object.freeze([ENTRYPOINT, verifier, identity.taskId, String(identity.issueNumber)]),
  });
}

export function buildIonosPreviewInvocation({ taskId, issueNumber, workspacePath, env = process.env }) {
  const identity = requireIdentity(taskId, issueNumber);
  if (!path.isAbsolute(String(workspacePath ?? ''))) throw new Error('V4_DETERMINISTIC_WORKSPACE_PATH_INVALID');
  requireEnvironment(env);
  const scriptPath = path.join(workspacePath, PREVIEW_SCRIPT);
  if (!scriptPath.startsWith(`${workspacePath}${path.sep}`)) throw new Error('V4_DETERMINISTIC_SCRIPT_PATH_INVALID');
  return Object.freeze({
    command: process.execPath,
    args: Object.freeze([TSX_CLI, scriptPath]),
    cwd: workspacePath,
    env: Object.freeze({
      ...env,
      V4_PRODUCTION_TASK_ID: identity.taskId,
      V4_PRODUCTION_ISSUE_NUMBER: String(identity.issueNumber),
      OPENCLAW_WORKSPACE_DIR: workspacePath,
    }),
  });
}

export async function runDeterministicVerification({
  verifier,
  taskId,
  issueNumber,
  workspacePath = process.cwd(),
  env = process.env,
  spawnProcess = spawn,
  timeoutMs = EXECUTION_TIMEOUT_MS,
}) {
  if (verifier !== DETERMINISTIC_VERIFIERS.IONOS_HISTORICAL_PREVIEW_V1) {
    throw new Error('V4_DETERMINISTIC_VERIFIER_NOT_ALLOWLISTED');
  }
  if (timeoutMs !== EXECUTION_TIMEOUT_MS) throw new Error('V4_DETERMINISTIC_TIMEOUT_OVERRIDE_FORBIDDEN');
  const invocation = buildIonosPreviewInvocation({ taskId, issueNumber, workspacePath, env });
  if (!fs.existsSync(invocation.args[1])) throw new Error('V4_DETERMINISTIC_PREVIEW_SCRIPT_MISSING');

  await new Promise((resolve, reject) => {
    const child = spawnProcess(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    let settled = false;
    let forceTimer = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), TERMINATION_GRACE_MS);
      forceTimer.unref?.();
    }, EXECUTION_TIMEOUT_MS);
    timer.unref?.();

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      if (error) reject(error);
      else resolve();
    };
    child.once('error', () => finish(new Error('V4_DETERMINISTIC_PREVIEW_SPAWN_FAILED')));
    child.once('exit', (code, signal) => {
      if (timedOut) return finish(new Error('V4_DETERMINISTIC_PREVIEW_TIMED_OUT'));
      if (signal) return finish(new Error(`V4_DETERMINISTIC_PREVIEW_SIGNAL:${signal}`));
      if (code !== 0) return finish(new Error(`V4_DETERMINISTIC_PREVIEW_EXIT:${code}`));
      return finish();
    });
  });

  return Object.freeze({ ok: true, verifier, taskId: String(taskId), issueNumber: Number(issueNumber) });
}

async function main() {
  const [verifier, taskId, issueNumber, ...extra] = process.argv.slice(2);
  if (!verifier || !taskId || !issueNumber || extra.length > 0) throw new Error('V4_DETERMINISTIC_ARGUMENTS_INVALID');
  await runDeterministicVerification({ verifier, taskId, issueNumber });
  process.stdout.write('V4_DETERMINISTIC_VERIFICATION_COMPLETE\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === ENTRYPOINT) {
  main().catch((error) => {
    const message = String(error?.message || 'V4_DETERMINISTIC_VERIFICATION_FAILED');
    const safe = /^V4_DETERMINISTIC_[A-Z0-9_:.-]+$/.test(message)
      ? message
      : 'V4_DETERMINISTIC_VERIFICATION_FAILED';
    process.stderr.write(`${safe}\n`);
    process.exitCode = 2;
  });
}
