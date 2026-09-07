import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRECTION_ACTIONS, CORRECTION_MUTATION_MODES, createCorrectionPacket, correctionMutationMode, correctionPrompt } from '../../../scripts/orchestration-v4/policy/correction-loop.mjs';

function packet(reason, attempt = 1) {
  return createCorrectionPacket({
    unitId: 'unit-1',
    verdict: 'RED',
    reason,
    evidence: 'bounded evidence',
    scope: 'owned/file.mjs',
    attempt,
    maxAttempts: 3,
  });
}

test('patch format correction remains a bounded retry and disables apply_patch for entire attempt', () => {
  const value = packet('APPLY_PATCH_FORMAT_ERROR');
  assert.equal(value.action, CORRECTION_ACTIONS.RETRY_UNIT);
  assert.equal(correctionMutationMode(value), CORRECTION_MUTATION_MODES.SHELL_ONLY);
  const prompt = correctionPrompt(value);
  assert.match(prompt, /MUTATION_MODE: SHELL_ONLY/);
  assert.match(prompt, /APPLY_PATCH IS DISABLED FOR THIS ENTIRE CORRECTION ATTEMPT/);
  assert.match(prompt, /Do not call apply_patch again during this attempt/);
  assert.match(prompt, /deterministic shell exec commands rooted at the authoritative repository workspace/);
  assert.match(prompt, /Change nothing outside SCOPE/);
});

test('other correction reasons retain the existing prompt and retry behavior', () => {
  const value = packet('TEST_FAILURE');
  assert.equal(value.action, CORRECTION_ACTIONS.RETRY_UNIT);
  assert.equal(correctionMutationMode(value), CORRECTION_MUTATION_MODES.DEFAULT);
  const prompt = correctionPrompt(value);
  assert.doesNotMatch(prompt, /MUTATION_MODE: SHELL_ONLY/);
  assert.doesNotMatch(prompt, /APPLY_PATCH IS DISABLED/);
  assert.match(prompt, /Preserve accepted sibling units/);
});

test('three-attempt ceiling is preserved for patch format corrections', () => {
  assert.equal(packet('APPLY_PATCH_FORMAT_ERROR', 3).action, CORRECTION_ACTIONS.REPLAN);
});

test('correction mutation mode fails closed without a governed packet identity', () => {
  assert.throws(() => correctionMutationMode({ reason: 'APPLY_PATCH_FORMAT_ERROR' }), /V4_CORRECTION_PACKET_REQUIRED/);
});