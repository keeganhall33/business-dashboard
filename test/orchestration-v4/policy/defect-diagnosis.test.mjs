import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFECT_DIAGNOSIS_CONTRACT_VERSION,
  validateDefectDiagnosis,
} from '../../../scripts/orchestration-v4/policy/defect-diagnosis.mjs';

function validDiagnosis() {
  return {
    contractVersion: DEFECT_DIAGNOSIS_CONTRACT_VERSION,
    taskId: 'route-selection-defect',
    issueNumber: 1640,
    baseSha: 'a'.repeat(40),
    observedAt: '2026-09-14T16:30:00.000Z',
    privacySafe: true,
    symptom: {
      id: 'unsupported-route-claimed',
      description: 'A direct-only task is selected by the local worker.',
    },
    reproduction: {
      command: 'node --test test/orchestration-v4/production/route-selection.test.mjs',
      symptomId: 'unsupported-route-claimed',
      deterministic: true,
      before: { verdict: 'RED', runs: 2, evidenceRefs: ['test-before'] },
      after: { verdict: 'GREEN', runs: 2, evidenceRefs: ['test-after'] },
    },
    hypotheses: [
      {
        id: 'parser-drops-route', rank: 1,
        statement: 'The task parser drops the execution route.',
        prediction: 'Preserving the route will make the selector reject the task.',
        disposition: 'CONFIRMED', evidenceRefs: ['parser-probe'],
      },
      {
        id: 'selector-ignores-route', rank: 2,
        statement: 'The selector receives the route but ignores it.',
        prediction: 'Logging selector input will show a route with no eligibility check.',
        disposition: 'REJECTED', evidenceRefs: ['selector-probe'],
      },
      {
        id: 'stale-task-state', rank: 3,
        statement: 'The selector reads stale task state.',
        prediction: 'Reloading the same snapshot will change the selected task.',
        disposition: 'REJECTED', evidenceRefs: ['state-probe'],
      },
    ],
    rootCauseHypothesisId: 'parser-drops-route',
    probes: [
      {
        id: 'probe-parser', hypothesisId: 'parser-drops-route',
        predictionTested: 'Inspect the parsed task route.',
        result: 'The parsed route is absent.', evidenceRefs: ['parser-probe'],
      },
      {
        id: 'probe-selector', hypothesisId: 'selector-ignores-route',
        predictionTested: 'Inspect selector input after preserving the route.',
        result: 'The selector rejects the preserved route.', evidenceRefs: ['selector-probe'],
      },
    ],
    regression: {
      command: 'node --test test/orchestration-v4/production/route-selection.test.mjs',
      symptomId: 'unsupported-route-claimed',
      failedBeforeFix: true,
      passedAfterFix: true,
      evidenceRefs: ['regression-red', 'regression-green'],
    },
    cleanup: {
      instrumentationRemoved: true,
      throwawayArtifactsRemoved: true,
      evidenceRefs: ['debug-prefix-search', 'workspace-status'],
    },
  };
}

const expected = {
  taskId: 'route-selection-defect',
  issueNumber: 1640,
  baseSha: 'a'.repeat(40),
};

test('accepts bounded evidence and returns a deterministic frozen summary without mutating input', () => {
  const input = validDiagnosis();
  const before = structuredClone(input);
  input.hypotheses.reverse();
  input.probes.reverse();
  input.cleanup.evidenceRefs.reverse();
  input.reproduction.before.evidenceRefs.push('shared-repro-proof');
  input.reproduction.after.evidenceRefs.push('shared-repro-proof');
  const result = validateDefectDiagnosis(input, expected);

  assert.equal(result.ok, true);
  assert.deepEqual(input, {
    ...before,
    hypotheses: [...before.hypotheses].reverse(),
    probes: [...before.probes].reverse(),
    reproduction: {
      ...before.reproduction,
      before: { ...before.reproduction.before, evidenceRefs: [...before.reproduction.before.evidenceRefs, 'shared-repro-proof'] },
      after: { ...before.reproduction.after, evidenceRefs: [...before.reproduction.after.evidenceRefs, 'shared-repro-proof'] },
    },
    cleanup: { ...before.cleanup, evidenceRefs: [...before.cleanup.evidenceRefs].reverse() },
  });
  assert.deepEqual(result.summary.hypotheses.map((item) => item.rank), [1, 2, 3]);
  assert.deepEqual(result.summary.probes.map((item) => item.id), ['probe-parser', 'probe-selector']);
  assert.deepEqual(result.summary.cleanup.evidenceRefs, ['debug-prefix-search', 'workspace-status']);
  assert.equal(result.summary.reproduction.evidenceRefs.filter((ref) => ref === 'shared-repro-proof').length, 1);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.summary.hypotheses[0]), true);

  const reordered = validDiagnosis();
  reordered.hypotheses.reverse();
  reordered.probes.reverse();
  reordered.reproduction.before.evidenceRefs.push('shared-repro-proof');
  reordered.reproduction.after.evidenceRefs.push('shared-repro-proof');
  assert.deepEqual(validateDefectDiagnosis(reordered, expected), result);
});

test('fails closed on identity, base SHA, timestamp, and privacy violations', () => {
  const wrongIdentity = validDiagnosis();
  wrongIdentity.taskId = 'other-task';
  assert.equal(validateDefectDiagnosis(wrongIdentity, expected).reason, 'V4_DEFECT_DIAGNOSIS_IDENTITY_MISMATCH');

  const badSha = validDiagnosis();
  badSha.baseSha = 'not-a-sha';
  assert.equal(validateDefectDiagnosis(badSha).reason, 'V4_DEFECT_DIAGNOSIS_IDENTITY_INVALID');

  const badTime = validDiagnosis();
  badTime.observedAt = 'yesterday';
  assert.equal(validateDefectDiagnosis(badTime).reason, 'V4_DEFECT_DIAGNOSIS_TIMESTAMP_INVALID');

  const unsafeKey = validDiagnosis();
  unsafeKey.secretToken = 'redacted';
  assert.equal(validateDefectDiagnosis(unsafeKey).reason, 'V4_DEFECT_DIAGNOSIS_PRIVACY_VIOLATION');

  const unsafeValue = validDiagnosis();
  unsafeValue.probes[0].result = 'Captured op://Engineering/example/password';
  assert.equal(validateDefectDiagnosis(unsafeValue).reason, 'V4_DEFECT_DIAGNOSIS_PRIVACY_VIOLATION');
});

test('requires the same exact symptom to go red before and green after', () => {
  const wrongSymptom = validDiagnosis();
  wrongSymptom.reproduction.symptomId = 'different-symptom';
  assert.equal(validateDefectDiagnosis(wrongSymptom).reason, 'V4_DEFECT_DIAGNOSIS_REPRODUCTION_INVALID');

  const noRed = validDiagnosis();
  noRed.reproduction.before.verdict = 'GREEN';
  assert.equal(validateDefectDiagnosis(noRed).reason, 'V4_DEFECT_DIAGNOSIS_REPRODUCTION_INVALID');

  const noGreen = validDiagnosis();
  noGreen.reproduction.after.verdict = 'RED';
  assert.equal(validateDefectDiagnosis(noGreen).reason, 'V4_DEFECT_DIAGNOSIS_REPRODUCTION_INVALID');
});

test('enforces bounded uniquely ranked falsifiable hypotheses and one confirmed root cause', () => {
  const tooFew = validDiagnosis();
  tooFew.hypotheses.pop();
  assert.equal(validateDefectDiagnosis(tooFew).reason, 'V4_DEFECT_DIAGNOSIS_HYPOTHESIS_COUNT_INVALID');

  const duplicateId = validDiagnosis();
  duplicateId.hypotheses[1].id = duplicateId.hypotheses[0].id;
  assert.equal(validateDefectDiagnosis(duplicateId).reason, 'V4_DEFECT_DIAGNOSIS_HYPOTHESIS_INVALID');

  const rankGap = validDiagnosis();
  rankGap.hypotheses[2].rank = 4;
  assert.equal(validateDefectDiagnosis(rankGap).reason, 'V4_DEFECT_DIAGNOSIS_HYPOTHESIS_RANK_INVALID');

  const noPrediction = validDiagnosis();
  noPrediction.hypotheses[0].prediction = '';
  assert.equal(validateDefectDiagnosis(noPrediction).reason, 'V4_DEFECT_DIAGNOSIS_HYPOTHESIS_INVALID');

  const twoConfirmed = validDiagnosis();
  twoConfirmed.hypotheses[1].disposition = 'CONFIRMED';
  assert.equal(validateDefectDiagnosis(twoConfirmed).reason, 'V4_DEFECT_DIAGNOSIS_ROOT_CAUSE_INVALID');
});

test('requires targeted probes, regression proof, and cleanup evidence', () => {
  const unknownHypothesis = validDiagnosis();
  unknownHypothesis.probes[0].hypothesisId = 'missing-hypothesis';
  assert.equal(validateDefectDiagnosis(unknownHypothesis).reason, 'V4_DEFECT_DIAGNOSIS_PROBE_INVALID');

  const missingRootProbe = validDiagnosis();
  missingRootProbe.probes = missingRootProbe.probes.filter((probe) => probe.hypothesisId !== missingRootProbe.rootCauseHypothesisId);
  assert.equal(validateDefectDiagnosis(missingRootProbe).reason, 'V4_DEFECT_DIAGNOSIS_ROOT_CAUSE_PROBE_MISSING');

  const regressionNeverRed = validDiagnosis();
  regressionNeverRed.regression.failedBeforeFix = false;
  assert.equal(validateDefectDiagnosis(regressionNeverRed).reason, 'V4_DEFECT_DIAGNOSIS_REGRESSION_INVALID');

  const wrongRegressionSymptom = validDiagnosis();
  wrongRegressionSymptom.regression.symptomId = 'other';
  assert.equal(validateDefectDiagnosis(wrongRegressionSymptom).reason, 'V4_DEFECT_DIAGNOSIS_REGRESSION_INVALID');

  const debugLeftBehind = validDiagnosis();
  debugLeftBehind.cleanup.instrumentationRemoved = false;
  assert.equal(validateDefectDiagnosis(debugLeftBehind).reason, 'V4_DEFECT_DIAGNOSIS_CLEANUP_INVALID');
});

test('rejects oversized evidence before accepting its claims', () => {
  const oversized = validDiagnosis();
  oversized.probes[0].result = 'x'.repeat(70 * 1024);
  assert.equal(validateDefectDiagnosis(oversized).reason, 'V4_DEFECT_DIAGNOSIS_SIZE_INVALID');
});
