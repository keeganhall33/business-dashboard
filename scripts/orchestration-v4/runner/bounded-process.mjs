import { spawn } from 'node:child_process';

const ALLOWED_CHILD_EVENT_KINDS = new Set(['WORKTREE_MUTATION','COMMIT_CREATED','TEST_RESULT','BUILD_RESULT','TYPECHECK_RESULT','MODEL_RESULT','PR_MUTATION']);
const OUTPUT_TAIL_LIMIT = 16_384;
const TERMINATION_REAP_GRACE_MS = 2000;

export function signalGroup(pgid, signal, killImpl = process.kill) {
  if (!Number.isInteger(pgid) || pgid <= 0) return false;
  try {
    killImpl(-pgid, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH' || error?.code === 'EPERM') return false;
    throw error;
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

function appendTail(current, chunk) {
  const next = current + String(chunk);
  return next.length <= OUTPUT_TAIL_LIMIT ? next : next.slice(-OUTPUT_TAIL_LIMIT);
}

export function runBoundedProcess({ command, args = [], cwd, env = process.env, timeoutMs, stallMs, onEvent = () => {}, onStarted = () => {}, observeSemantic = () => null, spawnImpl = spawn, now = () => Date.now() }) {
  if (!command) throw new Error('V4_PROCESS_COMMAND_REQUIRED');
  if (!cwd) throw new Error('V4_PROCESS_CWD_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('V4_PROCESS_TIMEOUT_REQUIRED');
  if (!Number.isInteger(stallMs) || stallMs <= 0 || stallMs > timeoutMs) throw new Error('V4_PROCESS_STALL_REQUIRED');

  return new Promise((resolve, reject) => {
    const startedAt = now();
    let lastSemanticAt = startedAt;
    let lastObserverAt = startedAt;
    let settled = false;
    let terminationResult = null;
    let killTimer = null;
    let reapTimer = null;
    let stdoutBuffer = '';
    let stdoutTail = '';
    let stderrTail = '';
    const child = spawnImpl(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const pgid = child.pid;
    onStarted({ childPid: child.pid, processGroupId: pgid, startedAt });

    const emit = (event) => {
      const classification = onEvent(event);
      if (classification === 'SEMANTIC') lastSemanticAt = now();
    };

    const sampleSemantic = (observedAt) => {
      try {
        const observed = observeSemantic(observedAt);
        if (observed) emit(observed);
      } catch (error) {
        emit({ kind: 'STDERR', data: `V4_SEMANTIC_OBSERVER_ERROR:${String(error?.message ?? error)}`, observedAt });
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      if (killTimer) clearTimeout(killTimer);
      if (reapTimer) clearTimeout(reapTimer);
      resolve({ ...result, stdoutTail, stderrTail, childPid: child.pid, processGroupId: pgid, startedAt, endedAt: now() });
    };

    const requestTermination = (result) => {
      if (settled || terminationResult) return;
      terminationResult = result;
      clearInterval(timer);
      signalGroup(pgid, 'SIGTERM');
      killTimer = setTimeout(() => signalGroup(pgid, 'SIGKILL'), 250);
      killTimer.unref?.();
      reapTimer = setTimeout(() => finish(result), TERMINATION_REAP_GRACE_MS);
      reapTimer.unref?.();
    };

    child.stdout?.on('data', (chunk) => {
      const observedAt = new Date(now()).toISOString();
      const text = String(chunk);
      stdoutTail = appendTail(stdoutTail, text);
      emit({ kind: 'STDOUT', data: text, observedAt });
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const structured = parseStructuredLine(line.trim(), observedAt);
        if (structured) emit(structured);
      }
    });
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk);
      stderrTail = appendTail(stderrTail, text);
      emit({ kind: 'STDERR', data: text, observedAt: new Date(now()).toISOString() });
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      if (killTimer) clearTimeout(killTimer);
      if (reapTimer) clearTimeout(reapTimer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      sampleSemantic(new Date(now()).toISOString());
      if (terminationResult) {
        finish({ ...terminationResult, code, observedSignal: signal });
        return;
      }
      finish({ status: code === 0 ? 'COMPLETE' : 'FAILED', code, signal, reason: code === 0 ? null : `EXIT_${code ?? signal}` });
    });

    const timer = setInterval(() => {
      const current = now();
      const elapsed = current - startedAt;
      const observerIntervalMs = Math.min(2000, Math.max(500, Math.floor(stallMs / 8)));
      if (current - lastObserverAt >= observerIntervalMs) {
        lastObserverAt = current;
        sampleSemantic(new Date(current).toISOString());
      }
      if (elapsed >= timeoutMs) {
        requestTermination({ status: 'TIMED_OUT', code: null, signal: 'SIGTERM', reason: 'HARD_DEADLINE' });
        return;
      }
      if (current - lastSemanticAt >= stallMs) {
        requestTermination({ status: 'BLOCKED', code: null, signal: 'SIGTERM', reason: 'SEMANTIC_PROGRESS_STALL' });
      }
    }, Math.min(250, Math.max(25, Math.floor(stallMs / 4))));
    timer.unref?.();
  });
}
