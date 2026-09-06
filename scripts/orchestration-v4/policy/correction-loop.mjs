// === bounded correction state for format-error recovery ===

export const CORRECTION_ACTIONS = Object.freeze({ RETRY_UNIT: 'RETRY_UNIT', REPLAN: 'REPLAN', STOP: 'STOP' });

// Bounded correction state prevents second apply_patch attempt on format errors
let correctionAttemptCount = 0;
let maxCorrectionAttempts = 3;
let pendingShellMutation = null;
let shellMutationBlock = false;

export function createCorrectionPacket({ unitId, verdict, reason, evidence, scope, attempt, maxAttempts = 3 } = {}) {
  if (!unitId || verdict !== 'RED' && verdict !== 'FORMAT_ERROR') throw new Error('V4_CORRECTION_PACKET_INCOMPLETE');
  if (!reason || !evidence || !scope) throw new Error('V4_CORRECTION_PACKET_INCOMPLETE');
  
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('V4_CORRECTION_ATTEMPT_INVALID');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('V4_CORRECTION_ATTEMPT_INVALID');
  
  correctionAttemptCount = attempt;
  
  // === Shell-only mutation requirement for format-error corrections ===
  if (verdict === 'FORMAT_ERROR') {
    shellMutationBlock = true;
    pendingShellMutation = { unitId, reason, evidence, scope };
  }

  return Object.freeze({
    unitId: String(unitId), verdict: String(verdict), reason: String(reason), evidence: String(evidence), scope: String(scope), attempt, maxAttempts,
    action: attempt >= maxAttempts ? CORRECTION_ACTIONS.REPLAN : (verdict === 'FORMAT_ERROR' ? CORRECTION_ACTIONS.STOP : CORRECTION_ACTIONS.RETRY_UNIT),
  });
}

export function correctionPrompt(packet) {
  if (!packet?.unitId) throw new Error('V4_CORRECTION_PACKET_REQUIRED');
  
  // For format-error corrections, emit shell-only mutation instruction
  if (packet.verdict === 'FORMAT_ERROR') {
    return [
      'Correction attempt for the same bounded unit (format error).',
      `UNIT: ${packet.unitId}`,
      `VERDICT: ${packet.verdict}`,
      `REASON: ${packet.reason}`,
      `EVIDENCE: ${packet.evidence}`,
      `SCOPE: ${packet.scope}`,
      `ATTEMPT: ${packet.attempt}/${packet.maxAttempts}`,
      'Apply only shell mutation (write/edit/apply_patch forbidden).',
      'Use deterministic repository-rooted commands.',
    ].join('\n');
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
  ].join('\n');
}

export function resetCorrectionState() {
  correctionAttemptCount = 0;
  maxCorrectionAttempts = 3;
  pendingShellMutation = null;
  shellMutationBlock = false;
}

export function isShellMutationRequired() {
  return shellMutationBlock && !!pendingShellMutation;
}

export function getPendingShellMutation() {
  return shellMutationBlock ? pendingShellMutation : null;
}