import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTONOMOUS_MERGE_BLOCK_REASONS,
  evaluateAutonomousMergeGate,
} from '../../../scripts/orchestration-v4/production/autonomous-merge-gate.mjs';

function healthy(overrides = {}) {
  return {
    pr: { state: 'open', draft: false, mergeable: true, base: 'main', headSha: 'abc123' },
    expectedHeadSha: 'abc123',
    changedPaths: ['src/feature.mjs', 'test/feature.test.mjs'],
    fileOwnership: ['src/feature.mjs', 'test/feature.test.mjs'],
    publication: { ownedMutationVerified: true, commitOwnershipVerified: true },
    validation: { focusedTestsPassed: true, diffCheckPassed: true },
    ci: { status: 'completed', conclusion: 'success' },
    review: { independent: true, decision: 'APPROVE', reviewedHeadSha: 'abc123', unresolvedThreads: 0 },
    ...overrides,
  };
}

test('allows autonomous merge only when every deterministic gate passes', () => {
  const result = evaluateAutonomousMergeGate(healthy());
  assert.equal(result.allowed, true);
  assert.deepEqual(result.reasons, []);
});

test('fails closed on empty, invalid, or unowned diffs', () => {
  const empty = evaluateAutonomousMergeGate(healthy({ changedPaths: [] }));
  assert.equal(empty.allowed, false);
  assert.ok(empty.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.EMPTY_DIFF));

  const invalid = evaluateAutonomousMergeGate(healthy({ changedPaths: ['src/feature.mjs', '../escape.mjs'] }));
  assert.equal(invalid.allowed, false);
  assert.deepEqual(invalid.invalidChangedPaths, ['../escape.mjs']);
  assert.ok(invalid.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.INVALID_CHANGED_PATH));

  const unowned = evaluateAutonomousMergeGate(healthy({ changedPaths: ['src/feature.mjs', 'memory/noise.md'] }));
  assert.equal(unowned.allowed, false);
  assert.deepEqual(unowned.unownedChangedPaths, ['memory/noise.md']);
  assert.ok(unowned.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.UNOWNED_CHANGE));
});

test('fails closed when the PR head moves or base/mergeability is unsafe', () => {
  const result = evaluateAutonomousMergeGate(healthy({
    expectedHeadSha: 'old-head',
    pr: { state: 'open', draft: true, mergeable: false, base: 'release', headSha: 'new-head' },
  }));
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.PR_DRAFT));
  assert.ok(result.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.PR_NOT_MERGEABLE));
  assert.ok(result.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.WRONG_BASE));
  assert.ok(result.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.HEAD_MOVED));
});

test('requires publisher ownership evidence, focused validation, and successful completed CI', () => {
  const result = evaluateAutonomousMergeGate(healthy({
    publication: { ownedMutationVerified: true, commitOwnershipVerified: false },
    validation: { focusedTestsPassed: false, diffCheckPassed: true },
    ci: { status: 'completed', conclusion: 'failure' },
  }));
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.PUBLICATION_NOT_VERIFIED));
  assert.ok(result.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.VALIDATION_INCOMPLETE));
  assert.ok(result.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.CI_FAILED));
});

test('requires an independent approving review tied to the exact head with no unresolved threads', () => {
  const missing = evaluateAutonomousMergeGate(healthy({ review: { independent: false, decision: 'APPROVE', reviewedHeadSha: 'abc123', unresolvedThreads: 0 } }));
  assert.ok(missing.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.INDEPENDENT_REVIEW_MISSING));

  const stale = evaluateAutonomousMergeGate(healthy({ review: { independent: true, decision: 'APPROVE', reviewedHeadSha: 'old-head', unresolvedThreads: 0 } }));
  assert.equal(stale.allowed, false);
  assert.ok(stale.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.REVIEW_HEAD_MISMATCH));

  const rejected = evaluateAutonomousMergeGate(healthy({ review: { independent: true, decision: 'REQUEST_CHANGES', reviewedHeadSha: 'abc123', unresolvedThreads: 2 } }));
  assert.equal(rejected.allowed, false);
  assert.ok(rejected.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.REVIEW_REJECTED));
  assert.ok(rejected.reasons.includes(AUTONOMOUS_MERGE_BLOCK_REASONS.UNRESOLVED_REVIEW_THREADS));
});

test('directory ownership covers descendants but not sibling paths', () => {
  const result = evaluateAutonomousMergeGate(healthy({
    changedPaths: ['src/lib/a.mjs', 'src/lib/nested/b.mjs', 'src/other.mjs'],
    fileOwnership: ['src/lib'],
  }));
  assert.equal(result.allowed, false);
  assert.deepEqual(result.unownedChangedPaths, ['src/other.mjs']);
});
