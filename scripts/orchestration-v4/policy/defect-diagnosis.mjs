export const DEFECT_DIAGNOSIS_CONTRACT_VERSION = 'DEFECT_DIAGNOSIS_V1';

const MAX_SERIALIZED_BYTES = 64 * 1024;
const MAX_TEXT = 1_024;
const MAX_COMMAND = 2_048;
const MAX_EVIDENCE_REFS = 12;
const MIN_HYPOTHESES = 3;
const MAX_HYPOTHESES = 5;
const DISPOSITIONS = new Set(['CONFIRMED', 'REJECTED', 'UNRESOLVED']);
const FORBIDDEN_KEY = /(password|secret|token|credential|authorization|cookie|raw_?prompt|prompt_?transcript|chain_?of_?thought|reasoning_?trace)/i;
const FORBIDDEN_VALUE = /(op:\/\/|bearer\s+[a-z0-9._~+\/-]+=*|\b(?:sk|ghp|github_pat)_[a-z0-9_-]{16,}\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;

function isPlainObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(reason) {
  return Object.freeze({ ok: false, reason });
}

function boundedString(value, max = MAX_TEXT) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function validEvidenceRefs(value, { required = true } = {}) {
  return Array.isArray(value)
    && (!required || value.length > 0)
    && value.length <= MAX_EVIDENCE_REFS
    && value.every((ref) => boundedString(ref, 256))
    && new Set(value).size === value.length;
}

function containsSensitiveEvidence(value) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === 'string') {
      if (FORBIDDEN_VALUE.test(current)) return true;
      continue;
    }
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (!isPlainObject(current)) continue;
    for (const [key, nested] of Object.entries(current)) {
      if (FORBIDDEN_KEY.test(key)) return true;
      stack.push(nested);
    }
  }
  return false;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function sortedRefs(refs) {
  return [...new Set(refs)].sort((left, right) => left.localeCompare(right));
}

export function validateDefectDiagnosis(input, expected = {}) {
  if (!isPlainObject(input)) return fail('V4_DEFECT_DIAGNOSIS_OBJECT_REQUIRED');

  let serialized;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return fail('V4_DEFECT_DIAGNOSIS_JSON_INVALID');
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES) {
    return fail('V4_DEFECT_DIAGNOSIS_SIZE_INVALID');
  }
  if (containsSensitiveEvidence(input) || input.privacySafe !== true) {
    return fail('V4_DEFECT_DIAGNOSIS_PRIVACY_VIOLATION');
  }
  if (input.contractVersion !== DEFECT_DIAGNOSIS_CONTRACT_VERSION) {
    return fail('V4_DEFECT_DIAGNOSIS_VERSION_INVALID');
  }
  if (!boundedString(input.taskId, 160)
      || !Number.isInteger(input.issueNumber)
      || input.issueNumber < 1
      || !/^[a-f0-9]{40}$/.test(String(input.baseSha || ''))) {
    return fail('V4_DEFECT_DIAGNOSIS_IDENTITY_INVALID');
  }
  if ((expected.taskId != null && input.taskId !== expected.taskId)
      || (expected.issueNumber != null && input.issueNumber !== expected.issueNumber)
      || (expected.baseSha != null && input.baseSha !== expected.baseSha)) {
    return fail('V4_DEFECT_DIAGNOSIS_IDENTITY_MISMATCH');
  }
  if (!boundedString(input.observedAt, 64)
      || !Number.isFinite(Date.parse(input.observedAt))
      || new Date(input.observedAt).toISOString() !== input.observedAt) {
    return fail('V4_DEFECT_DIAGNOSIS_TIMESTAMP_INVALID');
  }

  const symptom = input.symptom;
  if (!isPlainObject(symptom)
      || !boundedString(symptom.id, 120)
      || !boundedString(symptom.description)) {
    return fail('V4_DEFECT_DIAGNOSIS_SYMPTOM_INVALID');
  }

  const reproduction = input.reproduction;
  if (!isPlainObject(reproduction)
      || !boundedString(reproduction.command, MAX_COMMAND)
      || reproduction.symptomId !== symptom.id
      || reproduction.deterministic !== true
      || !isPlainObject(reproduction.before)
      || reproduction.before.verdict !== 'RED'
      || !Number.isInteger(reproduction.before.runs)
      || reproduction.before.runs < 1
      || !validEvidenceRefs(reproduction.before.evidenceRefs)
      || !isPlainObject(reproduction.after)
      || reproduction.after.verdict !== 'GREEN'
      || !Number.isInteger(reproduction.after.runs)
      || reproduction.after.runs < 1
      || !validEvidenceRefs(reproduction.after.evidenceRefs)) {
    return fail('V4_DEFECT_DIAGNOSIS_REPRODUCTION_INVALID');
  }

  const hypotheses = input.hypotheses;
  if (!Array.isArray(hypotheses)
      || hypotheses.length < MIN_HYPOTHESES
      || hypotheses.length > MAX_HYPOTHESES) {
    return fail('V4_DEFECT_DIAGNOSIS_HYPOTHESIS_COUNT_INVALID');
  }
  const hypothesisIds = new Set();
  const ranks = new Set();
  for (const hypothesis of hypotheses) {
    if (!isPlainObject(hypothesis)
        || !boundedString(hypothesis.id, 120)
        || hypothesisIds.has(hypothesis.id)
        || !Number.isInteger(hypothesis.rank)
        || ranks.has(hypothesis.rank)
        || !boundedString(hypothesis.statement)
        || !boundedString(hypothesis.prediction)
        || !DISPOSITIONS.has(hypothesis.disposition)
        || !validEvidenceRefs(hypothesis.evidenceRefs, { required: hypothesis.disposition !== 'UNRESOLVED' })) {
      return fail('V4_DEFECT_DIAGNOSIS_HYPOTHESIS_INVALID');
    }
    hypothesisIds.add(hypothesis.id);
    ranks.add(hypothesis.rank);
  }
  if ([...ranks].sort((left, right) => left - right).some((rank, index) => rank !== index + 1)) {
    return fail('V4_DEFECT_DIAGNOSIS_HYPOTHESIS_RANK_INVALID');
  }
  const confirmed = hypotheses.filter((hypothesis) => hypothesis.disposition === 'CONFIRMED');
  if (confirmed.length !== 1 || input.rootCauseHypothesisId !== confirmed[0].id) {
    return fail('V4_DEFECT_DIAGNOSIS_ROOT_CAUSE_INVALID');
  }

  const probes = input.probes;
  if (!Array.isArray(probes) || probes.length < 1 || probes.length > 20) {
    return fail('V4_DEFECT_DIAGNOSIS_PROBE_COUNT_INVALID');
  }
  const probeIds = new Set();
  for (const probe of probes) {
    if (!isPlainObject(probe)
        || !boundedString(probe.id, 120)
        || probeIds.has(probe.id)
        || !hypothesisIds.has(probe.hypothesisId)
        || !boundedString(probe.predictionTested)
        || !boundedString(probe.result)
        || !validEvidenceRefs(probe.evidenceRefs)) {
      return fail('V4_DEFECT_DIAGNOSIS_PROBE_INVALID');
    }
    probeIds.add(probe.id);
  }
  if (!probes.some((probe) => probe.hypothesisId === input.rootCauseHypothesisId)) {
    return fail('V4_DEFECT_DIAGNOSIS_ROOT_CAUSE_PROBE_MISSING');
  }

  const regression = input.regression;
  if (!isPlainObject(regression)
      || !boundedString(regression.command, MAX_COMMAND)
      || regression.symptomId !== symptom.id
      || regression.failedBeforeFix !== true
      || regression.passedAfterFix !== true
      || !validEvidenceRefs(regression.evidenceRefs)) {
    return fail('V4_DEFECT_DIAGNOSIS_REGRESSION_INVALID');
  }

  const cleanup = input.cleanup;
  if (!isPlainObject(cleanup)
      || cleanup.instrumentationRemoved !== true
      || cleanup.throwawayArtifactsRemoved !== true
      || !validEvidenceRefs(cleanup.evidenceRefs)) {
    return fail('V4_DEFECT_DIAGNOSIS_CLEANUP_INVALID');
  }

  const summary = {
    contractVersion: DEFECT_DIAGNOSIS_CONTRACT_VERSION,
    taskId: input.taskId,
    issueNumber: input.issueNumber,
    baseSha: input.baseSha,
    observedAt: input.observedAt,
    symptom: { id: symptom.id, description: symptom.description },
    reproduction: {
      command: reproduction.command,
      beforeRuns: reproduction.before.runs,
      afterRuns: reproduction.after.runs,
      evidenceRefs: sortedRefs([...reproduction.before.evidenceRefs, ...reproduction.after.evidenceRefs]),
    },
    hypotheses: [...hypotheses]
      .sort((left, right) => left.rank - right.rank)
      .map((hypothesis) => ({
        id: hypothesis.id,
        rank: hypothesis.rank,
        disposition: hypothesis.disposition,
        evidenceRefs: sortedRefs(hypothesis.evidenceRefs),
      })),
    probes: [...probes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((probe) => ({ id: probe.id, hypothesisId: probe.hypothesisId, evidenceRefs: sortedRefs(probe.evidenceRefs) })),
    rootCauseHypothesisId: input.rootCauseHypothesisId,
    regression: { command: regression.command, evidenceRefs: sortedRefs(regression.evidenceRefs) },
    cleanup: { evidenceRefs: sortedRefs(cleanup.evidenceRefs) },
  };

  return deepFreeze({ ok: true, summary });
}
