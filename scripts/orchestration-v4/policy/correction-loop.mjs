export const CORRECTION_ACTIONS = Object.freeze({ RETRY_UNIT: 'RETRY_UNIT', REPLAN: 'REPLAN', STOP: 'STOP' });

const APPLY_PATCH_FORMAT_ERROR_CODE = 'APPLY_PATCH_FORMAT_ERROR';

export function createCorrectionPacket({ unitId, verdict, reason, evidence, scope, attempt, maxAttempts = 3 } = {}) {
  if (!unitId || verdict !== 'RED' || !reason || !evidence || !scope) throw new Error('V4_CORRECTION_PACKET_INCOMPLETE');
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('V4_CORRECTION_ATTEMPT_INVALID');
  }
  return Object.freeze({
    unitId: String(unitId), verdict, reason: String(reason), evidence: String(evidence), scope: String(scope), attempt, maxAttempts,
    action: attempt >= maxAttempts ? CORRECTION_ACTIONS.REPLAN : CORRECTION_ACTIONS.RETRY_UNIT,
  });
}

export function correctionPrompt(packet) {
  if (!packet?.unitId) throw new Error('V4_CORRECTION_PACKET_REQUIRED');
  const directives = [];

  // For apply_patch format error: shell-only mutation directive
  if (packet.reason === APPLY_PATCH_FORMAT_ERROR_CODE) {
    directives.push(
      'For this correction attempt:',
      '- Disable all apply_patch tool calls.',
      '- Use repository-rooted deterministic shell exec for all file mutations.',
      '- Write files via: echo "content" > "/ABSOLUTE/PATH/TO/FILE"',
      '- Verify mutations with git status and read commands.',
      '- Complete the task before re-enabling any tool calls if needed.',
    );
  }

  return [
    'Correction attempt for the same bounded unit.',
    `UNIT: ${packet.unitId}`,
    `VERDICT: ${packet.verdict}`,
    `REASON: ${packet.reason}`,
    `EVIDENCE: ${packet.evidence}`,
    `SCOPE: ${packet.scope}`,
    `ATTEMPT: ${packet.attempt}/${packet.maxAttempts}`,
    'Preserve accepted sibling units. Change nothing outside SCOPE.',
    ...(directives.length > 0 ? directives : []),
  ].join('\n');
}
