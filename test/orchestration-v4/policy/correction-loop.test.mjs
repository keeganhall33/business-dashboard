import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorrectionPacket, correctionPrompt } from '../../../scripts/orchestration-v4/policy/correction-loop.mjs';

test('correction packet for apply_patch format error includes shell-only directive', async () => {
  const packet = createCorrectionPacket({
    unitId: 'v4-runner-apply-patch-payload-grammar-recovery',
    verdict: 'RED',
    reason: 'APPLY_PATCH_FORMAT_ERROR',
    evidence: '[tools] apply_patch failed: invalid Add File body',
    scope: 'scripts/orchestration-v4/runner/bounded-process.mjs',
    attempt: 1,
    maxAttempts: 3,
  });
  assert.equal(packet.reason, 'APPLY_PATCH_FORMAT_ERROR');
  
  const prompt = correctionPrompt(packet);
  assert.ok(prompt.includes('Disable all apply_patch tool calls'));
  assert.ok(prompt.includes('Use repository-rooted deterministic shell exec for all file mutations'));
  assert.ok(prompt.includes('Write files via: echo "content" > "/ABSOLUTE/PATH/TO/FILE"'));
  assert.ok(prompt.includes('Verify mutations with git status and read commands'));
  
  const packet2 = createCorrectionPacket({
    unitId: 'v4-runner-apply-patch-payload-grammar-recovery',
    verdict: 'RED',
    reason: 'SOME_OTHER_ERROR',
    evidence: 'some other error occurred',
    scope: 'scripts/orchestration-v4/policy/correction-loop.mjs',
    attempt: 1,
    maxAttempts: 3,
  });
  assert.equal(packet2.reason, 'SOME_OTHER_ERROR');
  
  const prompt2 = correctionPrompt(packet2);
  assert.ok(!prompt2.includes('Disable all apply_patch tool calls'));
  assert.ok(!prompt2.includes('Use repository-rooted deterministic shell exec for all file mutations'));
});

test('correction packet validation throws on incomplete packet', async () => {
  assert.throws(() => createCorrectionPacket({}), /V4_CORRECTION_PACKET_INCOMPLETE/);
  assert.throws(() => createCorrectionPacket({ unitId: 'x' }), /V4_CORRECTION_PACKET_INCOMPLETE/);
});

test('correction packet uses RETRY_UNIT for first attempt, REPLAN after maxAttempts', async () => {
  const packet1 = createCorrectionPacket({ unitId: 'u1', verdict: 'RED', reason: 'e', evidence: 'e', scope: 's', attempt: 1, maxAttempts: 3 });
  assert.equal(packet1.action, 'RETRY_UNIT');
  
  const packet3 = createCorrectionPacket({ unitId: 'u1', verdict: 'RED', reason: 'e', evidence: 'e', scope: 's', attempt: 3, maxAttempts: 3 });
  assert.equal(packet3.action, 'REPLAN');
});
