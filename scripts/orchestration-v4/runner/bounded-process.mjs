import { spawn } from 'node:child_process';

function signalGroup(pgid, signal) {
  if (!Number.isInteger(pgid) || pgid <= 0) return;
  try { process.kill(-pgid, signal); } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

export function runBoundedProcess({ command, args = [], cwd, env = process.env, timeoutMs, stallMs, onEvent = () => {}, spawnImpl = spawn, now = () => Date.now() }) {
  if (!command) throw new Error('V4_PROCESS_COMMAND_REQUIRED');
  if (!cwd) throw new Error('V4_PROCESS_CWD_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('V4_PROCESS_TIMEOUT_REQUIRED');
  if (!Number.isInteger(stallMs) || stallMs <= 0 || stallMs > timeoutMs) throw new Error('V4_PROCESS_STALL_REQUIRED');

  return new Promise((resolve, reject) => {
    const startedAt = now();
    let lastSemanticAt = startedAt;
    let settled = false;
    const child = spawnImpl(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const pgid = child.pid;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      resolve({ ...result, childPid: child.pid, processGroupId: pgid, startedAt, endedAt: now() });
    };

    const mark = (kind, data = '') => {
      const event = { kind, data: String(data), observedAt: new Date(now()).toISOString() };
      const classification = onEvent(event);
      if (classification === 'SEMANTIC') lastSemanticAt = now();
    };

    child.stdout?.on('data', (chunk) => mark('STDOUT', chunk));
    child.stderr?.on('data', (chunk) => mark('STDERR', chunk));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => finish({ status: code === 0 ? 'COMPLETE' : 'FAILED', code, signal, reason: code === 0 ? null : `EXIT_${code ?? signal}` }));

    const timer = setInterval(() => {
      const elapsed = now() - startedAt;
      if (elapsed >= timeoutMs) {
        signalGroup(pgid, 'SIGTERM');
        setTimeout(() => signalGroup(pgid, 'SIGKILL'), 250).unref?.();
        finish({ status: 'TIMED_OUT', code: null, signal: 'SIGTERM', reason: 'HARD_DEADLINE' });
        return;
      }
      if (now() - lastSemanticAt >= stallMs) {
        signalGroup(pgid, 'SIGTERM');
        setTimeout(() => signalGroup(pgid, 'SIGKILL'), 250).unref?.();
        finish({ status: 'BLOCKED', code: null, signal: 'SIGTERM', reason: 'SEMANTIC_PROGRESS_STALL' });
      }
    }, Math.min(250, Math.max(25, Math.floor(stallMs / 4))));
    timer.unref?.();
  });
}
