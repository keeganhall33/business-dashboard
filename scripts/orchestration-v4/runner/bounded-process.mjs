import { spawn } from 'node:child_process';

const ALLOWED_CHILD_EVENT_KINDS = new Set(['WORKTREE_MUTATION','COMMIT_CREATED','TEST_RESULT','BUILD_RESULT','TYPECHECK_RESULT','MODEL_RESULT','PR_MUTATION']);

function signalGroup(pgid, signal) {
  if (!Number.isInteger(pgid) || pgid <= 0) return;
  try { process.kill(-pgid, signal); } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function parseStructuredLine(line, observedAt) {
  const prefix = 'V4_EVENT ';
  if (!line.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(line.slice(prefix.length));
    const kind = String(parsed?.kind ?? '');
    if (!ALLOWED_CHILD_EVENT_KINDS.has(kind)) return null;
    return { kind, data: parsed?.data ?? '', observedAt };
  } catch {
    return null;
  }
}

export function runBoundedProcess({ command, args = [], cwd, env = process.env, timeoutMs, stallMs, onEvent = () => {}, onStarted = () => {}, spawnImpl = spawn, now = () => Date.now() }) {
  if (!command) throw new Error('V4_PROCESS_COMMAND_REQUIRED');
  if (!cwd) throw new Error('V4_PROCESS_CWD_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('V4_PROCESS_TIMEOUT_REQUIRED');
  if (!Number.isInteger(stallMs) || stallMs <= 0 || stallMs > timeoutMs) throw new Error('V4_PROCESS_STALL_REQUIRED');

  return new Promise((resolve, reject) => {
    const startedAt = now();
    let lastSemanticAt = startedAt;
    let settled = false;
    let stdoutBuffer = '';
    const child = spawnImpl(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const pgid = child.pid;
    onStarted({ childPid: child.pid, processGroupId: pgid, startedAt });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      resolve({ ...result, childPid: child.pid, processGroupId: pgid, startedAt, endedAt: now() });
    };

    const emit = (event) => {
      const classification = onEvent(event);
      if (classification === 'SEMANTIC') lastSemanticAt = now();
    };

    child.stdout?.on('data', (chunk) => {
      const observedAt = new Date(now()).toISOString();
      const text = String(chunk);
      emit({ kind: 'STDOUT', data: text, observedAt });
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const structured = parseStructuredLine(line.trim(), observedAt);
        if (structured) emit(structured);
      }
    });
    child.stderr?.on('data', (chunk) => emit({ kind: 'STDERR', data: String(chunk), observedAt: new Date(now()).toISOString() }));
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
