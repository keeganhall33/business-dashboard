import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTONOMOUS_MERGE_BLOCK_REASONS,
  DELIVERY_CONTINUITY_STATES,
  evaluateAutonomousMergeGate,
  runPrToDeployContinuity,
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

test('delivery continuity follows exact-head CI and review before merge and tolerates deployment lag', async () => {
  const observations = [
    healthy({ ci: { status: 'pending' }, review: {} }),
    healthy({ review: { independent: false } }),
    healthy(),
  ];
  const states = [];
  let deploymentCalls = 0;
  const result = await runPrToDeployContinuity({
    expectedHeadSha: 'abc123',
    gateInput: healthy(),
    observePr: async () => observations.shift() || healthy(),
    mergePr: async ({ expectedHeadSha }) => {
      assert.equal(expectedHeadSha, 'abc123');
      return { mergeSha: 'd'.repeat(40) };
    },
    observeDeployment: async () => (++deploymentCalls === 1 ? { state: 'DEPLOY_PENDING' } : { state: 'DEPLOYED', deploymentId: 7 }),
    pollMs: 1,
    sleep: async () => {},
    onState: (state) => states.push(state.state),
  });
  assert.equal(result.state, DELIVERY_CONTINUITY_STATES.DEPLOYED);
  assert.deepEqual(states, ['CI_PENDING', 'REVIEW_PENDING', 'MERGE_READY', 'MERGING', 'DEPLOY_PENDING', 'DEPLOYED']);
});

test('moved PR head fails closed even if an older head was approved', async () => {
  const result = await runPrToDeployContinuity({
    expectedHeadSha: 'abc123',
    gateInput: healthy(),
    observePr: async () => healthy({
      pr: { ...healthy().pr, headSha: 'moved' },
      review: { independent: true, decision: 'APPROVE', reviewedHeadSha: 'abc123', unresolvedThreads: 0 },
    }),
    mergePr: async () => { throw new Error('MUST_NOT_MERGE'); },
    observeDeployment: async () => ({ state: 'DEPLOY_PENDING' }),
  });
  assert.equal(result.state, DELIVERY_CONTINUITY_STATES.BLOCKED);
  assert.equal(result.blocker, 'HEAD_MOVED');
});

test('retryable merge failure retries once while permanent failure is bounded', async () => {
  let attempts = 0;
  const result = await runPrToDeployContinuity({
    expectedHeadSha: 'abc123',
    gateInput: healthy(),
    observePr: async () => healthy(),
    mergePr: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('busy'), { code: 'MERGE_QUEUE_BUSY' });
      return { mergeSha: 'e'.repeat(40) };
    },
    observeDeployment: async () => ({ state: 'DEPLOYED', deploymentId: 8 }),
    pollMs: 1,
    sleep: async () => {},
  });
  assert.equal(result.state, DELIVERY_CONTINUITY_STATES.DEPLOYED);
  assert.equal(result.mergeAttempts, 2);
});

test('bounded production propagation reports deployment timeout', async () => {
  let clock = 0;
  const result = await runPrToDeployContinuity({
    expectedHeadSha: 'abc123',
    gateInput: healthy(),
    observePr: async () => healthy(),
    mergePr: async () => ({ mergeSha: 'f'.repeat(40) }),
    observeDeployment: async () => ({ state: 'DEPLOY_PENDING' }),
    timeoutMs: 2,
    pollMs: 1,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
  });
  assert.equal(result.state, DELIVERY_CONTINUITY_STATES.BLOCKED);
  assert.equal(result.blocker, 'DEPLOY_TIMEOUT');
});
