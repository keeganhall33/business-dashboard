export const V4_STATES = Object.freeze({
  READY: 'READY',
  CLAIMED: 'CLAIMED',
  RUNNING: 'RUNNING',
  VALIDATING: 'VALIDATING',
  PR_OPENED: 'PR_OPENED',
  COMPLETE: 'COMPLETE',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
});

const TERMINAL = new Set([
  V4_STATES.COMPLETE,
  V4_STATES.BLOCKED,
  V4_STATES.FAILED,
  V4_STATES.TIMED_OUT,
]);

const ALLOWED = new Map([
  [V4_STATES.READY, new Set([V4_STATES.CLAIMED, V4_STATES.BLOCKED])],
  [V4_STATES.CLAIMED, new Set([V4_STATES.RUNNING, V4_STATES.BLOCKED, V4_STATES.FAILED])],
  [V4_STATES.RUNNING, new Set([V4_STATES.VALIDATING, V4_STATES.BLOCKED, V4_STATES.FAILED, V4_STATES.TIMED_OUT])],
  [V4_STATES.VALIDATING, new Set([V4_STATES.PR_OPENED, V4_STATES.COMPLETE, V4_STATES.BLOCKED, V4_STATES.FAILED, V4_STATES.TIMED_OUT])],
  [V4_STATES.PR_OPENED, new Set([V4_STATES.COMPLETE, V4_STATES.BLOCKED, V4_STATES.FAILED])],
]);

export function isTerminalState(state) {
  return TERMINAL.has(state);
}

export function assertTransition(from, to) {
  if (!Object.values(V4_STATES).includes(from)) throw new Error(`V4_UNKNOWN_STATE:${from}`);
  if (!Object.values(V4_STATES).includes(to)) throw new Error(`V4_UNKNOWN_STATE:${to}`);
  if (TERMINAL.has(from)) throw new Error(`V4_TERMINAL_STATE_IMMUTABLE:${from}`);
  if (!ALLOWED.get(from)?.has(to)) throw new Error(`V4_INVALID_TRANSITION:${from}->${to}`);
  return true;
}

export function transition(record, to, details = {}) {
  assertTransition(record.state, to);
  return Object.freeze({
    ...record,
    state: to,
    updatedAt: details.updatedAt ?? new Date().toISOString(),
    stateDetails: Object.freeze({ ...(record.stateDetails ?? {}), ...details }),
  });
}
