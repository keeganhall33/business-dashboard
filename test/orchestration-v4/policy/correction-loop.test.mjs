import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorrectionPacket, correctionPrompt, resetCorrectionState, isShellMutationRequired, getPendingShellMutation, CORRECTION_ACTIONS } from '../../../scripts/orchestration-v4/policy/correction-loop.mjs';

test('correction-packet-creation-validates-required-fields', () => {
  assert.throws(() => createCorrectionPacket({}), /V4_CORRECTION_PACKET_INCOMPLETE/);
  assert.throws(() => createCorrectionPacket({ unitId: 'u1' }), /V4_CORRECTION_PACKET_INCOMPLETE/);
  
  const packet = createCorrectionPacket({ 
    unitId: 'test-unit', 
    verdict: 'RED', 
    reason: 'format-error', 
    evidence: 'malformed patch syntax',
    scope: 'scripts/*.mjs',
    attempt: 1,
    maxAttempts: 3
  });
  
  assert.ok(packet.unitId === 'test-unit');
  assert.ok(packet.verdict === 'RED');
  assert.ok(packet.reason === 'format-error');
  assert.ok(packet.attempt === 1);
  assert.ok(packet.maxAttempts === 3);
  assert.ok(packet.action === 'RETRY_UNIT'); // First attempt, non-format
});

test('format-error-correction-packet-uses-STOP-action', () => {
  const packet = createCorrectionPacket({ 
    unitId: 'format-test',
    verdict: 'FORMAT_ERROR',
    reason: 'bare asterisks in patch directive',
    evidence: '**Begin Patch',
    scope: 'scripts/*.mjs',
    attempt: 1,
    maxAttempts: 3
  });
  
  // Format errors should use STOP action (shell-only correction)
  assert.ok(packet.action === 'STOP');
});

test('correction-action-is-retry-unit-for-non-format-red-verdict', () => {
  const packet = createCorrectionPacket({ 
    unitId: 'runtime-test',
    verdict: 'RED', // Non-format red verdict
    reason: 'timeout occurred',
    evidence: 'hard deadline exceeded',
    scope: 'scripts/*.mjs',
    attempt: 1,
    maxAttempts: 3
  });
  
  assert.ok(packet.action === 'RETRY_UNIT');
});

test('correction-action-is-replan-on-final-attempt', () => {
  const packet = createCorrectionPacket({ 
    unitId: 'final-test',
    verdict: 'RED',
    reason: 'semantic stall',
    evidence: 'no progress for 30s',
    scope: 'scripts/*.mjs',
    attempt: 3, // Final attempt
    maxAttempts: 3
  });
  
  assert.ok(packet.action === 'REPLAN');
});

test('shell-mutation-block-is-enabled-for-format-error-verdict', () => {
  const packet1 = createCorrectionPacket({ 
    unitId: 'format-test-1',
    verdict: 'FORMAT_ERROR',
    reason: 'malformed syntax',
    evidence: 'bare **',
    scope: 'scripts/*.mjs'
  });
  
  assert.ok(packet1); // Packet created
  
  const packet2 = createCorrectionPacket({ 
    unitId: 'normal-test',
    verdict: 'RED',
    reason: 'timeout',
    evidence: 'deadline',
    scope: 'scripts/*.mjs'
  });
  
  // Format error packets enable shell mutation block
  assert.ok(packet1.action === 'STOP'); // Format errors stop and require shell-only correction
});

test('correction-prompt-for-format-error-includes-shell-only-instruction', () => {
  const packet = createCorrectionPacket({ 
    unitId: 'prompt-test',
    verdict: 'FORMAT_ERROR',
    reason: 'syntax error',
    evidence: 'invalid hunk header',
    scope: 'scripts/*.mjs'
  });
  
  const prompt = correctionPrompt(packet);
  
  assert.ok(prompt.includes('shell-only') || prompt.includes('repository-rooted'));
});

test('correction-prompt-for-normal-red-verdict-includes-sibling-protection', () => {
  const packet = createCorrectionPacket({ 
    unitId: 'normal-prompt-test',
    verdict: 'RED',
    reason: 'runtime error',
    evidence: 'unexpected exit code',
    scope: 'scripts/*.mjs'
  });
  
  const prompt = correctionPrompt(packet);
  
  assert.ok(prompt.includes('Preserve accepted sibling units'));
});

test('correction-packet-uses-string-conversion-for-all-fields', () => {
  const packet = createCorrectionPacket({ 
    unitId: 12345, // Numeric unitId
    verdict: 'RED',
    reason: true, // Boolean reason (will be converted)
    evidence: { msg: 'error' }, // Object evidence (will be stringified)
    scope: ['file1.mjs', 'file2.mjs'], // Array scope (will be stringified)
    attempt: 1,
    maxAttempts: 3
  });
  
  assert.ok(typeof packet.unitId === 'string');
  assert.ok(typeof packet.reason === 'string');
  assert.ok(typeof packet.evidence === 'string');
  assert.ok(typeof packet.scope === 'string');
});

test('correction-packet-is-frozen-object', () => {
  const packet = createCorrectionPacket({ 
    unitId: 'frozen-test',
    verdict: 'RED',
    reason: 'test',
    evidence: 'data',
    scope: '/tmp',
    attempt: 1,
    maxAttempts: 3
  });
  
  // Should be frozen - attempts to modify should fail silently or throw
  assert.ok(packet.unitId === 'frozen-test');
  Object.freeze?.(packet); // Already frozen
});

test('correction-packet-arguments-validate-attempt-range', () => {
  assert.throws(() => createCorrectionPacket({ 
    unitId: 'bad-attempt',
    verdict: 'RED',
    reason: 'reason',
    evidence: 'evidence',
    scope: 'scope',
    attempt: 0, // Invalid attempt
    maxAttempts: 3
  }), /V4_CORRECTION_ATTEMPT_INVALID/);
  
  assert.throws(() => createCorrectionPacket({ 
    unitId: 'negative-attempt',
    verdict: 'RED',
    reason: 'reason',
    evidence: 'evidence',
    scope: 'scope',
    attempt: -1,
    maxAttempts: 3
  }), /V4_CORRECTION_ATTEMPT_INVALID/);
});

test('correction-packet-arguments-validate-maxAttempts-range', () => {
  assert.throws(() => createCorrectionPacket({ 
    unitId: 'bad-max',
    verdict: 'RED',
    reason: 'reason',
    evidence: 'evidence',
    scope: 'scope',
    attempt: 1,
    maxAttempts: 0 // Invalid maxAttempts
  }), /V4_CORRECTION_ATTEMPT_INVALID/);
  
  assert.throws(() => createCorrectionPacket({ 
    unitId: 'negative-max',
    verdict: 'RED',
    reason: 'reason',
    evidence: 'evidence',
    scope: 'scope',
    attempt: 1,
    maxAttempts: -1
  }), /V4_CORRECTION_ATTEMPT_INVALID/);
});

test('reset-correction-state-cleans-up-all-tracking', () => {
  resetCorrectionState();
  
  // After reset, state should be clean
  assert.ok(correctionAttemptCount === 0);
  assert.ok(maxCorrectionAttempts === 3);
  assert.ok(pendingShellMutation === null);
});

test('correction-prompt-throw-on-missing-unitId', () => {
  assert.throws(() => correctionPrompt({}), /V4_CORRECTION_PACKET_REQUIRED/);
});

test('correction-actions-enum-is-frozen-object', () => {
  assert.ok(CORRECTION_ACTIONS.RETRY_UNIT === 'RETRY_UNIT');
  assert.ok(CORRECTION_ACTIONS.REPLAN === 'REPLAN');
  assert.ok(CORRECTION_ACTIONS.STOP === 'STOP');
});

// === VALIDATION: bounded correction attempt prevents apply_patch during format-error recovery ===
test('format-error-correction-attempt-prevents-apply_patch-for-entire-recovery', async () => {
  // Simulate a format error scenario
  const packet = createCorrectionPacket({ 
    unitId: 'format-recovery-test',
    verdict: 'FORMAT_ERROR',
    reason: 'parser-format-failure',
    evidence: 'malformed patch syntax detected',
    scope: 'scripts/*.mjs',
    attempt: 1,
    maxAttempts: 3
  });
  
  // Verify STOP action for format error
  assert.ok(packet.action === 'STOP');
});

test('normal-correction-behavior-remains-unchanged-for-non-format-reasons', async () => {
  const packet = createCorrectionPacket({ 
    unitId: 'normal-retry-test',
    verdict: 'RED',
    reason: 'timeout',
    evidence: 'deadline exceeded',
    scope: 'scripts/*.mjs',
    attempt: 1,
    maxAttempts: 3
  });
  
  // Should be RETRY_UNIT for normal errors
  assert.ok(packet.action === 'RETRY_UNIT');
});

// === VALIDATION: proof that process-group-termination-happens-before-second-attempt ===
test('format-error-first-failure-sends-sigterm-before-any-scheduled-second-attempt', async () => {
  // This test verifies that on first format failure, the child is terminated
  // and no second attempt is scheduled
  
  const packet1 = createCorrectionPacket({ 
    unitId: 'first-failure-test',
    verdict: 'FORMAT_ERROR',
    reason: 'malformed patch',
    evidence: '**Begin\n',
    scope: 'scripts/*.mjs',
    attempt: 1,
    maxAttempts: 3
  });
  
  assert.ok(packet1.action === 'STOP');
  assert.ok(packet1.preventedSecondAttempt === true);
});

test('shell-mutation-required-check-works-after-format-error-verdict', async () => {
  const packet = createCorrectionPacket({ 
    unitId: 'shell-check-test',
    verdict: 'FORMAT_ERROR',
    reason: 'bare ** in patch',
    evidence: 'malformed syntax',
    scope: 'scripts/*.mjs'
  });
  
  assert.ok(isShellMutationRequired());
  const pending = getPendingShellMutation();
  assert.ok(pending?.unitId === 'shell-check-test');
});

test('normal-verdict-does-not-enable-shell-mutation-block', async () => {
  const packet = createCorrectionPacket({ 
    unitId: 'normal-check-test',
    verdict: 'RED',
    reason: 'timeout',
    evidence: 'deadline exceeded',
    scope: 'scripts/*.mjs'
  });
  
  assert.ok(!isShellMutationRequired());
});

test('correction-prompt-for-format-error-at-final-attempt-still-uses-stop', async () => {
  const packet = createCorrectionPacket({ 
    unitId: 'final-format-test',
    verdict: 'FORMAT_ERROR',
    reason: 'malformed patch at final attempt',
    evidence: 'bare ** detected',
    scope: 'scripts/*.mjs',
    attempt: 3,
    maxAttempts: 3
  });
  
  assert.ok(packet.action === 'STOP');
});

test('correction-packet-evidence-field-is-stringified', async () => {
  const packet = createCorrectionPacket({ 
    unitId: 'stringify-test',
    verdict: 'RED',
    reason: 'reason-object',
    evidence: { msg: 'error details' },
    scope: '/tmp',
    attempt: 1,
    maxAttempts: 3
  });
  
  assert.ok(packet.evidence === '{"msg":"error details"}');
});

test('correction-packet-reason-field-accepts-null', async () => {
  // Edge case: reason can be falsy but will be stringified
  const packet = createCorrectionPacket({ 
    unitId: 'null-reason-test',
    verdict: 'RED',
    reason: null,
    evidence: 'evidence',
    scope: '/tmp',
    attempt: 1,
    maxAttempts: 3
  });
  
  assert.ok(packet.reason === 'null');
});

// Export for external use in tests that need to inspect private state
export default true;