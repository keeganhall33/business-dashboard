import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgress, classifyProgress } from '../../scripts/orchestration-v4/progress.mjs';

test('model exit is telemetry and cannot forge semantic progress', () => {
  assert.equal(classifyProgress({ kind: 'MODEL_RESULT' }), 'TELEMETRY');
  const next = applyProgress({ semanticProgressSequence: 0 }, { kind: 'MODEL_RESULT' }, '2026-09-01T00:00:00.000Z');
  assert.equal(next.semanticProgressSequence, 0);
  assert.equal(next.lastSemanticProgressAt, undefined);
});

test('observable worktree mutation remains semantic progress', () => {
  assert.equal(classifyProgress({ kind: 'WORKTREE_MUTATION' }), 'SEMANTIC');
  const next = applyProgress({ semanticProgressSequence: 0 }, { kind: 'WORKTREE_MUTATION' }, '2026-09-01T00:00:00.000Z');
  assert.equal(next.semanticProgressSequence, 1);
  assert.equal(next.lastSemanticProgressAt, '2026-09-01T00:00:00.000Z');
});
