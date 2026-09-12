import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import {
  PRODUCTION_VERIFICATION_ARTIFACT,
  validateProductionVerificationArtifact,
} from '../../../scripts/orchestration-v4/production/publisher.mjs';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-production-evidence-'));
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n');
  execFileSync('git', ['-C', root, 'add', 'tracked.txt']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline']);
  return root;
}

function evidence(overrides = {}) {
  return {
    contractVersion: 'PRODUCTION_VERIFICATION_V1',
    taskId: 'verify-live',
    issueNumber: 55,
    verdict: 'PASS',
    observedAt: '2026-09-12T20:40:46.198Z',
    liveExecution: true,
    repositoryClean: true,
    privacySafe: true,
    externalMutation: false,
    checks: [{ id: 'FAILED_MAILBOX_COUNT_ZERO', passed: true }],
    telemetry: { mailboxCount: 3, failedMailboxCount: 0 },
    ...overrides,
  };
}

function writeEvidence(root, value) {
  const target = path.join(root, PRODUCTION_VERIFICATION_ARTIFACT);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value)}\n`);
}

test('production verification fails closed when the proof artifact is missing', () => {
  const root = workspace();
  const result = validateProductionVerificationArtifact({
    task: { task_id: 'verify-live', issue_number: 55 },
    workspacePath: root,
  });
  assert.deepEqual(result, { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_MISSING' });
});

test('production verification accepts a matching privacy-safe proof artifact', () => {
  const root = workspace();
  writeEvidence(root, evidence());
  const result = validateProductionVerificationArtifact({
    task: { task_id: 'verify-live', issue_number: 55 },
    workspacePath: root,
  });
  assert.equal(result.ok, true);
  assert.equal(result.productionVerification.verified, true);
  assert.deepEqual(result.productionVerification.assertionIds, ['FAILED_MAILBOX_COUNT_ZERO']);
  assert.deepEqual(result.productionVerification.telemetryKeys, ['failedMailboxCount', 'mailboxCount']);
  assert.match(result.productionVerification.artifactSha256, /^[a-f0-9]{64}$/);
});

test('production verification rejects sensitive evidence and unrelated mutations', () => {
  const root = workspace();
  writeEvidence(root, evidence({ telemetry: { address: 'person@example.com' } }));
  assert.equal(validateProductionVerificationArtifact({
    task: { task_id: 'verify-live', issue_number: 55 },
    workspacePath: root,
  }).reason, 'V4_PRODUCTION_EVIDENCE_PRIVACY_VIOLATION');

  writeEvidence(root, evidence());
  fs.writeFileSync(path.join(root, 'unexpected.txt'), 'mutation\n');
  assert.equal(validateProductionVerificationArtifact({
    task: { task_id: 'verify-live', issue_number: 55 },
    workspacePath: root,
  }).reason, 'V4_PRODUCTION_EVIDENCE_REPOSITORY_MUTATED');
});
