export const CORRECTION_ACTIONS = Object.freeze({ RETRY_UNIT: 'RETRY_UNIT', REPLAN: 'REPLAN', STOP: 'STOP' });
export const CORRECTION_MUTATION_MODES = Object.freeze({ DEFAULT: 'DEFAULT', SHELL_ONLY: 'SHELL_ONLY' });

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

export function correctionMutationMode(packet) {
  if (!packet?.unitId) throw new Error('V4_CORRECTION_PACKET_REQUIRED');
  return packet.reason === 'APPLY_PATCH_FORMAT_ERROR'
    ? CORRECTION_MUTATION_MODES.SHELL_ONLY
    : CORRECTION_MUTATION_MODES.DEFAULT;
}

export function correctionPrompt(packet) {
  if (!packet?.unitId) throw new Error('V4_CORRECTION_PACKET_REQUIRED');
  const mutationMode = correctionMutationMode(packet);
  const formatErrorDirectives = mutationMode === CORRECTION_MUTATION_MODES.SHELL_ONLY ? [
    'MUTATION_MODE: SHELL_ONLY',
    'APPLY_PATCH IS DISABLED FOR THIS ENTIRE CORRECTION ATTEMPT.',
    'Do not call apply_patch again during this attempt.',
    'Perform every mutation with deterministic shell exec commands rooted at the authoritative repository workspace.',
    'Verify the owned-path changes and tests with repository-rooted shell commands before completion.',
  ] : [];
  return [
    'Correction attempt for the same bounded unit.',
    `UNIT: ${packet.unitId}`,
    `VERDICT: ${packet.verdict}`,
    `REASON: ${packet.reason}`,
    `EVIDENCE: ${packet.evidence}`,
    `SCOPE: ${packet.scope}`,
    `ATTEMPT: ${packet.attempt}/${packet.maxAttempts}`,
    'Preserve accepted sibling units. Change nothing outside SCOPE.',
    ...formatErrorDirectives,
  ].join('\n');
}

export const TOTAL_TASK_DEADLINE_EXHAUSTED = 'TOTAL_TASK_DEADLINE_EXHAUSTED';

export function createTaskDeadline({ startedAtMs, timeoutMs, reserveMs }) {
  if (!Number.isFinite(startedAtMs) || !Number.isInteger(timeoutMs) || timeoutMs <= 0 ||
      !Number.isInteger(reserveMs) || reserveMs < 0 || reserveMs >= timeoutMs) {
    throw new Error('V4_TOTAL_TASK_DEADLINE_CONFIG_INVALID');
  }
  return Object.freeze({ startedAtMs, deadlineAtMs: startedAtMs + timeoutMs, timeoutMs, reserveMs });
}

export function remainingTaskExecutionMs(deadline, nowMs) {
  if (!deadline || !Number.isFinite(nowMs) || nowMs < deadline.startedAtMs) {
    throw new Error('V4_TOTAL_TASK_DEADLINE_CLOCK_INVALID');
  }
  return Math.max(0, deadline.deadlineAtMs - nowMs - deadline.reserveMs);
}
