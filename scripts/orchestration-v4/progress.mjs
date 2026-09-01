export const SEMANTIC_PROGRESS_KINDS = Object.freeze(new Set([
  'WORKTREE_MUTATION',
  'COMMIT_CREATED',
  'TEST_RESULT',
  'BUILD_RESULT',
  'TYPECHECK_RESULT',
  'PR_MUTATION',
]));

export function classifyProgress(event = {}) {
  const kind = String(event.kind ?? '');
  if (SEMANTIC_PROGRESS_KINDS.has(kind)) return 'SEMANTIC';
  if (kind.startsWith('GIT_READ_') || kind === 'STDOUT' || kind === 'STDERR' || kind === 'TOOL_JOURNAL' || kind === 'MODEL_RESULT') return 'TELEMETRY';
  return 'UNKNOWN';
}

export function applyProgress(record, event, observedAt = new Date().toISOString()) {
  const classification = classifyProgress(event);
  const next = {
    ...record,
    lastObservedAt: observedAt,
    lastObservedKind: event.kind ?? null,
  };
  if (classification === 'SEMANTIC') {
    next.lastSemanticProgressAt = observedAt;
    next.semanticProgressSequence = (record.semanticProgressSequence ?? 0) + 1;
  }
  return Object.freeze(next);
}
