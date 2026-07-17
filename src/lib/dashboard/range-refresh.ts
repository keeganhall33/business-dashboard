export type AppliedRangeSnapshot = {
  key: string;
  signal: number;
  queryString: string;
};

export type RangeRequestState = {
  key: string;
  signal: number;
  token: symbol;
};

export function createAppliedRangeSnapshot(key: string, queryString: string, signal = 0): AppliedRangeSnapshot {
  return { key, signal, queryString };
}

export function shouldStartRangeRequest(
  applied: AppliedRangeSnapshot,
  inFlight: RangeRequestState | null,
  targetKey: string,
  signal: number
) {
  const alreadyActive = applied.key === targetKey && applied.signal === signal;
  if (alreadyActive) return false;
  if (inFlight && inFlight.key === targetKey && inFlight.signal === signal) return false;
  return true;
}

export function createRangeRequestState(key: string, signal: number): RangeRequestState {
  return { key, signal, token: Symbol("range-request") };
}

export function isCurrentRangeRequest(inFlight: RangeRequestState | null, token: symbol) {
  return Boolean(inFlight && inFlight.token === token);
}

export function applyRangeSnapshot(state: AppliedRangeSnapshot, key: string, signal: number, queryString: string) {
  state.key = key;
  state.signal = signal;
  state.queryString = queryString;
  return state;
}
