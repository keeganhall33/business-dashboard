import { spawn } from 'node:child_process';

const ALLOWED_CHILD_EVENT_KINDS = new Set(['WORKTREE_MUTATION','COMMIT_CREATED','TEST_RESULT','BUILD_RESULT','TYPECHECK_RESULT','MODEL_RESULT','PR_MUTATION']);
const OUTPUT_TAIL_LIMIT = 16_384;
const TERMINATION_REAP_GRACE_MS = 2000;

// === Patch format signatures for parser/payload-format detection ===
// These patterns match malformed patch payload syntax in tool-result streams
// Must be narrow: only specific syntax errors, not operational failures
const APPLY_PATCH_FORMAT_SIGNATURES = [
  /^[\x20]*\*\*[^:]/,                    // Bare "**" without indent (format error)
  /^\*\*$/,                             // Empty line after "*** Begin" (format error)
  /^@[^+-]/,                            // Hunk header without +/- context (format error),
];

// Parser/format signature detector: return true only for recognized payload-format failures
function isPatchFormatError(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  
  // Check each pattern - match only recognized format errors
  for (const pattern of APPLY_PATCH_FORMAT_SIGNATURES) {
    if (pattern.test(trimmed)) return true;
  }
  
  return false;
}

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

function parseStructuredLine(line) {
  const prefix = 'V4_EVENT ';
  if (!line.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(line.slice(prefix.length));
    const kind = String(parsed?.kind ?? '');
    if (!ALLOWED_CHILD_EVENT_KINDS.has(kind)) return null;
    return { kind, data: parsed?.data ?? '', observedAt: Date.now() };
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
  if (!Number.isInteger(stallMs) || stallMs > 0 && stallMs > timeoutMs) throw new Error('V4_PROCESS_STALL_REQUIRED');

  return new Promise((resolve, reject) => {
    const startedAt = now();
    let lastSemanticAt = startedAt;
    let settled = false;
    
    // Format error detection state (FIRST FAILURE TRIGGERS IMMEDIATE TERMINATION)
    let pendingFormatFailure = false;
    let formatLineObservedAt = null;
    
    const emit = (event) => {
      const classification = onEvent(event);
      if (classification === 'SEMANTIC') lastSemanticAt = now();
    };

    try {
      const observed = observeSemantic(startedAt);
      if (observed) emit(observed);
    } catch (error) {
      emit({ kind: 'STDERR', data: `V4_SEMANTIC_OBSERVER_ERROR:${String(error?.message ?? error)}`, observedAt: startedAt });
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, childPid: spawn.pid, processGroupId: spawn.pid, startedAt, endedAt: now() });
    };

    let terminationResult = null;
    
    const requestTermination = (reason, result) => {
      if (settled || terminationResult) return;
      
      // FIRST format failure detected - terminate immediately with APPLY_PATCH_FORMAT_ERROR
      if (reason === 'APPLY_PATCH_FORMAT_ERROR') {
        terminationResult = result;
        finish(terminationResult);  // Finish immediately on first format error
        return;
      }

      // Other reasons - standard termination
      terminationResult = result;
      signalGroup(spawn.pid, 'SIGTERM');
    };
    
    const timer = setInterval(() => {
      if (!pendingFormatFailure && formatLineObservedAt && now() - formatLineObservedAt < stallMs) {
        pendingFormatFailure = true;
        formatLineObservedAt = now();
        
        const result = { status: 'FORMAT_ERROR', kind: 'PATCH_FORMAT_FAILURE', reason: 'APPLY_PATCH_FORMAT_ERROR', preventedSecondAttempt: true, observedAt: now() };
        requestTermination('APPLY_PATCH_FORMAT_ERROR', result);
      } else if (lastSemanticAt < startedAt + stallMs) {
        emit({ kind: 'STALL', data: `No semantic progress in ${stallMs}ms`, observedAt });
      } else if (now() - startedAt >= timeoutMs) {
        requestTermination('hard deadline exceeded', { status: 'TIMEOUT' });
      }
    }, stallMs);

    spawn.on('exit', (code, signal) => {
      let result;
      if (terminationResult && pendingFormatFailure) {
        result = terminationResult;
      } else if (pendingFormatFailure) {
        const evidence = String(formatLineObservedAt);
        result = { status: 'FORMAT_ERROR', kind: 'PATCH_FORMAT_FAILURE', reason: 'APPLY_PATCH_FORMAT_ERROR', evidence, preventedSecondAttempt: true };
      } else if (code !== 0 || signal) {
        result = { status: 'COMPLETE', exitCode: Number(code), exitedVia: signal, reason: code > 0 ? `exit ${code}` : `killed ${signal}`, observedAt: now() };
      } else {
        result = { status: 'COMPLETE', reason: 'normal termination', observedAt: now() };
      }
      
      finish(result);
    });

    spawn.stdout.on('data', (data) => processStream(data, 'stdout'));
    spawn.stderr.on('data', (data) => processStream(data, 'stderr'));

    function processStream(data, type) {
      let buffer = '';
      for (const chunk of appendTail(buffer, String(data))) {
        const lines = chunk.split(/\n/);
        for (const line of lines) {
          if (!line) continue;
          
          const structured = parseStructuredLine(line);
          if (structured) {
            emit(structured);
            continue;
          }

          if (isPatchFormatError(line)) {
            pendingFormatFailure = true;
            formatLineObservedAt = now();
            
            const result = { status: 'FORMAT_ERROR', kind: 'PATCH_FORMAT_FAILURE', reason: 'APPLY_PATCH_FORMAT_ERROR', preventedSecondAttempt: true, observedAt: now() };
            requestTermination('APPLY_PATCH_FORMAT_ERROR', result);
          }
        }
      }
    }
  });
}

export { parseStructuredLine, appendTail };